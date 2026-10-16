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

describe('enricher lookup', () => {
  it('looks up a pending film and stores the match', async () => {
    const id = await addFilm('Joy')
    expect(await enricher(client()).lookup(id)).toBe('done')
    expect(await getFilm(id)).toMatchObject({ tmdb: { id: 100, status: 'matched' }, tagline: 'Based on the true story' })
  })

  it('looks up a film whatever its status, such as not_found, error or matched', async () => {
    for (const status of ['not_found', 'error', 'matched']) {
      const title = `Joy ${status}`
      const id = await addFilm(title)
      await pool.query(`UPDATE films SET tmdb_status = $2 WHERE id = $1`, [id, status])
      const c = client({ searchMovie: vi.fn().mockResolvedValue([{ id: 100 + id, title, original_title: title, release_date: '2015-01-01' }]), getMovie: vi.fn().mockResolvedValue(movie(100 + id)) })
      expect(await enricher(c).lookup(id)).toBe('done')
      expect(c.searchMovie).toHaveBeenCalledTimes(1)
      expect((await getFilm(id)).tmdb).toMatchObject({ id: 100 + id, status: 'matched' })
    }
  })

  it('keeps the stored TMDB id and skips the search', async () => {
    const id = await addFilm('Whatever')
    await pool.query(`UPDATE films SET tmdb_id = 555, tmdb_status = 'not_found' WHERE id = $1`, [id])
    const c = client({ getMovie: vi.fn().mockResolvedValue(movie(555)) })
    expect(await enricher(c).lookup(id)).toBe('done')
    expect(c.searchMovie).not.toHaveBeenCalled()
    expect((await getFilm(id)).tmdb).toMatchObject({ id: 555, status: 'matched' })
  })

  it('answers done and stores not_found when TMDB knows no such film', async () => {
    const id = await addFilm('Nothing')
    expect(await enricher(client({ searchMovie: vi.fn().mockResolvedValue([]) })).lookup(id)).toBe('done')
    expect((await getFilm(id)).tmdb.status).toBe('not_found')
  })

  it('answers done and stores ambiguous when several films match', async () => {
    const id = await addFilm('Twice')
    const two = [
      { id: 1, title: 'Twice', original_title: 'Twice', release_date: '2015-01-01' },
      { id: 2, title: 'Twice', original_title: 'Twice', release_date: '2015-02-01' },
    ]
    const c = client({ searchMovie: vi.fn().mockResolvedValue(two) })
    expect(await enricher(c).lookup(id)).toBe('done')
    expect((await getFilm(id)).tmdb.status).toBe('ambiguous')
    expect(c.getMovie).not.toHaveBeenCalled()
  })

  it('answers no_such_film for an unknown id', async () => {
    const c = client()
    expect(await enricher(c).lookup(999)).toBe('no_such_film')
    expect(c.searchMovie).not.toHaveBeenCalled()
  })

  it('answers token_rejected and leaves the film unchanged when TMDB refuses the token', async () => {
    const id = await addFilm('Joy')
    const e = enricher(client({ searchMovie: vi.fn().mockRejectedValue(new TmdbError('TMDB answered 401', 401)) }))
    expect(await e.lookup(id)).toBe('token_rejected')
    expect((await getFilm(id)).tmdb.status).toBe('pending')
  })

  it.each([
    ['a server error', new TmdbError('TMDB answered 503', 503)],
    ['a rate limit', new TmdbError('TMDB answered 429', 429)],
    ['an unreachable TMDB', new TmdbError('TMDB is not reachable: ECONNREFUSED')],
  ])('answers unreachable and leaves the film unchanged on %s', async (_name, error) => {
    const id = await addFilm('Joy')
    await pool.query(`UPDATE films SET tmdb_status = 'error' WHERE id = $1`, [id])
    const log = vi.fn()
    const e = createEnricher(client({ searchMovie: vi.fn().mockRejectedValue(error) }), { delayMs: 0, log })
    expect(await e.lookup(id)).toBe('unreachable')
    expect((await getFilm(id)).tmdb.status).toBe('error')
    expect(log).toHaveBeenCalled()
    await pool.query(`UPDATE films SET tmdb_status = 'pending' WHERE id = $1`, [id])
    expect(await e.lookup(id)).toBe('unreachable')
    expect((await getFilm(id)).tmdb.status).toBe('pending')
  })

  it('sets status error for a failure that is not transient, and still answers done', async () => {
    const id = await addFilm('Joy')
    const log = vi.fn()
    const e = createEnricher(client({ searchMovie: vi.fn().mockRejectedValue(new Error('unexpected')) }), { delayMs: 0, log })
    expect(await e.lookup(id)).toBe('done')
    expect((await getFilm(id)).tmdb.status).toBe('error')
    expect(log).toHaveBeenCalled()
  })

  it('answers done without a TMDB client and changes nothing', async () => {
    const id = await addFilm('Joy')
    const e = enricher(null)
    expect(await e.lookup(id)).toBe('done')
    expect((await getFilm(id)).tmdb.status).toBe('pending')
  })

  it('waits behind a running pass and never runs in parallel with it', async () => {
    await addFilm('Slow')
    const wanted = await addFilm('Wanted')
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    let running = 0
    let overlapped = false
    const search = vi.fn(async (title: string) => {
      running++
      if (running > 1) overlapped = true
      if (title === 'Slow') await gate
      running--
      return []
    })
    const e = enricher(client({ searchMovie: search }))
    const pass = e.trigger()
    await vi.waitFor(() => expect(search).toHaveBeenCalledWith('Slow'))
    let lookedUp = false
    const lookup = e.lookup(wanted).then((r) => ((lookedUp = true), r))
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(lookedUp).toBe(false)
    release()
    expect(await lookup).toBe('done')
    await pass
    expect(overlapped).toBe(false)
  })

  it('goes between two films of a pass instead of waiting for the whole pass', async () => {
    await addFilm('A')
    await addFilm('B')
    await addFilm('C')
    const wanted = await addFilm('Wanted')
    await pool.query(`UPDATE films SET tmdb_id = 7, tmdb_status = 'matched' WHERE id = $1`, [wanted])
    const order: string[] = []
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    const search = vi.fn(async (title: string) => {
      order.push(title)
      if (title === 'A') await gate
      return []
    })
    const getMovie = vi.fn(async (id: number) => (order.push(`lookup ${id}`), movie(id)))
    const e = enricher(client({ searchMovie: search, getMovie }))
    const pass = e.trigger()
    await vi.waitFor(() => expect(order).toEqual(['A']))
    const lookup = e.lookup(wanted)
    release()
    await Promise.all([lookup, pass])
    expect(order).toEqual(['A', 'lookup 7', 'B', 'C'])
  })

  it('runs two lookups one after another', async () => {
    const a = await addFilm('A')
    const b = await addFilm('B')
    let running = 0
    let overlapped = false
    const search = vi.fn(async () => {
      running++
      if (running > 1) overlapped = true
      await new Promise((resolve) => setTimeout(resolve, 5))
      running--
      return []
    })
    const e = enricher(client({ searchMovie: search }))
    await Promise.all([e.lookup(a), e.lookup(b)])
    expect(search).toHaveBeenCalledTimes(2)
    expect(overlapped).toBe(false)
  })

  it('still runs a lookup after an earlier one failed', async () => {
    const id = await addFilm('Joy')
    const search = vi.fn().mockRejectedValueOnce(new Error('boom'))
    search.mockResolvedValue([{ id: 100, title: 'Joy', original_title: 'Joy', release_date: '2015-12-25' }])
    const e = enricher(client({ searchMovie: search }))
    await e.lookup(id)
    await pool.query(`UPDATE films SET tmdb_status = 'pending' WHERE id = $1`, [id])
    await e.lookup(id)
    expect((await getFilm(id)).tmdb.status).toBe('matched')
  })
})
