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
  source: 'letterboxd',
  applied: false,
  inserted: 2,
  updated: 1,
  unchanged: 10,
  skipped: [],
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
async function pick(wrapper: VueWrapper, files: File[]) {
  const input = wrapper.get('#csv')
  Object.defineProperty(input.element, 'files', { value: files, configurable: true })
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
    expect(wrapper.text()).toContain('Letterboxd: Date, Name, Year, Letterboxd URI. IMDb: Const, Title, Year, Created, URL')
    expect(wrapper.get('#csv').attributes('accept')).toBe('.csv,text/csv')
    expect(wrapper.find('#result-heading').exists()).toBe(false)
    await expectNoA11yViolations(wrapper.element)
  })

  describe('file chooser', () => {
    it('has a visible button for the input and says no file is chosen', async () => {
      const { wrapper } = await mountWithApp(ImportView, '/import')
      const button = wrapper.get('label.filepick__button')
      expect(button.attributes('for')).toBe('csv')
      expect(button.text()).toBe('Choose CSV file')
      expect(wrapper.get('#csv-name').text()).toBe('No file chosen')
      expect(wrapper.get('#csv').classes()).toContain('sr-only')
      await expectNoA11yViolations(wrapper.element)
    })

    it('describes the input with the hint and the file name', async () => {
      const { wrapper } = await mountWithApp(ImportView, '/import')
      expect(wrapper.get('#csv').attributes('aria-describedby')).toBe('csv-hint csv-name')
      await wrapper.get('form').trigger('submit')
      expect(wrapper.get('#csv').attributes('aria-describedby')).toBe('csv-hint csv-error csv-name')
    })

    it('shows the chosen file name, replaces it, and resets when the selection is cleared', async () => {
      const { wrapper } = await mountWithApp(ImportView, '/import')
      await pick(wrapper, [file])
      expect(wrapper.get('#csv-name').text()).toBe('watchlist.csv')
      await pick(wrapper, [new File(['x'], 'other.csv', { type: 'text/csv' })])
      expect(wrapper.get('#csv-name').text()).toBe('other.csv')
      await pick(wrapper, [])
      expect(wrapper.get('#csv-name').text()).toBe('No file chosen')
      await expectNoA11yViolations(wrapper.element)
    })

    it('puts the error between the hint and the file name, and removes it when a file is chosen', async () => {
      const { wrapper } = await mountWithApp(ImportView, '/import')
      await wrapper.get('form').trigger('submit')
      expect(wrapper.get('#csv').attributes('aria-describedby')).toBe('csv-hint csv-error csv-name')
      expect(wrapper.get('#csv').attributes('aria-invalid')).toBe('true')
      await expectNoA11yViolations(wrapper.element)
      await pick(wrapper, [file])
      expect(wrapper.get('#csv').attributes('aria-describedby')).toBe('csv-hint csv-name')
      expect(wrapper.get('#csv').attributes('aria-invalid')).toBeUndefined()
      expect(wrapper.get('#csv-name').text()).toBe('watchlist.csv')
    })

    it('opens the file dialog from the button (label for the input)', async () => {
      const { wrapper } = await mountWithApp(ImportView, '/import', { attachTo: document.body })
      const click = vi.fn<(e: Event) => void>((e) => e.preventDefault())
      wrapper.get('#csv').element.addEventListener('click', click)
      await wrapper.get('label.filepick__button').trigger('click')
      expect(click).toHaveBeenCalledTimes(1)
      wrapper.unmount()
    })

    it('shows file names with HTML characters as plain text', async () => {
      const { wrapper } = await mountWithApp(ImportView, '/import')
      const name = '<img src=x onerror=alert(1)> & "q".csv'
      await pick(wrapper, [new File(['x'], name, { type: 'text/csv' })])
      expect(wrapper.get('#csv-name').text()).toBe(name)
      expect(wrapper.find('#csv-name img').exists()).toBe(false)
    })

    it('keeps the file name through the check and the import', async () => {
      mocked.previewImport.mockResolvedValue(report())
      mocked.applyImport.mockResolvedValue(report({ applied: true }))
      const { wrapper } = await mountWithApp(ImportView, '/import')
      await check(wrapper)
      expect(wrapper.get('#csv-name').text()).toBe('watchlist.csv')
      await expectNoA11yViolations(wrapper.element)
      await confirmForm(wrapper).trigger('submit')
      await flushPromises()
      expect(wrapper.get('#csv-name').text()).toBe('watchlist.csv')
      await expectNoA11yViolations(wrapper.element)
    })

    it('shows "No file chosen" again when the selection is cleared after a check', async () => {
      mocked.previewImport.mockResolvedValue(report())
      const { wrapper } = await mountWithApp(ImportView, '/import')
      await check(wrapper)
      await pick(wrapper, [])
      expect(wrapper.get('#csv-name').text()).toBe('No file chosen')
      expect(wrapper.find('#result-heading').exists()).toBe(false)
    })

    it('shows the name of a non-CSV file and leaves the verdict to the backend', async () => {
      mocked.previewImport.mockRejectedValue(new api.ApiError(400, 'The file is not a CSV.'))
      const { wrapper } = await mountWithApp(ImportView, '/import')
      const txt = new File(['hello'], 'notes.txt', { type: 'text/plain' })
      await pick(wrapper, [txt])
      expect(wrapper.get('#csv-name').text()).toBe('notes.txt')
      await wrapper.get('form').trigger('submit')
      await flushPromises()
      expect(mocked.previewImport).toHaveBeenCalledWith(txt)
      expect(wrapper.get('[role="alert"]').text()).toContain('not a CSV')
      await expectNoA11yViolations(wrapper.element)
    })

    it('keeps a very long file name in the page and in the text', async () => {
      const { wrapper } = await mountWithApp(ImportView, '/import')
      const name = `${'a'.repeat(200)}.csv`
      await pick(wrapper, [new File(['x'], name, { type: 'text/csv' })])
      expect(wrapper.get('#csv-name').text()).toBe(name)
      await expectNoA11yViolations(wrapper.element)
    })
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

  it('shows the detected IMDb format after checking the file', async () => {
    mocked.previewImport.mockResolvedValue(report({ source: 'imdb' }))
    const { wrapper } = await mountWithApp(ImportView, '/import')
    await check(wrapper)
    expect(wrapper.text()).toContain('Detected: IMDb export.')
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

describe('ImportView: edge cases', () => {
  it('says the server is unreachable when checking', async () => {
    mocked.previewImport.mockRejectedValue(new api.ApiError(0, 'x'))
    const { wrapper } = await mountWithApp(ImportView, '/import')
    await check(wrapper)
    expect(wrapper.get('[role="alert"]').text()).toMatch(/Can't reach the server/)
    expect(wrapper.find('#result-heading').exists()).toBe(false)
    await expectNoA11yViolations(wrapper.element)
  })

  it('shows a server fault when checking', async () => {
    mocked.previewImport.mockRejectedValue(new api.ApiError(500, 'boom'))
    const { wrapper } = await mountWithApp(ImportView, '/import')
    await check(wrapper)
    expect(wrapper.get('[role="alert"]').text()).toContain('The server had a problem')
  })

  it('shows a too-large file (413) with the backend message', async () => {
    mocked.previewImport.mockRejectedValue(new api.ApiError(413, 'The file is too large'))
    const { wrapper } = await mountWithApp(ImportView, '/import')
    await check(wrapper)
    expect(wrapper.get('[role="alert"]').text()).toContain('The file is too large')
  })

  it('removes the error when the next check works', async () => {
    mocked.previewImport.mockRejectedValueOnce(new api.ApiError(400, 'Bad file'))
    mocked.previewImport.mockResolvedValueOnce(report())
    const { wrapper } = await mountWithApp(ImportView, '/import')
    await check(wrapper)
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(wrapper.find('#result-heading').exists()).toBe(true)
  })

  it('clears the "choose a file" error as soon as a file is chosen', async () => {
    const { wrapper } = await mountWithApp(ImportView, '/import')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.find('#csv-error').exists()).toBe(true)
    await choose(wrapper)
    expect(wrapper.find('#csv-error').exists()).toBe(false)
  })

  it('asks for a file again when the file dialog is cancelled', async () => {
    mocked.previewImport.mockResolvedValue(report())
    const { wrapper } = await mountWithApp(ImportView, '/import')
    await check(wrapper)
    Object.defineProperty(wrapper.get('#csv').element, 'files', { value: [], configurable: true })
    await wrapper.get('#csv').trigger('change')
    expect(wrapper.find('#result-heading').exists()).toBe(false)
    await wrapper.get('form').trigger('submit')
    expect(wrapper.get('#csv-error').text()).toBe('Choose a CSV file first.')
    expect(mocked.previewImport).toHaveBeenCalledTimes(1)
  })

  it('shows "Checking…" and a disabled button while the file is checked', async () => {
    mocked.previewImport.mockReturnValue(new Promise(() => {}))
    const { wrapper } = await mountWithApp(ImportView, '/import')
    await choose(wrapper)
    await wrapper.get('form').trigger('submit')
    const button = wrapper.get('button[type="submit"]')
    expect(button.text()).toBe('Checking…')
    expect(button.attributes('disabled')).toBeDefined()
  })

  it('shows "Importing…" and a disabled button while applying', async () => {
    mocked.previewImport.mockResolvedValue(report())
    mocked.applyImport.mockReturnValue(new Promise(() => {}))
    const { wrapper } = await mountWithApp(ImportView, '/import')
    await check(wrapper)
    await confirmForm(wrapper).trigger('submit')
    const apply = confirmForm(wrapper).get('button')
    expect(apply.text()).toBe('Importing…')
    expect(apply.attributes('disabled')).toBeDefined()
  })

  it('starts the confirmations over when the file is checked again', async () => {
    mocked.previewImport.mockResolvedValue(report(removal))
    const { wrapper } = await mountWithApp(ImportView, '/import')
    await check(wrapper)
    await confirmForm(wrapper).get('input[type="checkbox"]').setValue(true)
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect((confirmForm(wrapper).get('input[type="checkbox"]').element as HTMLInputElement).checked).toBe(false)
    expect(confirmForm(wrapper).get('button').attributes('disabled')).toBeDefined()
  })

  it('can check the file again after the list changed, and uses the new token', async () => {
    mocked.previewImport.mockResolvedValueOnce(report(removal))
    mocked.applyImport.mockRejectedValueOnce(new api.ApiError(409, 'changed'))
    const { wrapper } = await mountWithApp(ImportView, '/import')
    await check(wrapper)
    await confirmForm(wrapper).get('input[type="checkbox"]').setValue(true)
    await confirmForm(wrapper).trigger('submit')
    await flushPromises()

    mocked.previewImport.mockResolvedValueOnce(report({ ...removal, removalToken: 'new' }))
    mocked.applyImport.mockResolvedValueOnce(report({ applied: true }))
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    await confirmForm(wrapper).get('input[type="checkbox"]').setValue(true)
    await confirmForm(wrapper).trigger('submit')
    await flushPromises()
    expect(mocked.applyImport).toHaveBeenLastCalledWith(file, { removalToken: 'new', confirmLargeRemoval: false })
  })

  it('clears the error of a failed apply when the next apply works', async () => {
    mocked.previewImport.mockResolvedValue(report())
    mocked.applyImport.mockRejectedValueOnce(new api.ApiError(500, 'boom'))
    mocked.applyImport.mockResolvedValueOnce(report({ applied: true }))
    const { wrapper } = await mountWithApp(ImportView, '/import')
    await check(wrapper)
    await confirmForm(wrapper).trigger('submit')
    await flushPromises()
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    await confirmForm(wrapper).trigger('submit')
    await flushPromises()
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(wrapper.get('#result-heading').text()).toBe('Import finished')
  })

  it('moves focus to the result and announces it after the import', async () => {
    mocked.previewImport.mockResolvedValue(report())
    mocked.applyImport.mockResolvedValue(report({ applied: true }))
    const { wrapper } = await mountWithApp(ImportView, '/import')
    await check(wrapper)
    await confirmForm(wrapper).trigger('submit')
    await flushPromises()
    expect(document.activeElement).toBe(wrapper.get('#result-heading').element)
    expect(wrapper.get('[role="status"]').text()).toBe('Import finished.')
    await expectNoA11yViolations(wrapper.element)
  })

  it('forgets the finished result when another file is chosen', async () => {
    mocked.previewImport.mockResolvedValue(report())
    mocked.applyImport.mockResolvedValue(report({ applied: true }))
    const { wrapper } = await mountWithApp(ImportView, '/import')
    await check(wrapper)
    await confirmForm(wrapper).trigger('submit')
    await flushPromises()
    await choose(wrapper)
    expect(wrapper.find('#result-heading').exists()).toBe(false)
  })

  it('lets the same file be imported twice: the second check shows everything unchanged', async () => {
    mocked.previewImport.mockResolvedValueOnce(report({ inserted: 5, unchanged: 0 }))
    mocked.previewImport.mockResolvedValueOnce(report({ inserted: 0, updated: 0, unchanged: 5 }))
    mocked.applyImport.mockResolvedValue(report({ applied: true, inserted: 5, unchanged: 0 }))
    const { wrapper } = await mountWithApp(ImportView, '/import')
    await check(wrapper)
    await confirmForm(wrapper).trigger('submit')
    await flushPromises()
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('#result-heading').text()).toBe('Check result')
    expect(wrapper.text()).toContain('Will be added0')
    expect(wrapper.text()).toContain('Unchanged5')
  })

  it('reports rejected rows and still allows the import of the valid ones', async () => {
    mocked.previewImport.mockResolvedValue(
      report({ rejected: [{ line: 3, reason: 'Year is not a number' }, { line: 9, reason: 'Name is empty' }] }),
    )
    const { wrapper } = await mountWithApp(ImportView, '/import')
    await check(wrapper)
    expect(wrapper.text()).toContain('2 rows were rejected')
    expect(wrapper.findAll('tbody tr')).toHaveLength(2)
    expect(confirmForm(wrapper).get('button').attributes('disabled')).toBeUndefined()
    await expectNoA11yViolations(wrapper.element)
  })

  it('shows a header-only file as a result with only zeros', async () => {
    mocked.previewImport.mockResolvedValue(report({ inserted: 0, updated: 0, unchanged: 0 }))
    const { wrapper } = await mountWithApp(ImportView, '/import')
    await check(wrapper)
    expect(wrapper.findAll('dd').map((dd) => dd.text())).toEqual(['0', '0', '0', '0', '0'])
  })

  it('shows what was kept and what was removed after the import', async () => {
    mocked.previewImport.mockResolvedValue(report({ ...removal, keptWatched: [{ id: 8, title: 'Stalker', releaseYear: 1979 }] }))
    mocked.applyImport.mockResolvedValue(
      report({ ...removal, applied: true, keptWatched: [{ id: 8, title: 'Stalker', releaseYear: 1979 }] }),
    )
    const { wrapper } = await mountWithApp(ImportView, '/import')
    await check(wrapper)
    await confirmForm(wrapper).get('input[type="checkbox"]').setValue(true)
    await confirmForm(wrapper).trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('Removed from your list')
    expect(wrapper.text()).toContain('Stalker (1979)')
  })

  it('does not apply when the confirmation is withdrawn again', async () => {
    mocked.previewImport.mockResolvedValue(report(removal))
    const { wrapper } = await mountWithApp(ImportView, '/import')
    await check(wrapper)
    const box = confirmForm(wrapper).get('input[type="checkbox"]')
    await box.setValue(true)
    await box.setValue(false)
    await confirmForm(wrapper).trigger('submit')
    expect(mocked.applyImport).not.toHaveBeenCalled()
  })

  it('names the checkboxes by their text', async () => {
    mocked.previewImport.mockResolvedValue(report({ ...removal, requiresLargeRemovalConfirmation: true }))
    const { wrapper } = await mountWithApp(ImportView, '/import')
    await check(wrapper)
    expect(wrapper.findAll('label.import__check').map((l) => l.text())).toEqual([
      expect.stringContaining('will be removed from my list'),
      expect.stringContaining('more than half of my unwatched films'),
    ])
  })

  it('uses the singular in the removal confirmation for one film', async () => {
    mocked.previewImport.mockResolvedValue(report(removal))
    const { wrapper } = await mountWithApp(ImportView, '/import')
    await check(wrapper)
    expect(wrapper.get('label.import__check').text()).not.toContain('1 films')
  })
})

describe('ImportView: drop zone', () => {
  const dropOn = (wrapper: VueWrapper, files: File[]) =>
    wrapper.get('.filepick').trigger('drop', { dataTransfer: { files } })
  const csv = (name = 'dropped.csv', size = 2048) =>
    new File([new Uint8Array(size)], name, { type: 'text/csv' })

  it('chooses a dropped CSV and announces its name and size', async () => {
    const { wrapper } = await mountWithApp(ImportView, '/import')
    await dropOn(wrapper, [csv()])
    expect(wrapper.get('#csv-name').text()).toBe('dropped.csv')
    expect(wrapper.get('.import__chosen').text()).toBe('Chosen file: dropped.csv (2 KB)')
    await expectNoA11yViolations(wrapper.element)
  })

  it('announces a file chosen with the button in the same way', async () => {
    const { wrapper } = await mountWithApp(ImportView, '/import')
    await pick(wrapper, [csv('picked.csv', 100)])
    expect(wrapper.get('.import__chosen').text()).toBe('Chosen file: picked.csv (100 B)')
  })

  it('accepts a CSV by its extension when the browser gives no type', async () => {
    const { wrapper } = await mountWithApp(ImportView, '/import')
    await dropOn(wrapper, [new File(['x'], 'LIST.CSV')])
    expect(wrapper.get('#csv-name').text()).toBe('LIST.CSV')
  })

  it('refuses more than one file and keeps the file chosen before', async () => {
    const { wrapper } = await mountWithApp(ImportView, '/import')
    await pick(wrapper, [file])
    await dropOn(wrapper, [csv('a.csv'), csv('b.csv')])
    expect(wrapper.get('.field__error').text()).toContain('Drop one CSV file at a time.')
    expect(wrapper.get('.import__chosen').text()).toBe('Drop one CSV file at a time.')
    expect(wrapper.get('#csv-name').text()).toBe('watchlist.csv')
    await expectNoA11yViolations(wrapper.element)
  })

  it('refuses a file that is not a CSV and keeps the file chosen before', async () => {
    const { wrapper } = await mountWithApp(ImportView, '/import')
    await pick(wrapper, [file])
    await dropOn(wrapper, [new File(['x'], 'poster.png', { type: 'image/png' })])
    expect(wrapper.get('.field__error').text()).toContain('That is not a CSV file.')
    expect(wrapper.get('#csv-name').text()).toBe('watchlist.csv')
  })

  it('clears the refusal when a good file is dropped afterwards', async () => {
    const { wrapper } = await mountWithApp(ImportView, '/import')
    await dropOn(wrapper, [new File(['x'], 'a.txt')])
    await dropOn(wrapper, [csv()])
    expect(wrapper.find('.field__error').exists()).toBe(false)
    expect(wrapper.get('#csv-name').text()).toBe('dropped.csv')
  })

  it('ignores a drop without files, such as dragged text', async () => {
    const { wrapper } = await mountWithApp(ImportView, '/import')
    await dropOn(wrapper, [])
    expect(wrapper.find('.field__error').exists()).toBe(false)
    expect(wrapper.get('#csv-name').text()).toBe('No file chosen')
  })

  it('shows the drag-over state and removes it on leave and on drop', async () => {
    const { wrapper } = await mountWithApp(ImportView, '/import')
    const zone = wrapper.get('.filepick')
    expect(zone.text()).toContain('or drop a CSV file here')
    await zone.trigger('dragenter')
    expect(zone.classes()).toContain('filepick--over')
    expect(zone.text()).toContain('Drop to choose this file')
    await zone.trigger('dragleave', { relatedTarget: document.body })
    expect(zone.classes()).not.toContain('filepick--over')
    await zone.trigger('dragover')
    expect(zone.classes()).toContain('filepick--over')
    await dropOn(wrapper, [csv()])
    expect(zone.classes()).not.toContain('filepick--over')
  })

  it('stays in the drag-over state when the pointer moves onto a child of the box', async () => {
    const { wrapper } = await mountWithApp(ImportView, '/import')
    const zone = wrapper.get('.filepick')
    await zone.trigger('dragenter')
    await zone.trigger('dragleave', { relatedTarget: wrapper.get('#csv-name').element })
    expect(zone.classes()).toContain('filepick--over')
  })

  it('replaces the result when another file is dropped, and checks the dropped file', async () => {
    mocked.previewImport.mockResolvedValue(report())
    const { wrapper } = await mountWithApp(ImportView, '/import')
    await check(wrapper)
    expect(wrapper.find('#result-heading').exists()).toBe(true)
    const next = csv('next.csv')
    await dropOn(wrapper, [next])
    expect(wrapper.find('#result-heading').exists()).toBe(false)
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(mocked.previewImport).toHaveBeenLastCalledWith(next)
  })

  it('accepts a file by its CSV type when the name has no .csv', async () => {
    const { wrapper } = await mountWithApp(ImportView, '/import')
    await dropOn(wrapper, [new File(['x'], 'export', { type: 'text/csv' })])
    expect(wrapper.get('#csv-name').text()).toBe('export')
  })

  it('refuses a name that only contains .csv in the middle', async () => {
    const { wrapper } = await mountWithApp(ImportView, '/import')
    await dropOn(wrapper, [new File(['x'], 'list.csv.exe')])
    expect(wrapper.get('.field__error').text()).toContain('That is not a CSV file.')
    expect(wrapper.get('#csv-name').text()).toBe('No file chosen')
  })

  it('keeps the check result when a refused file is dropped', async () => {
    mocked.previewImport.mockResolvedValue(report())
    const { wrapper } = await mountWithApp(ImportView, '/import')
    await check(wrapper)
    await dropOn(wrapper, [new File(['x'], 'a.txt')])
    expect(wrapper.find('#result-heading').exists()).toBe(true)
    expect(wrapper.get('#csv-name').text()).toBe('watchlist.csv')
  })

  it('chooses a new file after the import finished and hides the finished result', async () => {
    mocked.previewImport.mockResolvedValue(report())
    mocked.applyImport.mockResolvedValue(report({ applied: true }))
    const { wrapper } = await mountWithApp(ImportView, '/import')
    await check(wrapper)
    await confirmForm(wrapper).trigger('submit')
    await flushPromises()
    expect(wrapper.get('#result-heading').text()).toBe('Import finished')
    await dropOn(wrapper, [csv('again.csv')])
    expect(wrapper.find('#result-heading').exists()).toBe(false)
    expect(wrapper.get('#csv-name').text()).toBe('again.csv')
  })

  it('clears an earlier error when a file is dropped', async () => {
    mocked.previewImport.mockRejectedValue(new api.ApiError(500, 'boom'))
    const { wrapper } = await mountWithApp(ImportView, '/import')
    await check(wrapper)
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    await dropOn(wrapper, [csv()])
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it('ignores a drop during the check, so the result belongs to the file shown', async () => {
    let finish: (r: ImportReport) => void = () => {}
    mocked.previewImport.mockReturnValue(new Promise((resolve) => (finish = resolve)))
    const { wrapper } = await mountWithApp(ImportView, '/import')
    await choose(wrapper)
    await wrapper.get('form').trigger('submit')
    await dropOn(wrapper, [csv('other.csv')])
    finish(report())
    await flushPromises()
    expect(wrapper.get('#csv-name').text()).toBe('watchlist.csv')
    expect(wrapper.get('#result-heading').text()).toBe('Check result')
  })

  it('ignores a drop during the import, so "Import finished" belongs to the file shown', async () => {
    mocked.previewImport.mockResolvedValue(report())
    let finish: (r: ImportReport) => void = () => {}
    mocked.applyImport.mockReturnValue(new Promise((resolve) => (finish = resolve)))
    const { wrapper } = await mountWithApp(ImportView, '/import')
    await check(wrapper)
    await confirmForm(wrapper).trigger('submit')
    await dropOn(wrapper, [csv('other.csv')])
    finish(report({ applied: true }))
    await flushPromises()
    expect(wrapper.get('#csv-name').text()).toBe('watchlist.csv')
    expect(wrapper.get('#result-heading').text()).toBe('Import finished')
  })

  it('does not show the drag-over state for a drag that carries no files', async () => {
    const { wrapper } = await mountWithApp(ImportView, '/import')
    const zone = wrapper.get('.filepick')
    await zone.trigger('dragenter', { dataTransfer: { types: ['text/plain'] } })
    expect(zone.classes()).not.toContain('filepick--over')
  })

  it('hides the drop hint text from assistive technology and keeps the input reachable', async () => {
    const { wrapper } = await mountWithApp(ImportView, '/import')
    expect(wrapper.get('.filepick__drop').attributes('aria-hidden')).toBe('true')
    expect(wrapper.get('#csv').attributes('disabled')).toBeUndefined()
    await wrapper.get('.filepick').trigger('dragenter')
    await expectNoA11yViolations(wrapper.element)
  })
})

describe('ImportView: choosing a file while a request runs', () => {
  it('keeps the file and says to wait when the button is used during the check', async () => {
    mocked.previewImport.mockReturnValue(new Promise(() => {}))
    const { wrapper } = await mountWithApp(ImportView, '/import')
    await choose(wrapper)
    await wrapper.get('form').trigger('submit')
    await pick(wrapper, [new File(['x'], 'other.csv', { type: 'text/csv' })])
    expect(wrapper.get('#csv-name').text()).toBe('watchlist.csv')
    expect(wrapper.get('.import__chosen').text()).toContain('Wait until')
  })

  it('says to wait for a dropped file, but not for a drop without files', async () => {
    mocked.previewImport.mockReturnValue(new Promise(() => {}))
    const { wrapper } = await mountWithApp(ImportView, '/import')
    await choose(wrapper)
    await wrapper.get('form').trigger('submit')
    await wrapper.get('.filepick').trigger('drop', { dataTransfer: { files: [], types: ['text/plain'] } })
    expect(wrapper.get('.import__chosen').text()).not.toContain('Wait until')
    await wrapper.get('.filepick').trigger('drop', { dataTransfer: { files: [file], types: ['Files'] } })
    expect(wrapper.get('.import__chosen').text()).toContain('Wait until')
  })
})

describe('ImportView: drop and button together', () => {
  it('empties the native input after a drop, so the earlier file can be chosen again', async () => {
    const { wrapper } = await mountWithApp(ImportView, '/import')
    const el = wrapper.get('#csv').element as HTMLInputElement
    const setValue = vi.fn<(value: string) => void>()
    Object.defineProperty(el, 'value', { get: () => 'C:\\fakepath\\watchlist.csv', set: setValue, configurable: true })
    await wrapper.get('.filepick').trigger('drop', { dataTransfer: { files: [new File(['x'], 'b.csv')] } })
    expect(setValue).toHaveBeenCalledWith('')
    expect(wrapper.get('#csv-name').text()).toBe('b.csv')
  })

  it('says the same refusal again when the same file is refused twice', async () => {
    const { wrapper } = await mountWithApp(ImportView, '/import')
    const bad = { dataTransfer: { files: [new File(['x'], 'a.txt')] } }
    await wrapper.get('.filepick').trigger('drop', bad)
    await flushPromises()
    const region = wrapper.get('.import__chosen')
    const seen: string[] = []
    new MutationObserver(() => seen.push(region.text())).observe(region.element, { childList: true, characterData: true, subtree: true })
    await wrapper.get('.filepick').trigger('drop', bad)
    await flushPromises()
    expect(seen).toContain('')
    expect(region.text()).toBe('That is not a CSV file.')
  })

  it('does not show the drag-over state while a request runs', async () => {
    mocked.previewImport.mockReturnValue(new Promise(() => {}))
    const { wrapper } = await mountWithApp(ImportView, '/import')
    await choose(wrapper)
    await wrapper.get('form').trigger('submit')
    await wrapper.get('.filepick').trigger('dragenter')
    expect(wrapper.get('.filepick').classes()).not.toContain('filepick--over')
  })
})
