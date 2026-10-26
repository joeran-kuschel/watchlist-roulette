import { getPool, query, type Db } from '../config/database.js'
import { dateOnly } from '../dates.js'
import type { ExistingFilm, ImportPlan } from '../import/plan.js'

interface ExistingRow {
  id: string | number
  title: string
  release_year: number | null
  letterboxd_url: string
  added_at: string | Date
  watched_at: Date | null
}

/** Films that came with a link, i.e. the ones a CSV import is allowed to update and remove. */
export async function loadLinkedFilms(db: Db = getPool()): Promise<ExistingFilm[]> {
  const rows = await query<ExistingRow>(
    `SELECT id, title, release_year, letterboxd_url, added_at, watched_at FROM films
      WHERE letterboxd_url IS NOT NULL ORDER BY id`,
    [],
    db,
  )
  return rows.map((row) => ({
    id: Number(row.id),
    title: row.title,
    releaseYear: row.release_year,
    letterboxdUrl: row.letterboxd_url,
    addedAt: dateOnly(row.added_at),
    watched: row.watched_at !== null,
  }))
}

/** Writes the plan. Run it inside a transaction. Updates never touch watched or TMDB data. */
export async function applyPlan(plan: ImportPlan, db: Db): Promise<void> {
  for (const row of plan.toInsert) {
    await query(
      `INSERT INTO films (title, release_year, letterboxd_url, added_at) VALUES ($1, $2, $3, COALESCE($4::date, CURRENT_DATE))`,
      [row.title, row.releaseYear, row.letterboxdUrl, row.addedAt],
      db,
    )
  }
  for (const { id, row } of plan.toUpdate) {
    await query(
      `UPDATE films SET title = $1, release_year = $2, added_at = COALESCE($3::date, added_at), updated_at = now() WHERE id = $4`,
      [row.title, row.releaseYear, row.addedAt, id],
      db,
    )
  }
  for (const film of plan.toRemove) {
    // re-check: a film marked watched since the plan was made must survive
    await query('DELETE FROM films WHERE id = $1 AND watched_at IS NULL', [film.id], db)
  }
}
