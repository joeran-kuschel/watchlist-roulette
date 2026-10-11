import { describe, expect, it } from 'vitest'
import type { ImportRow } from '../src/import/csv.js'
import { buildPlan, isLargeRemoval, removalToken, type ExistingFilm } from '../src/import/plan.js'

const row = (n: number, extra: Partial<ImportRow> = {}): ImportRow => ({
  line: n + 1,
  title: `Film ${n}`,
  releaseYear: 2000,
  letterboxdUrl: `https://boxd.it/${n}`,
  addedAt: '2020-01-01',
  ...extra,
})
const film = (n: number, extra: Partial<ExistingFilm> = {}): ExistingFilm => ({
  id: n,
  title: `Film ${n}`,
  releaseYear: 2000,
  letterboxdUrl: `https://boxd.it/${n}`,
  addedAt: '2020-01-01',
  watched: false,
  ...extra,
})

describe('buildPlan', () => {
  it('sorts rows into insert, update and unchanged', () => {
    const plan = buildPlan([row(1), row(2, { title: 'Renamed' }), row(3)], [], [film(1), film(2)])
    expect(plan.toInsert.map((r) => r.letterboxdUrl)).toEqual(['https://boxd.it/3'])
    expect(plan.toUpdate.map((u) => u.id)).toEqual([2])
    expect(plan.unchanged).toBe(1)
  })

  it('updates when only the year or the added date differ', () => {
    expect(buildPlan([row(1, { releaseYear: 2001 })], [], [film(1)]).toUpdate).toHaveLength(1)
    expect(buildPlan([row(1, { addedAt: '2021-01-01' })], [], [film(1)]).toUpdate).toHaveLength(1)
  })

  it('removes unwatched films missing from the file and keeps watched ones', () => {
    const plan = buildPlan([row(1)], [], [film(1), film(2), film(3, { watched: true })])
    expect(plan.toRemove.map((f) => f.id)).toEqual([2])
    expect(plan.keptWatched.map((f) => f.id)).toEqual([3])
  })

  it('does not remove a film whose row was rejected', () => {
    const plan = buildPlan([], [{ line: 2, reason: 'bad year', letterboxdUrl: 'https://boxd.it/1' }], [film(1)])
    expect(plan.toRemove).toEqual([])
  })

  it('an empty file removes every unwatched film', () => {
    const plan = buildPlan([], [], [film(1), film(2)])
    expect(plan.toRemove).toHaveLength(2)
    expect(isLargeRemoval(plan)).toBe(true)
  })
})

describe('isLargeRemoval', () => {
  it('is false for no removals and for at most half of the unwatched films', () => {
    expect(isLargeRemoval(buildPlan([row(1)], [], [film(1)]))).toBe(false)
    expect(isLargeRemoval(buildPlan([row(1), row(2)], [], [film(1), film(2), film(3), film(4)]))).toBe(false)
  })

  it('is true above half', () => {
    expect(isLargeRemoval(buildPlan([row(1)], [], [film(1), film(2), film(3)]))).toBe(true)
  })
})

describe('removalToken', () => {
  it('depends on the set of films, not their order', () => {
    expect(removalToken([film(1), film(2)])).toBe(removalToken([film(2), film(1)]))
    expect(removalToken([film(1)])).not.toBe(removalToken([film(1), film(2)]))
  })
})
