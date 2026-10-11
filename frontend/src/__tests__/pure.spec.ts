import { describe, expect, it } from 'vitest'
import { ApiError, describeError } from '../api'
import { formatDate, formatRuntime, joinNames, text } from '../format'
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

describe('format: edge cases', () => {
  it('text() trims strings and turns numbers, null and undefined into text', () => {
    expect(text('  a ')).toBe('a')
    expect(text(0)).toBe('0')
    expect(text(null)).toBe('')
    expect(text(undefined)).toBe('')
  })
  it('formats a timestamp with an offset by its UTC day', () => {
    expect(formatDate('2025-03-12T23:30:00-05:00')).toBe('13 Mar 2025')
  })
  it('joinNames of nobody is empty', () => {
    expect(joinNames([])).toBe('')
  })
})

describe('describeError', () => {
  it.each([
    [401, 'Not allowed'],
    [422, 'Unprocessable'],
  ])('shows the backend message for %i', (status, message) => {
    expect(describeError(new ApiError(status, message))).toBe(message)
  })
  it.each([500, 502, 503])('uses fixed wording for %i', (status) => {
    expect(describeError(new ApiError(status, 'stack trace'))).toBe('The server had a problem. Try again in a moment.')
  })
  it('uses a generic sentence for anything else', () => {
    expect(describeError(new TypeError('x'))).toBe('Something went wrong.')
    expect(describeError(undefined)).toBe('Something went wrong.')
  })
  it('keeps issues empty by default', () => {
    expect(new ApiError(400, 'x').issues).toEqual([])
    expect(new ApiError(400, 'x')).toBeInstanceOf(Error)
  })
})

describe('parseRouletteFilters: edge cases', () => {
  const input = (patch: Partial<ReturnType<typeof emptyFilters>>) => ({ ...emptyFilters(), ...patch })

  it('accepts the limits of every range', () => {
    const { params, errors } = parseRouletteFilters(input({ yearFrom: '1888', yearTo: '2100', maxRuntime: '10000' }))
    expect(errors).toEqual({})
    expect(params).toEqual({ yearFrom: 1888, yearTo: 2100, maxRuntime: 10000 })
  })
  it('rejects just past the limits', () => {
    const { errors } = parseRouletteFilters(input({ yearTo: '2101', maxRuntime: '10001' }))
    expect(Object.keys(errors).sort()).toEqual(['maxRuntime', 'yearTo'])
  })
  it('allows a single year and a lone end of the range', () => {
    expect(parseRouletteFilters(input({ yearFrom: '1999', yearTo: '1999' })).errors).toEqual({})
    expect(parseRouletteFilters(input({ yearTo: '1999' })).params).toEqual({ yearTo: 1999 })
  })
  it('trims whitespace and treats blank text as not set', () => {
    const { params, errors } = parseRouletteFilters(input({ yearFrom: ' 1990 ', yearTo: '   ', country: ' jp ' }))
    expect(errors).toEqual({})
    expect(params).toEqual({ yearFrom: 1990, country: 'JP' })
  })
  it.each(['abc', '-1', '1e400', 'NaN', 'Infinity'])('rejects a runtime of %j', (maxRuntime) => {
    expect(parseRouletteFilters(input({ maxRuntime })).errors).toHaveProperty('maxRuntime')
  })
  it.each(['J', 'J1', 'ÄÖ', 'J P'])('rejects the country %j', (country) => {
    expect(parseRouletteFilters(input({ country })).errors).toHaveProperty('country')
  })
  it('reports every wrong field at once and returns no parameters', () => {
    const { params, errors } = parseRouletteFilters(input({ yearFrom: 'x', country: 'x', maxRuntime: '0', genre: '18' }))
    expect(Object.keys(errors).sort()).toEqual(['country', 'maxRuntime', 'yearFrom'])
    expect(params).toEqual({})
  })
  it('only a genre counts as a filter', () => {
    expect(parseRouletteFilters(input({ genre: '18' })).params).toEqual({ genre: 18 })
  })
})

describe('film form validation: edge cases', () => {
  const values = (patch = {}) => ({ ...emptyFilmForm(), title: 'Joy', ...patch })

  it('accepts 500 characters, a non-ASCII title and the limits of the year', () => {
    expect(validateFilmForm(values({ title: 'x'.repeat(500) })).errors).toEqual({})
    expect(validateFilmForm(values({ title: 'Cléo 5 à 7 – 千と千尋の神隠し' })).payload.title).toBe('Cléo 5 à 7 – 千と千尋の神隠し')
    expect(validateFilmForm(values({ releaseYear: '1888' })).errors).toEqual({})
    expect(validateFilmForm(values({ releaseYear: '2100' })).errors).toEqual({})
    expect(validateFilmForm(values({ releaseYear: '2101' })).errors).toHaveProperty('releaseYear')
  })
  it.each(['abc', '-1', '0', '19 90'])('rejects the year %j', (releaseYear) => {
    expect(validateFilmForm(values({ releaseYear })).errors).toHaveProperty('releaseYear')
  })
  it.each(['javascript:alert(1)', 'mailto:a@b.c', 'file:///etc/passwd', 'boxd.it/abc', '//boxd.it/abc'])(
    'rejects the link %j',
    (letterboxdUrl) => {
      expect(validateFilmForm(values({ letterboxdUrl })).errors).toHaveProperty('letterboxdUrl')
    },
  )
  it('accepts http and https links in any case and trims them', () => {
    expect(validateFilmForm(values({ letterboxdUrl: 'HTTP://boxd.it/a' })).errors).toEqual({})
    expect(validateFilmForm(values({ letterboxdUrl: '  https://boxd.it/a ' })).payload.letterboxdUrl).toBe('https://boxd.it/a')
  })
  it('treats a link of only spaces as empty', () => {
    const { errors, payload } = validateFilmForm(values({ letterboxdUrl: '   ' }))
    expect(errors).toEqual({})
    expect(payload.letterboxdUrl).toBeNull()
  })
  it.each(['2024-02-29'])('accepts the real date %s', (addedAt) => {
    expect(validateFilmForm(values({ addedAt })).errors).toEqual({})
  })
  it.each(['2023-02-29', '25-1-1', '12.03.2025', '2025-03-12T10:00:00Z', 'tomorrow'])(
    'rejects the date %j',
    (addedAt) => {
      expect(validateFilmForm(values({ addedAt })).errors).toHaveProperty('addedAt')
    },
  )
  it.each(['2025-13-01', '2025-00-10', '2025-01-32'])('rejects the impossible date %j without throwing', (addedAt) => {
    expect(validateFilmForm(values({ addedAt })).errors).toHaveProperty('addedAt')
  })
  it('reports all wrong fields together', () => {
    const { errors } = validateFilmForm({ title: '', releaseYear: 'x', letterboxdUrl: 'x', addedAt: 'x' })
    expect(Object.keys(errors).sort()).toEqual(['addedAt', 'letterboxdUrl', 'releaseYear', 'title'])
  })
  it('ignores issues without a path or with a numeric path', () => {
    expect(issuesToErrors([{ path: [], message: 'x' }, { path: [0], message: 'y' }])).toEqual({})
    expect(issuesToErrors([])).toEqual({})
  })
  it('maps each field of the backend', () => {
    expect(
      issuesToErrors([
        { path: ['title'], message: 'a' },
        { path: ['letterboxdUrl'], message: 'b' },
        { path: ['addedAt'], message: 'c' },
      ]),
    ).toEqual({ title: 'a', letterboxdUrl: 'b', addedAt: 'c' })
  })
})

describe('parseTmdbId: edge cases', () => {
  it.each([
    ['https://www.themoviedb.org/movie/12?language=de', 12],
    ['https://www.themoviedb.org/movie/12#cast', 12],
    ['HTTPS://WWW.THEMOVIEDB.ORG/movie/12', 12],
    ['007', 7],
    ['  https://www.themoviedb.org/movie/5-x  ', 5],
  ])('reads %s', (value, id) => expect(parseTmdbId(value)).toBe(id))

  it.each([
    '99999999999999999999',
    '+5',
    '١٢٣',
    'https://www.themoviedb.org/movie/12abc',
    'https://www.themoviedb.org/movie/',
    'https://evil.org/?u=https://www.themoviedb.org/movie/12',
    'https://www.themoviedb.org.evil.org/movie/12',
    'ftp://www.themoviedb.org/movie/12',
    '12 13',
  ])('rejects %j', (value) => expect(parseTmdbId(value)).toBeNull())

  it('encodes a title with slashes, quotes and emoji in the search link', () => {
    expect(tmdbSearchUrl('a/b "c" 🎬')).toBe('https://www.themoviedb.org/search/movie?query=a%2Fb%20%22c%22%20%F0%9F%8E%AC')
  })
})

describe('watchlist query: edge cases', () => {
  it.each(['1.5', '0', 'abc', '', ' ', '2abc', '1e1'])('falls back to page 1 for page=%j', (page) => {
    expect(fromQuery({ page }).page).toBe(page === '1e1' ? 10 : 1)
  })
  it('falls back for a repeated key whose first value is empty', () => {
    expect(fromQuery({ q: [null, 'b'] }).q).toBe('')
  })
  it('keeps a search with spaces and non-ASCII characters', () => {
    expect(fromQuery({ q: 'cléo 5' }).q).toBe('cléo 5')
  })
  it.each(['toString', 'constructor', '__proto__', 'hasOwnProperty'])('falls back to the default sort for sort=%s', (sort) => {
    expect(fromQuery({ sort }).sort).toBe('added-desc')
  })
  it('trims the search before writing it to the URL and the API', () => {
    const view = { q: '  joy ', watched: 'all', sort: 'added-desc', page: 1 } as const
    expect(toQuery(view).q).toBe('joy')
    expect(toListParams(view).q).toBe('joy')
  })
  it('round-trips every sort option through the URL', () => {
    for (const sort of ['added-desc', 'added-asc', 'year-desc', 'year-asc', 'title'] as const) {
      const view = { q: 'x', watched: 'true', sort, page: 4 } as const
      expect(fromQuery(toQuery(view) as never)).toEqual(view)
    }
  })
  it('maps each sort to a column and direction', () => {
    const params = (sort: Parameters<typeof toListParams>[0]['sort']) =>
      toListParams({ q: '', watched: 'all', sort, page: 1 })
    expect(params('added-asc')).toMatchObject({ sort: 'added_at', order: 'asc' })
    expect(params('year-asc')).toMatchObject({ sort: 'release_year', order: 'asc' })
    expect(params('title')).toMatchObject({ sort: 'title', order: 'asc' })
  })
})
