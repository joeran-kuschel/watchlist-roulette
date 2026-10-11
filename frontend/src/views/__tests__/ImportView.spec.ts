import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import * as api from '../../api'
import { expectNoA11yViolations, mountWithApp } from '../../__tests__/helpers'
import type { ImportReport } from '../../types'
import ImportView from '../ImportView.vue'

vi.mock('../../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api')>()),
  previewImport: vi.fn<typeof import('../../api').previewImport>(),
  applyImport: vi.fn<typeof import('../../api').applyImport>(),
}))
const mocked = vi.mocked(api)

const report = (patch: Partial<ImportReport> = {}): ImportReport => ({
  applied: false,
  inserted: 2,
  updated: 1,
  unchanged: 10,
  removed: [],
  keptWatched: [],
  rejected: [],
  requiresLargeRemovalConfirmation: false,
  ...patch,
})
const removal = { removed: [{ id: 7, title: 'Metropolis', releaseYear: 1927 }], removalToken: 'tok' }
const file = new File(['Date,Name'], 'watchlist.csv', { type: 'text/csv' })

async function choose(wrapper: VueWrapper) {
  const input = wrapper.get('#csv')
  Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
  await input.trigger('change')
}
async function check(wrapper: VueWrapper) {
  await choose(wrapper)
  await wrapper.get('form').trigger('submit')
  await flushPromises()
}
const confirmForm = (wrapper: VueWrapper) => wrapper.get('.import__confirm')

beforeEach(() => vi.resetAllMocks())
afterEach(() => (document.body.innerHTML = ''))

describe('ImportView', () => {
  it('starts with the upload form and the expected columns', async () => {
    const { wrapper } = await mountWithApp(ImportView, '/import')
    expect(wrapper.get('h1').text()).toBe('Import from CSV')
    expect(wrapper.text()).toContain('Columns: Date, Name, Year, Letterboxd URI')
    expect(wrapper.get('#csv').attributes('accept')).toBe('.csv,text/csv')
    expect(wrapper.find('#result-heading').exists()).toBe(false)
    await expectNoA11yViolations(wrapper.element)
  })

  it('asks for a file before checking', async () => {
    const { wrapper } = await mountWithApp(ImportView, '/import')
    await wrapper.get('form').trigger('submit')
    expect(mocked.previewImport).not.toHaveBeenCalled()
    expect(wrapper.get('#csv-error').text()).toBe('Choose a CSV file first.')
    expect(wrapper.get('#csv').attributes('aria-invalid')).toBe('true')
    await expectNoA11yViolations(wrapper.element)
  })

  it('checks the file, shows the result and moves focus to it', async () => {
    mocked.previewImport.mockResolvedValue(report())
    const { wrapper } = await mountWithApp(ImportView, '/import')
    await check(wrapper)
    expect(mocked.previewImport).toHaveBeenCalledWith(file)
    expect(wrapper.get('#result-heading').text()).toBe('Check result')
    expect(document.activeElement).toBe(wrapper.get('#result-heading').element)
    expect(wrapper.get('[role="status"]').text()).toBe('Check finished. Nothing has been changed yet.')
    expect(wrapper.text()).toContain('Will be added2')
    // nothing to remove: no confirmation needed
    expect(confirmForm(wrapper).findAll('input[type="checkbox"]')).toHaveLength(0)
    expect(confirmForm(wrapper).get('button').attributes('disabled')).toBeUndefined()
    await expectNoA11yViolations(wrapper.element)
  })

  it('applies the import without a token when nothing is removed', async () => {
    mocked.previewImport.mockResolvedValue(report({ removalToken: 'unused' }))
    mocked.applyImport.mockResolvedValue(report({ applied: true }))
    const { wrapper } = await mountWithApp(ImportView, '/import')
    await check(wrapper)
    await confirmForm(wrapper).trigger('submit')
    await flushPromises()
    expect(mocked.applyImport).toHaveBeenCalledWith(file, { removalToken: undefined, confirmLargeRemoval: false })
    expect(wrapper.get('#result-heading').text()).toBe('Import finished')
    expect(wrapper.find('.import__confirm').exists()).toBe(false)
    expect(wrapper.get('a[href="/watchlist"]').text()).toBe('Go to your watchlist')
  })

  it('needs a confirmation before removing films, then sends the token', async () => {
    mocked.previewImport.mockResolvedValue(report(removal))
    mocked.applyImport.mockResolvedValue(report({ ...removal, applied: true }))
    const { wrapper } = await mountWithApp(ImportView, '/import')
    await check(wrapper)
    const button = confirmForm(wrapper).get('button')
    expect(wrapper.text()).toContain('Metropolis (1927)')
    expect(button.attributes('disabled')).toBeDefined()
    await confirmForm(wrapper).trigger('submit')
    expect(mocked.applyImport).not.toHaveBeenCalled()

    await confirmForm(wrapper).get('input[type="checkbox"]').setValue(true)
    expect(button.attributes('disabled')).toBeUndefined()
    await confirmForm(wrapper).trigger('submit')
    await flushPromises()
    expect(mocked.applyImport).toHaveBeenCalledWith(file, { removalToken: 'tok', confirmLargeRemoval: false })
    expect(wrapper.get('#result-heading').text()).toBe('Import finished')
  })

  it('needs a second confirmation when more than half would be removed', async () => {
    mocked.previewImport.mockResolvedValue(report({ ...removal, requiresLargeRemovalConfirmation: true }))
    mocked.applyImport.mockResolvedValue(report({ applied: true }))
    const { wrapper } = await mountWithApp(ImportView, '/import')
    await check(wrapper)
    const boxes = confirmForm(wrapper).findAll('input[type="checkbox"]')
    expect(boxes).toHaveLength(2)
    await boxes[0]!.setValue(true)
    expect(confirmForm(wrapper).get('button').attributes('disabled')).toBeDefined()
    await boxes[1]!.setValue(true)
    await confirmForm(wrapper).trigger('submit')
    await flushPromises()
    expect(mocked.applyImport).toHaveBeenCalledWith(file, { removalToken: 'tok', confirmLargeRemoval: true })
    await expectNoA11yViolations(wrapper.element)
  })

  it('starts over when the backend says the list changed', async () => {
    mocked.previewImport.mockResolvedValue(report(removal))
    mocked.applyImport.mockRejectedValue(new api.ApiError(409, 'changed', 'removal_not_confirmed'))
    const { wrapper } = await mountWithApp(ImportView, '/import')
    await check(wrapper)
    await confirmForm(wrapper).get('input[type="checkbox"]').setValue(true)
    await confirmForm(wrapper).trigger('submit')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toMatch(/nothing was imported\. Check the file again/)
    expect(wrapper.find('#result-heading').exists()).toBe(false)
  })

  it('shows other apply errors and keeps the result', async () => {
    mocked.previewImport.mockResolvedValue(report())
    mocked.applyImport.mockRejectedValue(new api.ApiError(0, 'x'))
    const { wrapper } = await mountWithApp(ImportView, '/import')
    await check(wrapper)
    await confirmForm(wrapper).trigger('submit')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toMatch(/Can't reach the server/)
    expect(wrapper.find('#result-heading').exists()).toBe(true)
  })

  it('shows a rejected file, for example a missing header', async () => {
    mocked.previewImport.mockRejectedValue(new api.ApiError(400, 'The CSV is missing the column "Name"'))
    const { wrapper } = await mountWithApp(ImportView, '/import')
    await check(wrapper)
    expect(wrapper.get('[role="alert"]').text()).toContain('missing the column "Name"')
    expect(wrapper.find('#result-heading').exists()).toBe(false)
  })

  it('forgets the result when another file is chosen', async () => {
    mocked.previewImport.mockResolvedValue(report(removal))
    const { wrapper } = await mountWithApp(ImportView, '/import')
    await check(wrapper)
    expect(wrapper.find('#result-heading').exists()).toBe(true)
    await choose(wrapper)
    expect(wrapper.find('#result-heading').exists()).toBe(false)
  })
})
