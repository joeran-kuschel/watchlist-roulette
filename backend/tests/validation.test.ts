import { describe, expect, it } from 'vitest'
import {
  filmCreateSchema,
  filmPatchSchema,
  listQuerySchema,
  parseIsoDate,
  randomQuerySchema,
} from '../src/validation.js'

describe('listQuerySchema', () => {
  it('fills in defaults', () => {
    expect(listQuerySchema.parse({})).toEqual({
      watched: 'all',
      sort: 'added_at',
      order: 'desc',
      page: 1,
      pageSize: 50,
    })
  })

  it('turns numeric query strings into numbers', () => {
    expect(listQuerySchema.parse({ page: '2', genre: '18' })).toMatchObject({ page: 2, genre: 18 })
  })

  it('rejects a page below 1 and a sort column outside the allowed list', () => {
    expect(listQuerySchema.safeParse({ page: '0' }).success).toBe(false)
    expect(listQuerySchema.safeParse({ sort: 'id; DROP TABLE films' }).success).toBe(false)
  })
})

describe('randomQuerySchema', () => {
  it('upper-cases the country code', () => {
    expect(randomQuerySchema.parse({ country: 'us' }).country).toBe('US')
  })
})

describe('filmPatchSchema', () => {
  it('accepts a single field and rejects an empty object', () => {
    expect(filmPatchSchema.safeParse({ watched: true }).success).toBe(true)
    expect(filmPatchSchema.safeParse({}).success).toBe(false)
  })

  it('allows clearing the year and the link with null', () => {
    expect(filmPatchSchema.safeParse({ releaseYear: null, letterboxdUrl: null }).success).toBe(true)
  })
})

describe('dates', () => {
  it.each(['2020-13-01', '2020-00-10', '2020-02-30', 'yesterday', ''])('rejects "%s" without throwing', (value) => {
    expect(() => parseIsoDate(value)).not.toThrow()
    expect(parseIsoDate(value).success).toBe(false)
    expect(filmCreateSchema.safeParse({ title: 'A', addedAt: value }).success).toBe(false)
  })

  it.each(['2020-02-29', '1888-01-01', '2100-12-31'])('accepts %s', (value) => {
    expect(parseIsoDate(value).success).toBe(true)
  })
})

describe('filmPatchSchema edge cases', () => {
  it.each([
    { title: null },
    { watched: null },
    { addedAt: null },
    { tmdbId: null },
    { tmdbId: 0 },
    { tmdbId: 2 ** 31 },
    { id: 1, title: 'x' },
  ])('rejects %j', (patch) => {
    expect(filmPatchSchema.safeParse(patch).success).toBe(false)
  })

  it('accepts a TMDB id together with other fields and trims the title', () => {
    expect(filmPatchSchema.parse({ tmdbId: 5, title: '  Joy ', watched: false })).toEqual({
      tmdbId: 5,
      title: 'Joy',
      watched: false,
    })
  })
})

describe('query bounds', () => {
  it('rejects a genre that does not fit the database column', () => {
    expect(listQuerySchema.safeParse({ genre: String(2 ** 31) }).success).toBe(false)
    expect(randomQuerySchema.safeParse({ genre: String(2 ** 31) }).success).toBe(false)
  })

  it('rejects a runtime that does not fit the database column', () => {
    expect(randomQuerySchema.safeParse({ maxRuntime: String(2 ** 31) }).success).toBe(false)
  })
})
