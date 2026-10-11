import { createHash } from 'node:crypto'
import type { ImportRow, RejectedRow } from './csv.js'

export interface ExistingFilm {
  id: number
  title: string
  releaseYear: number | null
  letterboxdUrl: string
  addedAt: string
  watched: boolean
}

export interface ImportPlan {
  toInsert: ImportRow[]
  toUpdate: { id: number; row: ImportRow }[]
  unchanged: number
  toRemove: ExistingFilm[]
  keptWatched: ExistingFilm[]
  /** Unwatched films with a link; the base for the "removes too many" guard. */
  unwatchedCount: number
}

const isChanged = (film: ExistingFilm, row: ImportRow) =>
  film.title !== row.title || film.releaseYear !== row.releaseYear || film.addedAt !== row.addedAt

/**
 * Compares the CSV with the films in the database. Films with a link that are missing from the CSV are removed,
 * unless they are watched or their CSV row was rejected (a bad row must not delete a film).
 */
export function buildPlan(rows: ImportRow[], rejected: RejectedRow[], existing: ExistingFilm[]): ImportPlan {
  const existingByUrl = new Map(existing.map((film) => [film.letterboxdUrl, film]))
  const inFile = new Set([...rows.map((row) => row.letterboxdUrl), ...rejected.flatMap((r) => r.letterboxdUrl ?? [])])

  const plan: ImportPlan = {
    toInsert: [],
    toUpdate: [],
    unchanged: 0,
    toRemove: [],
    keptWatched: [],
    unwatchedCount: existing.filter((film) => !film.watched).length,
  }
  for (const row of rows) {
    const film = existingByUrl.get(row.letterboxdUrl)
    if (!film) plan.toInsert.push(row)
    else if (isChanged(film, row)) plan.toUpdate.push({ id: film.id, row })
    else plan.unchanged++
  }
  for (const film of existing) {
    if (inFile.has(film.letterboxdUrl)) continue
    ;(film.watched ? plan.keptWatched : plan.toRemove).push(film)
  }
  return plan
}

/** Identifies the exact set of films a preview showed for removal. */
export function removalToken(toRemove: ExistingFilm[]): string {
  const ids = toRemove.map((film) => film.id).sort((a, b) => a - b)
  return createHash('sha256').update(ids.join(',')).digest('hex').slice(0, 32)
}

/** Removing more than half of the unwatched films (or all of them from an empty file) needs an explicit OK. */
export function isLargeRemoval(plan: ImportPlan): boolean {
  return plan.toRemove.length > 0 && plan.toRemove.length * 2 > plan.unwatchedCount
}
