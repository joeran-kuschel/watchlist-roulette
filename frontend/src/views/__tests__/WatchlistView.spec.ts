import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import * as api from '../../api'
import { expectNoA11yViolations, makeFilm, mountWithApp } from '../../__tests__/helpers'
import { RouterView } from 'vue-router'
import WatchlistView from '../WatchlistView.vue'

vi.mock('../../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api')>()),
  listFilms: vi.fn<typeof import('../../api').listFilms>(),
  updateFilm: vi.fn<typeof import('../../api').updateFilm>(),
}))
const mocked = vi.mocked(api)

const films = [
  makeFilm({ id: 1, title: 'Perfect Days' }),
  makeFilm({ id: 2, title: 'Aftersun', releaseYear: 2022, watchedAt: '2025-03-04T10:00:00.000Z' }),
  makeFilm({
    id: 3,
    title: 'Cléo from 5 to 7',
    letterboxdUrl: null,
    releaseYear: null,
    tmdb: { id: null, status: 'ambiguous', syncedAt: null },
  }),
  makeFilm({ id: 4, title: 'Rare Home Video', tmdb: { id: null, status: 'not_found', syncedAt: null } }),
  makeFilm({ id: 5, title: 'Broken Lookup', tmdb: { id: null, status: 'error', syncedAt: null } }),
]
// A copy, because the store replaces entries in the array it is given
const listing = (items = films, total = items.length, page = 1) => ({ items: [...items], total, page, pageSize: 50 })

beforeEach(() => {
  vi.resetAllMocks()
  mocked.listFilms.mockResolvedValue(listing())
})
afterEach(() => (document.body.innerHTML = ''))

describe('WatchlistView', () => {
  it('loads with the default view and lists the films in an accessible table', async () => {
    const { wrapper } = await mountWithApp(WatchlistView, '/watchlist')
    expect(mocked.listFilms).toHaveBeenCalledWith({
      q: undefined,
      watched: 'all',
      sort: 'added_at',
      order: 'desc',
      page: 1,
      pageSize: 50,
    })
    expect(wrapper.get('h1').text()).toBe('Watchlist')
    expect(wrapper.text()).toContain('5 films')
    expect(wrapper.get('caption').text()).toBe('Films on your watchlist')
    expect(wrapper.findAll('thead th').map((th) => th.text())).toEqual(['Title', 'Year', 'Added', 'Status', 'Actions'])
    expect(wrapper.findAll('tbody tr')).toHaveLength(5)
    await expectNoA11yViolations(wrapper.element)
  })

  it('reads the view from the URL', async () => {
    await mountWithApp(WatchlistView, '/watchlist?q=days&watched=false&sort=year-asc&page=2')
    expect(mocked.listFilms).toHaveBeenCalledWith({
      q: 'days',
      watched: 'false',
      sort: 'release_year',
      order: 'asc',
      page: 2,
      pageSize: 50,
    })
  })

  it('shows title links, years, dates, watched state and TMDB problems', async () => {
    const { wrapper } = await mountWithApp(WatchlistView, '/watchlist')
    const rows = wrapper.findAll('tbody tr')
    const first = rows[0]!
    expect(first.get('th a').attributes('href')).toBe('https://boxd.it/abc')
    expect(first.get('th a').text()).toContain('opens Letterboxd in a new tab')
    expect(first.text()).toContain('2023')
    expect(first.text()).toContain('12 Mar 2025')
    expect(first.text()).toContain('To watch')
    expect(rows[1]!.text()).toContain('Watched 4 Mar 2025')
    expect(rows[2]!.find('th a').exists()).toBe(false)
    expect(rows[2]!.text()).toContain('—')
    expect(rows[2]!.text()).toContain('Needs review: several TMDB matches')
    expect(rows[3]!.text()).toContain('Not found on TMDB')
    expect(rows[4]!.text()).toContain('TMDB lookup failed')
    expect(first.text()).not.toContain('TMDB')
  })

  it('offers per-film icon actions with the film in their names', async () => {
    const { wrapper } = await mountWithApp(WatchlistView, '/watchlist')
    const names = (row: number) =>
      wrapper
        .findAll('tbody tr')
        [row]!.findAll('.watchlist__actions [aria-label]')
        .map((el) => el.attributes('aria-label'))
    expect(names(0)).toEqual(['Mark Perfect Days as watched', 'Edit Perfect Days'])
    expect(names(1)).toEqual(['Mark Aftersun as unwatched', 'Edit Aftersun'])
    expect(names(2)).toEqual([
      'Mark Cléo from 5 to 7 as watched',
      'Choose TMDB match for Cléo from 5 to 7',
      'Edit Cléo from 5 to 7',
    ])
    expect(wrapper.find('a[href="/watchlist/3/match"]').exists()).toBe(true)
    expect(wrapper.find('a[href="/watchlist/1/edit"]').exists()).toBe(true)
    expect(wrapper.find('a[href="/watchlist/new"]').exists()).toBe(true)
  })

  it('marks a film as watched and announces it', async () => {
    const { wrapper } = await mountWithApp(WatchlistView, '/watchlist')
    mocked.updateFilm.mockResolvedValue(makeFilm({ id: 1, watchedAt: '2026-10-11T10:00:00.000Z' }))
    await wrapper.get('button[aria-label="Mark Perfect Days as watched"]').trigger('click')
    await flushPromises()
    expect(mocked.updateFilm).toHaveBeenCalledWith(1, { watched: true })
    expect(wrapper.get('.watchlist__notice').text()).toBe('Perfect Days is marked as watched.')
    expect(wrapper.find('button[aria-label="Mark Perfect Days as unwatched"]').exists()).toBe(true)
  })

  it('shows an error when the update fails', async () => {
    const { wrapper } = await mountWithApp(WatchlistView, '/watchlist')
    mocked.updateFilm.mockRejectedValue(new api.ApiError(404, 'Film not found'))
    await wrapper.get('button[aria-label="Mark Perfect Days as watched"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('Film not found')
  })

  it('puts the search into the URL and reloads', async () => {
    const { wrapper, router } = await mountWithApp(WatchlistView, '/watchlist?page=3')
    await wrapper.get('#search').setValue('days')
    await wrapper.get('form[role="search"]').trigger('submit')
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({ q: 'days' })
    expect(mocked.listFilms).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'days', page: 1 }))
  })

  it('reloads when the filter or sort changes', async () => {
    const { wrapper, router } = await mountWithApp(WatchlistView, '/watchlist')
    await wrapper.get('#watched').setValue('true')
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({ watched: 'true' })
    await wrapper.get('#sort').setValue('title')
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({ watched: 'true', sort: 'title' })
    expect(mocked.listFilms).toHaveBeenLastCalledWith(
      expect.objectContaining({ watched: 'true', sort: 'title', order: 'asc' }),
    )
    expect(wrapper.text()).toContain('matching films')
  })

  it('pages with links and disables the unavailable direction', async () => {
    mocked.listFilms.mockResolvedValue(listing(films, 120, 2))
    const { wrapper } = await mountWithApp(WatchlistView, '/watchlist?page=2&sort=title')
    expect(wrapper.get('nav[aria-label="Pagination"] p').text()).toBe('Showing 51–100 of 120')
    expect(wrapper.get('a[aria-label="Previous page"]').attributes('href')).toBe('/watchlist?sort=title')
    expect(wrapper.get('a[aria-label="Next page"]').attributes('href')).toBe('/watchlist?sort=title&page=3')
  })

  it('disables Previous on the first page and Next on the last', async () => {
    mocked.listFilms.mockResolvedValue(listing(films, 5, 1))
    const { wrapper } = await mountWithApp(WatchlistView, '/watchlist')
    expect(wrapper.get('button[aria-label="Previous page"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('button[aria-label="Next page"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('nav[aria-label="Pagination"] p').text()).toBe('Showing 1–5 of 5')
  })

  it('shows the empty state of an empty list', async () => {
    mocked.listFilms.mockResolvedValue(listing([], 0))
    const { wrapper } = await mountWithApp(WatchlistView, '/watchlist')
    expect(wrapper.text()).toContain('Your watchlist is empty')
    expect(wrapper.find('table').exists()).toBe(false)
    expect(wrapper.find('.card a[href="/import"]').exists()).toBe(true)
    await expectNoA11yViolations(wrapper.element)
  })

  it('shows the no-results state for a search and offers a reset', async () => {
    mocked.listFilms.mockResolvedValue(listing([], 0))
    const { wrapper } = await mountWithApp(WatchlistView, '/watchlist?q=zzz')
    expect(wrapper.text()).toContain('No films match your search')
    expect(wrapper.get('a[href="/watchlist"].btn').text()).toBe('Reset search')
  })

  it('shows a load error and retries', async () => {
    mocked.listFilms.mockRejectedValueOnce(new api.ApiError(0, 'x'))
    const { wrapper } = await mountWithApp(WatchlistView, '/watchlist')
    expect(wrapper.get('[role="alert"]').text()).toMatch(/Can't reach the server/)
    expect(wrapper.find('table').exists()).toBe(false)
    await wrapper.get('[role="alert"] button').trigger('click')
    await flushPromises()
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(wrapper.findAll('tbody tr')).toHaveLength(5)
  })

  it('shows a loading message', async () => {
    mocked.listFilms.mockReturnValue(new Promise(() => {}))
    const { wrapper } = await mountWithApp(WatchlistView, '/watchlist')
    expect(wrapper.get('[aria-busy="true"]').text()).toBe('Loading films…')
  })

  it('forgets the notice when leaving', async () => {
    const { wrapper } = await mountWithApp(WatchlistView, '/watchlist')
    const { useWatchlistStore } = await import('../../stores/watchlist')
    const store = useWatchlistStore()
    store.notice = 'Joy was added.'
    await flushPromises()
    expect(wrapper.get('.watchlist__notice').text()).toBe('Joy was added.')
    wrapper.unmount()
    expect(store.notice).toBe('')
  })
})

describe('WatchlistView: edge cases', () => {
  it('shows the film count and the singular for one film', async () => {
    mocked.listFilms.mockResolvedValue(listing([films[0]!], 1))
    const { wrapper } = await mountWithApp(WatchlistView, '/watchlist')
    expect(wrapper.get('.lead').text()).toBe('1 films')
    expect(wrapper.get('nav[aria-label="Pagination"] p').text()).toBe('Showing 1–1 of 1')
  })

  it('shows "Loading…" instead of a count until the list is there', async () => {
    mocked.listFilms.mockReturnValue(new Promise(() => {}))
    const { wrapper } = await mountWithApp(WatchlistView, '/watchlist')
    expect(wrapper.get('.lead').text()).toBe('Loading…')
  })

  it('keeps search, filter and sort in the pagination links', async () => {
    mocked.listFilms.mockResolvedValue(listing(films, 120, 2))
    const { wrapper } = await mountWithApp(WatchlistView, '/watchlist?q=days&watched=false&sort=year-asc&page=2')
    const next = wrapper.get('a[aria-label="Next page"]').attributes('href')!
    expect(new URLSearchParams(next.split('?')[1])).toEqual(
      new URLSearchParams({ q: 'days', watched: 'false', sort: 'year-asc', page: '3' }),
    )
  })

  it('fills the form from the URL', async () => {
    const { wrapper } = await mountWithApp(WatchlistView, '/watchlist?q=days&watched=true&sort=title')
    expect((wrapper.get('#search').element as HTMLInputElement).value).toBe('days')
    expect((wrapper.get('#watched').element as HTMLSelectElement).value).toBe('true')
    expect((wrapper.get('#sort').element as HTMLSelectElement).value).toBe('title')
  })

  it('falls back to the defaults for unknown values in the URL', async () => {
    await mountWithApp(WatchlistView, '/watchlist?watched=maybe&sort=nope&page=-2')
    expect(mocked.listFilms).toHaveBeenCalledWith(
      expect.objectContaining({ watched: 'all', sort: 'added_at', order: 'desc', page: 1 }),
    )
  })

  it('follows the back button: the form and the list return to the earlier state', async () => {
    const { wrapper, router } = await mountWithApp(WatchlistView, '/watchlist')
    await wrapper.get('#search').setValue('days')
    await wrapper.get('form[role="search"]').trigger('submit')
    await flushPromises()
    router.back()
    await flushPromises()
    expect((wrapper.get('#search').element as HTMLInputElement).value).toBe('')
    expect(mocked.listFilms).toHaveBeenLastCalledWith(expect.objectContaining({ q: undefined }))
  })

  it('does not put a search of only spaces into the URL', async () => {
    const { wrapper, router } = await mountWithApp(WatchlistView, '/watchlist')
    await wrapper.get('#search').setValue('   ')
    await wrapper.get('form[role="search"]').trigger('submit')
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({})
  })

  it('searches for a non-ASCII title', async () => {
    const { wrapper, router } = await mountWithApp(WatchlistView, '/watchlist')
    await wrapper.get('#search').setValue('Cléo 千尋')
    await wrapper.get('form[role="search"]').trigger('submit')
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({ q: 'Cléo 千尋' })
    expect(mocked.listFilms).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'Cléo 千尋' }))
  })

  it('goes back to page 1 when the sort changes', async () => {
    mocked.listFilms.mockResolvedValue(listing(films, 120, 3))
    const { wrapper, router } = await mountWithApp(WatchlistView, '/watchlist?page=3')
    await wrapper.get('#sort').setValue('title')
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({ sort: 'title' })
  })

  it('offers the five sort choices and the three watched filters with labels', async () => {
    const { wrapper } = await mountWithApp(WatchlistView, '/watchlist')
    expect(wrapper.findAll('#sort option').map((o) => o.text())).toEqual([
      'Date added, newest first',
      'Date added, oldest first',
      'Release year, newest first',
      'Release year, oldest first',
      'Title, A to Z',
    ])
    expect(wrapper.findAll('#watched option').map((o) => o.text())).toEqual(['All films', 'Unwatched', 'Watched'])
  })

  it('resets a search through the link to the plain watchlist', async () => {
    mocked.listFilms.mockResolvedValue(listing([], 0))
    const { wrapper, router } = await mountWithApp(WatchlistView, '/watchlist?watched=true')
    expect(wrapper.text()).toContain('No films match your search')
    await wrapper.get('a.btn').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/watchlist')
  })

  it('treats a watched filter alone as filtered when nothing matches', async () => {
    mocked.listFilms.mockResolvedValue(listing([], 0))
    const { wrapper } = await mountWithApp(WatchlistView, '/watchlist?watched=false')
    expect(wrapper.text()).not.toContain('Your watchlist is empty')
  })

  it('keeps showing the table when only the update fails, with the error above it', async () => {
    const { wrapper } = await mountWithApp(WatchlistView, '/watchlist')
    mocked.updateFilm.mockRejectedValue(new api.ApiError(0, 'x'))
    await wrapper.get('button[aria-label="Mark Perfect Days as watched"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toMatch(/Can't reach the server/)
    expect(wrapper.findAll('tbody tr')).toHaveLength(5)
  })

  it('un-marks a watched film', async () => {
    const { wrapper } = await mountWithApp(WatchlistView, '/watchlist')
    mocked.updateFilm.mockResolvedValue(makeFilm({ id: 2, title: 'Aftersun', watchedAt: null }))
    await wrapper.get('button[aria-label="Mark Aftersun as unwatched"]').trigger('click')
    await flushPromises()
    expect(mocked.updateFilm).toHaveBeenCalledWith(2, { watched: false })
    expect(wrapper.get('.watchlist__notice').text()).toBe('Aftersun is marked as unwatched.')
    expect(wrapper.find('button[aria-label="Mark Aftersun as watched"]').exists()).toBe(true)
  })

  it('shows a long title and a film without year and link', async () => {
    const title = 'Eine sehr lange Überschrift '.repeat(10).trim()
    mocked.listFilms.mockResolvedValue(listing([makeFilm({ title, releaseYear: null, letterboxdUrl: null })]))
    const { wrapper } = await mountWithApp(WatchlistView, '/watchlist')
    expect(wrapper.get('tbody th').text()).toBe(title)
    expect(wrapper.findAll('tbody td')[0]!.text()).toBe('—')
    expect(wrapper.find('tbody th a').exists()).toBe(false)
  })

  it('opens Letterboxd safely in a new tab and says so', async () => {
    const { wrapper } = await mountWithApp(WatchlistView, '/watchlist')
    const link = wrapper.get('tbody th a')
    expect(link.attributes('target')).toBe('_blank')
    expect(link.attributes('rel')).toBe('noopener noreferrer')
    expect(link.text()).toContain('opens Letterboxd in a new tab')
  })

  it('has no axe violations in the load error, the no-results and the loading state', async () => {
    mocked.listFilms.mockRejectedValueOnce(new api.ApiError(500, 'x'))
    const error = await mountWithApp(WatchlistView, '/watchlist')
    expect(error.wrapper.find('[role="alert"]').exists()).toBe(true)
    await expectNoA11yViolations(error.wrapper.element)
    error.wrapper.unmount()

    mocked.listFilms.mockResolvedValue(listing([], 0))
    const none = await mountWithApp(WatchlistView, '/watchlist?q=zzz')
    expect(none.wrapper.text()).toContain('No films match your search')
    await expectNoA11yViolations(none.wrapper.element)
    none.wrapper.unmount()

    mocked.listFilms.mockReturnValue(new Promise(() => {}))
    const loading = await mountWithApp(WatchlistView, '/watchlist')
    await expectNoA11yViolations(loading.wrapper.element)
  })

  it('has no axe violations in the paged table with disabled buttons', async () => {
    mocked.listFilms.mockResolvedValue(listing(films, 120, 3))
    const { wrapper } = await mountWithApp(WatchlistView, '/watchlist?page=3')
    expect(wrapper.get('nav[aria-label="Pagination"] p').text()).toBe('Showing 101–120 of 120')
    await expectNoA11yViolations(wrapper.element)
  })

  it('does not reload the list when the user leaves for another screen', async () => {
    const { router } = await mountWithApp(RouterView, '/watchlist')
    expect(mocked.listFilms).toHaveBeenCalledTimes(1)
    await router.push('/watchlist/new')
    await flushPromises()
    expect(mocked.listFilms).toHaveBeenCalledTimes(1)
  })

  it('does not show a backwards range when the page is past the end', async () => {
    mocked.listFilms.mockResolvedValue(listing([], 120, 100))
    const { wrapper } = await mountWithApp(WatchlistView, '/watchlist?page=100')
    expect(wrapper.get('nav[aria-label="Pagination"] p').text()).not.toMatch(/Showing 4951/)
  })
})
