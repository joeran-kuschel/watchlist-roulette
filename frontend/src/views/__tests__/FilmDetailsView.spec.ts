import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import * as api from '../../api'
import { expectNoA11yViolations, makeFilm, mountWithApp } from '../../__tests__/helpers'
import { useWatchlistStore } from '../../stores/watchlist'
import AppLayout from '../../components/AppLayout.vue'
import FilmDetailsView from '../FilmDetailsView.vue'

vi.mock('../../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api')>()),
  getFilm: vi.fn<typeof import('../../api').getFilm>(),
  updateFilm: vi.fn<typeof import('../../api').updateFilm>(),
}))
const mocked = vi.mocked(api)

const rich = makeFilm({
  id: 7,
  title: 'Perfect Days',
  originalTitle: 'パーフェクト・デイズ',
  tagline: 'Every day is a new day.',
  voteCount: 1234,
  countries: ['JP', 'DE'],
  genres: [
    { id: 18, name: 'Drama' },
    { id: 10749, name: 'Romance' },
  ],
  cast: [
    { id: 1, name: 'Kōji Yakusho' },
    { id: 2, name: 'Tokio Emoto' },
  ],
})
const bare = (overrides = {}) =>
  makeFilm({
    id: 8,
    letterboxdUrl: null,
    tmdb: { id: null, mediaType: 'movie', status: 'pending', syncedAt: null },
    originalTitle: null,
    tagline: null,
    overview: null,
    runtimeMinutes: null,
    voteAverage: null,
    voteCount: null,
    posterPath: null,
    countries: [],
    genres: [],
    directors: [],
    cast: [],
    ...overrides,
  })

beforeEach(() => {
  vi.resetAllMocks()
  mocked.getFilm.mockResolvedValue(rich)
})
afterEach(() => (document.body.innerHTML = ''))

describe('FilmDetailsView', () => {
  it('loads the film from the id in the address and shows its data', async () => {
    const { wrapper } = await mountWithApp(FilmDetailsView, '/watchlist/7')
    expect(mocked.getFilm).toHaveBeenCalledWith(7)
    expect(wrapper.get('h1').text()).toBe('Perfect Days')
    const text = wrapper.text()
    expect(text).toContain('Original title: パーフェクト・デイズ')
    expect(text).toContain('Every day is a new day.')
    expect(text).toContain('2023')
    expect(text).toContain('124 min')
    expect(text).toContain('7.9 / 10 (1,234 votes)')
    expect(text).toContain('JP, DE')
    expect(text).toContain('Drama, Romance')
    expect(text).toContain('Wim Wenders')
    expect(text).toContain('A janitor in Tokyo finds joy in small things.')
    expect(text).toContain('Kōji Yakusho, Tokio Emoto')
    expect(wrapper.get('.details__meta').text().replace(/\s+/g, ' ')).toBe('On your list since 12 Mar 2025 · Not watched yet')
    expect(wrapper.find('img.poster').attributes('src')).toBe('/api/films/7/poster')
  })

  it('shows the watched date', async () => {
    mocked.getFilm.mockResolvedValue(makeFilm({ watchedAt: '2025-03-04T10:00:00.000Z' }))
    const { wrapper } = await mountWithApp(FilmDetailsView, '/watchlist/1')
    expect(wrapper.text()).toContain('Watched 4 Mar 2025')
    expect(wrapper.text()).not.toContain('Not watched yet')
  })

  it('has a Links section with Letterboxd and TMDB that open in a new tab and say so', async () => {
    const { wrapper } = await mountWithApp(FilmDetailsView, '/watchlist/7')
    expect(wrapper.get('h2#links-heading').text()).toBe('Links')
    const links = wrapper.findAll('section[aria-labelledby="links-heading"] a')
    expect(links.map((a) => a.attributes('href'))).toEqual([
      'https://boxd.it/abc',
      'https://www.themoviedb.org/movie/976893',
    ])
    for (const link of links) {
      expect(link.attributes('target')).toBe('_blank')
      expect(link.attributes('rel')).toBe('noopener noreferrer')
      expect(link.text()).toContain('(opens in a new tab)')
    }
    expect(links.map((a) => a.text())).toEqual([
      'Letterboxd (opens in a new tab)',
      'The Movie Database (TMDB) (opens in a new tab)',
    ])
  })

  it('leaves out the TMDB link without a TMDB id and the Letterboxd link without an address', async () => {
    mocked.getFilm.mockResolvedValue(bare({ letterboxdUrl: 'https://boxd.it/x' }))
    const { wrapper } = await mountWithApp(FilmDetailsView, '/watchlist/8')
    expect(wrapper.findAll('#links-heading ~ ul a').map((a) => a.attributes('href'))).toEqual(['https://boxd.it/x'])

    mocked.getFilm.mockResolvedValue(bare({ tmdb: { id: 5, mediaType: 'movie', status: 'matched', syncedAt: null } }))
    const other = await mountWithApp(FilmDetailsView, '/watchlist/8')
    expect(other.wrapper.findAll('#links-heading ~ ul a').map((a) => a.attributes('href'))).toEqual([
      'https://www.themoviedb.org/movie/5',
    ])
  })

  it('shows no Links section at all when there is neither link', async () => {
    mocked.getFilm.mockResolvedValue(bare())
    const { wrapper } = await mountWithApp(FilmDetailsView, '/watchlist/8')
    expect(wrapper.find('#links-heading').exists()).toBe(false)
  })

  it('never renders a javascript: address as a link', async () => {
    mocked.getFilm.mockResolvedValue(bare({ letterboxdUrl: 'javascript:alert(1)' }))
    const { wrapper } = await mountWithApp(FilmDetailsView, '/watchlist/8')
    expect(wrapper.html()).not.toContain('javascript:')
  })

  it('shows a film without TMDB data with only what it has', async () => {
    mocked.getFilm.mockResolvedValue(bare())
    const { wrapper } = await mountWithApp(FilmDetailsView, '/watchlist/8')
    expect(wrapper.get('h1').text()).toBe('Perfect Days')
    expect(wrapper.find('.poster--empty').exists()).toBe(true)
    for (const heading of ['#overview-heading', '#cast-heading']) expect(wrapper.find(heading).exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Original title')
    expect(wrapper.text()).not.toContain('Runtime')
    expect(wrapper.text()).not.toContain('null')
    expect(wrapper.text()).not.toContain('undefined')
  })

  it('does not repeat the original title when it equals the title', async () => {
    mocked.getFilm.mockResolvedValue(makeFilm({ originalTitle: 'Perfect Days' }))
    const { wrapper } = await mountWithApp(FilmDetailsView, '/watchlist/1')
    expect(wrapper.text()).not.toContain('Original title')
  })

  it('shows the rating without a vote count when there is none', async () => {
    mocked.getFilm.mockResolvedValue(makeFilm({ voteAverage: 6, voteCount: null }))
    const { wrapper } = await mountWithApp(FilmDetailsView, '/watchlist/1')
    expect(wrapper.text()).toContain('6.0 / 10')
    expect(wrapper.text()).not.toContain('votes')
  })

  it('has an Edit button that names the film and a link back to the watchlist', async () => {
    const { wrapper } = await mountWithApp(FilmDetailsView, '/watchlist/7')
    const edit = wrapper.get('a[href="/watchlist/7/edit"]')
    expect(edit.text()).toBe('Edit')
    expect(edit.attributes('aria-label')).toBe('Edit Perfect Days')
    expect(edit.classes()).toContain('btn')
    expect(wrapper.get('a[href="/watchlist"]').text()).toBe('← Back to watchlist')
  })

  it('links back to the watchlist as the user left it', async () => {
    const { wrapper } = await mountWithApp(FilmDetailsView, '/watchlist/7')
    expect(wrapper.get('.back a').attributes('href')).toBe('/watchlist')
    useWatchlistStore().rememberList({ q: 'cléo', watched: 'false', page: '2' })
    await flushPromises()
    expect(wrapper.get('.back a').attributes('href')).toBe('/watchlist?q=cl%C3%A9o&watched=false&page=2')
    await expectNoA11yViolations(wrapper.element)
  })

  it('keeps the remembered list on the back link of the not-found page', async () => {
    mocked.getFilm.mockRejectedValue(new api.ApiError(404, 'Film not found'))
    const { wrapper } = await mountWithApp(FilmDetailsView, '/watchlist/999')
    useWatchlistStore().rememberList({ q: 'a', page: '2' })
    await flushPromises()
    expect(wrapper.get('.back a').attributes('href')).toBe('/watchlist?q=a&page=2')
  })

  it('keeps the remembered list when the route switches to another film', async () => {
    const { wrapper, router } = await mountWithApp(FilmDetailsView, '/watchlist/7')
    useWatchlistStore().rememberList({ q: 'a', page: '2' })
    await router.push('/watchlist/8')
    await flushPromises()
    expect(wrapper.get('.back a').attributes('href')).toBe('/watchlist?q=a&page=2')
  })

  it('writes repeated query values into the back link', async () => {
    const { wrapper } = await mountWithApp(FilmDetailsView, '/watchlist/7')
    useWatchlistStore().rememberList({ tmdb: ['ambiguous', 'error'] })
    await flushPromises()
    expect(wrapper.get('.back a').attributes('href')).toBe('/watchlist?tmdb=ambiguous&tmdb=error')
  })

  it('has no form fields and no delete button', async () => {
    const { wrapper } = await mountWithApp(FilmDetailsView, '/watchlist/7')
    expect(wrapper.find('input, select, textarea').exists()).toBe(false)
    expect(wrapper.findAll('button').map((b) => b.text())).toEqual(['Mark as watched'])
  })

  describe('actions', () => {
    const actions = (wrapper: Awaited<ReturnType<typeof mountWithApp>>['wrapper']) =>
      wrapper.findAll('.details__actions .btn').map((a) => a.text())

    it('offers Mark as watched, then Edit, for a film without a problem', async () => {
      const { wrapper } = await mountWithApp(FilmDetailsView, '/watchlist/7')
      expect(actions(wrapper)).toEqual(['Mark as watched', 'Edit'])
      expect(wrapper.get('button.btn').attributes('aria-label')).toBeUndefined()
    })

    it('offers Mark as unwatched for a watched film', async () => {
      mocked.getFilm.mockResolvedValue(makeFilm({ watchedAt: '2025-03-04T10:00:00.000Z' }))
      const { wrapper } = await mountWithApp(FilmDetailsView, '/watchlist/1')
      expect(actions(wrapper)).toEqual(['Mark as unwatched', 'Edit'])
    })

    it('marks the film as watched, updates the page and announces it', async () => {
      mocked.updateFilm.mockResolvedValue({ ...rich, watchedAt: '2025-03-04T10:00:00.000Z' })
      const { wrapper } = await mountWithApp(FilmDetailsView, '/watchlist/7')
      expect(wrapper.get('[role="status"]').text()).toBe('')
      await wrapper.get('button.btn').trigger('click')
      await flushPromises()
      expect(mocked.updateFilm).toHaveBeenCalledWith(7, { watched: true })
      expect(wrapper.get('button.btn').text()).toBe('Mark as unwatched')
      expect(wrapper.get('.details__meta').text()).toContain('Watched 4 Mar 2025')
      expect(wrapper.get('[role="status"]').text()).toBe('Perfect Days is marked as watched.')
      expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    })

    it('marks a watched film as unwatched', async () => {
      mocked.getFilm.mockResolvedValue({ ...rich, watchedAt: '2025-03-04T10:00:00.000Z' })
      mocked.updateFilm.mockResolvedValue(rich)
      const { wrapper } = await mountWithApp(FilmDetailsView, '/watchlist/7')
      await wrapper.get('button.btn').trigger('click')
      await flushPromises()
      expect(mocked.updateFilm).toHaveBeenCalledWith(7, { watched: false })
      expect(wrapper.get('button.btn').text()).toBe('Mark as watched')
      expect(wrapper.get('.details__meta').text()).toContain('Not watched yet')
      expect(wrapper.get('[role="status"]').text()).toBe('Perfect Days is marked as unwatched.')
    })

    it('marks the button as disabled while the request runs, but keeps it focusable', async () => {
      let finish: (film: typeof rich) => void = () => {}
      mocked.updateFilm.mockReturnValue(new Promise((resolve) => (finish = resolve)))
      const { wrapper } = await mountWithApp(FilmDetailsView, '/watchlist/7')
      await wrapper.get('button.btn').trigger('click')
      expect(wrapper.get('button.btn').attributes('aria-disabled')).toBe('true')
      // a real "disabled" would drop the keyboard focus in Firefox and Safari
      expect(wrapper.get('button.btn').attributes('disabled')).toBeUndefined()
      finish({ ...rich, watchedAt: '2025-03-04T10:00:00.000Z' })
      await flushPromises()
      expect(wrapper.get('button.btn').attributes('aria-disabled')).toBeUndefined()
    })

    it('does not block the button of the next film while a slow request for the previous one runs', async () => {
      let finishFirst: (film: typeof rich) => void = () => {}
      mocked.getFilm.mockImplementation(async (id) => makeFilm({ id, title: `Film ${id}` }))
      mocked.updateFilm.mockReturnValueOnce(new Promise((resolve) => (finishFirst = resolve)))
      const { wrapper, router } = await mountWithApp(FilmDetailsView, '/watchlist/7')
      await wrapper.get('button.btn').trigger('click')
      expect(wrapper.get('button.btn').attributes('aria-disabled')).toBe('true')
      await router.push('/watchlist/8')
      await flushPromises()
      expect(wrapper.get('h1').text()).toBe('Film 8')
      expect(wrapper.get('button.btn').attributes('aria-disabled')).toBeUndefined()
      finishFirst(makeFilm({ id: 7, title: 'Film 7', watchedAt: '2025-03-04T10:00:00.000Z' }))
      await flushPromises()
      expect(wrapper.get('h1').text()).toBe('Film 8')
      expect(wrapper.get('button.btn').attributes('aria-disabled')).toBeUndefined()
    })

    it('shows an error in an alert, keeps the film as it was and enables the button again', async () => {
      mocked.updateFilm.mockRejectedValue(new api.ApiError(0, 'x'))
      const { wrapper } = await mountWithApp(FilmDetailsView, '/watchlist/7')
      await wrapper.get('button.btn').trigger('click')
      await flushPromises()
      expect(wrapper.get('[role="alert"]').text()).toMatch(/Can't reach the server/)
      expect(wrapper.get('button.btn').text()).toBe('Mark as watched')
      expect(wrapper.get('button.btn').attributes('aria-disabled')).toBeUndefined()
      expect(wrapper.get('[role="status"]').text()).toBe('')
      await expectNoA11yViolations(wrapper.element)
    })

    it('clears the error after the next successful change', async () => {
      mocked.updateFilm.mockRejectedValueOnce(new api.ApiError(0, 'x')).mockResolvedValueOnce(rich)
      const { wrapper } = await mountWithApp(FilmDetailsView, '/watchlist/7')
      await wrapper.get('button.btn').trigger('click')
      await flushPromises()
      await wrapper.get('button.btn').trigger('click')
      await flushPromises()
      expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    })

    it.each(['ambiguous', 'not_found', 'error'] as const)(
      'links to the match page for a film with status %s, between Mark as watched and Edit',
      async (status) => {
        mocked.getFilm.mockResolvedValue(makeFilm({ id: 3, tmdb: { id: null, mediaType: 'movie', status, syncedAt: null } }))
        const { wrapper } = await mountWithApp(FilmDetailsView, '/watchlist/3')
        expect(actions(wrapper)).toEqual(['Mark as watched', 'Choose TMDB match', 'Edit'])
        const link = wrapper.get('a[href="/watchlist/3/match"]')
        expect(link.classes()).toContain('btn')
        await expectNoA11yViolations(wrapper.element)
      },
    )

    it('ignores a second click while the request runs', async () => {
      mocked.updateFilm.mockReturnValue(new Promise(() => {}))
      const { wrapper } = await mountWithApp(FilmDetailsView, '/watchlist/7')
      await wrapper.get('button.btn').trigger('click')
      await wrapper.get('button.btn').trigger('click')
      expect(mocked.updateFilm).toHaveBeenCalledTimes(1)
    })

    it('marks as watched and then as unwatched in a row', async () => {
      mocked.updateFilm
        .mockResolvedValueOnce({ ...rich, watchedAt: '2025-03-04T10:00:00.000Z' })
        .mockResolvedValueOnce(rich)
      const { wrapper } = await mountWithApp(FilmDetailsView, '/watchlist/7')
      await wrapper.get('button.btn').trigger('click')
      await flushPromises()
      await wrapper.get('button.btn').trigger('click')
      await flushPromises()
      expect(mocked.updateFilm).toHaveBeenNthCalledWith(1, 7, { watched: true })
      expect(mocked.updateFilm).toHaveBeenNthCalledWith(2, 7, { watched: false })
      expect(wrapper.get('button.btn').text()).toBe('Mark as watched')
      expect(wrapper.get('[role="status"]').text()).toBe('Perfect Days is marked as unwatched.')
    })

    it('shows the watched date the server returned, not today', async () => {
      mocked.updateFilm.mockResolvedValue({ ...rich, watchedAt: '2020-01-02T10:00:00.000Z' })
      const { wrapper } = await mountWithApp(FilmDetailsView, '/watchlist/7')
      await wrapper.get('button.btn').trigger('click')
      await flushPromises()
      expect(wrapper.get('.details__meta').text()).toContain('Watched 2 Jan 2020')
    })

    it('shows the error first and succeeds on a retry', async () => {
      mocked.updateFilm
        .mockRejectedValueOnce(new api.ApiError(500, 'x'))
        .mockResolvedValueOnce({ ...rich, watchedAt: '2025-03-04T10:00:00.000Z' })
      const { wrapper } = await mountWithApp(FilmDetailsView, '/watchlist/7')
      await wrapper.get('button.btn').trigger('click')
      await flushPromises()
      expect(wrapper.find('[role="alert"]').exists()).toBe(true)
      await wrapper.get('button.btn').trigger('click')
      await flushPromises()
      expect(wrapper.find('[role="alert"]').exists()).toBe(false)
      expect(wrapper.get('button.btn').text()).toBe('Mark as unwatched')
    })

    it('does not carry the status text over to the next film after a route change', async () => {
      mocked.updateFilm.mockResolvedValue({ ...rich, watchedAt: '2025-03-04T10:00:00.000Z' })
      const { wrapper, router } = await mountWithApp(FilmDetailsView, '/watchlist/7')
      await wrapper.get('button.btn').trigger('click')
      await flushPromises()
      expect(wrapper.get('[role="status"]').text()).not.toBe('')
      mocked.getFilm.mockResolvedValue(bare({ title: 'Cléo from 5 to 7' }))
      await router.push('/watchlist/8')
      await flushPromises()
      expect(wrapper.get('h1').text()).toBe('Cléo from 5 to 7')
      expect(wrapper.get('[role="status"]').text()).toBe('')
    })

    it('ignores the answer for a film the user has left', async () => {
      let finish: (film: typeof rich) => void = () => {}
      mocked.updateFilm.mockReturnValue(new Promise((resolve) => (finish = resolve)))
      const { wrapper, router } = await mountWithApp(FilmDetailsView, '/watchlist/7')
      await wrapper.get('button.btn').trigger('click')
      const other = bare({ title: 'Cléo from 5 to 7' })
      mocked.getFilm.mockResolvedValue(other)
      await router.push('/watchlist/8')
      await flushPromises()
      finish({ ...rich, watchedAt: '2025-03-04T10:00:00.000Z' })
      await flushPromises()
      expect(wrapper.get('h1').text()).toBe(other.title)
      expect(wrapper.get('button.btn').text()).toBe('Mark as watched')
      expect(wrapper.get('[role="status"]').text()).toBe('')
    })

    it('ignores a failure for a film the user has left', async () => {
      let fail: (e: unknown) => void = () => {}
      mocked.updateFilm.mockReturnValue(new Promise((_, reject) => (fail = reject)))
      const { wrapper, router } = await mountWithApp(FilmDetailsView, '/watchlist/7')
      await wrapper.get('button.btn').trigger('click')
      mocked.getFilm.mockResolvedValue(bare())
      await router.push('/watchlist/8')
      await flushPromises()
      fail(new api.ApiError(0, 'x'))
      await flushPromises()
      expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    })

    it('has no accessibility violations while the request runs, with the button disabled', async () => {
      mocked.updateFilm.mockReturnValue(new Promise(() => {}))
      const { wrapper } = await mountWithApp(FilmDetailsView, '/watchlist/7')
      await wrapper.get('button.btn').trigger('click')
      expect(wrapper.get('button.btn').attributes('aria-disabled')).toBe('true')
      await expectNoA11yViolations(wrapper.element)
    })

    it('has no accessibility violations after the change', async () => {
      mocked.updateFilm.mockResolvedValue({ ...rich, watchedAt: '2025-03-04T10:00:00.000Z' })
      const { wrapper } = await mountWithApp(FilmDetailsView, '/watchlist/7')
      await wrapper.get('button.btn').trigger('click')
      await flushPromises()
      expect(wrapper.get('button.btn').text()).toBe('Mark as unwatched')
      await expectNoA11yViolations(wrapper.element)
    })

    it('names the Edit link "Edit <title>" and puts the actions in the order watched, match, edit', async () => {
      mocked.getFilm.mockResolvedValue(makeFilm({ id: 3, title: 'Cléo', tmdb: { id: null, mediaType: 'movie', status: 'ambiguous', syncedAt: null } }))
      const { wrapper } = await mountWithApp(FilmDetailsView, '/watchlist/3')
      const items = wrapper.findAll('.details__actions > *')
      expect(items.map((i) => i.element.tagName)).toEqual(['BUTTON', 'A', 'A'])
      expect(items[2]!.attributes('aria-label')).toBe('Edit Cléo')
      expect(items[1]!.attributes('aria-label')).toBeUndefined()
    })

    it.each(['matched', 'pending'] as const)('has no match link for a film with status %s', async (status) => {
      mocked.getFilm.mockResolvedValue(makeFilm({ tmdb: { id: null, mediaType: 'movie', status, syncedAt: null } }))
      const { wrapper } = await mountWithApp(FilmDetailsView, '/watchlist/1')
      expect(wrapper.find('a[href$="/match"]').exists()).toBe(false)
    })
  })

  it('shows a loading text first', async () => {
    mocked.getFilm.mockReturnValue(new Promise(() => {}))
    const { wrapper } = await mountWithApp(FilmDetailsView, '/watchlist/7')
    expect(wrapper.get('[aria-busy="true"]').text()).toBe('Loading film…')
    expect(wrapper.get('h1').text()).toBe('Film details')
  })

  it('says so when the film does not exist, without a retry button', async () => {
    mocked.getFilm.mockRejectedValue(new api.ApiError(404, 'Film not found'))
    const { wrapper } = await mountWithApp(FilmDetailsView, '/watchlist/999')
    expect(wrapper.get('h1').text()).toBe('Film not found')
    expect(wrapper.get('[role="alert"]').text()).toContain('Film not found')
    expect(wrapper.find('[role="alert"] button').exists()).toBe(false)
    expect(wrapper.find('a[href="/watchlist"]').exists()).toBe(true)
    await expectNoA11yViolations(wrapper.element)
  })

  it('shows a load error and retries', async () => {
    mocked.getFilm.mockRejectedValueOnce(new api.ApiError(0, 'x'))
    const { wrapper } = await mountWithApp(FilmDetailsView, '/watchlist/7')
    expect(wrapper.get('[role="alert"]').text()).toMatch(/Can't reach the server/)
    await wrapper.get('[role="alert"] button').trigger('click')
    await flushPromises()
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(wrapper.get('h1').text()).toBe('Perfect Days')
  })

  it('has no accessibility violations, with a full and with a bare film', async () => {
    const full = await mountWithApp(FilmDetailsView, '/watchlist/7')
    expect(full.wrapper.find('article').exists()).toBe(true)
    await expectNoA11yViolations(full.wrapper.element)
    mocked.getFilm.mockResolvedValue(bare())
    const empty = await mountWithApp(FilmDetailsView, '/watchlist/8')
    await expectNoA11yViolations(empty.wrapper.element)
  })

  it('shows a very long title without breaking the page', async () => {
    const title = 'A'.repeat(300) + ' ' + 'Ünïcödé'.repeat(30)
    mocked.getFilm.mockResolvedValue(makeFilm({ title }))
    const { wrapper } = await mountWithApp(FilmDetailsView, '/watchlist/1')
    expect(wrapper.get('h1').text()).toBe(title)
    expect(wrapper.get('a[href="/watchlist/1/edit"]').attributes('aria-label')).toBe(`Edit ${title}`)
    await expectNoA11yViolations(wrapper.element)
  })

  it('shows markup in the overview, cast and title as plain text', async () => {
    const evil = '<img src=x onerror="alert(1)"><script>alert(2)</script>'
    mocked.getFilm.mockResolvedValue(
      makeFilm({ title: evil, overview: evil, cast: [{ id: 1, name: evil }], tagline: evil, originalTitle: evil + '!' }),
    )
    const { wrapper } = await mountWithApp(FilmDetailsView, '/watchlist/1')
    expect(wrapper.find('article img[src="x"]').exists()).toBe(false)
    expect(wrapper.find('article script').exists()).toBe(false)
    expect(wrapper.get('h1').text()).toBe(evil)
    expect(wrapper.get('#overview-heading + p').text()).toBe(evil)
    expect(wrapper.get('#cast-heading + p').text()).toBe(evil)
  })

  it('loads the other film when the address changes to a different id', async () => {
    mocked.getFilm.mockImplementation(async (id) => makeFilm({ id, title: `Film ${id}` }))
    const { wrapper, router } = await mountWithApp(AppLayout, '/watchlist/7')
    expect(wrapper.get('h1').text()).toBe('Film 7')
    await router.push('/watchlist/8')
    await flushPromises()
    expect(mocked.getFilm).toHaveBeenLastCalledWith(8)
    expect(wrapper.get('h1').text()).toBe('Film 8')
  })

  it('ignores a slow answer for the earlier film when the address has changed', async () => {
    let answerFirst: (film: ReturnType<typeof makeFilm>) => void = () => {}
    mocked.getFilm.mockImplementation((id) =>
      id === 7
        ? new Promise((resolve) => (answerFirst = resolve))
        : Promise.resolve(makeFilm({ id, title: `Film ${id}` })),
    )
    const { wrapper, router } = await mountWithApp(AppLayout, '/watchlist/7')
    await router.push('/watchlist/8')
    await flushPromises()
    expect(wrapper.get('h1').text()).toBe('Film 8')
    answerFirst(makeFilm({ id: 7, title: 'Film 7' }))
    await flushPromises()
    expect(wrapper.get('h1').text()).toBe('Film 8')
  })

  it('shows the loading state while the other film loads', async () => {
    mocked.getFilm.mockResolvedValueOnce(makeFilm({ id: 7, title: 'Film 7' })).mockReturnValueOnce(new Promise(() => {}))
    const { wrapper, router } = await mountWithApp(AppLayout, '/watchlist/7')
    await router.push('/watchlist/8')
    await flushPromises()
    expect(wrapper.get('[aria-busy="true"]').text()).toBe('Loading film…')
    expect(wrapper.text()).not.toContain('Film 7')
  })

  it('does not load anything when the route leaves the details page', async () => {
    mocked.getFilm.mockResolvedValue(makeFilm({ id: 7 }))
    const { router } = await mountWithApp(AppLayout, '/watchlist/7')
    mocked.getFilm.mockClear()
    await router.push('/watchlist')
    await flushPromises()
    expect(mocked.getFilm).not.toHaveBeenCalled()
  })

  describe('for a TV show', () => {
    const tv = makeFilm({
      id: 9,
      title: 'Breaking Bad',
      tmdb: { id: 1396, mediaType: 'tv', status: 'matched', syncedAt: null },
      runtimeMinutes: 47,
      directors: [{ id: 66633, name: 'Vince Gilligan' }],
    })

    it('links to the show page on TMDB, not the movie page', async () => {
      mocked.getFilm.mockResolvedValue(tv)
      const { wrapper } = await mountWithApp(FilmDetailsView, '/watchlist/9')
      const hrefs = wrapper.findAll('#links-heading ~ ul a').map((a) => a.attributes('href'))
      expect(hrefs).toContain('https://www.themoviedb.org/tv/1396')
      expect(hrefs.join()).not.toContain('/movie/')
    })

    it('says "Created by" and "Episode runtime" instead of "Directed by" and "Runtime"', async () => {
      mocked.getFilm.mockResolvedValue(tv)
      const { wrapper } = await mountWithApp(FilmDetailsView, '/watchlist/9')
      const labels = wrapper.findAll('dt').map((dt) => dt.text())
      expect(labels).toContain('Created by')
      expect(labels).toContain('Episode runtime')
      expect(labels).not.toContain('Directed by')
      expect(labels).not.toContain('Runtime')
      expect(wrapper.text()).toContain('47 min')
      expect(wrapper.text()).toContain('Vince Gilligan')
      await expectNoA11yViolations(wrapper.element)
    })

    it('keeps the movie wording and the movie link for a movie', async () => {
      const { wrapper } = await mountWithApp(FilmDetailsView, '/watchlist/7')
      const labels = wrapper.findAll('dt').map((dt) => dt.text())
      expect(labels).toContain('Directed by')
      expect(labels).toContain('Runtime')
      expect(wrapper.find('a[href="https://www.themoviedb.org/movie/976893"]').exists()).toBe(true)
    })
  })
})

