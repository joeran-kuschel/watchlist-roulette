import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
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
    expect(wrapper.get('[role="status"]').text()).toBe('Picked Perfect Days from your whole list')
    await expectNoA11yViolations(wrapper.element)
  })

  it('explains the optional year and runtime filters with hints, not placeholders', async () => {
    mocked.randomFilm.mockResolvedValue(makeFilm())
    const { wrapper } = await mountWithApp(RouletteView)
    for (const id of ['year-from', 'year-to', 'max-runtime']) {
      expect(wrapper.get(`#${id}`).attributes('placeholder')).toBeUndefined()
    }
    const years = wrapper.get('fieldset')
    expect(years.attributes('aria-describedby')).toBe('year-hint')
    expect(wrapper.get('#year-hint').text()).toBe('Optional. For example 1970 to 2026.')
    expect(years.find('#year-hint').exists()).toBe(true)
    expect(wrapper.get('#max-runtime').attributes('aria-describedby')).toBe('max-runtime-hint')
    expect(wrapper.get('#max-runtime-hint').text()).toBe('Optional. For example 120.')
    await expectNoA11yViolations(wrapper.element)
  })

  it('points each input with a hint and an error to both, hint first', async () => {
    mocked.randomFilm.mockResolvedValue(makeFilm())
    const { wrapper } = await mountWithApp(RouletteView)
    await wrapper.get('#country').setValue('Japan')
    await wrapper.get('#max-runtime').setValue('0')
    await wrapper.get('#year-from').setValue('1500')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('#country').attributes('aria-describedby')).toBe('country-hint country-error')
    expect(wrapper.get('#max-runtime').attributes('aria-describedby')).toBe(
      'max-runtime-hint max-runtime-error',
    )
    expect(wrapper.get('#max-runtime-error').text()).toMatch(/runtime/i)
    // The year hint stays on the fieldset; the inputs only reference their own error
    expect(wrapper.get('fieldset').attributes('aria-describedby')).toBe('year-hint')
    expect(wrapper.get('#year-from').attributes('aria-describedby')).toBe('year-from-error')
    expect(wrapper.get('#year-to').attributes('aria-describedby')).toBeUndefined()
    expect(wrapper.get('#country-hint').text()).toBe('Two letters, for example JP or FR')
    await expectNoA11yViolations(wrapper.element)
  })

  it('drops the error id from aria-describedby but keeps the hint once the input is valid', async () => {
    mocked.randomFilm.mockResolvedValue(makeFilm())
    const { wrapper } = await mountWithApp(RouletteView)
    await wrapper.get('#max-runtime').setValue('0')
    await wrapper.get('form').trigger('submit')
    await wrapper.get('#max-runtime').setValue('120')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('#max-runtime').attributes('aria-describedby')).toBe('max-runtime-hint')
    expect(wrapper.get('#max-runtime').attributes('aria-invalid')).toBeUndefined()
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

  it('asks for the side-by-side layout from 990 px, the same width as the CSS breakpoint', async () => {
    const queries: string[] = []
    vi.stubGlobal('matchMedia', (query: string) => {
      queries.push(query)
      return { matches: true, addEventListener: () => {}, removeEventListener: () => {} }
    })
    mocked.randomFilm.mockResolvedValue(makeFilm())
    await mountWithApp(RouletteView)
    expect(queries).toEqual(['(min-width: 990px)'])
    // jsdom applies no CSS, so keep the stylesheet's collapse breakpoint in step by reading the source
    const source = readFileSync(resolve(import.meta.dirname, '../RouletteView.vue'), 'utf8')
    expect(source).toMatch(/@media \(max-width: 989\.98px\) \{\s*\.roulette__filters \{/)
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

    it('keeps the hints wired to the inputs inside the collapsed panel', async () => {
      stubNarrowScreen()
      mocked.randomFilm.mockResolvedValue(makeFilm())
      const { wrapper } = await mountWithApp(RouletteView)
      expect(wrapper.get('details').element.open).toBe(false)
      expect(wrapper.get('fieldset').attributes('aria-describedby')).toBe('year-hint')
      expect(wrapper.get('#year-hint').text()).toBe('Optional. For example 1970 to 2026.')
      expect(wrapper.get('#max-runtime').attributes('aria-describedby')).toBe('max-runtime-hint')
      expect(wrapper.get('#max-runtime-hint').text()).toBe('Optional. For example 120.')
      expect(wrapper.get('#country').attributes('aria-describedby')).toBe('country-hint')
      for (const id of ['year-from', 'year-to', 'max-runtime', 'country']) {
        expect(wrapper.get(`#${id}`).attributes('placeholder')).toBeUndefined()
      }
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

describe('RouletteView: hints about spinning', () => {
  it('tells that filters only apply on Spin again', async () => {
    mocked.randomFilm.mockResolvedValue(makeFilm())
    const { wrapper } = await mountWithApp(RouletteView)
    expect(wrapper.get('.lead').text()).toBe('Set your filters, then press Spin again. Nothing changes until you do.')
    await wrapper.get('#year-from').setValue('1990')
    await flushPromises()
    expect(mocked.randomFilm).toHaveBeenCalledTimes(1) // changing a filter does not spin
  })

  it('says that the first pick comes from the whole list, and drops the note on the next spin', async () => {
    mocked.randomFilm.mockResolvedValue(makeFilm())
    const { wrapper } = await mountWithApp(RouletteView)
    expect(wrapper.get('.roulette__first').text()).toContain('comes from your whole list, before any filter')
    await expectNoA11yViolations(wrapper.element)
    await wrapper.get('button[aria-label="Spin again"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('.roulette__first').exists()).toBe(false)
  })

  it('shows no first-pick note when there is no film or the pick failed', async () => {
    mocked.randomFilm.mockRejectedValue(new api.ApiError(404, 'none'))
    const { wrapper } = await mountWithApp(RouletteView)
    expect(wrapper.find('.roulette__first').exists()).toBe(false)
  })

  it('keeps the note when the screen is left and opened again with the same first pick', async () => {
    mocked.randomFilm.mockResolvedValue(makeFilm())
    const first = await mountWithApp(RouletteView)
    first.wrapper.unmount()
    mocked.getFilm.mockResolvedValue(makeFilm())
    const second = mount(RouletteView, {
      attachTo: document.body,
      global: { plugins: [first.router, getActivePinia()!] },
    })
    await flushPromises()
    expect(second.find('.roulette__first').exists()).toBe(true)
  })

  it('drops the note when the user spins with a filter set', async () => {
    mocked.randomFilm.mockResolvedValue(makeFilm())
    const { wrapper } = await mountWithApp(RouletteView)
    await wrapper.get('#country').setValue('jp')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.find('.roulette__first').exists()).toBe(false)
  })

  it('keeps the note after the first pick is marked as watched', async () => {
    mocked.randomFilm.mockResolvedValue(makeFilm())
    mocked.updateFilm.mockResolvedValue(makeFilm({ watchedAt: '2026-01-01T00:00:00.000Z' }))
    const { wrapper } = await mountWithApp(RouletteView)
    await wrapper.get('button[aria-label="Mark as watched"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('.roulette__first').exists()).toBe(true)
  })

  it('keeps the note when filters are cleared without spinning', async () => {
    mocked.randomFilm.mockResolvedValue(makeFilm())
    const { wrapper } = await mountWithApp(RouletteView)
    await wrapper.get('#country').setValue('jp')
    await wrapper.get('button[aria-label="Clear filters"]').trigger('click')
    expect(wrapper.find('.roulette__first').exists()).toBe(true)
  })

  it('shows no note after Try again following a failed first pick', async () => {
    mocked.randomFilm.mockRejectedValueOnce(new api.ApiError(0, 'down'))
    const { wrapper } = await mountWithApp(RouletteView)
    mocked.randomFilm.mockResolvedValueOnce(makeFilm())
    await wrapper.get('button.btn').trigger('click')
    await flushPromises()
    expect(wrapper.get('article h2').text()).toBe('Perfect Days')
    expect(wrapper.find('.roulette__first').exists()).toBe(false)
  })

  it('replaces a first pick that was watched elsewhere when the screen is opened again', async () => {
    mocked.randomFilm.mockResolvedValueOnce(makeFilm())
    const first = await mountWithApp(RouletteView)
    first.wrapper.unmount()
    mocked.getFilm.mockResolvedValue(makeFilm({ watchedAt: '2026-01-01T00:00:00.000Z' }))
    mocked.randomFilm.mockResolvedValueOnce(makeFilm({ id: 2, title: 'Next' }))
    const second = mount(RouletteView, {
      attachTo: document.body,
      global: { plugins: [first.router, getActivePinia()!] },
    })
    await flushPromises()
    expect(second.get('article h2').text()).toBe('Next')
  })
})
