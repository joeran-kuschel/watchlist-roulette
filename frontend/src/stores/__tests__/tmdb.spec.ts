import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import * as api from '../../api'
import type { TmdbCheck } from '../../types'
import { useTmdbStore } from '../tmdb'

vi.mock('../../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api')>()),
  getTmdbCheck: vi.fn<typeof import('../../api').getTmdbCheck>(),
}))
const mocked = vi.mocked(api)

const state = (enabled: boolean): TmdbCheck => ({ enabled, running: false, total: 0, done: 0, lastRun: null })

beforeEach(() => {
  setActivePinia(createPinia())
  vi.resetAllMocks()
})

describe('tmdb store', () => {
  it('is unknown, and not off, before it has asked', () => {
    const store = useTmdbStore()
    expect(store.enabled).toBeNull()
    expect(store.off).toBe(false)
    expect(mocked.getTmdbCheck).not.toHaveBeenCalled()
  })

  it('is on when the backend has a TMDB token', async () => {
    mocked.getTmdbCheck.mockResolvedValue(state(true))
    const store = useTmdbStore()
    await store.load()
    expect(store.enabled).toBe(true)
    expect(store.off).toBe(false)
  })

  it('is off when the backend has no TMDB token', async () => {
    mocked.getTmdbCheck.mockResolvedValue(state(false))
    const store = useTmdbStore()
    await store.load()
    expect(store.enabled).toBe(false)
    expect(store.off).toBe(true)
  })

  it('stays unknown, and not off, when the request fails', async () => {
    mocked.getTmdbCheck.mockRejectedValue(new api.ApiError(0, 'unreachable'))
    const store = useTmdbStore()
    await expect(store.load()).resolves.toBeUndefined()
    expect(store.enabled).toBeNull()
    expect(store.off).toBe(false)
  })

  it('asks again on the next call after a failed request', async () => {
    mocked.getTmdbCheck.mockRejectedValueOnce(new api.ApiError(503, 'down')).mockResolvedValue(state(false))
    const store = useTmdbStore()
    await store.load()
    await store.load()
    expect(mocked.getTmdbCheck).toHaveBeenCalledTimes(2)
    expect(store.off).toBe(true)
  })

  it('sends one request for several loads, also while the first is still running', async () => {
    mocked.getTmdbCheck.mockResolvedValue(state(true))
    const store = useTmdbStore()
    await Promise.all([store.load(), store.load()])
    await store.load()
    expect(mocked.getTmdbCheck).toHaveBeenCalledTimes(1)
  })

  it('asks again on the next call while TMDB is off, so a token added later shows up', async () => {
    mocked.getTmdbCheck.mockResolvedValueOnce(state(false)).mockResolvedValue(state(true))
    const store = useTmdbStore()
    await store.load()
    expect(store.off).toBe(true)
    await store.load()
    expect(mocked.getTmdbCheck).toHaveBeenCalledTimes(2)
    expect(store.off).toBe(false)
  })

  it('does not ask again once TMDB is known to be on', async () => {
    mocked.getTmdbCheck.mockResolvedValue(state(true))
    const store = useTmdbStore()
    await store.load()
    mocked.getTmdbCheck.mockResolvedValue(state(false))
    await store.load()
    expect(store.enabled).toBe(true)
  })
})
