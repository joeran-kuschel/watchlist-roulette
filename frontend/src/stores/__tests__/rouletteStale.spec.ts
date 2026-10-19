import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import * as api from '../../api'
import { makeFilm } from '../../__tests__/helpers'
import { useRouletteStore } from '../roulette'

vi.mock('../../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api')>()),
  randomFilm: vi.fn<typeof import('../../api').randomFilm>(),
  updateFilm: vi.fn<typeof import('../../api').updateFilm>(),
  getFilm: vi.fn<typeof import('../../api').getFilm>(),
}))
const mocked = vi.mocked(api)

type Film = ReturnType<typeof makeFilm>
const deferred = () => {
  let resolve!: (value: Film) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<Film>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.resetAllMocks()
})

describe('roulette store: stale answers', () => {
  it('keeps the answer of the last spin even if an older one arrives later', async () => {
    const slow = deferred()
    mocked.randomFilm.mockReturnValueOnce(slow.promise)
    mocked.randomFilm.mockResolvedValueOnce(makeFilm({ id: 2, title: 'Newer' }))
    const store = useRouletteStore()
    const older = store.spin()
    await store.spin()
    slow.resolve(makeFilm({ id: 1, title: 'Older' }))
    await older
    expect(store.film?.title).toBe('Newer')
    expect(store.status).toBe('ready')
  })

  it('ignores the failure of an older spin', async () => {
    const slow = deferred()
    mocked.randomFilm.mockReturnValueOnce(slow.promise)
    mocked.randomFilm.mockResolvedValueOnce(makeFilm({ title: 'Newer' }))
    const store = useRouletteStore()
    const older = store.spin()
    await store.spin()
    slow.reject(new api.ApiError(0, 'x'))
    await older
    expect(store.film?.title).toBe('Newer')
    expect(store.error).toBe('')
    expect(store.status).toBe('ready')
  })

  it('does not overwrite a newer pick when marking the old film finishes late', async () => {
    mocked.randomFilm.mockResolvedValueOnce(makeFilm({ id: 1, title: 'Old' }))
    const store = useRouletteStore()
    await store.spin()
    const slow = deferred()
    mocked.updateFilm.mockReturnValueOnce(slow.promise)
    const marking = store.markWatched()
    mocked.randomFilm.mockResolvedValueOnce(makeFilm({ id: 2, title: 'New' }))
    await store.spin()
    slow.resolve(makeFilm({ id: 1, title: 'Old', watchedAt: '2026-01-01T00:00:00.000Z' }))
    await marking
    expect(store.film?.title).toBe('New')
    expect(store.notice).toBe('')
  })

  it('does not show the error of a late failed mark for a film that is no longer shown', async () => {
    mocked.randomFilm.mockResolvedValueOnce(makeFilm({ id: 1 }))
    const store = useRouletteStore()
    await store.spin()
    const slow = deferred()
    mocked.updateFilm.mockReturnValueOnce(slow.promise)
    const marking = store.markWatched()
    mocked.randomFilm.mockResolvedValueOnce(makeFilm({ id: 2 }))
    await store.spin()
    slow.reject(new api.ApiError(500, 'boom'))
    await marking
    expect(store.error).toBe('')
  })
})

describe('roulette store: refresh', () => {
  it('does nothing without a pick', async () => {
    const store = useRouletteStore()
    await store.refresh()
    expect(mocked.getFilm).not.toHaveBeenCalled()
  })

  it('replaces the film with its current data', async () => {
    mocked.randomFilm.mockResolvedValueOnce(makeFilm())
    const store = useRouletteStore()
    await store.spin()
    mocked.getFilm.mockResolvedValue(makeFilm({ title: 'Edited' }))
    await store.refresh()
    expect(mocked.getFilm).toHaveBeenCalledWith(1)
    expect(store.film?.title).toBe('Edited')
    expect(mocked.randomFilm).toHaveBeenCalledTimes(1)
  })

  it('spins again with the same filters when the film was watched meanwhile', async () => {
    mocked.randomFilm.mockResolvedValueOnce(makeFilm())
    const store = useRouletteStore()
    await store.spin({ country: 'JP' })
    mocked.getFilm.mockResolvedValue(makeFilm({ watchedAt: '2026-01-01T00:00:00.000Z' }))
    mocked.randomFilm.mockResolvedValueOnce(makeFilm({ id: 2, title: 'Next' }))
    await store.refresh()
    expect(mocked.randomFilm).toHaveBeenLastCalledWith({ country: 'JP' })
    expect(store.film?.title).toBe('Next')
  })

  it('spins again when the film no longer exists', async () => {
    mocked.randomFilm.mockResolvedValueOnce(makeFilm())
    const store = useRouletteStore()
    await store.spin()
    mocked.getFilm.mockRejectedValue(new api.ApiError(404, 'Film not found'))
    mocked.randomFilm.mockResolvedValueOnce(makeFilm({ id: 2, title: 'Next' }))
    await store.refresh()
    expect(store.film?.title).toBe('Next')
  })

  it('keeps the film on other errors', async () => {
    mocked.randomFilm.mockResolvedValueOnce(makeFilm())
    const store = useRouletteStore()
    await store.spin()
    mocked.getFilm.mockRejectedValue(new api.ApiError(0, 'x'))
    await store.refresh()
    expect(store.film?.title).toBe('Perfect Days')
    expect(store.error).toBe('')
  })

  it('drops its result when the user spun meanwhile', async () => {
    mocked.randomFilm.mockResolvedValueOnce(makeFilm({ id: 1, title: 'Old' }))
    const store = useRouletteStore()
    await store.spin()
    const slow = deferred()
    mocked.getFilm.mockReturnValueOnce(slow.promise)
    const refreshing = store.refresh()
    mocked.randomFilm.mockResolvedValueOnce(makeFilm({ id: 2, title: 'New' }))
    await store.spin()
    slow.resolve(makeFilm({ id: 1, title: 'Old', watchedAt: '2026-01-01T00:00:00.000Z' }))
    await refreshing
    expect(store.film?.title).toBe('New')
    expect(mocked.randomFilm).toHaveBeenCalledTimes(2)
  })
})

describe('roulette store: automatic first pick', () => {
  it('is automatic only for a spin made on arrival', async () => {
    mocked.randomFilm.mockResolvedValue(makeFilm())
    const store = useRouletteStore()
    expect(store.automatic).toBe(false)
    await store.spin({}, true)
    expect(store.automatic).toBe(true)
    await store.spin()
    expect(store.automatic).toBe(false)
  })

  it('stays automatic when the first pick is marked as watched', async () => {
    mocked.randomFilm.mockResolvedValue(makeFilm())
    mocked.updateFilm.mockResolvedValue(makeFilm({ watchedAt: '2026-01-01T00:00:00.000Z' }))
    const store = useRouletteStore()
    await store.spin({}, true)
    await store.markWatched()
    expect(store.automatic).toBe(true)
  })

  it('stays automatic when refresh only reloads the same film', async () => {
    mocked.randomFilm.mockResolvedValue(makeFilm())
    const store = useRouletteStore()
    await store.spin({}, true)
    mocked.getFilm.mockResolvedValue(makeFilm({ title: 'Edited' }))
    await store.refresh()
    expect(store.automatic).toBe(true)
  })

  it('is not automatic when a retry follows a failed first pick', async () => {
    mocked.randomFilm.mockRejectedValueOnce(new api.ApiError(0, 'x'))
    const store = useRouletteStore()
    await store.spin({}, true)
    mocked.randomFilm.mockResolvedValueOnce(makeFilm())
    await store.spin({})
    expect(store.status).toBe('ready')
    expect(store.automatic).toBe(false)
  })

  it('keeps the first-pick note when refresh replaces a watched first pick', async () => {
    mocked.randomFilm.mockResolvedValueOnce(makeFilm())
    const store = useRouletteStore()
    await store.spin({}, true)
    mocked.getFilm.mockResolvedValue(makeFilm({ watchedAt: '2026-01-01T00:00:00.000Z' }))
    mocked.randomFilm.mockResolvedValueOnce(makeFilm({ id: 2, title: 'Next' }))
    await store.refresh()
    expect(store.film?.title).toBe('Next')
    expect(store.automatic).toBe(true)
  })

  it('does not make a replacement a first pick when the user had pressed Spin', async () => {
    mocked.randomFilm.mockResolvedValueOnce(makeFilm())
    const store = useRouletteStore()
    await store.spin({})
    mocked.getFilm.mockResolvedValue(makeFilm({ watchedAt: '2026-01-01T00:00:00.000Z' }))
    mocked.randomFilm.mockResolvedValueOnce(makeFilm({ id: 2, title: 'Next' }))
    await store.refresh()
    expect(store.film?.title).toBe('Next')
    expect(store.automatic).toBe(false)
  })
})
