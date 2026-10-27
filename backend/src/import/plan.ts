import { createHash } from 'node:crypto'
import type { ImportRow, ImportSource, RejectedRow } from './csv.js'

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
  /** New rows that are not added because the same film (title and year) came from the other export. */
  toSkip: { row: ImportRow; existing: ExistingFilm }[]
  unchanged: number
  toRemove: ExistingFilm[]
  keptWatched: ExistingFilm[]
  /** Unwatched films with a link; the base for the "removes too many" guard. */
  unwatchedCount: number
}

const isChanged = (film: ExistingFilm, row: ImportRow) =>
  film.title !== row.title ||
  film.releaseYear !== row.releaseYear ||
  (row.addedAt !== null && film.addedAt !== row.addedAt)

/** Which export a film's link belongs to. Everything that is not an IMDb link counts as Letterboxd, as before. */
export const sourceOfLink = (link: string): ImportSource =>
  /^https?:\/\/([\w-]+\.)*imdb\.com(\/|$)/i.test(link) ? 'imdb' : 'letterboxd'

/** A title as it is compared across exports: no case, Latin accents or punctuation, and without a leading "the". */
export const normalizeTitle = (title: string): string =>
  title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, ' ')
    .trim()
    .replace(/^the /, '')

// a title of only punctuation ("!!!") has nothing left after normalizing, so it is compared as it is
const filmKey = (title: string, year: number) => `${year}|${normalizeTitle(title) || title.trim().toLowerCase()}`

/**
 * Compares the CSV with the films in the database. Films with a link that are missing from the CSV are removed,
 * unless they are watched or their CSV row was rejected (a bad row must not delete a film). Only films from the
 * same source as the file can be removed: an IMDb file never removes a Letterboxd film, and the other way round.
 * A new row is skipped when a film of the other source has the same title and year (both known), so a film that is
 * in both exports is not stored twice. The first export that is imported keeps the film.
 */
export function buildPlan(
  rows: ImportRow[],
  rejected: RejectedRow[],
  existing: ExistingFilm[],
  source: ImportSource = 'letterboxd',
): ImportPlan {
  const existingByUrl = new Map(existing.map((film) => [film.letterboxdUrl, film]))
  const inFile = new Set([...rows.map((row) => row.letterboxdUrl), ...rejected.flatMap((r) => r.letterboxdUrl ?? [])])

  const sameSource = existing.filter((film) => sourceOfLink(film.letterboxdUrl) === source)
  const otherSource = new Map<string, ExistingFilm>()
  for (const film of existing) {
    if (sourceOfLink(film.letterboxdUrl) === source || film.releaseYear === null) continue
    const key = filmKey(film.title, film.releaseYear)
    if (!otherSource.has(key)) otherSource.set(key, film)
  }
  const plan: ImportPlan = {
    toInsert: [],
    toUpdate: [],
    toSkip: [],
    unchanged: 0,
    toRemove: [],
    keptWatched: [],
    unwatchedCount: sameSource.filter((film) => !film.watched).length,
  }
  for (const row of rows) {
    const film = existingByUrl.get(row.letterboxdUrl)
    const sameFilm = row.releaseYear === null ? undefined : otherSource.get(filmKey(row.title, row.releaseYear))
    if (!film && sameFilm) plan.toSkip.push({ row, existing: sameFilm })
    else if (!film) plan.toInsert.push(row)
    else if (isChanged(film, row)) plan.toUpdate.push({ id: film.id, row })
    else plan.unchanged++
  }
  for (const film of sameSource) {
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
