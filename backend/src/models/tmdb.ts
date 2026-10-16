import { getPool, query, withTransaction, type Db } from '../config/database.js'
import type { TmdbMediaType, TmdbMovie } from '../tmdb/client.js'

export interface PendingFilm {
  id: number
  title: string
  releaseYear: number | null
  tmdbId: number | null
  mediaType: TmdbMediaType
}

export type TmdbStatus = 'pending' | 'matched' | 'ambiguous' | 'not_found' | 'error'

const MAX_CAST = 10

interface PendingRow {
  id: string | number
  title: string
  release_year: number | null
  tmdb_id: number | null
  tmdb_media_type: TmdbMediaType
}

const toPendingFilm = (row: PendingRow): PendingFilm => ({
  id: Number(row.id),
  title: row.title,
  releaseYear: row.release_year,
  tmdbId: row.tmdb_id,
  mediaType: row.tmdb_media_type,
})

const PENDING_COLUMNS = `id, title, release_year, tmdb_id, tmdb_media_type`

export async function loadPendingFilms(retryErrors: boolean, db: Db = getPool()): Promise<PendingFilm[]> {
  const statuses = retryErrors ? `('pending', 'error')` : `('pending')`
  const rows = await query<PendingRow>(
    `SELECT ${PENDING_COLUMNS} FROM films WHERE tmdb_status IN ${statuses} ORDER BY id`,
    [],
    db,
  )
  return rows.map(toPendingFilm)
}

/** One film for a look-up the user asked for, whatever its status; null if there is no such film. */
export async function loadFilmToEnrich(filmId: number, db: Db = getPool()): Promise<PendingFilm | null> {
  const rows = await query<PendingRow>(`SELECT ${PENDING_COLUMNS} FROM films WHERE id = $1`, [filmId], db)
  return rows[0] ? toPendingFilm(rows[0]) : null
}

export async function setStatus(filmId: number, status: TmdbStatus, db: Db = getPool()): Promise<void> {
  await query(
    `UPDATE films SET tmdb_status = $1, tmdb_synced_at = now(), updated_at = now() WHERE id = $2`,
    [status, filmId],
    db,
  )
}

type Credit = { person: { id: number; name: string }; role: 'director' | 'cast'; position: number }

async function updateFilmRow(filmId: number, movie: TmdbMovie, db: Db): Promise<void> {
  await query(
    `UPDATE films SET tmdb_id = $1, tmdb_status = 'matched', tmdb_synced_at = now(), original_title = $2,
       tagline = $3, overview = $4, runtime_minutes = $5, vote_average = $6, vote_count = $7,
       poster_path = $8, backdrop_path = $9, countries = $10, updated_at = now()
     WHERE id = $11`,
    [
      movie.id,
      movie.original_title || null,
      movie.tagline || null,
      movie.overview || null,
      movie.runtime || null,
      movie.vote_average ?? null,
      movie.vote_count ?? null,
      movie.poster_path ?? null,
      movie.backdrop_path ?? null,
      movie.production_countries.map((country) => country.iso_3166_1),
      filmId,
    ],
    db,
  )
}

/** Inserts or renames a genre or person, keyed by its TMDB id. */
async function upsertNamed(table: 'genres' | 'people', row: { id: number; name: string }, db: Db): Promise<void> {
  await query(
    `INSERT INTO ${table} (id, name) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
    [row.id, row.name],
    db,
  )
}

async function replaceGenres(filmId: number, movie: TmdbMovie, db: Db): Promise<void> {
  await query('DELETE FROM film_genres WHERE film_id = $1', [filmId], db)
  for (const genre of movie.genres) {
    await upsertNamed('genres', genre, db)
    await query('INSERT INTO film_genres (film_id, genre_id) VALUES ($1, $2)', [filmId, genre.id], db)
  }
}

function creditsOf(movie: TmdbMovie): Credit[] {
  const directors = (movie.credits?.crew ?? []).filter((person) => person.job === 'Director')
  const cast = [...(movie.credits?.cast ?? [])].sort((a, b) => a.order - b.order).slice(0, MAX_CAST)
  return [
    ...directors.map((person, position) => ({ person, role: 'director' as const, position })),
    ...cast.map((person, position) => ({ person, role: 'cast' as const, position })),
  ]
}

async function replaceCredits(filmId: number, movie: TmdbMovie, db: Db): Promise<void> {
  await query('DELETE FROM film_credits WHERE film_id = $1', [filmId], db)
  for (const { person, role, position } of creditsOf(movie)) {
    await upsertNamed('people', person, db)
    await query(
      `INSERT INTO film_credits (film_id, person_id, role, position) VALUES ($1, $2, $3, $4)
       ON CONFLICT (film_id, person_id, role) DO NOTHING`,
      [filmId, person.id, role, position],
      db,
    )
  }
}

/** Stores TMDB's data for a film, replacing its genres and credits. Throws code 23505 if another film has this id. */
export async function saveMovie(filmId: number, movie: TmdbMovie): Promise<void> {
  await withTransaction(async (db) => {
    await updateFilmRow(filmId, movie, db)
    await replaceGenres(filmId, movie, db)
    await replaceCredits(filmId, movie, db)
  })
}
