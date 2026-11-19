import { withTransaction } from '../config/database.js'
import { HttpError } from '../errors.js'
import { applyPlan, loadLinkedFilms } from '../models/filmImport.js'
import { parseWatchlistCsv, type ImportSource, type RejectedRow } from './csv.js'
import { buildPlan, isLargeRemoval, removalToken, type ExistingFilm, type ImportPlan } from './plan.js'

export interface ImportOptions {
  removalToken?: string
  confirmLargeRemoval?: boolean
  /** Also remove watched films that are missing from the file. */
  deleteWatched?: boolean
}

interface FilmRef {
  id: number
  title: string
  releaseYear: number | null
}

interface RemovedFilm extends FilmRef {
  watched: boolean
}

export interface ImportReport {
  source: ImportSource
  applied: boolean
  inserted: number
  updated: number
  unchanged: number
  /** New rows that were not added, because the same film (title and year) came from the other export. */
  skipped: { line: number; title: string; releaseYear: number | null; existing: FilmRef }[]
  removed: RemovedFilm[]
  keptWatched: FilmRef[]
  rejected: Omit<RejectedRow, 'letterboxdUrl'>[]
  removalToken: string
  requiresLargeRemovalConfirmation: boolean
}

const summary = (film: FilmRef) => ({
  id: film.id,
  title: film.title,
  releaseYear: film.releaseYear,
})

const removedSummary = (film: ExistingFilm): RemovedFilm => ({ ...summary(film), watched: film.watched })

function report(source: ImportSource, plan: ImportPlan, rejected: RejectedRow[], applied: boolean): ImportReport {
  return {
    source,
    applied,
    inserted: plan.toInsert.length,
    updated: plan.toUpdate.length,
    unchanged: plan.unchanged,
    skipped: plan.toSkip.map(({ row, existing }) => ({
      line: row.line,
      title: row.title,
      releaseYear: row.releaseYear,
      existing: summary(existing),
    })),
    removed: plan.toRemove.map(removedSummary),
    keptWatched: plan.keptWatched.map(summary),
    rejected: rejected.map(({ line, reason }) => ({ line, reason })),
    removalToken: removalToken(plan.toRemove),
    requiresLargeRemovalConfirmation: isLargeRemoval(plan),
  }
}

/** Shows what an import would do, without writing anything. */
export async function previewImport(file: Buffer, options: Pick<ImportOptions, 'deleteWatched'> = {}): Promise<ImportReport> {
  const { source, rows, rejected } = parseWatchlistCsv(file)
  const plan = buildPlan(rows, rejected, await loadLinkedFilms(), source, options.deleteWatched)
  return report(source, plan, rejected, false)
}

/** Applies an import. Removals only happen for the exact list a preview showed (matched by its token). */
export async function applyImport(file: Buffer, options: ImportOptions): Promise<ImportReport> {
  const { source, rows, rejected } = parseWatchlistCsv(file)
  return withTransaction(async (db) => {
    const plan = buildPlan(rows, rejected, await loadLinkedFilms(db), source, options.deleteWatched)
    if (plan.toRemove.length > 0 && options.removalToken !== removalToken(plan.toRemove)) {
      throw new HttpError(
        409,
        'The films to be removed changed or were not previewed. Run the preview again and confirm its list.',
        { code: 'removal_not_confirmed', removed: plan.toRemove.map(removedSummary) },
      )
    }
    if (isLargeRemoval(plan) && !options.confirmLargeRemoval) {
      const films = options.deleteWatched ? 'films it can remove' : 'unwatched films'
      throw new HttpError(409, `This import removes more than half of the ${films}. Confirm it explicitly.`, {
        code: 'large_removal',
        removed: plan.toRemove.map(removedSummary),
      })
    }
    await applyPlan(plan, db)
    return report(source, plan, rejected, true)
  })
}
