import { isUniqueViolation } from '../errors.js'
import { loadFilmToEnrich, loadPendingFilms, saveMovie, setStatus, type PendingFilm, type TmdbStatus } from '../models/tmdb.js'
import { TmdbError, type TmdbClient, type TmdbMovie } from './client.js'
import { chooseMatch } from './match.js'
import { tvToMovie } from './tv.js'

/** `unreachable`: TMDB or the network is having trouble, the film is unchanged. `token_rejected`: TMDB refused our token. */
export type LookupResult = 'done' | 'unreachable' | 'token_rejected' | 'no_such_film'

export interface RunOptions {
  retryErrors?: boolean
  /** Also search films again that were not found or had several matches (never films matched by hand). */
  retryUnmatched?: boolean
}

/** What the last finished run did. `stopped`: the run ended early because TMDB rejected the token or had trouble. */
export interface RunSummary {
  matched: number
  notFound: number
  ambiguous: number
  error: number
  /** Films TMDB could not be reached for (a single failure): they stay as they were. */
  unreachable: number
  stopped: 'token' | 'tmdb' | null
  /** ISO time; changes with every run, so a caller can tell a new summary from the old one. */
  finishedAt: string
}

export interface EnricherStatus {
  enabled: boolean
  /** A run is going or one more is queued. `total` and `done` count the films of the current run. */
  running: boolean
  total: number
  done: number
  lastRun: RunSummary | null
}

export interface Enricher {
  /** Starts a run in the background; resolves when it (and any follow-up run) is done. */
  trigger(options?: RunOptions): Promise<void>
  status(): EnricherStatus
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
async function enrichFilm(client: TmdbClient, film: PendingFilm): Promise<TmdbStatus> {
  const stop = async (status: TmdbStatus) => (await setStatus(film.id, status), status)
  let tmdbId = film.tmdbId
  if (tmdbId === null) {
    const match = chooseMatch(film, await client.searchMovie(film.title))
    if (match.status !== 'matched') return stop(match.status)
    tmdbId = match.tmdbId
  }
  const movie = await fetchTitle(client, film, tmdbId)
  if (!movie) return stop('not_found')
  try {
    await saveMovie(film.id, movie)
    return 'matched'
  } catch (error) {
    // another film already has this TMDB id (e.g. the same film listed twice under different links)
    if (!isUniqueViolation(error)) throw error
    return stop('ambiguous')
  }
}

/** Counts what a run does, for `status()`. */
interface Progress {
  start(total: number): void
  film(outcome: TmdbStatus | 'unchanged'): void
  finish(stopped: RunSummary['stopped']): void
}

/**
 * One pass over the films to look up. A rejected token or repeated trouble at TMDB stops the pass and leaves the
 * remaining films as they are; any other failure marks only that film as error.
 */
async function runPass(
  client: TmdbClient,
  options: RunOptions,
  delayMs: number,
  log: Log,
  exclusively: Exclusively,
  progress: Progress,
): Promise<void> {
  const films = await loadPendingFilms(options)
  progress.start(films.length)
  let transientInARow = 0
  let stopped: RunSummary['stopped'] = null
  try {
    for (const film of films) {
      try {
        // The lock is held for one film at a time, so a look-up the user asked for goes next, not after the pass
        progress.film(await exclusively(() => enrichFilm(client, film)))
        transientInARow = 0
      } catch (error) {
        if (isAuthFailure(error)) {
          stopped = 'token'
          throw error
        }
        log(`TMDB lookup failed for "${film.title}"`, error)
        if (!isTransient(error)) {
          await setStatus(film.id, 'error')
          progress.film('error')
        } else {
          progress.film('unchanged')
          if (++transientInARow >= TRANSIENT_FAILURES_BEFORE_STOP) {
            stopped = 'tmdb'
            throw error
          }
        }
      }
      if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  } finally {
    progress.finish(stopped)
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
 * are not in that run's list, so one more run follows (with the retries any request asked for).
 */
function oneAtATime(work: (options: RunOptions) => Promise<void>) {
  let running: Promise<void> | undefined
  let followUp: RunOptions | undefined

  function start(options: RunOptions): Promise<void> {
    running = work(options).then(() => {
      running = undefined
      if (!followUp) return
      const next = followUp
      followUp = undefined
      return start(next)
    })
    return running
  }

  return {
    schedule(options: RunOptions): Promise<void> {
      if (!running) return start(options)
      followUp = {
        retryErrors: Boolean(options.retryErrors || followUp?.retryErrors),
        retryUnmatched: Boolean(options.retryUnmatched || followUp?.retryUnmatched),
      }
      return running
    },
    busy: () => running !== undefined,
  }
}

export function createEnricher(
  client: TmdbClient | null,
  { delayMs = 150, log = (message, error) => console.error(message, error) }: { delayMs?: number; log?: Log } = {},
): Enricher {
  const exclusively = serially()
  let total = 0
  let done = 0
  let counts = { matched: 0, notFound: 0, ambiguous: 0, error: 0, unreachable: 0 }
  let lastRun: RunSummary | null = null
  const progress: Progress = {
    start(count) {
      total = count
      done = 0
      counts = { matched: 0, notFound: 0, ambiguous: 0, error: 0, unreachable: 0 }
    },
    film(outcome) {
      done++
      if (outcome === 'matched') counts.matched++
      else if (outcome === 'not_found') counts.notFound++
      else if (outcome === 'ambiguous') counts.ambiguous++
      else if (outcome === 'error') counts.error++
      else if (outcome === 'unchanged') counts.unreachable++
    },
    finish(stopped) {
      lastRun = { ...counts, stopped, finishedAt: new Date().toISOString() }
    },
  }
  const runs = oneAtATime((options) =>
    runPass(client!, options, delayMs, log, exclusively, progress).catch((error) =>
      log('TMDB enrichment stopped', error),
    ),
  )
  return {
    enabled: client !== null,
    trigger: (options = {}) => (client ? runs.schedule(options) : Promise.resolve()),
    status: () => ({ enabled: client !== null, running: runs.busy(), total, done, lastRun }),
    lookup: (filmId) => (client ? exclusively(() => lookupFilm(client, filmId, log)) : Promise.resolve('done')),
  }
}
