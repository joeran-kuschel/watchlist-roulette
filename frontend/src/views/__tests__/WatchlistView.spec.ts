import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import * as api from '../../api'
import { expectNoA11yViolations, makeFilm, mountWithApp } from '../../__tests__/helpers'
import { useWatchlistStore } from '../../stores/watchlist'
import { RouterView } from 'vue-router'
import WatchlistView from '../WatchlistView.vue'

vi.mock('../../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api')>()),
  listFilms: vi.fn<typeof import('../../api').listFilms>(),
  updateFilm: vi.fn<typeof import('../../api').updateFilm>(),
  getFilm: vi.fn<typeof import('../../api').getFilm>(),
  startTmdbCheck: vi.fn<typeof import('../../api').startTmdbCheck>(),
  getTmdbCheck: vi.fn<typeof import('../../api').getTmdbCheck>(),
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
    tmdb: { id: null, mediaType: 'movie', status: 'ambiguous', syncedAt: null },
  }),
  makeFilm({ id: 4, title: 'Rare Home Video', tmdb: { id: null, mediaType: 'movie', status: 'not_found', syncedAt: null } }),
  makeFilm({ id: 5, title: 'Broken Lookup', tmdb: { id: null, mediaType: 'movie', status: 'error', syncedAt: null } }),
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
    expect(first.get('th a').attributes('href')).toBe('/watchlist/1')
    expect(first.text()).toContain('2023')
    expect(first.text()).toContain('12 Mar 2025')
    expect(first.text()).toContain('To watch')
    expect(rows[1]!.text()).toContain('Watched 4 Mar 2025')
    expect(rows[2]!.get('th a').attributes('href')).toBe('/watchlist/3')
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
    expect(names(0)).toEqual(['Mark as watched: Perfect Days', 'Edit film: Perfect Days'])
    expect(names(1)).toEqual(['Mark as unwatched: Aftersun', 'Edit film: Aftersun'])
    expect(names(2)).toEqual([
      'Mark as watched: Cléo from 5 to 7',
      'Choose TMDB match: Cléo from 5 to 7',
      'Edit film: Cléo from 5 to 7',
    ])
    expect(wrapper.find('a[href="/watchlist/3/match"]').exists()).toBe(true)
    expect(wrapper.find('a[href="/watchlist/1/edit"]').exists()).toBe(true)
    expect(wrapper.find('a[href="/watchlist/new"]').exists()).toBe(true)
  })

  it('remembers its query for the way back from a film page, also unknown values', async () => {
    const { router } = await mountWithApp(WatchlistView, '/watchlist?q=days&tmdb=ambiguous&sort=nonsense&page=2')
    const store = useWatchlistStore()
    expect(store.listLocation.query).toEqual({ q: 'days', tmdb: 'ambiguous', sort: 'nonsense', page: '2' })
    await router.push('/watchlist?watched=true')
    await flushPromises()
    expect(store.listLocation.query).toEqual({ watched: 'true' })
  })

  it('keeps the remembered query after a film was marked as watched', async () => {
    const { wrapper } = await mountWithApp(WatchlistView, '/watchlist?watched=false&page=2')
    mocked.updateFilm.mockResolvedValue(makeFilm({ id: 1, watchedAt: '2026-10-11T10:00:00.000Z' }))
    await wrapper.get('button[aria-label="Mark as watched: Perfect Days"]').trigger('click')
    await flushPromises()
    expect(useWatchlistStore().listLocation.query).toEqual({ watched: 'false', page: '2' })
  })

  it('marks a film as watched and announces it', async () => {
    const { wrapper } = await mountWithApp(WatchlistView, '/watchlist')
    mocked.updateFilm.mockResolvedValue(makeFilm({ id: 1, watchedAt: '2026-10-11T10:00:00.000Z' }))
    await wrapper.get('button[aria-label="Mark as watched: Perfect Days"]').trigger('click')
    await flushPromises()
    expect(mocked.updateFilm).toHaveBeenCalledWith(1, { watched: true })
    expect(wrapper.get('.watchlist__notice').text()).toBe('Perfect Days is marked as watched.')
    expect(wrapper.find('button[aria-label="Mark as unwatched: Perfect Days"]').exists()).toBe(true)
  })

  it('shows an error when the update fails', async () => {
    const { wrapper } = await mountWithApp(WatchlistView, '/watchlist')
    mocked.updateFilm.mockRejectedValue(new api.ApiError(404, 'Film not found'))
    await wrapper.get('button[aria-label="Mark as watched: Perfect Days"]').trigger('click')
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
    expect(useWatchlistStore().listLocation.query).toEqual({})
  })

  it('treats a watched filter alone as filtered when nothing matches', async () => {
    mocked.listFilms.mockResolvedValue(listing([], 0))
    const { wrapper } = await mountWithApp(WatchlistView, '/watchlist?watched=false')
    expect(wrapper.text()).not.toContain('Your watchlist is empty')
  })

  it('keeps showing the table when only the update fails, with the error above it', async () => {
    const { wrapper } = await mountWithApp(WatchlistView, '/watchlist')
    mocked.updateFilm.mockRejectedValue(new api.ApiError(0, 'x'))
    await wrapper.get('button[aria-label="Mark as watched: Perfect Days"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toMatch(/Can't reach the server/)
    expect(wrapper.findAll('tbody tr')).toHaveLength(5)
  })

  it('un-marks a watched film', async () => {
    const { wrapper } = await mountWithApp(WatchlistView, '/watchlist')
    mocked.updateFilm.mockResolvedValue(makeFilm({ id: 2, title: 'Aftersun', watchedAt: null }))
    await wrapper.get('button[aria-label="Mark as unwatched: Aftersun"]').trigger('click')
    await flushPromises()
    expect(mocked.updateFilm).toHaveBeenCalledWith(2, { watched: false })
    expect(wrapper.get('.watchlist__notice').text()).toBe('Aftersun is marked as unwatched.')
    expect(wrapper.find('button[aria-label="Mark as watched: Aftersun"]').exists()).toBe(true)
  })

  it('shows a long title and a film without year and link', async () => {
    const title = 'Eine sehr lange Überschrift '.repeat(10).trim()
    mocked.listFilms.mockResolvedValue(listing([makeFilm({ title, releaseYear: null, letterboxdUrl: null })]))
    const { wrapper } = await mountWithApp(WatchlistView, '/watchlist')
    expect(wrapper.get('tbody th').text()).toBe(title)
    expect(wrapper.findAll('tbody td')[0]!.text()).toBe('—')
    expect(wrapper.get('tbody th a').attributes('href')).toMatch(/^\/watchlist\/\d+$/)
  })

  it('links the title to the details page in the same tab, with the title as its only text', async () => {
    const { wrapper } = await mountWithApp(WatchlistView, '/watchlist')
    const link = wrapper.get('tbody th a')
    expect(link.attributes('target')).toBeUndefined()
    expect(link.attributes('href')).toBe('/watchlist/1')
    expect(link.text()).toBe('Perfect Days')
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

  it('returns to the same list from two film pages in a row, and the last list wins', async () => {
    mocked.getFilm.mockImplementation(async (id) => films.find((f) => f.id === id)!)
    const { wrapper, router } = await mountWithApp(RouterView, '/watchlist?q=a&sort=title&page=2')
    const openFilm = async (name: string) => {
      await wrapper.get(`a[href^="/watchlist/"][href$="/${name}"]`).trigger('click')
      await vi.waitFor(() => expect(wrapper.find('.back a').exists()).toBe(true))
    }
    const goBack = async () => {
      await wrapper.get('.back a').trigger('click')
      await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/watchlist'))
      await flushPromises()
    }
    await openFilm('1')
    expect(wrapper.get('.back a').attributes('href')).toBe('/watchlist?q=a&sort=title&page=2')
    await goBack()
    expect(router.currentRoute.value.fullPath).toBe('/watchlist?q=a&sort=title&page=2')
    await openFilm('2')
    await goBack()
    expect(router.currentRoute.value.fullPath).toBe('/watchlist?q=a&sort=title&page=2')

    await router.push('/watchlist?watched=true')
    await flushPromises()
    await openFilm('1')
    expect(wrapper.get('.back a').attributes('href')).toBe('/watchlist?watched=true')
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

describe('WatchlistView TMDB status filter', () => {
  it('offers a labelled select with every status', async () => {
    const { wrapper } = await mountWithApp(WatchlistView, '/watchlist')
    expect(wrapper.get('label[for="tmdb"]').text()).toBe('TMDB status')
    expect(wrapper.findAll('#tmdb option').map((o) => [o.attributes('value'), o.text()])).toEqual([
      ['all', 'Any status'],
      ['pending', 'Pending'],
      ['ambiguous', 'Needs review'],
      ['not_found', 'Not found'],
      ['error', 'Lookup failed'],
      ['matched', 'Matched'],
    ])
    expect((wrapper.get('#tmdb').element as HTMLSelectElement).value).toBe('all')
  })

  it('puts the choice into the URL, reloads with tmdbStatus and keeps the other filters', async () => {
    const { wrapper, router } = await mountWithApp(WatchlistView, '/watchlist?watched=false&page=2')
    await wrapper.get('#tmdb').setValue('ambiguous')
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({ watched: 'false', tmdb: 'ambiguous' })
    expect(mocked.listFilms).toHaveBeenLastCalledWith(
      expect.objectContaining({ watched: 'false', tmdbStatus: 'ambiguous', page: 1 }),
    )
    expect(wrapper.text()).toContain('matching films')
  })

  it('takes the status out of the URL again when "Any status" is chosen', async () => {
    const { wrapper, router } = await mountWithApp(WatchlistView, '/watchlist?tmdb=pending')
    await wrapper.get('#tmdb').setValue('all')
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({})
    expect(mocked.listFilms).toHaveBeenLastCalledWith(expect.objectContaining({ tmdbStatus: undefined }))
  })

  it('fills the select from the URL and sends the status', async () => {
    const { wrapper } = await mountWithApp(WatchlistView, '/watchlist?tmdb=not_found')
    expect((wrapper.get('#tmdb').element as HTMLSelectElement).value).toBe('not_found')
    expect(mocked.listFilms).toHaveBeenCalledWith(expect.objectContaining({ tmdbStatus: 'not_found' }))
  })

  it('ignores an unknown status in the URL', async () => {
    const { wrapper } = await mountWithApp(WatchlistView, '/watchlist?tmdb=nope')
    expect((wrapper.get('#tmdb').element as HTMLSelectElement).value).toBe('all')
    expect(mocked.listFilms).toHaveBeenCalledWith(expect.objectContaining({ tmdbStatus: undefined }))
  })

  it('keeps the status in the pagination links', async () => {
    mocked.listFilms.mockResolvedValue(listing(films, 120, 2))
    const { wrapper } = await mountWithApp(WatchlistView, '/watchlist?tmdb=pending&page=2')
    const next = wrapper.get('a[aria-label="Next page"]').attributes('href')!
    expect(new URLSearchParams(next.split('?')[1])).toEqual(new URLSearchParams({ tmdb: 'pending', page: '3' }))
  })

  it('shows the no-results state and the reset link when no film has the status', async () => {
    mocked.listFilms.mockResolvedValue(listing([], 0))
    const { wrapper } = await mountWithApp(WatchlistView, '/watchlist?tmdb=error')
    expect(wrapper.text()).toContain('No films match your search')
    expect(wrapper.get('a[href="/watchlist"].btn').text()).toBe('Reset search')
  })

  it('has no accessibility violations with the status chosen', async () => {
    const { wrapper } = await mountWithApp(WatchlistView, '/watchlist?tmdb=ambiguous')
    expect(wrapper.find('#tmdb').exists()).toBe(true)
    await expectNoA11yViolations(wrapper.element)
  })
})

describe('WatchlistView pending badge', () => {
  const pending = makeFilm({ id: 6, title: 'Fresh Import', tmdb: { id: null, mediaType: 'movie', status: 'pending', syncedAt: null } })
  const matched = makeFilm({ id: 7, title: 'Done Film', tmdb: { id: 9, mediaType: 'movie', status: 'matched', syncedAt: '2026-10-11T12:00:00.000Z' } })

  it('shows a neutral badge for a film that is waiting for its TMDB lookup', async () => {
    mocked.listFilms.mockResolvedValue(listing([pending, matched]))
    const { wrapper } = await mountWithApp(WatchlistView, '/watchlist')
    const [pendingRow, matchedRow] = wrapper.findAll('tbody tr')
    const badge = pendingRow!.findAll('.badge').find((b) => b.text() === 'Waiting for TMDB data')!
    expect(badge.classes()).not.toContain('badge--warn')
    expect(matchedRow!.text()).not.toContain('Waiting for TMDB data')
  })

  it('offers no "Choose TMDB match" button for a pending film', async () => {
    mocked.listFilms.mockResolvedValue(listing([pending]))
    const { wrapper } = await mountWithApp(WatchlistView, '/watchlist')
    expect(wrapper.find('a[href="/watchlist/6/match"]').exists()).toBe(false)
  })

  it('shows the pending badge next to "Watched" and keeps the problem badges separate', async () => {
    const watchedPending = makeFilm({ ...pending, id: 8, watchedAt: '2025-03-04T10:00:00.000Z' })
    mocked.listFilms.mockResolvedValue(listing([watchedPending, films[2]!]))
    const { wrapper } = await mountWithApp(WatchlistView, '/watchlist')
    const [first, second] = wrapper.findAll('tbody tr')
    expect(first!.text()).toContain('Watched 4 Mar 2025')
    expect(first!.text()).toContain('Waiting for TMDB data')
    expect(second!.text()).toContain('Needs review: several TMDB matches')
    expect(second!.text()).not.toContain('Waiting for TMDB data')
  })

  it('never shows the pending badge for any other TMDB status', async () => {
    mocked.listFilms.mockResolvedValue(listing([matched, ...films]))
    const { wrapper } = await mountWithApp(WatchlistView, '/watchlist')
    expect(wrapper.findAll('tbody tr')).toHaveLength(6)
    expect(wrapper.text()).not.toContain('Waiting for TMDB data')
  })

  it('shows the badge once per pending film, as plain text without a live region or alert', async () => {
    const second = makeFilm({ id: 9, title: 'Also Fresh', tmdb: { id: null, mediaType: 'movie', status: 'pending', syncedAt: null } })
    mocked.listFilms.mockResolvedValue(listing([pending, second]))
    const { wrapper } = await mountWithApp(WatchlistView, '/watchlist')
    for (const row of wrapper.findAll('tbody tr')) {
      expect(row.text().split('Waiting for TMDB data')).toHaveLength(2)
      expect(row.find('[role="alert"], [role="status"], [aria-live]').exists()).toBe(false)
    }
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it('shows the badge when the list is filtered to pending films', async () => {
    mocked.listFilms.mockResolvedValue(listing([pending], 1))
    const { wrapper } = await mountWithApp(WatchlistView, '/watchlist?tmdb=pending')
    expect(mocked.listFilms).toHaveBeenCalledWith(expect.objectContaining({ tmdbStatus: 'pending' }))
    expect(wrapper.get('tbody tr').text()).toContain('Waiting for TMDB data')
  })

  it('has no accessibility violations with pending films in the table', async () => {
    mocked.listFilms.mockResolvedValue(listing([pending, matched]))
    const { wrapper } = await mountWithApp(WatchlistView, '/watchlist')
    expect(wrapper.text()).toContain('Waiting for TMDB data')
    await expectNoA11yViolations(wrapper.element)
  })
})

describe('WatchlistView table semantics (the rows become cards on small screens)', () => {
  it('states the table, row, header and cell roles, so the structure survives the card layout', async () => {
    const { wrapper } = await mountWithApp(WatchlistView, '/watchlist')
    expect(wrapper.get('table').attributes('role')).toBe('table')
    expect(wrapper.findAll('[role="rowgroup"]').map((e) => e.element.tagName)).toEqual([
      'THEAD',
      'TBODY',
    ])
    expect(wrapper.findAll('[role="row"]')).toHaveLength(films.length + 1)
    expect(wrapper.findAll('[role="columnheader"]').map((e) => e.text())).toEqual([
      'Title',
      'Year',
      'Added',
      'Status',
      'Actions',
    ])
    expect(wrapper.findAll('tbody [role="rowheader"]')).toHaveLength(films.length)
    expect(wrapper.findAll('tbody [role="cell"]')).toHaveLength(films.length * 4)
    await expectNoA11yViolations(wrapper.element)
  })

  it('keeps the title as the row header and the year, date, status and actions as cells, in this order', async () => {
    const { wrapper } = await mountWithApp(WatchlistView, '/watchlist')
    const row = wrapper.get('tbody tr')
    expect(row.element.children[0]!.getAttribute('role')).toBe('rowheader')
    const cells = Array.from(row.element.children).slice(1)
    expect(cells).toHaveLength(4)
    const kinds = ['watchlist__year', 'watchlist__added', 'watchlist__status-cell', 'watchlist__actions']
    cells.forEach((cell, i) => expect(cell.classList.contains(kinds[i]!), `${kinds[i]} is cell ${i + 1}`).toBe(true))
  })

  it('shows a dash for a missing year, and the date cell holds only the date, because its label is drawn by CSS', async () => {
    const { wrapper } = await mountWithApp(WatchlistView, '/watchlist')
    expect(wrapper.findAll('tbody tr')[2]!.get('.watchlist__year').text()).toBe('—')
    // the "Added" label of the card is drawn by CSS only, so the cell text is just the date
    expect(wrapper.get('.watchlist__added').text()).toBe('12 Mar 2025')
  })
})

describe('WatchlistView table states', () => {
  it('shows a watched film with a TMDB problem with both badges and a long title unbroken in one row header', async () => {
    const title = 'Supercalifragilisticexpialidocious'.repeat(3)
    mocked.listFilms.mockResolvedValue(
      listing([
        makeFilm({
          id: 9,
          title,
          watchedAt: '2025-03-04T10:00:00.000Z',
          tmdb: { id: null, mediaType: 'movie', status: 'ambiguous', syncedAt: null },
        }),
      ]),
    )
    const { wrapper } = await mountWithApp(WatchlistView, '/watchlist')
    const row = wrapper.get('tbody tr')
    expect(row.get('[role="rowheader"]').text()).toBe(title)
    expect(row.get('.watchlist__status-cell').text()).toContain('Watched 4 Mar 2025')
    expect(row.get('.watchlist__status-cell').text()).toContain(
      'Needs review: several TMDB matches',
    )
    await expectNoA11yViolations(wrapper.element)
  })

  it('renders no table for an empty watchlist', async () => {
    mocked.listFilms.mockResolvedValue(listing([], 0))
    const { wrapper } = await mountWithApp(WatchlistView, '/watchlist')
    expect(wrapper.find('table').exists()).toBe(false)
    expect(wrapper.text()).toContain('Your watchlist is empty')
  })

  describe('TMDB check', () => {
    const idle = { enabled: true, running: false, total: 0, done: 0, lastRun: null }
    const summary = { matched: 1, notFound: 0, ambiguous: 0, error: 0, unreachable: 0, stopped: null, finishedAt: '2026-10-16T10:00:00.000Z' }

    it('shows the panel with its button above the filters', async () => {
      const { wrapper } = await mountWithApp(WatchlistView, '/watchlist')
      const button = wrapper.get('button.btn:not([aria-label])')
      expect(button.text()).toBe('Check TMDB again')
      expect(wrapper.get('section[aria-labelledby="tmdb-check-heading"] h2').text()).toBe('TMDB data')
      expect(mocked.getTmdbCheck).not.toHaveBeenCalled()
    })

    it('reloads the list with the current view when the check has finished', async () => {
      mocked.getTmdbCheck.mockResolvedValueOnce(idle).mockResolvedValue({ ...idle, total: 1, done: 1, lastRun: summary })
      mocked.startTmdbCheck.mockResolvedValue({ started: true })
      const { wrapper } = await mountWithApp(WatchlistView, '/watchlist?q=days&page=2')
      expect(mocked.listFilms).toHaveBeenCalledTimes(1)
      await wrapper.get('section[aria-labelledby="tmdb-check-heading"] button').trigger('click')
      await flushPromises()
      expect(mocked.listFilms).toHaveBeenCalledTimes(2)
      expect(mocked.listFilms).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'days', page: 2 }))
      expect(wrapper.get('section[aria-labelledby="tmdb-check-heading"] [role="status"]').text()).toContain('TMDB check finished')
    })

    it('shows the new statuses after the reload', async () => {
      mocked.getTmdbCheck.mockResolvedValueOnce(idle).mockResolvedValue({ ...idle, total: 1, done: 1, lastRun: summary })
      mocked.startTmdbCheck.mockResolvedValue({ started: true })
      const { wrapper } = await mountWithApp(WatchlistView, '/watchlist')
      expect(wrapper.text()).toContain('Not found on TMDB')
      mocked.listFilms.mockResolvedValue(listing(films.filter((f) => f.id !== 4)))
      await wrapper.get('section[aria-labelledby="tmdb-check-heading"] button').trigger('click')
      await flushPromises()
      expect(wrapper.text()).not.toContain('Not found on TMDB')
    })

    it('does not reload the list when the check could not start', async () => {
      mocked.getTmdbCheck.mockResolvedValue(idle)
      mocked.startTmdbCheck.mockRejectedValue(new api.ApiError(503, 'TMDB is not configured.', 'tmdb_unavailable'))
      const { wrapper } = await mountWithApp(WatchlistView, '/watchlist')
      await wrapper.get('section[aria-labelledby="tmdb-check-heading"] button').trigger('click')
      await flushPromises()
      expect(mocked.listFilms).toHaveBeenCalledTimes(1)
      expect(wrapper.get('[role="alert"]').text()).toContain('TMDB is not configured.')
    })
  })
})
