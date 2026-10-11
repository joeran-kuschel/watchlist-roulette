import type { Pool } from 'pg'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getFilm } from '../src/models/film.js'
import { TmdbError, createTmdbClient, type TmdbClient, type TmdbTv } from '../src/tmdb/client.js'
import { createEnricher } from '../src/tmdb/enricher.js'
import { tvToMovie } from '../src/tmdb/tv.js'
import { fakeEnricher, testApp } from './helpers/app.js'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DataType, newDb } from 'pg-mem'
import { createTestPool } from './helpers/testDb.js'

let pool: Pool
beforeEach(async () => {
  pool = await createTestPool()
})

const show = (id = 1396, extra: Partial<TmdbTv> = {}): TmdbTv => ({
  id,
  name: 'Breaking Bad',
  original_name: 'Breaking Bad',
  tagline: 'Change the equation.',
  overview: 'A chemistry teacher.',
  episode_run_time: [47, 45],
  vote_average: 8.9,
  vote_count: 14000,
  poster_path: '/tv.jpg',
  backdrop_path: '/tvb.jpg',
  genres: [{ id: 18, name: 'Drama' }],
  origin_country: ['US'],
  created_by: [{ id: 66633, name: 'Vince Gilligan' }],
  credits: { cast: [{ id: 17419, name: 'Bryan Cranston', order: 0 }] },
  ...extra,
})

describe('tvToMovie', () => {
  it('maps a TV show onto the movie shape the model stores', () => {
    expect(tvToMovie(show())).toEqual({
      id: 1396,
      title: 'Breaking Bad',
      original_title: 'Breaking Bad',
      tagline: 'Change the equation.',
      overview: 'A chemistry teacher.',
      runtime: 47,
      vote_average: 8.9,
      vote_count: 14000,
      poster_path: '/tv.jpg',
      backdrop_path: '/tvb.jpg',
      genres: [{ id: 18, name: 'Drama' }],
      production_countries: [{ iso_3166_1: 'US' }],
      credits: {
        cast: [{ id: 17419, name: 'Bryan Cranston', order: 0 }],
        crew: [{ id: 66633, name: 'Vince Gilligan', job: 'Director' }],
      },
    })
  })

  it('copes with a show that lacks episode length, countries, creators and credits', () => {
    const bare = tvToMovie({ id: 5, name: 'X', original_name: 'X', genres: [] })
    expect(bare).toMatchObject({ runtime: null, production_countries: [], credits: { cast: [], crew: [] } })
    expect(tvToMovie(show(5, { episode_run_time: [] })).runtime).toBeNull()
  })
})

describe('createTmdbClient getTv', () => {
  const respond = (status: number, body: unknown = {}) =>
    vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }))

  it('loads a show with its credits from /tv, with the token in a header', async () => {
    const fetchFn = respond(200, show())
    expect(await createTmdbClient('secret', 'en-US', fetchFn).getTv(1396)).toMatchObject({ id: 1396 })
    const [url, init] = fetchFn.mock.calls[0]!
    expect(url).toContain('https://api.themoviedb.org/3/tv/1396?')
    expect(url).toContain('append_to_response=credits')
    expect(url).not.toContain('secret')
    expect(init.headers.Authorization).toBe('Bearer secret')
  })

  it('returns null for an unknown show and throws a TmdbError for other failures', async () => {
    expect(await createTmdbClient('t', 'en-US', respond(404)).getTv(5)).toBeNull()
    await expect(createTmdbClient('t', 'en-US', respond(500)).getTv(5)).rejects.toMatchObject({ status: 500 })
  })
})

describe('createTmdbClient getTv errors', () => {
  it('throws a TmdbError with the status for a rejected token', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('{}', { status: 401 }))
    await expect(createTmdbClient('t', 'en-US', fetchFn).getTv(5)).rejects.toMatchObject({ status: 401 })
  })

  it('throws a TmdbError without a status when TMDB is unreachable', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))
    const error = await createTmdbClient('t', 'en-US', fetchFn).getTv(5).catch((e) => e)
    expect(error).toBeInstanceOf(TmdbError)
    expect(error.status).toBeUndefined()
  })
})

describe('enricher with a TV show', () => {
  const client = (overrides: Partial<TmdbClient> = {}): TmdbClient => ({
    searchMovie: vi.fn().mockResolvedValue([]),
    getMovie: vi.fn().mockResolvedValue(null),
    getTv: vi.fn().mockResolvedValue(show()),
    ...overrides,
  })
  const addShow = async (title = 'Breaking Bad', tmdbId = 1396) =>
    Number(
      (
        await pool.query(
          `INSERT INTO films (title, tmdb_id, tmdb_media_type) VALUES ($1, $2, 'tv') RETURNING id`,
          [title, tmdbId],
        )
      ).rows[0].id,
    )

  it('loads a film whose type is tv from /tv, never from /movie, and stores the mapped data', async () => {
    const id = await addShow()
    const c = client()
    await createEnricher(c, { delayMs: 0, log: vi.fn() }).trigger()
    expect(c.getTv).toHaveBeenCalledWith(1396)
    expect(c.getMovie).not.toHaveBeenCalled()
    expect(c.searchMovie).not.toHaveBeenCalled()
    expect(await getFilm(id)).toMatchObject({
      tmdb: { id: 1396, mediaType: 'tv', status: 'matched' },
      originalTitle: 'Breaking Bad',
      runtimeMinutes: 47,
      voteAverage: 8.9,
      posterPath: '/tv.jpg',
      countries: ['US'],
      genres: [{ id: 18, name: 'Drama' }],
      directors: [{ id: 66633, name: 'Vince Gilligan' }],
      cast: [{ id: 17419, name: 'Bryan Cranston' }],
    })
  })

  it('stores a show without an episode length with no runtime', async () => {
    const id = await addShow()
    await createEnricher(client({ getTv: vi.fn().mockResolvedValue(show(1396, { episode_run_time: [] })) }), {
      delayMs: 0,
      log: vi.fn(),
    }).trigger()
    expect((await getFilm(id)).runtimeMinutes).toBeNull()
  })

  it('marks a film as not_found when TMDB has no such show', async () => {
    const id = await addShow()
    await createEnricher(client({ getTv: vi.fn().mockResolvedValue(null) }), { delayMs: 0, log: vi.fn() }).trigger()
    expect((await getFilm(id)).tmdb.status).toBe('not_found')
  })

  it('keeps a show pending and stops the run when TMDB rejects the token', async () => {
    const id = await addShow()
    const log = vi.fn()
    const getTv = vi.fn().mockRejectedValue(new TmdbError('TMDB answered 401', 401))
    await createEnricher(client({ getTv }), { delayMs: 0, log }).trigger()
    expect((await getFilm(id)).tmdb.status).toBe('pending')
    expect(log).toHaveBeenCalledWith('TMDB enrichment stopped', expect.any(TmdbError))
  })

  it('marks a show as error after a TMDB answer like 400 and keeps it pending on a 500', async () => {
    const bad = await addShow('Bad', 1)
    const down = await addShow('Down', 2)
    const getTv = vi.fn(async (id: number) => {
      throw new TmdbError(`TMDB answered ${id === 1 ? 400 : 500}`, id === 1 ? 400 : 500)
    })
    await createEnricher(client({ getTv }), { delayMs: 0, log: vi.fn() }).trigger()
    expect((await getFilm(bad)).tmdb.status).toBe('error')
    expect((await getFilm(down)).tmdb.status).toBe('pending')
  })

  it('retries a show in error with the right type when asked to', async () => {
    const id = await addShow()
    await pool.query(`UPDATE films SET tmdb_status = 'error' WHERE id = $1`, [id])
    const c = client()
    await createEnricher(c, { delayMs: 0, log: vi.fn() }).trigger({ retryErrors: true })
    expect(c.getTv).toHaveBeenCalledWith(1396)
    expect((await getFilm(id)).tmdb.status).toBe('matched')
  })

  it('does not cross over: a show id is not looked up as a movie when /tv has no such show', async () => {
    const id = await addShow()
    const c = client({ getMovie: vi.fn().mockResolvedValue(tvToMovie(show())) })
    c.getTv = vi.fn().mockResolvedValue(null)
    await createEnricher(c, { delayMs: 0, log: vi.fn() }).trigger()
    expect(c.getMovie).not.toHaveBeenCalled()
    expect((await getFilm(id)).tmdb.status).toBe('not_found')
  })

  it('replaces the genres and credits of a film that was matched as a movie and is now a show', async () => {
    const id = await addShow()
    await pool.query(`UPDATE films SET tmdb_media_type = 'movie' WHERE id = $1`, [id])
    const movie = { ...tvToMovie(show()), genres: [{ id: 28, name: 'Action' }], credits: { cast: [{ id: 1, name: 'Old Actor', order: 0 }], crew: [{ id: 2, name: 'Old Dir', job: 'Director' }] } }
    await createEnricher(client({ getMovie: vi.fn().mockResolvedValue(movie) }), { delayMs: 0, log: vi.fn() }).trigger()
    expect((await getFilm(id)).genres).toEqual([{ id: 28, name: 'Action' }])

    await testApp().patch(`/api/films/${id}`).send({ tmdbId: 1396, tmdbMediaType: 'tv' })
    await createEnricher(client(), { delayMs: 0, log: vi.fn() }).trigger()
    expect(await getFilm(id)).toMatchObject({
      tmdb: { mediaType: 'tv', status: 'matched' },
      genres: [{ id: 18, name: 'Drama' }],
      directors: [{ id: 66633, name: 'Vince Gilligan' }],
      cast: [{ id: 17419, name: 'Bryan Cranston' }],
    })
  })

  it('still searches only movies for a film without a TMDB id', async () => {
    await pool.query(`INSERT INTO films (title, release_year) VALUES ('Joy', 2015)`)
    const c = client({
      searchMovie: vi.fn().mockResolvedValue([{ id: 100, title: 'Joy', original_title: 'Joy', release_date: '2015-12-25' }]),
      getMovie: vi.fn().mockResolvedValue({ ...tvToMovie(show(100)), title: 'Joy' }),
    })
    await createEnricher(c, { delayMs: 0, log: vi.fn() }).trigger()
    expect(c.getMovie).toHaveBeenCalledWith(100)
    expect(c.getTv).not.toHaveBeenCalled()
  })

  it('is not blocked by a TV show that has the same number as a movie it matches', async () => {
    await pool.query(`INSERT INTO films (title, tmdb_id, tmdb_media_type, tmdb_status) VALUES ('A show', 100, 'tv', 'matched')`)
    const id = Number((await pool.query(`INSERT INTO films (title, release_year) VALUES ('Joy', 2015) RETURNING id`)).rows[0].id)
    const c = client({
      searchMovie: vi.fn().mockResolvedValue([{ id: 100, title: 'Joy', original_title: 'Joy', release_date: '2015-12-25' }]),
      getMovie: vi.fn().mockResolvedValue({ ...tvToMovie(show(100)), title: 'Joy' }),
    })
    await createEnricher(c, { delayMs: 0, log: vi.fn() }).trigger()
    expect((await getFilm(id)).tmdb).toMatchObject({ id: 100, mediaType: 'movie', status: 'matched' })
  })
})

describe('the media type in the database', () => {
  it('starts every film as a movie', async () => {
    const { rows } = await pool.query(`INSERT INTO films (title) VALUES ('A') RETURNING tmdb_media_type`)
    expect(rows[0].tmdb_media_type).toBe('movie')
  })

  it('rejects a media type other than movie and tv', async () => {
    await expect(pool.query(`INSERT INTO films (title, tmdb_media_type) VALUES ('A', 'book')`)).rejects.toThrow()
  })

  it('lets a movie and a TV show share a TMDB id but not two films of the same type', async () => {
    const insert = (title: string, type: string) =>
      pool.query(`INSERT INTO films (title, tmdb_id, tmdb_media_type) VALUES ($1, 5, $2)`, [title, type])
    await insert('A movie', 'movie')
    await insert('A show', 'tv')
    await expect(insert('Another movie', 'movie')).rejects.toThrow()
    await expect(insert('Another show', 'tv')).rejects.toThrow()
  })

  it('allows many films without a TMDB id', async () => {
    await pool.query(`INSERT INTO films (title) VALUES ('A'), ('B')`)
    expect(Number((await pool.query('SELECT count(*) FROM films')).rows[0].count)).toBe(2)
  })
})

describe('PATCH /api/films/:id with a media type', () => {
  const add = async (title = 'Joy') => (await testApp().post('/api/films').send({ title })).body.id as number

  it('stores a TV show and starts the enrichment', async () => {
    const enricher = fakeEnricher()
    const id = await add()
    const res = await testApp(enricher).patch(`/api/films/${id}`).send({ tmdbId: 1396, tmdbMediaType: 'tv' })
    expect(res.status).toBe(200)
    expect(res.body.tmdb).toMatchObject({ id: 1396, mediaType: 'tv', status: 'pending' })
    expect(enricher.trigger).toHaveBeenCalled()
  })

  it('treats a tmdbId without a media type as a movie, even for a film that was a show', async () => {
    const id = await add()
    await testApp().patch(`/api/films/${id}`).send({ tmdbId: 1396, tmdbMediaType: 'tv' })
    const res = await testApp().patch(`/api/films/${id}`).send({ tmdbId: 262543 })
    expect(res.body.tmdb).toMatchObject({ id: 262543, mediaType: 'movie' })
  })

  it('shows the media type in the film, the list and the random pick', async () => {
    const id = await add()
    await testApp().patch(`/api/films/${id}`).send({ tmdbId: 5, tmdbMediaType: 'tv' })
    expect((await testApp().get(`/api/films/${id}`)).body.tmdb.mediaType).toBe('tv')
    expect((await testApp().get('/api/films')).body.items[0].tmdb.mediaType).toBe('tv')
    expect((await testApp().get('/api/films/random')).body.tmdb.mediaType).toBe('tv')
  })

  it('answers 409 for the same id and type on another film, but not for the other type', async () => {
    const a = await add('A')
    const b = await add('B')
    await testApp().patch(`/api/films/${a}`).send({ tmdbId: 5, tmdbMediaType: 'tv' })
    expect((await testApp().patch(`/api/films/${b}`).send({ tmdbId: 5, tmdbMediaType: 'tv' })).status).toBe(409)
    expect((await testApp().patch(`/api/films/${b}`).send({ tmdbId: 5 })).status).toBe(200)
  })

  it.each([
    ['an unknown type', { tmdbId: 5, tmdbMediaType: 'book' }],
    ['a type without an id', { tmdbMediaType: 'tv' }],
    ['a null type', { tmdbId: 5, tmdbMediaType: null }],
    ['a type as a number', { tmdbId: 5, tmdbMediaType: 1 }],
    ['an upper-case type', { tmdbId: 5, tmdbMediaType: 'TV' }],
    ['an empty type', { tmdbId: 5, tmdbMediaType: '' }],
    ['an unknown extra field next to a valid type', { tmdbId: 5, tmdbMediaType: 'tv', mediaType: 'tv' }],
  ])('answers 400 for %s', async (_name, body) => {
    const id = await add()
    const res = await testApp().patch(`/api/films/${id}`).send(body)
    expect(res.status).toBe(400)
    expect((await testApp().get(`/api/films/${id}`)).body.tmdb.mediaType).toBe('movie')
  })

  it('does not accept the media type when a film is created', async () => {
    expect((await testApp().post('/api/films').send({ title: 'A', tmdbMediaType: 'tv' })).status).toBe(400)
  })
})

describe('migration 003 on a database that already holds films', () => {
  const dir = join(import.meta.dirname, '../migrations')
  const sql = (file: string) => readFileSync(join(dir, file), 'utf8')

  it('keeps the rows it finds as movies with their TMDB ids and still enforces one film per id', async () => {
    const db = newDb()
    db.public.registerFunction({ name: 'btrim', args: [DataType.text], returns: DataType.text, implementation: (v: string) => v.trim() })
    db.public.none(sql('001_create_films.sql'))
    db.public.none(sql('002_tmdb_enrichment.sql'))
    db.public.none(`INSERT INTO films (title, tmdb_id, tmdb_status) VALUES ('Matched', 262543, 'matched'), ('Plain', NULL, 'pending')`)
    db.public.none(sql('003_tmdb_media_type.sql'))

    const rows = db.public.many(`SELECT title, tmdb_id, tmdb_media_type, tmdb_status FROM films ORDER BY id`)
    expect(rows).toEqual([
      { title: 'Matched', tmdb_id: 262543, tmdb_media_type: 'movie', tmdb_status: 'matched' },
      { title: 'Plain', tmdb_id: null, tmdb_media_type: 'movie', tmdb_status: 'pending' },
    ])
    expect(() => db.public.none(`INSERT INTO films (title, tmdb_id) VALUES ('Dup', 262543)`)).toThrow()
    db.public.none(`INSERT INTO films (title, tmdb_id, tmdb_media_type) VALUES ('Show', 262543, 'tv')`)
  })
})
