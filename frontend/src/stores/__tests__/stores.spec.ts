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
})
