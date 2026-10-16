import { isUniqueViolation } from '../errors.js'
import { loadFilmToEnrich, loadPendingFilms, saveMovie, setStatus, type PendingFilm } from '../models/tmdb.js'
import { TmdbError, type TmdbClient, type TmdbMovie } from './client.js'
import { chooseMatch } from './match.js'
import { tvToMovie } from './tv.js'

/** `unreachable`: TMDB or the network is having trouble, the film is unchanged. `token_rejected`: TMDB refused our token. */
export type LookupResult = 'done' | 'unreachable' | 'token_rejected' | 'no_such_film'

export interface Enricher {
  /** Starts a run in the background; resolves when it (and any follow-up run) is done. */
  trigger(options?: { retryErrors?: boolean }): Promise<void>
  /** Looks one film up now, between two films of a running pass; resolves when it is done. Needs `enabled`. */
  lookup(filmId: number): Promise<LookupResult>
  readonly enabled: boolean
}

type Log = (message: string, error?: unknown) => void

const TRANSIENT_FAILURES_BEFORE_STOP = 3

const isAuthFailure = (error: unknown) => error instanceof TmdbError && error.status === 401
// TMDB or the network is having trouble: the film stays pending and is tried again in a later run
const isTransient = (error: unknown) =>
  error instanceof TmdbError && (error.status === undefined || error.status === 429 || error.status >= 500)

async function fetchTitle(client: TmdbClient, film: PendingFilm, tmdbId: number): Promise<TmdbMovie | null> {
  if (film.mediaType === 'movie') return client.getMovie(tmdbId)
  const show = await client.getTv(tmdbId)
  return show && tvToMovie(show)
}

/** Looks one film up on TMDB and stores the result (or why there is none). Only movies are searched by title. */
async function enrichFilm(client: TmdbClient, film: PendingFilm): Promise<void> {
  let tmdbId = film.tmdbId
  if (tmdbId === null) {
    const match = chooseMatch(film, await client.searchMovie(film.title))
    if (match.status !== 'matched') return setStatus(film.id, match.status)
    tmdbId = match.tmdbId
  }
  const movie = await fetchTitle(client, film, tmdbId)
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
async function runPass(
  client: TmdbClient,
  retryErrors: boolean,
  delayMs: number,
  log: Log,
  exclusively: Exclusively,
): Promise<void> {
  let transientInARow = 0
  for (const film of await loadPendingFilms(retryErrors)) {
    try {
      // The lock is held for one film at a time, so a look-up the user asked for goes next, not after the pass
      await exclusively(() => enrichFilm(client, film))
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

/** Looks up a single film the user asked for. Unlike a pass it reports a failure instead of only logging it. */
async function lookupFilm(client: TmdbClient, filmId: number, log: Log): Promise<LookupResult> {
  const film = await loadFilmToEnrich(filmId)
  if (!film) return 'no_such_film'
  try {
    await enrichFilm(client, film)
  } catch (error) {
    if (isAuthFailure(error)) return 'token_rejected'
    log(`TMDB lookup failed for "${film.title}"`, error)
    if (isTransient(error)) return 'unreachable'
    await setStatus(film.id, 'error')
  }
  return 'done'
}

/** A lock: tasks run strictly one after another, in the order they were asked for. */
type Exclusively = <T>(task: () => Promise<T>) => Promise<T>

function serially(): Exclusively {
  let tail: Promise<unknown> = Promise.resolve()
  return (task) => {
    const result = tail.then(task)
    tail = result.catch(() => undefined)
    return result
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
  const exclusively = serially()
  const schedule = oneAtATime((retryErrors) =>
    runPass(client!, retryErrors, delayMs, log, exclusively).catch((error) => log('TMDB enrichment stopped', error)),
  )
  return {
    enabled: client !== null,
    trigger: ({ retryErrors = false } = {}) => (client ? schedule(retryErrors) : Promise.resolve()),
    lookup: (filmId) => (client ? exclusively(() => lookupFilm(client, filmId, log)) : Promise.resolve('done')),
  }
}
