import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import * as api from '../../api'
import { makeFilm } from '../../__tests__/helpers'
import { useRouletteStore } from '../roulette'
import { useWatchlistStore } from '../watchlist'

vi.mock('../../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api')>()),
  randomFilm: vi.fn<typeof import('../../api').randomFilm>(),
  updateFilm: vi.fn<typeof import('../../api').updateFilm>(),
  listFilms: vi.fn<typeof import('../../api').listFilms>(),
}))

const mocked = vi.mocked(api)

beforeEach(() => {
  setActivePinia(createPinia())
  vi.resetAllMocks()
})

describe('roulette store', () => {
  it('stores the picked film', async () => {
    mocked.randomFilm.mockResolvedValue(makeFilm())
    const store = useRouletteStore()
    const pending = store.spin({ country: 'JP' })
    expect(store.status).toBe('loading')
    await pending
    expect(mocked.randomFilm).toHaveBeenCalledWith({ country: 'JP' })
    expect(store.status).toBe('ready')
    expect(store.film?.title).toBe('Perfect Days')
  })

  it('is empty on 404 and drops the old film', async () => {
    const store = useRouletteStore()
    mocked.randomFilm.mockResolvedValueOnce(makeFilm())
    await store.spin()
    mocked.randomFilm.mockRejectedValueOnce(new api.ApiError(404, 'No unwatched film matches'))
    await store.spin()
    expect(store.status).toBe('empty')
    expect(store.film).toBeNull()
    expect(store.error).toBe('')
  })

  it('reports other errors in words', async () => {
    mocked.randomFilm.mockRejectedValue(new api.ApiError(0, 'x'))
    const store = useRouletteStore()
    await store.spin()
    expect(store.status).toBe('error')
    expect(store.error).toMatch(/Can't reach the server/)
  })

  it('clears the old notice and error when spinning again', async () => {
    const store = useRouletteStore()
    store.notice = 'old'
    store.error = 'old'
    mocked.randomFilm.mockResolvedValue(makeFilm())
    await store.spin()
    expect(store.notice).toBe('')
    expect(store.error).toBe('')
  })

  it('marks the film as watched', async () => {
    const store = useRouletteStore()
    mocked.randomFilm.mockResolvedValue(makeFilm())
    await store.spin()
    mocked.updateFilm.mockResolvedValue(makeFilm({ watchedAt: '2026-10-11T10:00:00.000Z' }))
    await store.markWatched()
    expect(mocked.updateFilm).toHaveBeenCalledWith(1, { watched: true })
    expect(store.film?.watchedAt).not.toBeNull()
    expect(store.notice).toMatch(/Perfect Days is marked as watched/)
  })

  it('keeps the film when marking fails', async () => {
    const store = useRouletteStore()
    mocked.randomFilm.mockResolvedValue(makeFilm())
    await store.spin()
    mocked.updateFilm.mockRejectedValue(new api.ApiError(500, 'boom'))
    await store.markWatched()
    expect(store.film?.title).toBe('Perfect Days')
    expect(store.error).toMatch(/server had a problem/)
    expect(store.status).toBe('ready')
  })

  it('does nothing without a film', async () => {
    const store = useRouletteStore()
    await store.markWatched()
    expect(mocked.updateFilm).not.toHaveBeenCalled()
  })
})

describe('watchlist store', () => {
  const page = (items = [makeFilm(), makeFilm({ id: 2, title: 'Stalker' })]) => ({
    items,
    total: 120,
    page: 2,
    pageSize: 50,
  })

  it('loads a page', async () => {
    mocked.listFilms.mockResolvedValue(page())
    const store = useWatchlistStore()
    await store.load({ q: 'x' })
    expect(mocked.listFilms).toHaveBeenCalledWith({ q: 'x' })
    expect(store).toMatchObject({ status: 'ready', total: 120, page: 2, pageSize: 50 })
    expect(store.items).toHaveLength(2)
  })

  it('reports a load error', async () => {
    mocked.listFilms.mockRejectedValue(new api.ApiError(0, 'x'))
    const store = useWatchlistStore()
    await store.load({})
    expect(store.status).toBe('error')
    expect(store.error).toMatch(/Can't reach the server/)
  })

  it('replaces the film in the list after marking it watched', async () => {
    mocked.listFilms.mockResolvedValue(page())
    const store = useWatchlistStore()
    await store.load({})
    mocked.updateFilm.mockResolvedValue(makeFilm({ id: 2, title: 'Stalker', watchedAt: '2026-10-11T10:00:00.000Z' }))
    await store.setWatched(store.items[1]!, true)
    expect(mocked.updateFilm).toHaveBeenCalledWith(2, { watched: true })
    expect(store.items[1]!.watchedAt).not.toBeNull()
    expect(store.items[0]!.watchedAt).toBeNull()
    expect(store.notice).toBe('Stalker is marked as watched.')
  })

  it('says "unwatched" when undoing', async () => {
    mocked.listFilms.mockResolvedValue(page())
    const store = useWatchlistStore()
    await store.load({})
    mocked.updateFilm.mockResolvedValue(makeFilm())
    await store.setWatched(store.items[0]!, false)
    expect(store.notice).toBe('Perfect Days is marked as unwatched.')
  })

  it('keeps the list and reports an error when the update fails', async () => {
    mocked.listFilms.mockResolvedValue(page())
    const store = useWatchlistStore()
    await store.load({})
    mocked.updateFilm.mockRejectedValue(new api.ApiError(404, 'Film not found'))
    await store.setWatched(store.items[0]!, true)
    expect(store.error).toBe('Film not found')
    expect(store.items[0]!.watchedAt).toBeNull()
    expect(store.notice).toBe('')
  })

  it('clears the old error when loading again', async () => {
    const store = useWatchlistStore()
    mocked.listFilms.mockRejectedValueOnce(new api.ApiError(500, 'boom'))
    await store.load({})
    expect(store.error).toMatch(/server had a problem/)
    mocked.listFilms.mockResolvedValueOnce(page())
    await store.load({})
    expect(store.error).toBe('')
    expect(store.status).toBe('ready')
  })

  it('is loading while the request runs', async () => {
    mocked.listFilms.mockReturnValue(new Promise(() => {}))
    const store = useWatchlistStore()
    void store.load({})
    expect(store.status).toBe('loading')
  })

  it('shows an empty list as ready with a total of 0', async () => {
    mocked.listFilms.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50 })
    const store = useWatchlistStore()
    await store.load({})
    expect(store).toMatchObject({ status: 'ready', total: 0, items: [] })
  })

  it.each([
    [400, 'Invalid request', 'Invalid request'],
    [500, 'boom', 'The server had a problem. Try again in a moment.'],
    [0, 'x', "Can't reach the server. Check that the app is running, then try again."],
  ])('describes a %i from the update', async (status, message, shown) => {
    mocked.listFilms.mockResolvedValue(page())
    const store = useWatchlistStore()
    await store.load({})
    mocked.updateFilm.mockRejectedValue(new api.ApiError(status, message))
    await store.setWatched(store.items[0]!, true)
    expect(store.error).toBe(shown)
    expect(store.status).toBe('ready')
  })

  it('clears the old error when an update succeeds', async () => {
    mocked.listFilms.mockResolvedValue(page())
    const store = useWatchlistStore()
    await store.load({})
    mocked.updateFilm.mockRejectedValueOnce(new api.ApiError(500, 'boom'))
    await store.setWatched(store.items[0]!, true)
    mocked.updateFilm.mockResolvedValueOnce(makeFilm())
    await store.setWatched(store.items[0]!, true)
    expect(store.error).toBe('')
  })

  it('announces the update even if the film is no longer in the list, without adding it', async () => {
    mocked.listFilms.mockResolvedValue(page([makeFilm()]))
    const store = useWatchlistStore()
    await store.load({})
    mocked.updateFilm.mockResolvedValue(makeFilm({ id: 99, title: 'Gone' }))
    await store.setWatched(makeFilm({ id: 99, title: 'Gone' }), true)
    expect(store.items).toHaveLength(1)
    expect(store.notice).toBe('Gone is marked as watched.')
  })

  it('names films with quotes and non-ASCII characters in the notice', async () => {
    mocked.listFilms.mockResolvedValue(page([makeFilm({ title: 'Cléo "5" à 7' })]))
    const store = useWatchlistStore()
    await store.load({})
    mocked.updateFilm.mockResolvedValue(makeFilm({ title: 'Cléo "5" à 7' }))
    await store.setWatched(store.items[0]!, true)
    expect(store.notice).toBe('Cléo "5" à 7 is marked as watched.')
  })

  it('shows the answer of the latest load when an older one finishes last', async () => {
    let resolveFirst!: (value: ReturnType<typeof page>) => void
    mocked.listFilms.mockReturnValueOnce(new Promise((resolve) => (resolveFirst = resolve)))
    mocked.listFilms.mockResolvedValueOnce(page([makeFilm({ id: 2, title: 'Second' })]))
    const store = useWatchlistStore()
    const first = store.load({ page: 1 })
    await store.load({ page: 2 })
    resolveFirst(page([makeFilm({ id: 1, title: 'First' })]))
    await first
    expect(store.items.map((film) => film.title)).toEqual(['Second'])
  })

  it('forgets the old notice when a later update fails', async () => {
    mocked.listFilms.mockResolvedValue(page())
    const store = useWatchlistStore()
    await store.load({})
    mocked.updateFilm.mockResolvedValueOnce(makeFilm())
    await store.setWatched(store.items[0]!, true)
    mocked.updateFilm.mockRejectedValueOnce(new api.ApiError(500, 'boom'))
    await store.setWatched(store.items[1]!, true)
    expect(store.notice).toBe('')
  })
})

describe('roulette store: edge cases', () => {
  it.each([
    [400, 'Invalid request'],
    [500, 'The server had a problem. Try again in a moment.'],
    [0, "Can't reach the server. Check that the app is running, then try again."],
  ])('is an error, not empty, on a %i', async (status, shown) => {
    mocked.randomFilm.mockRejectedValue(new api.ApiError(status, 'Invalid request'))
    const store = useRouletteStore()
    await store.spin()
    expect(store).toMatchObject({ status: 'error', error: shown, film: null })
  })

  it('treats a non-API failure as an error', async () => {
    mocked.randomFilm.mockRejectedValue(new TypeError('x'))
    const store = useRouletteStore()
    await store.spin()
    expect(store).toMatchObject({ status: 'error', error: 'Something went wrong.' })
  })

  it('recovers from an error with the next spin', async () => {
    const store = useRouletteStore()
    mocked.randomFilm.mockRejectedValueOnce(new api.ApiError(0, 'x'))
    await store.spin()
    mocked.randomFilm.mockResolvedValueOnce(makeFilm())
    await store.spin()
    expect(store).toMatchObject({ status: 'ready', error: '' })
  })

  it('is idle before the first spin', () => {
    expect(useRouletteStore()).toMatchObject({ status: 'idle', film: null, error: '', notice: '' })
  })

  it('passes no filters by default', async () => {
    mocked.randomFilm.mockResolvedValue(makeFilm())
    await useRouletteStore().spin()
    expect(mocked.randomFilm).toHaveBeenCalledWith({})
  })

  it('keeps the film and shows the error when it was deleted meanwhile (404 on mark)', async () => {
    const store = useRouletteStore()
    mocked.randomFilm.mockResolvedValue(makeFilm())
    await store.spin()
    mocked.updateFilm.mockRejectedValue(new api.ApiError(404, 'Film not found'))
    await store.markWatched()
    expect(store).toMatchObject({ status: 'ready', error: 'Film not found' })
    expect(store.film?.title).toBe('Perfect Days')
    expect(store.notice).toBe('')
  })

  it('clears the mark error when marking works the next time', async () => {
    const store = useRouletteStore()
    mocked.randomFilm.mockResolvedValue(makeFilm())
    await store.spin()
    mocked.updateFilm.mockRejectedValueOnce(new api.ApiError(500, 'boom'))
    await store.markWatched()
    mocked.updateFilm.mockResolvedValueOnce(makeFilm({ watchedAt: '2026-10-11T10:00:00.000Z' }))
    await store.markWatched()
    expect(store.error).toBe('')
    expect(store.notice).toMatch(/marked as watched/)
  })

  it('forgets the old notice when a later mark fails', async () => {
    const store = useRouletteStore()
    mocked.randomFilm.mockResolvedValue(makeFilm())
    await store.spin()
    mocked.updateFilm.mockResolvedValueOnce(makeFilm({ watchedAt: '2026-10-11T10:00:00.000Z' }))
    await store.markWatched()
    mocked.updateFilm.mockRejectedValueOnce(new api.ApiError(500, 'boom'))
    await store.markWatched()
    expect(store.notice).toBe('')
  })
})
