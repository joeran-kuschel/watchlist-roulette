import { withTransaction } from '../config/database.js'
import { HttpError } from '../errors.js'
import { applyPlan, loadLinkedFilms } from '../models/filmImport.js'
import { parseWatchlistCsv, type ImportSource, type RejectedRow } from './csv.js'
import { buildPlan, isLargeRemoval, removalToken, type ImportPlan } from './plan.js'

export interface ImportOptions {
  removalToken?: string
  confirmLargeRemoval?: boolean
}

export interface ImportReport {
  source: ImportSource
  applied: boolean
  inserted: number
  updated: number
  unchanged: number
  removed: { id: number; title: string; releaseYear: number | null }[]
  keptWatched: { id: number; title: string; releaseYear: number | null }[]
  rejected: Omit<RejectedRow, 'letterboxdUrl'>[]
  removalToken: string
  requiresLargeRemovalConfirmation: boolean
}

const summary = (film: { id: number; title: string; releaseYear: number | null }) => ({
  id: film.id,
  title: film.title,
  releaseYear: film.releaseYear,
})

function report(source: ImportSource, plan: ImportPlan, rejected: RejectedRow[], applied: boolean): ImportReport {
  return {
    source,
    applied,
    inserted: plan.toInsert.length,
    updated: plan.toUpdate.length,
    unchanged: plan.unchanged,
    removed: plan.toRemove.map(summary),
    keptWatched: plan.keptWatched.map(summary),
    rejected: rejected.map(({ line, reason }) => ({ line, reason })),
    removalToken: removalToken(plan.toRemove),
    requiresLargeRemovalConfirmation: isLargeRemoval(plan),
  }
}

/** Shows what an import would do, without writing anything. */
export async function previewImport(file: Buffer): Promise<ImportReport> {
  const { source, rows, rejected } = parseWatchlistCsv(file)
  return report(source, buildPlan(rows, rejected, await loadLinkedFilms(), source), rejected, false)
}

/** Applies an import. Removals only happen for the exact list a preview showed (matched by its token). */
export async function applyImport(file: Buffer, options: ImportOptions): Promise<ImportReport> {
  const { source, rows, rejected } = parseWatchlistCsv(file)
  return withTransaction(async (db) => {
    const plan = buildPlan(rows, rejected, await loadLinkedFilms(db), source)
    if (plan.toRemove.length > 0 && options.removalToken !== removalToken(plan.toRemove)) {
      throw new HttpError(
        409,
        'The films to be removed changed or were not previewed. Run the preview again and confirm its list.',
        { code: 'removal_not_confirmed', removed: plan.toRemove.map(summary) },
      )
    }
    if (isLargeRemoval(plan) && !options.confirmLargeRemoval) {
      throw new HttpError(409, 'This import removes more than half of the unwatched films. Confirm it explicitly.', {
        code: 'large_removal',
        removed: plan.toRemove.map(summary),
      })
    }
    await applyPlan(plan, db)
    return report(source, plan, rejected, true)
  })
}
