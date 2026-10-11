import { isUniqueViolation } from '../errors.js'
import { loadPendingFilms, saveMovie, setStatus, type PendingFilm } from '../models/tmdb.js'
import { TmdbError, type TmdbClient } from './client.js'
import { chooseMatch } from './match.js'

export interface Enricher {
  /** Starts a run in the background; resolves when it (and any follow-up run) is done. */
  trigger(options?: { retryErrors?: boolean }): Promise<void>
  readonly enabled: boolean
}

type Log = (message: string, error?: unknown) => void

const TRANSIENT_FAILURES_BEFORE_STOP = 3

const isAuthFailure = (error: unknown) => error instanceof TmdbError && error.status === 401
// TMDB or the network is having trouble: the film stays pending and is tried again in a later run
const isTransient = (error: unknown) =>
  error instanceof TmdbError && (error.status === undefined || error.status === 429 || error.status >= 500)

/** Looks one film up on TMDB and stores the result (or why there is none). */
async function enrichFilm(client: TmdbClient, film: PendingFilm): Promise<void> {
  let tmdbId = film.tmdbId
  if (tmdbId === null) {
    const match = chooseMatch(film, await client.searchMovie(film.title))
    if (match.status !== 'matched') return setStatus(film.id, match.status)
    tmdbId = match.tmdbId
  }
  const movie = await client.getMovie(tmdbId)
  if (!movie) return setStatus(film.id, 'not_found')
  try {
    await saveMovie(film.id, movie)
  } catch (error) {
    // another film already has this TMDB id (e.g. the same film listed twice under different links)
    if (!isUniqueViolation(error)) throw error
    await setStatus(film.id, 'ambiguous')
  }
}

/**
 * One pass over the pending films. A rejected token or repeated trouble at TMDB stops the pass and leaves the
 * remaining films pending; any other failure marks only that film as error.
 */
async function runPass(client: TmdbClient, retryErrors: boolean, delayMs: number, log: Log): Promise<void> {
  let transientInARow = 0
  for (const film of await loadPendingFilms(retryErrors)) {
    try {
      await enrichFilm(client, film)
      transientInARow = 0
    } catch (error) {
      if (isAuthFailure(error)) throw error
      log(`TMDB lookup failed for "${film.title}"`, error)
      if (!isTransient(error)) await setStatus(film.id, 'error')
      else if (++transientInARow >= TRANSIENT_FAILURES_BEFORE_STOP) throw error
    }
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs))
  }
}

/**
 * Runs `work` one at a time. A request that arrives during a run is not lost: films added or changed meanwhile
 * are not in that run's list, so one more run follows (with error retries if any request asked for them).
 */
function oneAtATime(work: (retryErrors: boolean) => Promise<void>) {
  let running: Promise<void> | undefined
  let followUp: { retryErrors: boolean } | undefined

  function start(retryErrors: boolean): Promise<void> {
    running = work(retryErrors).then(() => {
      running = undefined
      if (!followUp) return
      const next = followUp.retryErrors
      followUp = undefined
      return start(next)
    })
    return running
  }

  return (retryErrors: boolean) => {
    if (!running) return start(retryErrors)
    followUp = { retryErrors: retryErrors || (followUp?.retryErrors ?? false) }
    return running
  }
}

export function createEnricher(
  client: TmdbClient | null,
  { delayMs = 150, log = (message, error) => console.error(message, error) }: { delayMs?: number; log?: Log } = {},
): Enricher {
  const schedule = oneAtATime((retryErrors) =>
    runPass(client!, retryErrors, delayMs, log).catch((error) => log('TMDB enrichment stopped', error)),
  )
  return {
    enabled: client !== null,
    trigger: ({ retryErrors = false } = {}) => (client ? schedule(retryErrors) : Promise.resolve()),
  }
}
