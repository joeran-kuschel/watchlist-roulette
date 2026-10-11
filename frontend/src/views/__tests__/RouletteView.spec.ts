import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import * as api from '../../api'
import { expectNoA11yViolations, makeFilm, mountWithApp } from '../../__tests__/helpers'
import RouletteView from '../RouletteView.vue'

vi.mock('../../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api')>()),
  randomFilm: vi.fn<typeof import('../../api').randomFilm>(),
  updateFilm: vi.fn<typeof import('../../api').updateFilm>(),
}))
const mocked = vi.mocked(api)

beforeEach(() => vi.resetAllMocks())
afterEach(() => (document.body.innerHTML = ''))

describe('RouletteView', () => {
  it('spins on arrival and shows the pick', async () => {
    mocked.randomFilm.mockResolvedValue(makeFilm())
    const { wrapper } = await mountWithApp(RouletteView)
    expect(mocked.randomFilm).toHaveBeenCalledWith({})
    expect(wrapper.get('h1').text()).toBe("Tonight's film")
    expect(wrapper.get('article h2').text()).toBe('Perfect Days')
    expect(wrapper.get('[role="status"]').text()).toBe('Picked Perfect Days')
    await expectNoA11yViolations(wrapper.element)
  })

  it('shows a loading message while it picks', async () => {
    mocked.randomFilm.mockReturnValue(new Promise(() => {}))
    const { wrapper } = await mountWithApp(RouletteView)
    expect(wrapper.get('[aria-busy="true"]').text()).toBe('Picking a film…')
    expect(wrapper.get('[role="status"]').text()).toBe('Picking a film…')
  })

  it('sends the filters when spinning again', async () => {
    mocked.randomFilm.mockResolvedValue(makeFilm())
    const { wrapper } = await mountWithApp(RouletteView)
    await wrapper.get('#year-from').setValue('1990')
    await wrapper.get('#genre').setValue('18')
    await wrapper.get('#country').setValue('jp')
    await wrapper.get('#max-runtime').setValue('120')
    mocked.randomFilm.mockClear()
    await wrapper.get('button[aria-label="Spin again"]').trigger('click')
    await flushPromises()
    expect(mocked.randomFilm).toHaveBeenCalledWith({ yearFrom: 1990, genre: 18, country: 'JP', maxRuntime: 120 })
  })

  it('shows field errors and does not call the server for invalid filters', async () => {
    mocked.randomFilm.mockResolvedValue(makeFilm())
    const { wrapper } = await mountWithApp(RouletteView)
    mocked.randomFilm.mockClear()
    await wrapper.get('#country').setValue('JPN')
    await wrapper.get('#year-from').setValue('1500')
    await wrapper.get('form').trigger('submit')
    expect(mocked.randomFilm).not.toHaveBeenCalled()
    expect(wrapper.get('#country').attributes('aria-invalid')).toBe('true')
    expect(wrapper.get('#country-error').text()).toMatch(/two-letter country code/)
    expect(wrapper.get('#year-from-error').text()).toMatch(/between 1888 and 2100/)
    await expectNoA11yViolations(wrapper.element)
  })

  it('clears the filters', async () => {
    mocked.randomFilm.mockResolvedValue(makeFilm())
    const { wrapper } = await mountWithApp(RouletteView)
    await wrapper.get('#country').setValue('JP')
    await wrapper.get('#year-from').setValue('1500')
    await wrapper.get('form').trigger('submit')
    await wrapper.get('button[aria-label="Clear filters"]').trigger('click')
    expect((wrapper.get('#country').element as HTMLInputElement).value).toBe('')
    expect(wrapper.find('#year-from-error').exists()).toBe(false)
  })

  it('explains an empty list and offers the next steps', async () => {
    mocked.randomFilm.mockRejectedValue(new api.ApiError(404, 'No unwatched film matches'))
    const { wrapper } = await mountWithApp(RouletteView)
    expect(wrapper.text()).toContain('Nothing to spin')
    expect(wrapper.find('a[href="/import"]').exists()).toBe(true)
    expect(wrapper.find('a[href="/watchlist/new"]').exists()).toBe(true)
    await expectNoA11yViolations(wrapper.element)
  })

  it('says when the filters leave no film', async () => {
    mocked.randomFilm.mockResolvedValueOnce(makeFilm())
    const { wrapper } = await mountWithApp(RouletteView)
    mocked.randomFilm.mockRejectedValue(new api.ApiError(404, 'No unwatched film matches'))
    await wrapper.get('#country').setValue('NZ')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('No film fits these filters')
    expect(wrapper.text()).not.toContain('Nothing to spin')
  })

  it('shows a server error with a retry button', async () => {
    mocked.randomFilm.mockRejectedValueOnce(new api.ApiError(0, 'x'))
    const { wrapper } = await mountWithApp(RouletteView)
    expect(wrapper.get('[role="alert"]').text()).toMatch(/Can't reach the server/)
    mocked.randomFilm.mockResolvedValue(makeFilm())
    await wrapper.get('[role="alert"] button').trigger('click')
    await flushPromises()
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(wrapper.get('article h2').text()).toBe('Perfect Days')
  })

  it('marks the film as watched and disables the button', async () => {
    mocked.randomFilm.mockResolvedValue(makeFilm())
    mocked.updateFilm.mockResolvedValue(makeFilm({ watchedAt: '2026-10-11T10:00:00.000Z' }))
    const { wrapper } = await mountWithApp(RouletteView)
    await wrapper.get('button[aria-label="Mark as watched"]').trigger('click')
    await flushPromises()
    expect(mocked.updateFilm).toHaveBeenCalledWith(1, { watched: true })
    expect(wrapper.get('[role="status"]').text()).toMatch(/marked as watched/)
    expect(wrapper.get('button[aria-label="Mark as watched"]').attributes('disabled')).toBeDefined()
  })

  it('has no mark-as-watched button without a film', async () => {
    mocked.randomFilm.mockRejectedValue(new api.ApiError(404, 'x'))
    const { wrapper } = await mountWithApp(RouletteView)
    expect(wrapper.find('button[aria-label="Mark as watched"]').exists()).toBe(false)
    expect(wrapper.find('button[aria-label="Spin again"]').exists()).toBe(true)
  })
})
