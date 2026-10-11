import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { getActivePinia } from 'pinia'
import * as api from '../../api'
import { expectNoA11yViolations, makeFilm, mountWithApp } from '../../__tests__/helpers'
import RouletteView from '../RouletteView.vue'

vi.mock('../../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api')>()),
  randomFilm: vi.fn<typeof import('../../api').randomFilm>(),
  updateFilm: vi.fn<typeof import('../../api').updateFilm>(),
  getFilm: vi.fn<typeof import('../../api').getFilm>(),
}))
const mocked = vi.mocked(api)

beforeEach(() => vi.resetAllMocks())
afterEach(() => {
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

/** jsdom has no matchMedia; this one reports a phone-sized (stacked) screen and lets a test resize it. */
function stubNarrowScreen() {
  let onChange: (event: { matches: boolean }) => void = () => {}
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: (_: string, listener: typeof onChange) => (onChange = listener),
    removeEventListener: () => {},
  }))
  return { resize: (matches: boolean) => onChange({ matches }) }
}

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

describe('RouletteView: edge cases', () => {
  const spinAgain = async (wrapper: Awaited<ReturnType<typeof mountWithApp>>['wrapper']) => {
    await wrapper.get('button[aria-label="Spin again"]').trigger('click')
    await flushPromises()
  }

  it('announces an empty result in the live region', async () => {
    mocked.randomFilm.mockRejectedValue(new api.ApiError(404, 'x'))
    const { wrapper } = await mountWithApp(RouletteView)
    expect(wrapper.get('[role="status"]').text()).toBe('No film to pick.')
  })

  it('reports a failed pick once, in the alert, not also in the status region', async () => {
    mocked.randomFilm.mockRejectedValue(new api.ApiError(500, 'boom'))
    const { wrapper } = await mountWithApp(RouletteView)
    expect(wrapper.get('[role="alert"]').text()).toContain('The server had a problem')
    expect(wrapper.get('[role="status"]').text()).toBe('')
    expect(wrapper.findAll('[role="alert"]')).toHaveLength(1)
    await expectNoA11yViolations(wrapper.element)
  })

  it('treats a fully watched list like an empty one (the backend answers 404 for both)', async () => {
    mocked.randomFilm.mockRejectedValue(new api.ApiError(404, 'x'))
    const { wrapper } = await mountWithApp(RouletteView)
    expect(wrapper.text()).toContain('you have watched everything on it')
  })

  it('picks the only film again on every spin', async () => {
    mocked.randomFilm.mockResolvedValue(makeFilm({ title: 'Only One' }))
    const { wrapper } = await mountWithApp(RouletteView)
    await spinAgain(wrapper)
    expect(mocked.randomFilm).toHaveBeenCalledTimes(2)
    expect(wrapper.get('article h2').text()).toBe('Only One')
  })

  it('announces the new pick after a spin and keeps focus on the spin button', async () => {
    mocked.randomFilm.mockResolvedValueOnce(makeFilm({ title: 'First' }))
    const { wrapper } = await mountWithApp(RouletteView)
    mocked.randomFilm.mockResolvedValueOnce(makeFilm({ id: 2, title: 'Second' }))
    const button = wrapper.get('button[aria-label="Spin again"]')
    ;(button.element as HTMLElement).focus()
    await spinAgain(wrapper)
    expect(wrapper.get('[role="status"]').text()).toBe('Picked Second')
    expect(document.activeElement).toBe(button.element)
  })

  it('spins when Enter is pressed in a filter field (form submit)', async () => {
    mocked.randomFilm.mockResolvedValue(makeFilm())
    const { wrapper } = await mountWithApp(RouletteView)
    await wrapper.get('#max-runtime').setValue('90')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(mocked.randomFilm).toHaveBeenLastCalledWith({ maxRuntime: 90 })
  })

  it('offers any genre plus every TMDB genre, with labels', async () => {
    mocked.randomFilm.mockResolvedValue(makeFilm())
    const { wrapper } = await mountWithApp(RouletteView)
    const options = wrapper.findAll('#genre option')
    expect(options[0]!.text()).toBe('Any genre')
    expect(options).toHaveLength(20)
    expect(options.map((o) => o.text())).toContain('Science Fiction')
  })

  it('rejects a range that ends before it starts and keeps the current film', async () => {
    mocked.randomFilm.mockResolvedValue(makeFilm())
    const { wrapper } = await mountWithApp(RouletteView)
    mocked.randomFilm.mockClear()
    await wrapper.get('#year-from').setValue('2000')
    await wrapper.get('#year-to').setValue('1990')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.get('#year-to-error').text()).toMatch(/must not be before the first year/)
    expect(mocked.randomFilm).not.toHaveBeenCalled()
    expect(wrapper.get('article h2').text()).toBe('Perfect Days')
  })

  it('removes the field errors once the filters are valid and spins', async () => {
    mocked.randomFilm.mockResolvedValue(makeFilm())
    const { wrapper } = await mountWithApp(RouletteView)
    await wrapper.get('#country').setValue('JPN')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.find('#country-error').exists()).toBe(true)
    await wrapper.get('#country').setValue('JP')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.find('#country-error').exists()).toBe(false)
    expect(mocked.randomFilm).toHaveBeenLastCalledWith({ country: 'JP' })
  })

  it('does not spin when the filters are cleared', async () => {
    mocked.randomFilm.mockResolvedValue(makeFilm())
    const { wrapper } = await mountWithApp(RouletteView)
    await wrapper.get('#max-runtime').setValue('90')
    mocked.randomFilm.mockClear()
    await wrapper.get('button[aria-label="Clear filters"]').trigger('click')
    expect(mocked.randomFilm).not.toHaveBeenCalled()
    expect((wrapper.get('#max-runtime').element as HTMLInputElement).value).toBe('')
  })

  it('hides "Mark as watched" while the next film is being picked', async () => {
    mocked.randomFilm.mockResolvedValueOnce(makeFilm())
    const { wrapper } = await mountWithApp(RouletteView)
    mocked.randomFilm.mockReturnValue(new Promise(() => {}))
    await wrapper.get('button[aria-label="Spin again"]').trigger('click')
    expect(wrapper.find('button[aria-label="Mark as watched"]').exists()).toBe(false)
    expect(wrapper.find('article').exists()).toBe(false)
  })

  it('shows a failed "mark as watched" as an alert and keeps the film and the button', async () => {
    mocked.randomFilm.mockResolvedValue(makeFilm())
    mocked.updateFilm.mockRejectedValue(new api.ApiError(404, 'Film not found'))
    const { wrapper } = await mountWithApp(RouletteView)
    await wrapper.get('button[aria-label="Mark as watched"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('Film not found')
    expect(wrapper.get('article h2').text()).toBe('Perfect Days')
    expect(wrapper.get('button[aria-label="Mark as watched"]').attributes('disabled')).toBeUndefined()
    // the retry button is for a failed pick only
    expect(wrapper.find('[role="alert"] button').exists()).toBe(false)
    await expectNoA11yViolations(wrapper.element)
  })

  it('forgets the "marked as watched" notice on the next spin', async () => {
    mocked.randomFilm.mockResolvedValue(makeFilm())
    mocked.updateFilm.mockResolvedValue(makeFilm({ watchedAt: '2026-10-11T10:00:00.000Z' }))
    const { wrapper } = await mountWithApp(RouletteView)
    await wrapper.get('button[aria-label="Mark as watched"]').trigger('click')
    await flushPromises()
    await spinAgain(wrapper)
    expect(wrapper.get('[role="status"]').text()).toBe('Picked Perfect Days')
  })

  it('shows a film that is already watched with a disabled button', async () => {
    mocked.randomFilm.mockResolvedValue(makeFilm({ watchedAt: '2026-01-05T10:00:00.000Z' }))
    const { wrapper } = await mountWithApp(RouletteView)
    expect(wrapper.get('button[aria-label="Mark as watched"]').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('Watched 5 Jan 2026')
  })

  it('does not spin again on arrival when a pick is already in the store', async () => {
    mocked.randomFilm.mockResolvedValue(makeFilm())
    const first = await mountWithApp(RouletteView)
    first.wrapper.unmount()
    mocked.randomFilm.mockClear()
    mocked.getFilm.mockResolvedValue(makeFilm()) // the kept pick is reloaded, and is unchanged
    const second = mount(RouletteView, {
      attachTo: document.body,
      global: { plugins: [first.router, getActivePinia()!] },
    })
    await flushPromises()
    expect(mocked.randomFilm).not.toHaveBeenCalled()
    expect(second.get('article h2').text()).toBe('Perfect Days')
  })

  it('has no axe violations while loading', async () => {
    mocked.randomFilm.mockReturnValue(new Promise(() => {}))
    const { wrapper } = await mountWithApp(RouletteView)
    expect(wrapper.find('[aria-busy="true"]').exists()).toBe(true)
    await expectNoA11yViolations(wrapper.element)
  })

  it('still says the filters left no film after leaving the screen and coming back', async () => {
    mocked.randomFilm.mockResolvedValueOnce(makeFilm())
    const first = await mountWithApp(RouletteView)
    mocked.randomFilm.mockRejectedValue(new api.ApiError(404, 'No unwatched film matches'))
    await first.wrapper.get('#country').setValue('NZ')
    await first.wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(first.wrapper.text()).toContain('No film fits these filters')
    first.wrapper.unmount()

    const second = mount(RouletteView, {
      attachTo: document.body,
      global: { plugins: [first.router, getActivePinia()!] },
    })
    await flushPromises()
    expect(second.text()).not.toContain('Nothing to spin')
  })

  describe('on a narrow screen', () => {
    it('collapses the filters, and the summary opens and closes them', async () => {
      stubNarrowScreen()
      mocked.randomFilm.mockResolvedValue(makeFilm())
      const { wrapper } = await mountWithApp(RouletteView)
      const panel = wrapper.get('details')
      expect(panel.element.open).toBe(false)
      expect(wrapper.get('summary').text()).toBe('Filters')
      // jsdom does not toggle a <details> on a summary click: open it and fire the event it fires
      panel.element.open = true
      await panel.trigger('toggle')
      expect(panel.element.open).toBe(true)
      panel.element.open = false
      await panel.trigger('toggle')
      await flushPromises()
      expect(panel.element.open).toBe(false)
      await expectNoA11yViolations(wrapper.element)
    })

    it('tells how many filters are set while the panel is closed', async () => {
      stubNarrowScreen()
      mocked.randomFilm.mockResolvedValue(makeFilm())
      const { wrapper } = await mountWithApp(RouletteView)
      await wrapper.get('#country').setValue('JP')
      await wrapper.get('#max-runtime').setValue('120')
      expect(wrapper.get('summary').text()).toBe('Filters (2 active)')
    })

    it('opens the panel and focuses the first wrong field when a filter is invalid', async () => {
      stubNarrowScreen()
      mocked.randomFilm.mockResolvedValue(makeFilm())
      const { wrapper } = await mountWithApp(RouletteView)
      await wrapper.get('#country').setValue('Japan')
      mocked.randomFilm.mockClear()
      await wrapper.get('form').trigger('submit')
      await flushPromises()
      expect(wrapper.get('details').element.open).toBe(true)
      expect(document.activeElement?.id).toBe('country')
      expect(mocked.randomFilm).not.toHaveBeenCalled()
    })

    it('passes an axe check with the panel open and its errors shown', async () => {
      stubNarrowScreen()
      mocked.randomFilm.mockResolvedValue(makeFilm())
      const { wrapper } = await mountWithApp(RouletteView)
      await wrapper.get('#year-from').setValue('1500')
      await wrapper.get('#country').setValue('Japan')
      await wrapper.get('form').trigger('submit')
      await flushPromises()
      expect(wrapper.get('details').element.open).toBe(true)
      expect(document.activeElement?.id).toBe('year-from')
      await expectNoA11yViolations(wrapper.element)
    })

    it('remembers that the user opened the panel when the screen goes wide and narrow again', async () => {
      const screen = stubNarrowScreen()
      mocked.randomFilm.mockResolvedValue(makeFilm())
      const { wrapper } = await mountWithApp(RouletteView)
      const panel = wrapper.get('details')
      panel.element.open = true
      await panel.trigger('toggle')
      screen.resize(true)
      await flushPromises()
      screen.resize(false)
      await flushPromises()
      expect(panel.element.open).toBe(true)
    })

    it('moves focus to the wrong field also when the panel was already open', async () => {
      stubNarrowScreen()
      mocked.randomFilm.mockResolvedValue(makeFilm())
      const { wrapper } = await mountWithApp(RouletteView)
      const panel = wrapper.get('details')
      panel.element.open = true
      await panel.trigger('toggle')
      await wrapper.get('#country').setValue('Japan')
      ;(document.querySelector('button[aria-label="Spin again"]') as HTMLElement).focus()
      await wrapper.get('form').trigger('submit')
      await flushPromises()
      expect(document.activeElement?.id).toBe('country')
    })

    it('keeps the filters heading for screen readers instead of removing it', async () => {
      stubNarrowScreen()
      mocked.randomFilm.mockResolvedValue(makeFilm())
      const { wrapper } = await mountWithApp(RouletteView)
      expect(wrapper.get('#filters-heading').classes()).toContain('sr-only')
      expect(wrapper.get('#filters-heading').text()).toBe('Filters (optional)')
    })

    it('shows the filters again, without a toggle, when the screen becomes wide', async () => {
      const screen = stubNarrowScreen()
      mocked.randomFilm.mockResolvedValue(makeFilm())
      const { wrapper } = await mountWithApp(RouletteView)
      expect(wrapper.get('details').element.open).toBe(false)
      screen.resize(true)
      await flushPromises()
      expect(wrapper.get('details').element.open).toBe(true)
    })
  })

  it('does not move focus when a filter is invalid and the filters are already shown', async () => {
    mocked.randomFilm.mockResolvedValue(makeFilm())
    const { wrapper } = await mountWithApp(RouletteView)
    await wrapper.get('#country').setValue('Japan')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('#country').attributes('aria-invalid')).toBe('true')
    expect(document.activeElement?.id).not.toBe('country')
  })

  it('keeps the filters open on a screen without matchMedia (and on wide screens)', async () => {
    mocked.randomFilm.mockResolvedValue(makeFilm())
    const { wrapper } = await mountWithApp(RouletteView)
    expect(wrapper.get('details').element.open).toBe(true)
  })
})
