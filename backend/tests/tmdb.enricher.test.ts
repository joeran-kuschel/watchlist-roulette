import type { Pool } from 'pg'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getFilm } from '../src/models/film.js'
import { TmdbError, type TmdbClient, type TmdbMovie } from '../src/tmdb/client.js'
import { createEnricher } from '../src/tmdb/enricher.js'
import { createTestPool } from './helpers/testDb.js'

let pool: Pool
beforeEach(async () => {
  pool = await createTestPool()
})

const addFilm = async (title: string, year: number | null = 2015) =>
  Number((await pool.query(`INSERT INTO films (title, release_year) VALUES ($1, $2) RETURNING id`, [title, year])).rows[0].id)

const movie = (id: number, extra: Partial<TmdbMovie> = {}): TmdbMovie => ({
  id,
  title: 'Joy',
  original_title: 'Joy',
  tagline: 'Based on the true story',
  overview: 'A plot',
  runtime: 124,
  vote_average: 6.6,
  vote_count: 4000,
  poster_path: '/p.jpg',
  backdrop_path: '/b.jpg',
  genres: [{ id: 18, name: 'Drama' }],
  production_countries: [{ iso_3166_1: 'US' }],
  credits: {
    cast: [
      { id: 2, name: 'Second', order: 1 },
      { id: 1, name: 'First', order: 0 },
    ],
    crew: [
      { id: 9, name: 'The Director', job: 'Director' },
      { id: 8, name: 'The Editor', job: 'Editor' },
    ],
  },
  ...extra,
})

const client = (overrides: Partial<TmdbClient> = {}): TmdbClient => ({
  searchMovie: vi.fn().mockResolvedValue([{ id: 100, title: 'Joy', original_title: 'Joy', release_date: '2015-12-25' }]),
  getMovie: vi.fn().mockResolvedValue(movie(100)),
  getTv: vi.fn().mockResolvedValue(null),
  ...overrides,
})

const enricher = (c: TmdbClient | null) => createEnricher(c, { delayMs: 0, log: vi.fn() })

describe('enricher', () => {
  it('searches, matches and stores the movie data', async () => {
    const id = await addFilm('Joy')
    await enricher(client()).trigger()

    const film = await getFilm(id)
    expect(film).toMatchObject({
      tmdb: { id: 100, status: 'matched' },
      tagline: 'Based on the true story',
      runtimeMinutes: 124,
      voteAverage: 6.6,
      posterPath: '/p.jpg',
      genres: [{ id: 18, name: 'Drama' }],
      directors: [{ id: 9, name: 'The Director' }],
      cast: [{ id: 1, name: 'First' }, { id: 2, name: 'Second' }],
    })
    expect(film.tmdb.syncedAt).not.toBeNull()
  })

  it('keeps only the top ten cast members', async () => {
    const id = await addFilm('Joy')
    const cast = Array.from({ length: 15 }, (_, i) => ({ id: 100 + i, name: `Actor ${i}`, order: i }))
    await enricher(client({ getMovie: vi.fn().mockResolvedValue(movie(100, { credits: { cast, crew: [] } })) })).trigger()
    expect((await getFilm(id)).cast).toHaveLength(10)
  })

  it('stores the countries as codes', async () => {
    await addFilm('Joy')
    await enricher(client({ getMovie: vi.fn().mockResolvedValue(movie(100, { production_countries: [{ iso_3166_1: 'US' }, { iso_3166_1: 'GB' }] })) })).trigger()
    const { rows } = await pool.query('SELECT countries FROM films')
    expect(rows[0].countries).toEqual(expect.arrayContaining(['US', 'GB']))
  })

  it('skips the search when the film already has a TMDB id', async () => {
    const id = await addFilm('Whatever')
    await pool.query('UPDATE films SET tmdb_id = 555 WHERE id = $1', [id])
    const c = client({ getMovie: vi.fn().mockResolvedValue(movie(555)) })
    await enricher(c).trigger()
    expect(c.searchMovie).not.toHaveBeenCalled()
    expect(c.getMovie).toHaveBeenCalledWith(555)
    expect((await getFilm(id)).tmdb.status).toBe('matched')
  })

  it('marks a film not_found or ambiguous and does not fetch details', async () => {
    const none = await addFilm('Nothing')
    const twice = await addFilm('Twice')
    const search = vi.fn(async (title: string) =>
      title === 'Twice'
        ? [
            { id: 1, title: 'Twice', original_title: 'Twice', release_date: '2015-01-01' },
            { id: 2, title: 'Twice', original_title: 'Twice', release_date: '2015-02-01' },
          ]
        : [],
    )
    const c = client({ searchMovie: search })
    await enricher(c).trigger()
    expect((await getFilm(none)).tmdb.status).toBe('not_found')
    expect((await getFilm(twice)).tmdb.status).toBe('ambiguous')
    expect(c.getMovie).not.toHaveBeenCalled()
  })

  it('marks a film not_found when TMDB does not know the id', async () => {
    const id = await addFilm('Joy')
    await pool.query('UPDATE films SET tmdb_id = 555 WHERE id = $1', [id])
    await enricher(client({ getMovie: vi.fn().mockResolvedValue(null) })).trigger()
    expect((await getFilm(id)).tmdb.status).toBe('not_found')
  })

  it('marks a film ambiguous when its match belongs to another film already', async () => {
    const first = await addFilm('Joy')
    const second = await addFilm('Joy')
    await enricher(client()).trigger()
    expect((await getFilm(first)).tmdb.status).toBe('matched')
    expect((await getFilm(second)).tmdb.status).toBe('ambiguous')
  })

  it('marks a failing film as error and goes on with the next one', async () => {
    const bad = await addFilm('Bad')
    const good = await addFilm('Joy')
    const search = vi.fn(async (title: string) => {
      if (title === 'Bad') throw new Error('unexpected failure')
      return [{ id: 100, title: 'Joy', original_title: 'Joy', release_date: '2015-12-25' }]
    })
    const log = vi.fn()
    await createEnricher(client({ searchMovie: search }), { delayMs: 0, log }).trigger()
    expect((await getFilm(bad)).tmdb.status).toBe('error')
    expect((await getFilm(good)).tmdb.status).toBe('matched')
    expect(log).toHaveBeenCalled()
  })

  it('stops and leaves films pending when TMDB rejects the token', async () => {
    const id = await addFilm('Joy')
    const log = vi.fn()
    const search = vi.fn().mockRejectedValue(new TmdbError('TMDB answered 401', 401))
    await createEnricher(client({ searchMovie: search }), { delayMs: 0, log }).trigger()
    expect((await getFilm(id)).tmdb.status).toBe('pending')
    expect(log).toHaveBeenCalledWith('TMDB enrichment stopped', expect.any(TmdbError))
  })

  it('retries errors only when asked to', async () => {
    const id = await addFilm('Joy')
    await pool.query(`UPDATE films SET tmdb_status = 'error' WHERE id = $1`, [id])
    const c = client()
    await enricher(c).trigger()
    expect(c.searchMovie).not.toHaveBeenCalled()
    await enricher(c).trigger({ retryErrors: true })
    expect((await getFilm(id)).tmdb.status).toBe('matched')
  })

  it('does not touch matched films', async () => {
    const id = await addFilm('Joy')
    await pool.query(`UPDATE films SET tmdb_status = 'matched' WHERE id = $1`, [id])
    const c = client()
    await enricher(c).trigger({ retryErrors: true })
    expect(c.searchMovie).not.toHaveBeenCalled()
  })

  it('runs only once at a time', async () => {
    await addFilm('Joy')
    let release!: () => void
    const search = vi.fn(() => new Promise<never[]>((resolve) => (release = () => resolve([]))))
    const e = enricher(client({ searchMovie: search }))
    const first = e.trigger()
    const second = e.trigger()
    await vi.waitFor(() => expect(search).toHaveBeenCalledTimes(1))
    release()
    await Promise.all([first, second])
    expect(search).toHaveBeenCalledTimes(1)
  })

  it('does nothing without a TMDB client', async () => {
    const id = await addFilm('Joy')
    const e = enricher(null)
    expect(e.enabled).toBe(false)
    await e.trigger()
    expect((await getFilm(id)).tmdb.status).toBe('pending')
  })

  it('replaces genres and credits when a film is enriched again', async () => {
    const id = await addFilm('Joy')
    const getMovie = vi
      .fn()
      .mockResolvedValueOnce(movie(100))
      .mockResolvedValueOnce(movie(100, { genres: [{ id: 35, name: 'Comedy' }], credits: { cast: [], crew: [] } }))
    const c = client({ getMovie })
    await enricher(c).trigger()
    await pool.query(`UPDATE films SET tmdb_status = 'pending' WHERE id = $1`, [id])
    await enricher(c).trigger()
    expect(await getFilm(id)).toMatchObject({ genres: [{ id: 35, name: 'Comedy' }], directors: [], cast: [] })
  })
  it('survives a film that is deleted while the run is going and enriches the others', async () => {
    const gone = await addFilm('Gone')
    const stays = await addFilm('Joy')
    const search = vi.fn(async (title: string) => {
      if (title === 'Gone') await pool.query('DELETE FROM films WHERE id = $1', [gone])
      return [{ id: 100, title, original_title: title, release_date: '2015-12-25' }]
    })
    const log = vi.fn()
    await createEnricher(client({ searchMovie: search }), { delayMs: 0, log }).trigger()
    expect((await pool.query('SELECT id FROM films WHERE id = $1', [gone])).rows).toEqual([])
    expect((await pool.query('SELECT 1 FROM film_genres WHERE film_id = $1', [gone])).rows).toEqual([])
    expect((await getFilm(stays)).tmdb.status).toBe('matched')
  })

  it('does not leave genres or credits behind for a film deleted between the search and the save', async () => {
    const gone = await addFilm('Joy')
    const getMovie = vi.fn(async () => {
      await pool.query('DELETE FROM films WHERE id = $1', [gone])
      return movie(100)
    })
    await createEnricher(client({ getMovie }), { delayMs: 0, log: vi.fn() }).trigger()
    expect((await pool.query('SELECT 1 FROM film_genres')).rows).toEqual([])
    expect((await pool.query('SELECT 1 FROM film_credits')).rows).toEqual([])
  })

  it('can run again after a run stopped on a rejected token', async () => {
    const id = await addFilm('Joy')
    const search = vi.fn().mockRejectedValueOnce(new TmdbError('TMDB answered 401', 401))
    search.mockResolvedValue([{ id: 100, title: 'Joy', original_title: 'Joy', release_date: '2015-12-25' }])
    const e = createEnricher(client({ searchMovie: search }), { delayMs: 0, log: vi.fn() })
    await e.trigger()
    expect((await getFilm(id)).tmdb.status).toBe('pending')
    await e.trigger()
    expect((await getFilm(id)).tmdb.status).toBe('matched')
  })

  it('retries errors when a sync is asked for while a normal run is going', async () => {
    const broken = await addFilm('Broken')
    await pool.query(`UPDATE films SET tmdb_status = 'error' WHERE id = $1`, [broken])
    await addFilm('Joy')
    let release!: () => void
    const search = vi.fn(
      (title: string) =>
        new Promise<never[]>((resolve) => {
          if (title === 'Joy') release = () => resolve([])
          else resolve([])
        }),
    )
    const e = enricher(client({ searchMovie: search }))
    const normal = e.trigger()
    await vi.waitFor(() => expect(search).toHaveBeenCalledTimes(1))
    const sync = e.trigger({ retryErrors: true })
    release()
    await Promise.all([normal, sync])
    // the sync is not swallowed by the run in progress: it gets its own run afterwards
    expect(search).toHaveBeenCalledWith('Broken')
  })

  it('stores a movie without credits, runtime, tagline or overview', async () => {
    const id = await addFilm('Joy')
    const bare = movie(100, { credits: undefined, runtime: 0, tagline: '', overview: '', vote_average: undefined, poster_path: null })
    await enricher(client({ getMovie: vi.fn().mockResolvedValue(bare) })).trigger()
    expect(await getFilm(id)).toMatchObject({
      tmdb: { status: 'matched' },
      runtimeMinutes: null,
      tagline: null,
      overview: null,
      voteAverage: null,
      posterPath: null,
      directors: [],
      cast: [],
    })
  })

  it('stores a person who is both director and cast, and a director listed twice, once per role', async () => {
    const id = await addFilm('Joy')
    const both = movie(100, {
      credits: {
        cast: [{ id: 9, name: 'Dir Actor', order: 0 }],
        crew: [
          { id: 9, name: 'Dir Actor', job: 'Director' },
          { id: 9, name: 'Dir Actor', job: 'Director' },
          { id: 10, name: 'Co', job: 'Co-Director' },
        ],
      },
    })
    await enricher(client({ getMovie: vi.fn().mockResolvedValue(both) })).trigger()
    expect(await getFilm(id)).toMatchObject({
      tmdb: { status: 'matched' },
      directors: [{ id: 9, name: 'Dir Actor' }],
      cast: [{ id: 9, name: 'Dir Actor' }],
    })
  })

  it('keeps the cast in TMDB order and renames a genre that changed', async () => {
    const first = await addFilm('Joy')
    await enricher(client()).trigger()
    await pool.query(`UPDATE films SET tmdb_status = 'pending' WHERE id = $1`, [first])
    const renamed = movie(100, { genres: [{ id: 18, name: 'Drama (new)' }] })
    await enricher(client({ getMovie: vi.fn().mockResolvedValue(renamed) })).trigger()
    const film = await getFilm(first)
    expect(film.genres).toEqual([{ id: 18, name: 'Drama (new)' }])
    expect(film.cast.map((p) => p.name)).toEqual(['First', 'Second'])
  })
})

describe('enricher follow-up runs and TMDB trouble', () => {
  const slowSearch = () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    const search = vi.fn(async (title: string) => {
      await gate
      return title === 'Late'
        ? [{ id: 200, title: 'Late', original_title: 'Late', release_date: '2015-01-01' }]
        : []
    })
    return { search, release }
  }

  it('picks up a film that was added while a run was going', async () => {
    await addFilm('First')
    const { search, release } = slowSearch()
    const e = enricher(client({ searchMovie: search, getMovie: vi.fn().mockResolvedValue(movie(200)) }))
    const run = e.trigger()
    await vi.waitFor(() => expect(search).toHaveBeenCalledTimes(1))
    const late = await addFilm('Late')
    const second = e.trigger()
    release()
    await Promise.all([run, second])
    expect((await getFilm(late)).tmdb.status).toBe('matched')
  })

  it('runs one follow-up for several requests during a run', async () => {
    await addFilm('First')
    const { search, release } = slowSearch()
    const e = enricher(client({ searchMovie: search }))
    const run = e.trigger()
    await vi.waitFor(() => expect(search).toHaveBeenCalledTimes(1))
    const more = [e.trigger(), e.trigger(), e.trigger()]
    release()
    await Promise.all([run, ...more])
    expect(search).toHaveBeenCalledTimes(1) // First is not_found after the first pass, nothing left for the follow-up
  })

  it('keeps films pending and stops after three TMDB failures in a row', async () => {
    const ids = [await addFilm('A'), await addFilm('B'), await addFilm('C'), await addFilm('D')]
    const search = vi.fn().mockRejectedValue(new TmdbError('TMDB answered 503', 503))
    await createEnricher(client({ searchMovie: search }), { delayMs: 0, log: vi.fn() }).trigger()
    expect(search).toHaveBeenCalledTimes(3)
    for (const id of ids) expect((await getFilm(id)).tmdb.status).toBe('pending')
  })

  it('treats a rate limit and an unreachable TMDB as trouble, not as an error on the film', async () => {
    const a = await addFilm('A')
    const search = vi.fn().mockRejectedValue(new TmdbError('TMDB answered 429', 429))
    await createEnricher(client({ searchMovie: search }), { delayMs: 0, log: vi.fn() }).trigger()
    expect((await getFilm(a)).tmdb.status).toBe('pending')
    const down = vi.fn().mockRejectedValue(new TmdbError('TMDB is not reachable: ECONNREFUSED'))
    await createEnricher(client({ searchMovie: down }), { delayMs: 0, log: vi.fn() }).trigger()
    expect((await getFilm(a)).tmdb.status).toBe('pending')
  })

  it('a success resets the count of failures in a row', async () => {
    for (const title of ['A', 'B', 'Ok', 'C', 'D']) await addFilm(title)
    const search = vi.fn(async (title: string) => {
      if (title === 'Ok') return []
      throw new TmdbError('TMDB answered 503', 503)
    })
    await createEnricher(client({ searchMovie: search }), { delayMs: 0, log: vi.fn() }).trigger()
    expect(search).toHaveBeenCalledTimes(5)
  })
})
