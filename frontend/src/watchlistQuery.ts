import type { LocationQuery, LocationQueryRaw } from 'vue-router'
import type { ListParams, TmdbStatus } from './types'

/** The sort options of the watchlist screen, as one choice each. */
export const SORTS = {
  'added-desc': { label: 'Date added, newest first', sort: 'added_at', order: 'desc' },
  'added-asc': { label: 'Date added, oldest first', sort: 'added_at', order: 'asc' },
  'year-desc': { label: 'Release year, newest first', sort: 'release_year', order: 'desc' },
  'year-asc': { label: 'Release year, oldest first', sort: 'release_year', order: 'asc' },
  title: { label: 'Title, A to Z', sort: 'title', order: 'asc' },
} as const

export type SortKey = keyof typeof SORTS
export type WatchedFilter = 'all' | 'false' | 'true'

/** The TMDB status choices of the watchlist screen; the labels match the badges in the table. */
export const TMDB_FILTERS: Record<TmdbStatus, string> = {
  pending: 'Pending',
  ambiguous: 'Needs review',
  not_found: 'Not found',
  error: 'Lookup failed',
  matched: 'Matched',
}
export type TmdbFilter = 'all' | TmdbStatus

export interface WatchlistView {
  q: string
  watched: WatchedFilter
  tmdb: TmdbFilter
  sort: SortKey
  page: number
}

export const PAGE_SIZE = 50

const first = (value: LocationQuery[string] | undefined) => (Array.isArray(value) ? value[0] : value) ?? ''

/** Reads the screen's state from the URL; anything unknown falls back to the default. */
export function fromQuery(query: LocationQuery): WatchlistView {
  const watched = first(query.watched)
  const tmdb = first(query.tmdb)
  const sort = first(query.sort)
  const page = Number(first(query.page))
  return {
    q: first(query.q) ?? '',
    watched: watched === 'false' || watched === 'true' ? watched : 'all',
    tmdb: Object.prototype.hasOwnProperty.call(TMDB_FILTERS, tmdb) ? (tmdb as TmdbStatus) : 'all',
    sort: Object.prototype.hasOwnProperty.call(SORTS, sort) ? (sort as SortKey) : 'added-desc',
    page: Number.isInteger(page) && page >= 1 ? page : 1,
  }
}

/** Only non-default values go into the URL. */
export function toQuery(view: WatchlistView): LocationQueryRaw {
  return {
    q: view.q.trim() || undefined,
    watched: view.watched === 'all' ? undefined : view.watched,
    tmdb: view.tmdb === 'all' ? undefined : view.tmdb,
    sort: view.sort === 'added-desc' ? undefined : view.sort,
    page: view.page === 1 ? undefined : String(view.page),
  }
}

export function toListParams(view: WatchlistView): ListParams {
  const { sort, order } = SORTS[view.sort]
  return {
    q: view.q.trim() || undefined,
    watched: view.watched,
    tmdbStatus: view.tmdb === 'all' ? undefined : view.tmdb,
    sort,
    order,
    page: view.page,
    pageSize: PAGE_SIZE,
  }
}
