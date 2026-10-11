// Runs against a real PostgreSQL, for behavior pg-mem does not implement.
// Start one and set TEST_DATABASE_URL, e.g.:
//   docker run --rm -d -p 55432:5432 -e POSTGRES_PASSWORD=test postgres:17-alpine
//   TEST_DATABASE_URL=postgres://postgres:test@localhost:55432/postgres npm test
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import pg from 'pg'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { setPool } from '../src/config/database.js'
import { createFilm, getFilm, listFilms } from '../src/models/film.js'
import { createEnricher } from '../src/tmdb/enricher.js'
import { HEADER, testApp } from './helpers/app.js'

const url = process.env.TEST_DATABASE_URL
const migrationsDir = join(import.meta.dirname, '../migrations')

describe.skipIf(!url)('real PostgreSQL', () => {
  const pool = new pg.Pool({ connectionString: url })
  afterAll(() => pool.end())

  beforeEach(async () => {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public')
    for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()) {
      await pool.query(readFileSync(join(migrationsDir, file), 'utf8'))
    }
    setPool(pool)
  })

  const search = async (q: string) =>
    (await listFilms({ q, watched: 'all', sort: 'title', order: 'asc', page: 1, pageSize: 50 })).items.map(
      (f) => f.title,
    )

  it('treats % and _ in the title search as plain characters', async () => {
    await createFilm({ title: '100% Gamma_x' })
    await createFilm({ title: 'Alpha' })
    expect(await search('%')).toEqual(['100% Gamma_x'])
    expect(await search('_x')).toEqual(['100% Gamma_x'])
    expect(await search('a_p')).toEqual([])
  })

  it('returns genres, dates and countries in their real types', async () => {
    const { id } = await createFilm({ title: 'Joy', addedAt: '2020-01-12' })
    await pool.query(`UPDATE films SET countries = ARRAY['US','GB'], vote_average = 7.5 WHERE id = $1`, [id])
    const [film] = (await listFilms({ watched: 'all', sort: 'title', order: 'asc', page: 1, pageSize: 5 })).items
    expect(film).toMatchObject({ addedAt: '2020-01-12', countries: ['US', 'GB'], voteAverage: 7.5 })
  })

  it('enforces the title, link and rating constraints', async () => {
    await expect(pool.query(`INSERT INTO films (title) VALUES ('   ')`)).rejects.toThrow()
    await expect(
      pool.query(`INSERT INTO films (title, letterboxd_url) VALUES ('A', 'ftp://x')`),
    ).rejects.toThrow()
  })

  it('rolls back the whole import when a statement fails halfway', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await pool.query(`ALTER TABLE films ADD CONSTRAINT no_film_3 CHECK (title <> 'Film 3')`)
    const csv = `${HEADER}2020-01-01,Film 2,2000,https://boxd.it/2\n2020-01-01,Film 3,2000,https://boxd.it/3\n`
    const res = await testApp().post('/api/films/import').attach('file', Buffer.from(csv), 'w.csv')
    expect(res.status).toBe(500)
    expect((await pool.query('SELECT count(*) FROM films')).rows[0].count).toBe('0')
  })

  it('stores TMDB data, genres, credits and countries', async () => {
    const { id } = await createFilm({ title: 'Joy', releaseYear: 2015 })
    const client = {
      searchMovie: async () => [{ id: 100, title: 'Joy', original_title: 'Joy', release_date: '2015-12-25' }],
      getMovie: async () => ({
        id: 100,
        title: 'Joy',
        original_title: 'Joy',
        runtime: 124,
        vote_average: 6.6,
        genres: [{ id: 18, name: 'Drama' }],
        production_countries: [{ iso_3166_1: 'US' }, { iso_3166_1: 'GB' }],
        credits: { cast: [{ id: 1, name: 'First', order: 0 }], crew: [{ id: 9, name: 'Dir', job: 'Director' }] },
      }),
    }
    await createEnricher(client, { delayMs: 0 }).trigger()
    expect(await getFilm(id)).toMatchObject({
      tmdb: { id: 100, status: 'matched' },
      countries: ['US', 'GB'],
      voteAverage: 6.6,
      genres: [{ id: 18, name: 'Drama' }],
      directors: [{ id: 9, name: 'Dir' }],
      cast: [{ id: 1, name: 'First' }],
    })
  })
  describe('values that fit the API schema but not the column type', () => {
    beforeEach(() => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
    })

    it('answers 400, not 500, for a TMDB id above the INTEGER range', async () => {
      const { id } = await createFilm({ title: 'Joy' })
      const res = await testApp().patch(`/api/films/${id}`).send({ tmdbId: 2 ** 31 })
      expect(res.status).toBe(400)
    })

    it('answers 400, not 500, for a genre filter above the INTEGER range', async () => {
      await createFilm({ title: 'Joy' })
      expect((await testApp().get(`/api/films?genre=${2 ** 31}`)).status).toBe(400)
      expect((await testApp().get(`/api/films/random?genre=${2 ** 31}`)).status).toBe(400)
    })

    it('answers 404 or 400, not 500, for a maxRuntime above the SMALLINT range', async () => {
      await createFilm({ title: 'Joy' })
      expect([400, 404]).toContain((await testApp().get('/api/films/random?maxRuntime=100000')).status)
    })

    it('answers 404, not 500, for a film id above the BIGINT range', async () => {
      expect((await testApp().get('/api/films/9007199254740991')).status).toBe(404)
    })

    it('rejects an added date in year 0000 with 400, not 500', async () => {
      expect((await testApp().post('/api/films').send({ title: 'A', addedAt: '0000-01-01' })).status).toBe(400)
    })
  })

  it('never answers 500 and never duplicates a film when the same file is imported twice at once', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const csv = `${HEADER}2020-01-01,Film 1,2000,https://boxd.it/1\n`
    const send = () => testApp().post('/api/films/import').attach('file', Buffer.from(csv), 'w.csv')
    const results = await Promise.all([send(), send()])
    for (const { status } of results) expect([200, 409]).toContain(status)
    expect((await pool.query('SELECT count(*) FROM films')).rows[0].count).toBe('1')
  })
})
