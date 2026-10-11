import type { TmdbMediaType } from './types'

export interface TmdbTitle {
  id: number
  mediaType: TmdbMediaType
}

/**
 * Reads a TMDB title from what the user pastes: the page address of a movie or a TV show, for example
 * https://www.themoviedb.org/movie/262543-joy or https://www.themoviedb.org/tv/1396, or a bare number, which
 * means a movie (TMDB numbers movies and shows separately, so a number alone cannot name a show). Returns null if there is none.
 */
export function parseTmdbTitle(text: string): TmdbTitle | null {
  const trimmed = text.trim()
  const fromUrl = /^https?:\/\/(?:www\.)?themoviedb\.org\/(movie|tv)\/(\d+)(?:[-/?#].*)?$/i.exec(trimmed)
  const mediaType = (fromUrl ? fromUrl[1]!.toLowerCase() : 'movie') as TmdbMediaType
  const digits = fromUrl ? fromUrl[2] : /^\d+$/.test(trimmed) ? trimmed : undefined
  const id = digits === undefined ? NaN : Number(digits)
  return Number.isSafeInteger(id) && id > 0 ? { id, mediaType } : null
}

export const tmdbSearchUrl = (title: string) => `https://www.themoviedb.org/search?query=${encodeURIComponent(title)}`

export const tmdbTitleUrl = (id: number, mediaType: TmdbMediaType) => `https://www.themoviedb.org/${mediaType}/${id}`
