import { describe, expect, it } from 'vitest'
import { formatDate, formatRuntime, joinNames } from '../format'
import { emptyFilters, hasFilters, parseRouletteFilters } from '../filters'
import { emptyFilmForm, issuesToErrors, validateFilmForm } from '../filmForm'
import { parseTmdbId, tmdbSearchUrl } from '../tmdbId'
import { fromQuery, toListParams, toQuery } from '../watchlistQuery'

describe('format', () => {
  it('formats dates and timestamps in UTC', () => {
    expect(formatDate('2025-03-12')).toBe('12 Mar 2025')
    expect(formatDate('2025-03-12T23:59:00.000Z')).toBe('12 Mar 2025')
  })
  it('formats runtime and names', () => {
    expect(formatRuntime(124)).toBe('124 min')
    expect(formatRuntime(null)).toBeNull()
    expect(joinNames([{ name: 'A' }, { name: 'B' }])).toBe('A, B')
  })
})

describe('parseRouletteFilters', () => {
  const input = (patch: Partial<ReturnType<typeof emptyFilters>>) => ({ ...emptyFilters(), ...patch })

  it('gives no parameters for empty filters', () => {
    const { params, errors } = parseRouletteFilters(emptyFilters())
    expect(params).toEqual({})
    expect(errors).toEqual({})
    expect(hasFilters(params)).toBe(false)
  })

  it('converts the values and upper-cases the country', () => {
    const { params } = parseRouletteFilters(
      input({ yearFrom: '1990', yearTo: '1999', genre: '18', country: 'jp', maxRuntime: '90' }),
    )
    expect(params).toEqual({ yearFrom: 1990, yearTo: 1999, genre: 18, country: 'JP', maxRuntime: 90 })
    expect(hasFilters(params)).toBe(true)
  })

  it.each([
    [{ yearFrom: '1887' }, 'yearFrom'],
    [{ yearTo: '2101' }, 'yearTo'],
    [{ yearFrom: '19.5' }, 'yearFrom'],
    [{ maxRuntime: '0' }, 'maxRuntime'],
    [{ country: 'JPN' }, 'country'],
    [{ country: '1' }, 'country'],
  ])('rejects %j', (patch, field) => {
    const { params, errors } = parseRouletteFilters(input(patch))
    expect(errors).toHaveProperty(field)
    expect(params).toEqual({})
  })

  it('accepts numbers, which is what v-model gives for number inputs', () => {
    const numeric = { ...emptyFilters(), yearFrom: 1990, yearTo: 1999, maxRuntime: 90 } as unknown as ReturnType<typeof emptyFilters>
    expect(parseRouletteFilters(numeric).params).toEqual({ yearFrom: 1990, yearTo: 1999, maxRuntime: 90 })
  })

  it('rejects a range that ends before it starts', () => {
    const { errors } = parseRouletteFilters(input({ yearFrom: '2000', yearTo: '1990' }))
    expect(errors.yearTo).toMatch(/before the first year/)
  })
})

describe('film form validation', () => {
  const values = (patch = {}) => ({ ...emptyFilmForm(), title: 'Joy', ...patch })

  it('builds a payload with nulls for empty optional fields', () => {
    const { errors, payload } = validateFilmForm(values({ title: '  Joy  ' }))
    expect(errors).toEqual({})
    expect(payload).toEqual({ title: 'Joy', releaseYear: null, letterboxdUrl: null })
  })

  it('accepts the year as a number, which is what v-model gives for number inputs', () => {
    const { errors, payload } = validateFilmForm(values({ releaseYear: 2015 as unknown as string }))
    expect(errors).toEqual({})
    expect(payload.releaseYear).toBe(2015)
    expect(validateFilmForm(values({ releaseYear: null as unknown as string })).payload.releaseYear).toBeNull()
  })

  it('keeps the given values', () => {
    const { payload } = validateFilmForm(
      values({ releaseYear: '2015', letterboxdUrl: 'https://boxd.it/8kEU', addedAt: '2020-01-12' }),
    )
    expect(payload).toEqual({
      title: 'Joy',
      releaseYear: 2015,
      letterboxdUrl: 'https://boxd.it/8kEU',
      addedAt: '2020-01-12',
    })
  })

  it.each([
    [{ title: '   ' }, 'title'],
    [{ title: 'x'.repeat(501) }, 'title'],
    [{ releaseYear: '1887' }, 'releaseYear'],
    [{ releaseYear: '2015.5' }, 'releaseYear'],
    [{ letterboxdUrl: 'ftp://x.org' }, 'letterboxdUrl'],
    [{ letterboxdUrl: 'not a link' }, 'letterboxdUrl'],
    [{ addedAt: '2025-02-30' }, 'addedAt'],
  ])('flags %j', (patch, field) => {
    expect(validateFilmForm(values(patch)).errors).toHaveProperty(field)
  })

  it('maps backend issues to fields and ignores unknown ones', () => {
    expect(
      issuesToErrors([
        { path: ['releaseYear'], message: 'Too big' },
        { path: ['releaseYear'], message: 'Second message' },
        { path: ['other'], message: 'x' },
      ]),
    ).toEqual({ releaseYear: 'Too big' })
  })
})

describe('parseTmdbId', () => {
  it.each([
    ['262543', 262543],
    ['  262543 ', 262543],
    ['https://www.themoviedb.org/movie/262543-joy', 262543],
    ['https://themoviedb.org/movie/262543', 262543],
    ['http://www.themoviedb.org/movie/12/cast', 12],
  ])('reads %s', (text, id) => expect(parseTmdbId(text)).toBe(id))

  it.each(['', 'abc', '0', '-5', '1.5', 'https://example.com/movie/12', 'https://www.themoviedb.org/tv/12'])(
    'rejects %j',
    (text) => expect(parseTmdbId(text)).toBeNull(),
  )

  it('builds an encoded search link', () => {
    expect(tmdbSearchUrl('Cléo & Co')).toBe('https://www.themoviedb.org/search/movie?query=Cl%C3%A9o%20%26%20Co')
  })
})

describe('watchlist query', () => {
  it('uses defaults for an empty or unknown query', () => {
    expect(fromQuery({})).toEqual({ q: '', watched: 'all', sort: 'added-desc', page: 1 })
    expect(fromQuery({ watched: 'maybe', sort: 'nope', page: '-3' })).toEqual({
      q: '',
      watched: 'all',
      sort: 'added-desc',
      page: 1,
    })
  })

  it('reads valid values and takes the first of repeated ones', () => {
    expect(fromQuery({ q: ['a', 'b'], watched: 'false', sort: 'year-asc', page: '3' })).toEqual({
      q: 'a',
      watched: 'false',
      sort: 'year-asc',
      page: 3,
    })
  })

  it('writes only non-default values to the URL', () => {
    expect(toQuery({ q: ' ', watched: 'all', sort: 'added-desc', page: 1 })).toEqual({
      q: undefined,
      watched: undefined,
      sort: undefined,
      page: undefined,
    })
    expect(toQuery({ q: 'joy', watched: 'true', sort: 'title', page: 2 })).toEqual({
      q: 'joy',
      watched: 'true',
      sort: 'title',
      page: '2',
    })
  })

  it('translates the sort choice for the API', () => {
    expect(toListParams({ q: 'joy', watched: 'false', sort: 'year-desc', page: 2 })).toEqual({
      q: 'joy',
      watched: 'false',
      sort: 'release_year',
      order: 'desc',
      page: 2,
      pageSize: 50,
    })
  })
})
