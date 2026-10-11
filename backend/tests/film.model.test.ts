import { beforeEach, describe, expect, it } from 'vitest'
import type { Pool } from 'pg'
import { createTestPool } from './helpers/testDb.js'
import {
  createFilm,
  deleteFilm,
  getFilm,
  listFilms,
  randomFilm,
  updateFilm,
} from '../src/models/film.js'
import type { ListQuery } from '../src/validation.js'

let pool: Pool
beforeEach(async () => {
  pool = await createTestPool()
})

const list = (overrides: Partial<ListQuery> = {}) =>
  listFilms({ watched: 'all', sort: 'added_at', order: 'desc', page: 1, pageSize: 50, ...overrides })

describe('createFilm / getFilm', () => {
  it('stores a film and reads it back with defaults', async () => {
    const created = await createFilm({ title: 'Joy', releaseYear: 2015 })
    const film = await getFilm(created.id)
    expect(film).toMatchObject({
      title: 'Joy',
      releaseYear: 2015,
      watchedAt: null,
      tmdb: { id: null, status: 'pending' },
      genres: [],
    })
    expect(film.addedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('keeps the added date it is given', async () => {
    const film = await createFilm({ title: 'Joy', addedAt: '2020-01-12' })
    expect(film.addedAt).toBe('2020-01-12')
  })

  it('throws not found for an unknown id', async () => {
    await expect(getFilm(999)).rejects.toMatchObject({ status: 404 })
  })
})

describe('updateFilm', () => {
  it('changes only the given fields', async () => {
    const { id } = await createFilm({ title: 'Joy', releaseYear: 2015 })
    const film = await updateFilm(id, { title: 'Joy!' })
    expect(film).toMatchObject({ title: 'Joy!', releaseYear: 2015 })
  })

  it('marks a film watched and unwatched', async () => {
    const { id } = await createFilm({ title: 'Joy' })
    expect((await updateFilm(id, { watched: true })).watchedAt).not.toBeNull()
    expect((await updateFilm(id, { watched: false })).watchedAt).toBeNull()
  })

  it('keeps the original watched date when marked watched twice', async () => {
    const { id } = await createFilm({ title: 'Joy' })
    const first = (await updateFilm(id, { watched: true })).watchedAt
    expect((await updateFilm(id, { watched: true })).watchedAt).toBe(first)
  })

  it('sets a TMDB id and puts the film back to pending', async () => {
    const { id } = await createFilm({ title: 'Joy' })
    await pool.query(`UPDATE films SET tmdb_status = 'ambiguous' WHERE id = $1`, [id])
    const film = await updateFilm(id, { tmdbId: 262543 })
    expect(film.tmdb).toMatchObject({ id: 262543, status: 'pending' })
  })

  it('throws not found for an unknown id', async () => {
    await expect(updateFilm(999, { title: 'x' })).rejects.toMatchObject({ status: 404 })
  })
})

describe('deleteFilm', () => {
  it('removes the film', async () => {
    const { id } = await createFilm({ title: 'Joy' })
    await deleteFilm(id)
    await expect(getFilm(id)).rejects.toMatchObject({ status: 404 })
  })

  it('throws not found for an unknown id', async () => {
    await expect(deleteFilm(999)).rejects.toMatchObject({ status: 404 })
  })
})

describe('listFilms', () => {
  beforeEach(async () => {
    await createFilm({ title: 'Alpha', releaseYear: 1999, addedAt: '2020-01-01' })
    await createFilm({ title: 'Beta', releaseYear: 2010, addedAt: '2021-01-01' })
    const gamma = await createFilm({ title: '100% Gamma_x', addedAt: '2022-01-01' })
    await updateFilm(gamma.id, { watched: true })
  })

  it('returns all films, newest added first, with the total', async () => {
    const result = await list()
    expect(result.items.map((f) => f.title)).toEqual(['100% Gamma_x', 'Beta', 'Alpha'])
    expect(result.total).toBe(3)
  })

  it('sorts by release year with films without a year last', async () => {
    const result = await list({ sort: 'release_year', order: 'asc' })
    expect(result.items.map((f) => f.title)).toEqual(['Alpha', 'Beta', '100% Gamma_x'])
  })

  it('searches the title case-insensitively', async () => {
    expect((await list({ q: 'alp' })).items.map((f) => f.title)).toEqual(['Alpha'])
  })

  it('filters by watched state', async () => {
    expect((await list({ watched: 'true' })).items.map((f) => f.title)).toEqual(['100% Gamma_x'])
    expect((await list({ watched: 'false' })).total).toBe(2)
  })

  it('pages the result and keeps the total', async () => {
    const page = await list({ pageSize: 2, page: 2 })
    expect(page.items.map((f) => f.title)).toEqual(['Alpha'])
    expect(page.total).toBe(3)
  })

  it('filters by genre and loads genres and credits', async () => {
    const { rows } = await pool.query(`SELECT id FROM films WHERE title = 'Alpha'`)
    const id = Number(rows[0].id)
    await pool.query(`INSERT INTO genres (id, name) VALUES (18, 'Drama'), (35, 'Comedy')`)
    await pool.query(`INSERT INTO film_genres VALUES ($1, 18), ($1, 35)`, [id])
    await pool.query(`INSERT INTO people (id, name) VALUES (1, 'Dir'), (2, 'Actor')`)
    await pool.query(`INSERT INTO film_credits VALUES ($1, 1, 'director', 0), ($1, 2, 'cast', 0)`, [id])

    const result = await list({ genre: 18 })
    expect(result.items).toHaveLength(1)
    expect(result.items[0]).toMatchObject({
      title: 'Alpha',
      genres: [
        { id: 35, name: 'Comedy' },
        { id: 18, name: 'Drama' },
      ],
      directors: [{ id: 1, name: 'Dir' }],
      cast: [{ id: 2, name: 'Actor' }],
    })
  })

  it('filters by TMDB status', async () => {
    await pool.query(`UPDATE films SET tmdb_status = 'ambiguous' WHERE title = 'Beta'`)
    expect((await list({ tmdbStatus: 'ambiguous' })).items.map((f) => f.title)).toEqual(['Beta'])
  })

  it('returns an empty page for an empty database', async () => {
    await pool.query('DELETE FROM films')
    expect(await list()).toMatchObject({ items: [], total: 0 })
  })
})

describe('randomFilm', () => {
  it('can pick every unwatched film and never a watched one', async () => {
    const a = await createFilm({ title: 'A' })
    const b = await createFilm({ title: 'B' })
    const c = await createFilm({ title: 'C' })
    await updateFilm(c.id, { watched: true })

    expect((await randomFilm({}, () => 0)).id).toBe(a.id)
    expect((await randomFilm({}, () => 0.99)).id).toBe(b.id)
  })

  it('throws not found when everything is watched', async () => {
    const { id } = await createFilm({ title: 'A' })
    await updateFilm(id, { watched: true })
    await expect(randomFilm({})).rejects.toMatchObject({ status: 404 })
  })

  it('throws not found for an empty watchlist', async () => {
    await expect(randomFilm({})).rejects.toMatchObject({ status: 404 })
  })

  it('respects the year range', async () => {
    await createFilm({ title: 'Old', releaseYear: 1950 })
    const recent = await createFilm({ title: 'Recent', releaseYear: 2015 })
    await createFilm({ title: 'No year' })
    expect((await randomFilm({ yearFrom: 2000, yearTo: 2020 }, () => 0)).id).toBe(recent.id)
  })

  it('respects genre, country and runtime', async () => {
    const short = await createFilm({ title: 'Short' })
    const long = await createFilm({ title: 'Long' })
    await pool.query(`INSERT INTO genres (id, name) VALUES (18, 'Drama')`)
    await pool.query(`INSERT INTO film_genres VALUES ($1, 18), ($2, 18)`, [short.id, long.id])
    await pool.query(`UPDATE films SET runtime_minutes = 80, countries = ARRAY['FR'] WHERE id = $1`, [short.id])
    await pool.query(`UPDATE films SET runtime_minutes = 200, countries = ARRAY['US'] WHERE id = $1`, [long.id])

    expect((await randomFilm({ genre: 18, maxRuntime: 100 }, () => 0)).id).toBe(short.id)
    expect((await randomFilm({ country: 'US' }, () => 0)).id).toBe(long.id)
    await expect(randomFilm({ country: 'JP' })).rejects.toMatchObject({ status: 404 })
  })
})
