export type TmdbMediaType = 'movie' | 'tv'

export type TmdbStatus = 'pending' | 'matched' | 'ambiguous' | 'not_found' | 'error'

export interface Named {
  id: number
  name: string
}

export interface Film {
  id: number
  title: string
  releaseYear: number | null
  letterboxdUrl: string | null
  addedAt: string
  watchedAt: string | null
  tmdb: { id: number | null; mediaType: TmdbMediaType; status: TmdbStatus; syncedAt: string | null }
  originalTitle: string | null
  tagline: string | null
  overview: string | null
  runtimeMinutes: number | null
  voteAverage: number | null
  voteCount: number | null
  posterPath: string | null
  backdropPath: string | null
  countries: string[]
  genres: Named[]
  directors: Named[]
  cast: Named[]
}

export interface FilmPage {
  items: Film[]
  total: number
  page: number
  pageSize: number
}

export interface ListParams {
  q?: string
  watched?: 'true' | 'false' | 'all'
  tmdbStatus?: TmdbStatus
  sort?: 'added_at' | 'release_year' | 'title'
  order?: 'asc' | 'desc'
  page?: number
  pageSize?: number
}

export interface RandomParams {
  yearFrom?: number
  yearTo?: number
  genre?: number
  country?: string
  maxRuntime?: number
}

export interface FilmInput {
  title: string
  releaseYear?: number | null
  letterboxdUrl?: string | null
  addedAt?: string
}

export interface FilmPatch extends Partial<FilmInput> {
  watched?: boolean
  tmdbId?: number
  tmdbMediaType?: TmdbMediaType
}

export interface ImportedFilmRef {
  id: number
  title: string
  releaseYear: number | null
}

export interface ImportReport {
  applied: boolean
  inserted: number
  updated: number
  unchanged: number
  removed: ImportedFilmRef[]
  keptWatched: ImportedFilmRef[]
  rejected: { line: number; reason: string }[]
  removalToken?: string
  requiresLargeRemovalConfirmation: boolean
}

export interface ApplyImportOptions {
  removalToken?: string
  confirmLargeRemoval?: boolean
}
