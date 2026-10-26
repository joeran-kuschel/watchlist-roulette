import { describe, expect, it } from 'vitest'
import type { ImportRow } from '../src/import/csv.js'
import { buildPlan, isLargeRemoval, removalToken, sourceOfLink, type ExistingFilm } from '../src/import/plan.js'

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

describe('buildPlan with several sources', () => {
  const imdbRow = (n: number, extra: Partial<ImportRow> = {}) =>
    row(n, { letterboxdUrl: `https://www.imdb.com/title/tt000000${n}/`, ...extra })
  const imdbFilm = (n: number, extra: Partial<ExistingFilm> = {}) =>
    film(n, { letterboxdUrl: `https://www.imdb.com/title/tt000000${n}/`, ...extra })

  it('an IMDb file never removes Letterboxd films, and a Letterboxd file never removes IMDb films', () => {
    const existing = [film(1), imdbFilm(2), imdbFilm(3)]
    expect(buildPlan([imdbRow(2)], [], existing, 'imdb').toRemove.map((f) => f.id)).toEqual([3])
    expect(buildPlan([row(9)], [], existing, 'letterboxd').toRemove.map((f) => f.id)).toEqual([1])
  })

  it('counts only films of the same source for the large-removal guard', () => {
    const existing = [film(1), film(2), film(3), imdbFilm(4), imdbFilm(5)]
    const plan = buildPlan([imdbRow(4), imdbRow(5)], [], existing, 'imdb')
    expect(plan.unwatchedCount).toBe(2)
    expect(isLargeRemoval(plan)).toBe(false)
  })

  it('treats a film with any other link as Letterboxd, as before', () => {
    const other = film(1, { letterboxdUrl: 'https://example.com/film/1' })
    expect(buildPlan([], [], [other]).toRemove).toEqual([other])
    expect(buildPlan([], [], [other], 'imdb').toRemove).toEqual([])
  })

  it('a row without a date never counts as a change', () => {
    expect(buildPlan([row(1, { addedAt: null })], [], [film(1)]).unchanged).toBe(1)
    expect(buildPlan([row(1, { addedAt: null, title: 'New' })], [], [film(1)]).toUpdate).toHaveLength(1)
  })

  it.each([
    'https://notimdb.com/title/tt0000001/',
    'https://imdb.com.evil.test/title/tt0000001/',
    'https://evil.test/imdb.com/title/tt0000001/',
    'https://boxd.it/imdb.com',
  ])('does not take %s for an IMDb link', (letterboxdUrl) => {
    expect(sourceOfLink(letterboxdUrl)).toBe('letterboxd')
    expect(buildPlan([], [], [film(1, { letterboxdUrl })], 'imdb').toRemove).toEqual([])
  })

  it.each([
    'https://www.imdb.com/title/tt0000001/',
    'http://imdb.com/title/tt0000001/',
    'https://m.imdb.com/title/tt0000001/?ref_=x',
    'HTTPS://WWW.IMDB.COM/title/tt0000001/',
  ])('takes %s for an IMDb link', (link) => {
    expect(sourceOfLink(link)).toBe('imdb')
  })

  it('does not remove an IMDb film whose row was rejected, and keeps watched manual IMDb films', () => {
    const existing = [imdbFilm(1), imdbFilm(2, { watched: true }), imdbFilm(3)]
    const rejected = [{ line: 2, reason: 'TV episodes are not imported', letterboxdUrl: existing[0]!.letterboxdUrl }]
    const plan = buildPlan([], rejected, existing, 'imdb')
    expect(plan.toRemove.map((f) => f.id)).toEqual([3])
    expect(plan.keptWatched.map((f) => f.id)).toEqual([2])
  })

  it('updates the title of a film without touching its date when the row has none', () => {
    const plan = buildPlan([imdbRow(1, { addedAt: null, title: 'New', releaseYear: 1999 })], [], [imdbFilm(1)], 'imdb')
    expect(plan.toUpdate).toHaveLength(1)
  })
})
