import { getPool, query, type Db } from '../config/database.js'
import { dateOnly } from '../dates.js'
import { notFound } from '../errors.js'
import type { FilmCreate, FilmPatch, ListQuery, RandomQuery } from '../validation.js'

interface FilmRow {
  id: string | number
  title: string
  release_year: number | null
  letterboxd_url: string | null
  added_at: string | Date
  watched_at: Date | null
  tmdb_id: number | null
  tmdb_status: string
  tmdb_synced_at: Date | null
  original_title: string | null
  tagline: string | null
  overview: string | null
  runtime_minutes: number | null
  vote_average: string | number | null
  vote_count: number | null
  poster_path: string | null
  backdrop_path: string | null
  countries: string[] | string | null
}

interface Named {
  id: number
  name: string
}

export interface Film {
  id: number
  title: string
  releaseYear: number | null
  letterboxdUrl: string | null
  addedAt: string
  watchedAt: string | null
  tmdb: { id: number | null; status: string; syncedAt: string | null }
  originalTitle: string | null
  tagline: string | null
  overview: string | null
  runtimeMinutes: number | null
  voteAverage: number | null
  voteCount: number | null
  posterPath: string | null
  backdropPath: string | null
  countries: string[]
  genres: Named[]
  directors: Named[]
  cast: Named[]
}

// pg-mem hands back array columns as '{}' text; Postgres returns real arrays
const toCountries = (value: string[] | string | null) => (Array.isArray(value) ? value : [])

function toFilm(row: FilmRow): Film {
  return {
    id: Number(row.id),
    title: row.title,
    releaseYear: row.release_year,
    letterboxdUrl: row.letterboxd_url,
    addedAt: dateOnly(row.added_at),
    watchedAt: row.watched_at?.toISOString() ?? null,
    tmdb: {
      id: row.tmdb_id,
      status: row.tmdb_status,
      syncedAt: row.tmdb_synced_at?.toISOString() ?? null,
    },
    originalTitle: row.original_title,
    tagline: row.tagline,
    overview: row.overview,
    runtimeMinutes: row.runtime_minutes,
    voteAverage: row.vote_average === null ? null : Number(row.vote_average),
    voteCount: row.vote_count,
    posterPath: row.poster_path,
    backdropPath: row.backdrop_path,
    countries: toCountries(row.countries),
    genres: [],
    directors: [],
    cast: [],
  }
}

/** Loads genres and credits for the given films with two queries, however many films there are. */
async function withRelations(rows: FilmRow[], db: Db): Promise<Film[]> {
  const films = rows.map(toFilm)
  if (films.length === 0) return films
  const byId = new Map(films.map((film) => [film.id, film]))
  const marks = films.map((_, i) => `$${i + 1}`).join(', ')
  const ids = films.map((film) => film.id)

  const genres = await query<{ film_id: string | number } & Named>(
    `SELECT fg.film_id, g.id, g.name FROM film_genres fg JOIN genres g ON g.id = fg.genre_id
      WHERE fg.film_id IN (${marks}) ORDER BY g.name`,
    ids,
    db,
  )
  for (const g of genres) byId.get(Number(g.film_id))?.genres.push({ id: g.id, name: g.name })

  const credits = await query<{ film_id: string | number; role: string } & Named>(
    `SELECT c.film_id, c.role, p.id, p.name FROM film_credits c JOIN people p ON p.id = c.person_id
      WHERE c.film_id IN (${marks}) ORDER BY c.position`,
    ids,
    db,
  )
  for (const c of credits) {
    const film = byId.get(Number(c.film_id))
    film?.[c.role === 'director' ? 'directors' : 'cast'].push({ id: c.id, name: c.name })
  }
  return films
}

const escapeLike = (text: string) => text.replace(/[\\%_]/g, (char) => `\\${char}`)

/** Builds the WHERE clause shared by the list and the random pick. */
class Where {
  readonly conditions: string[] = []
  readonly params: unknown[] = []

  add(condition: string, value?: unknown) {
    if (value === undefined) this.conditions.push(condition)
    else {
      this.params.push(value)
      this.conditions.push(condition.replace('?', `$${this.params.length}`))
    }
  }

  get sql() {
    return this.conditions.length ? `WHERE ${this.conditions.join(' AND ')}` : ''
  }
}

const genreFilter = 'id IN (SELECT film_id FROM film_genres WHERE genre_id = ?)'

export async function listFilms(filters: ListQuery, db: Db = getPool()) {
  const where = new Where()
  if (filters.q) where.add('title ILIKE ?', `%${escapeLike(filters.q)}%`)
  if (filters.watched === 'true') where.add('watched_at IS NOT NULL')
  if (filters.watched === 'false') where.add('watched_at IS NULL')
  if (filters.genre !== undefined) where.add(genreFilter, filters.genre)
  if (filters.tmdbStatus) where.add('tmdb_status = ?', filters.tmdbStatus)

  const [{ count } = { count: '0' }] = await query<{ count: string }>(
    `SELECT count(*) AS count FROM films ${where.sql}`,
    where.params,
    db,
  )
  const direction = filters.order === 'asc' ? 'ASC' : 'DESC'
  const limit = where.params.length
  const rows = await query<FilmRow>(
    `SELECT * FROM films ${where.sql}
      ORDER BY ${filters.sort} ${direction} NULLS LAST, id ${direction}
      LIMIT $${limit + 1} OFFSET $${limit + 2}`,
    [...where.params, filters.pageSize, (filters.page - 1) * filters.pageSize],
    db,
  )
  return {
    items: await withRelations(rows, db),
    total: Number(count),
    page: filters.page,
    pageSize: filters.pageSize,
  }
}

export async function getFilm(id: number, db: Db = getPool()): Promise<Film> {
  const rows = await query<FilmRow>('SELECT * FROM films WHERE id = $1', [id], db)
  if (rows.length === 0) throw notFound()
  return (await withRelations(rows, db))[0]!
}

export async function createFilm(input: FilmCreate, db: Db = getPool()): Promise<Film> {
  const rows = await query<FilmRow>(
    `INSERT INTO films (title, release_year, letterboxd_url, added_at)
     VALUES ($1, $2, $3, COALESCE($4::date, CURRENT_DATE)) RETURNING *`,
    [input.title, input.releaseYear ?? null, input.letterboxdUrl ?? null, input.addedAt ?? null],
    db,
  )
  return toFilm(rows[0]!)
}

const patchColumns = {
  title: 'title',
  releaseYear: 'release_year',
  letterboxdUrl: 'letterboxd_url',
  addedAt: 'added_at',
  tmdbId: 'tmdb_id',
} as const

export async function updateFilm(id: number, patch: FilmPatch, db: Db = getPool()): Promise<Film> {
  const sets: string[] = []
  const params: unknown[] = []
  const set = (column: string, value: unknown) => {
    params.push(value)
    sets.push(`${column} = $${params.length}`)
  }
  for (const [key, column] of Object.entries(patchColumns)) {
    const value = patch[key as keyof typeof patchColumns]
    if (value !== undefined) set(column, value)
  }
  if (patch.tmdbId !== undefined) {
    sets.push(`tmdb_status = 'pending'`)
  }
  if (patch.watched === false) sets.push('watched_at = NULL')
  if (patch.watched === true) sets.push('watched_at = COALESCE(watched_at, now())')
  sets.push('updated_at = now()')

  params.push(id)
  const rows = await query<FilmRow>(
    `UPDATE films SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING id`,
    params,
    db,
  )
  if (rows.length === 0) throw notFound()
  return getFilm(id, db)
}

export async function deleteFilm(id: number, db: Db = getPool()): Promise<void> {
  const rows = await query('DELETE FROM films WHERE id = $1 RETURNING id', [id], db)
  if (rows.length === 0) throw notFound()
}

/** Picks one unwatched film that matches the filters. `random` returns a number in [0, 1). */
export async function randomFilm(
  filters: RandomQuery,
  random: () => number = Math.random,
  db: Db = getPool(),
): Promise<Film> {
  const where = new Where()
  where.add('watched_at IS NULL')
  if (filters.yearFrom !== undefined) where.add('release_year >= ?', filters.yearFrom)
  if (filters.yearTo !== undefined) where.add('release_year <= ?', filters.yearTo)
  if (filters.genre !== undefined) where.add(genreFilter, filters.genre)
  if (filters.country) where.add('? = ANY(countries)', filters.country)
  if (filters.maxRuntime !== undefined) where.add('runtime_minutes <= ?', filters.maxRuntime)

  const candidates = await query<{ id: string | number }>(
    `SELECT id FROM films ${where.sql} ORDER BY id`,
    where.params,
    db,
  )
  if (candidates.length === 0) throw notFound('No unwatched film matches')
  const pick = candidates[Math.floor(random() * candidates.length)]!
  return getFilm(Number(pick.id), db)
}
