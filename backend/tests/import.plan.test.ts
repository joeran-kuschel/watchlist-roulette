import { describe, expect, it } from 'vitest'
import type { ImportRow } from '../src/import/csv.js'
import { buildPlan, isLargeRemoval, normalizeTitle, removalToken, sourceOfLink, type ExistingFilm } from '../src/import/plan.js'

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

describe('normalizeTitle', () => {
  it('ignores case, accents, punctuation, spacing and a leading "the"', () => {
    const same = ['Amélie', 'amelie', 'AMELIE!', '  Amelie  ', 'The Amelie']
    expect(new Set(same.map(normalizeTitle))).toEqual(new Set(['amelie']))
    expect(normalizeTitle('Cléo from 5 to 7')).toBe('cleo from 5 to 7')
    expect(normalizeTitle('Se7en')).toBe('se7en')
    expect(normalizeTitle("Heat: Director's Cut")).toBe('heat director s cut')
  })

  it('keeps the marks of other scripts, which change the meaning (Japanese dakuten)', () => {
    expect(normalizeTitle('か')).not.toBe(normalizeTitle('が'))
  })

  it('keeps other scripts, and does not strip "the" inside a word', () => {
    expect(normalizeTitle('千と千尋の神隠し')).toBe('千と千尋の神隠し')
    expect(normalizeTitle('Theory of Everything')).toBe('theory of everything')
  })
})

describe('buildPlan skips a film that came from the other export', () => {
  const imdbLink = (n: number) => `https://www.imdb.com/title/tt000000${n}/`
  const imdbRow = (n: number, extra: Partial<ImportRow> = {}) => row(n, { letterboxdUrl: imdbLink(n), ...extra })

  it('skips an IMDb row whose title and year match a Letterboxd film, and lists the film it matches', () => {
    const plan = buildPlan([imdbRow(9, { title: 'film 1!', releaseYear: 2000 })], [], [film(1)], 'imdb')
    expect(plan.toInsert).toEqual([])
    expect(plan.toSkip).toEqual([{ row: expect.objectContaining({ title: 'film 1!' }), existing: film(1) }])
  })

  it('works the other way round for a Letterboxd file', () => {
    const existing = film(1, { letterboxdUrl: imdbLink(1) })
    expect(buildPlan([row(9, { title: 'Film 1' })], [], [existing]).toSkip).toHaveLength(1)
  })

  it('does not skip a row from the same source, a different year, or a row or film without a year', () => {
    expect(buildPlan([row(9, { title: 'Film 1' })], [], [film(1)]).toInsert).toHaveLength(1)
    expect(buildPlan([imdbRow(9, { title: 'Film 1', releaseYear: 2001 })], [], [film(1)], 'imdb').toInsert).toHaveLength(1)
    const noYear = buildPlan([imdbRow(9, { title: 'Film 1', releaseYear: null })], [], [film(1, { releaseYear: null })], 'imdb')
    expect(noYear.toInsert).toHaveLength(1)
  })

  it('does not skip a row whose link is already stored, so an update still happens', () => {
    const stored = film(9, { title: 'Film 1', letterboxdUrl: imdbLink(9) })
    const plan = buildPlan([imdbRow(9, { title: 'Film 1', releaseYear: 2000, addedAt: '2021-01-01' })], [], [film(1), stored], 'imdb')
    expect(plan.toSkip).toEqual([])
    expect(plan.toUpdate).toHaveLength(1)
  })

  it('does not change what is removed or counted for the guard', () => {
    const plan = buildPlan([imdbRow(9, { title: 'Film 1', releaseYear: 2000 })], [], [film(1)], 'imdb')
    expect(plan.toRemove).toEqual([])
    expect(plan.unwatchedCount).toBe(0)
  })

  it('matches the oldest film when several films of the other source share title and year', () => {
    const twins = [film(1, { title: 'Twin' }), film(2, { title: 'Twin' })]
    const plan = buildPlan([imdbRow(9, { title: 'Twin', releaseYear: 2000 })], [], twins, 'imdb')
    expect(plan.toSkip[0]?.existing.id).toBe(1)
  })
})

describe('normalizeTitle edge cases', () => {
  it('gives an empty string for an empty or whitespace-only title', () => {
    expect(normalizeTitle('')).toBe('')
    expect(normalizeTitle('   ')).toBe('')
  })

  it('keeps a lone "The", and strips only one leading "the"', () => {
    expect(normalizeTitle('The')).toBe('the')
    expect(normalizeTitle('The The')).toBe('the')
    expect(normalizeTitle('The Thé')).toBe('the')
    expect(normalizeTitle('THE   MATRIX')).toBe('matrix')
  })

  it('does not fold ligatures, sharp s or full-width letters (only accents are folded)', () => {
    // Documents the current limit: such titles from two exports are stored twice.
    expect(normalizeTitle('Straße')).not.toBe(normalizeTitle('Strasse'))
    expect(normalizeTitle('Œuvre')).not.toBe(normalizeTitle('Oeuvre'))
    expect(normalizeTitle('Ｈeat')).not.toBe(normalizeTitle('Heat'))
  })

  it('compares a punctuation-only title as it is, so "!!!" and "???" are different films', () => {
    const imdb = (title: string) =>
      buildPlan([row(9, { title, releaseYear: 2000, letterboxdUrl: 'https://www.imdb.com/title/tt0000009/' })], [], [film(1, { title: '!!!', releaseYear: 2000 })], 'imdb')
    expect(imdb('???').toInsert).toHaveLength(1)
    expect(imdb('???').toSkip).toEqual([])
    expect(imdb(' !!! ').toSkip).toHaveLength(1)
  })
})

describe('buildPlan skip edge cases', () => {
  const imdbRow = (n: number, extra: Partial<ImportRow> = {}) =>
    row(n, { letterboxdUrl: `https://www.imdb.com/title/tt000000${n}/`, ...extra })

  it('skips every row that matches the same film, each listing that film', () => {
    const rows = [imdbRow(8, { title: 'Film 1' }), imdbRow(9, { title: 'FILM 1' })]
    const plan = buildPlan(rows, [], [film(1)], 'imdb')
    expect(plan.toInsert).toEqual([])
    expect(plan.toSkip.map((s) => [s.row.line, s.existing.id])).toEqual([[9, 1], [10, 1]])
  })

  it('does not let the other-source rule skip a row that matches a film of its own source', () => {
    const own = film(5, { title: 'Film 1', letterboxdUrl: 'https://www.imdb.com/title/tt0000005/' })
    const plan = buildPlan([imdbRow(9, { title: 'Film 1' })], [], [own], 'imdb')
    expect(plan.toSkip).toEqual([])
    expect(plan.toInsert).toHaveLength(1)
  })

  it('skips a row that matches a watched film of the other source, without touching it', () => {
    const watched = film(1, { watched: true })
    const plan = buildPlan([imdbRow(9, { title: 'Film 1' })], [], [watched], 'imdb')
    expect(plan.toSkip[0]?.existing.watched).toBe(true)
    expect(plan.toRemove).toEqual([])
    expect(plan.keptWatched).toEqual([])
  })

  it('does not match films that differ only in year', () => {
    const plan = buildPlan([imdbRow(9, { title: 'Film 1', releaseYear: 1999 })], [], [film(1), film(2, { title: 'Film 1', releaseYear: 2001 })], 'imdb')
    expect(plan.toSkip).toEqual([])
  })

  it('does not let a rejected row hide or skip anything', () => {
    const plan = buildPlan([], [{ line: 3, reason: 'x', letterboxdUrl: 'https://www.imdb.com/title/tt0000009/' }], [film(1)], 'imdb')
    expect(plan.toSkip).toEqual([])
    expect(plan.toRemove).toEqual([])
  })
})
