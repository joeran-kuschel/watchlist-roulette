import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { getActivePinia } from 'pinia'
import * as api from '../../api'
import { expectNoA11yViolations, makeFilm, mountWithApp } from '../../__tests__/helpers'
import BackLink from '../../components/BackLink.vue'
import FilmCard from '../../components/FilmCard.vue'
import { isHttpUrl } from '../../format'
import { MAX_YEAR, MIN_YEAR } from '../../filters'
import { validateFilmForm, emptyFilmForm } from '../../filmForm'
import FilmFormView from '../FilmFormView.vue'
import RouletteView from '../RouletteView.vue'
import WatchlistView from '../WatchlistView.vue'

vi.mock('../../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api')>()),
  randomFilm: vi.fn<typeof import('../../api').randomFilm>(),
  getFilm: vi.fn<typeof import('../../api').getFilm>(),
  deleteFilm: vi.fn<typeof import('../../api').deleteFilm>(),
  listFilms: vi.fn<typeof import('../../api').listFilms>(),
}))
const mocked = vi.mocked(api)

beforeEach(() => vi.resetAllMocks())
afterEach(() => (document.body.innerHTML = ''))

describe('Roulette: spin button and kept pick', () => {
  it('disables Spin again while a pick is loading', async () => {
    mocked.randomFilm.mockReturnValue(new Promise(() => {}))
    const { wrapper } = await mountWithApp(RouletteView)
    expect(wrapper.get('button[aria-label="Spin again"]').attributes('disabled')).toBeDefined()
  })

  it('reloads the kept pick when the screen is opened again', async () => {
    mocked.randomFilm.mockResolvedValue(makeFilm())
    const first = await mountWithApp(RouletteView)
    first.wrapper.unmount()
    mocked.getFilm.mockResolvedValue(makeFilm({ title: 'Perfect Days (edited)' }))
    const second = mount(RouletteView, {
      attachTo: document.body,
      global: { plugins: [first.router, getActivePinia()!] },
    })
    await flushPromises()
    expect(mocked.getFilm).toHaveBeenCalledWith(1)
    expect(mocked.randomFilm).toHaveBeenCalledTimes(1)
    expect(second.get('article h2').text()).toBe('Perfect Days (edited)')
  })

  it('picks a new film when the kept one was deleted meanwhile', async () => {
    mocked.randomFilm.mockResolvedValue(makeFilm())
    const first = await mountWithApp(RouletteView)
    first.wrapper.unmount()
    mocked.getFilm.mockRejectedValue(new api.ApiError(404, 'Film not found'))
    mocked.randomFilm.mockResolvedValue(makeFilm({ id: 2, title: 'Stalker' }))
    const second = mount(RouletteView, {
      attachTo: document.body,
      global: { plugins: [first.router, getActivePinia()!] },
    })
    await flushPromises()
    expect(mocked.randomFilm).toHaveBeenCalledTimes(2)
    expect(second.get('article h2').text()).toBe('Stalker')
  })
})

describe('Letterboxd links only for web addresses', () => {
  it('recognizes http and https', () => {
    expect(isHttpUrl('https://boxd.it/x')).toBe(true)
    expect(isHttpUrl('http://boxd.it/x')).toBe(true)
    for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'ftp://x.org', 'boxd.it/x', '']) {
      expect(isHttpUrl(bad)).toBe(false)
    }
  })

  it('does not render a javascript: address as a link in the film card', () => {
    const wrapper = mount(FilmCard, { props: { film: makeFilm({ letterboxdUrl: 'javascript:alert(1)' }) } })
    expect(wrapper.find('a').exists()).toBe(false)
  })

  it('names the film card link after its site', () => {
    const card = (url: string) => mount(FilmCard, { props: { film: makeFilm({ letterboxdUrl: url }) } }).get('a').text()
    expect(card('https://boxd.it/x')).toContain('Open on Letterboxd')
    expect(card('https://www.imdb.com/title/tt0113277/')).toContain('Open on IMDb')
  })

  it('never links a javascript: address from the watchlist; the title goes to the details page', async () => {
    mocked.listFilms.mockResolvedValue({
      items: [makeFilm({ letterboxdUrl: 'javascript:alert(1)' })],
      total: 1,
      page: 1,
      pageSize: 50,
    })
    const { wrapper } = await mountWithApp(WatchlistView, '/watchlist')
    expect(wrapper.get('tbody th a').attributes('href')).toBe('/watchlist/1')
    expect(wrapper.html()).not.toContain('javascript:')
  })
})

describe('Watchlist: tooltip names', () => {
  it('shows a tooltip that is part of the accessible name (WCAG 2.5.3)', async () => {
    mocked.listFilms.mockResolvedValue({
      items: [makeFilm({ title: 'Cléo', tmdb: { id: null, mediaType: 'movie', status: 'ambiguous', syncedAt: null } })],
      total: 1,
      page: 1,
      pageSize: 50,
    })
    const { wrapper } = await mountWithApp(WatchlistView, '/watchlist')
    const link = wrapper.get('a[href$="/match"]')
    expect(link.get('.icon-button__tip').text()).toBe('Choose TMDB match')
    expect(link.attributes('aria-label')).toContain('Choose TMDB match')
  })

  it('has a name that contains the tooltip text on every icon button of the table (WCAG 2.5.3)', async () => {
    mocked.listFilms.mockResolvedValue({
      items: [
        makeFilm({ id: 1, title: 'Cléo', tmdb: { id: null, mediaType: 'movie', status: 'ambiguous', syncedAt: null } }),
        makeFilm({ id: 2, title: 'Aftersun', watchedAt: '2025-03-04T10:00:00.000Z' }),
        makeFilm({ id: 3, title: 'Joy' }),
      ],
      total: 3,
      page: 1,
      pageSize: 50,
    })
    const { wrapper } = await mountWithApp(WatchlistView, '/watchlist')
    const buttons = wrapper.findAll('.icon-button')
    expect(buttons.length).toBeGreaterThan(8)
    for (const button of buttons) {
      const name = button.attributes('aria-label')!
      const tip = button.get('.icon-button__tip').text()
      expect(name, `"${name}" should contain its tooltip "${tip}"`).toContain(tip)
    }
  })

  it('keeps the film title at the end of the row button names, after the action', async () => {
    mocked.listFilms.mockResolvedValue({ items: [makeFilm({ title: 'Perfect Days' })], total: 1, page: 1, pageSize: 50 })
    const { wrapper } = await mountWithApp(WatchlistView, '/watchlist')
    const row = wrapper.get('tbody tr')
    expect(row.findAll('.icon-button').map((b) => b.attributes('aria-label'))).toEqual([
      'Mark as watched: Perfect Days',
      'Edit film: Perfect Days',
    ])
  })

  it('shows the notice in the status region after it is set', async () => {
    mocked.listFilms.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50 })
    const { wrapper } = await mountWithApp(WatchlistView, '/watchlist')
    expect(wrapper.get('.watchlist__notice').text()).toBe('')
    const { useWatchlistStore } = await import('../../stores/watchlist')
    useWatchlistStore().notice = 'Joy was added.'
    await flushPromises()
    expect(wrapper.get('.watchlist__notice').text()).toBe('Joy was added.')
  })
})

describe('Film form', () => {
  it('uses the shared year limits in its message', () => {
    const { errors } = validateFilmForm({ ...emptyFilmForm(), title: 'x', releaseYear: String(MAX_YEAR + 1) })
    expect(errors.releaseYear).toBe(`Enter a year between ${MIN_YEAR} and ${MAX_YEAR}.`)
    expect(validateFilmForm({ ...emptyFilmForm(), title: 'x', releaseYear: String(MIN_YEAR) }).errors).toEqual({})
  })

  it('disables "Yes, delete it" while the delete is running, so it cannot be sent twice', async () => {
    mocked.getFilm.mockResolvedValue(makeFilm({ id: 9, title: 'Stalker' }))
    let finish!: () => void
    mocked.deleteFilm.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)))
    const { wrapper } = await mountWithApp(FilmFormView, '/watchlist/9/edit')
    await wrapper.get('.danger button').trigger('click')
    const yes = wrapper.findAll('.danger button').find((b) => b.text() === 'Yes, delete it')!
    await yes.trigger('click')
    expect(yes.attributes('disabled')).toBeDefined()
    await yes.trigger('click')
    expect(mocked.deleteFilm).toHaveBeenCalledTimes(1)
    finish()
    await flushPromises()
  })

  it('is axe-clean with the new back link', async () => {
    mocked.getFilm.mockResolvedValue(makeFilm({ id: 9 }))
    const { wrapper } = await mountWithApp(FilmFormView, '/watchlist/9/edit')
    expect(wrapper.find('nav[aria-label="Breadcrumb"]').exists()).toBe(false)
    await expectNoA11yViolations(wrapper.element)
  })
})

describe('BackLink', () => {
  it('is a plain link to the given place', async () => {
    const { wrapper } = await mountWithApp(BackLink, '/', {
      props: { to: '/watchlist' },
      slots: { default: '← Back' },
    })
    expect(wrapper.get('a').attributes('href')).toBe('/watchlist')
    expect(wrapper.text()).toBe('← Back')
    expect(wrapper.find('nav').exists()).toBe(false)
    await expectNoA11yViolations(wrapper.element)
  })
})
