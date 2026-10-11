/**
 * Reads a TMDB movie id from what the user pastes: the number itself or the movie's page address,
 * for example https://www.themoviedb.org/movie/262543-joy. Returns null if there is none.
 */
export function parseTmdbId(text: string): number | null {
  const trimmed = text.trim()
  const match = /^\d+$/.test(trimmed)
    ? trimmed
    : /^https?:\/\/(?:www\.)?themoviedb\.org\/movie\/(\d+)(?:[-/?#].*)?$/i.exec(trimmed)?.[1]
  const id = match === undefined ? NaN : Number(match)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

export const tmdbSearchUrl = (title: string) =>
  `https://www.themoviedb.org/search/movie?query=${encodeURIComponent(title)}`

export const tmdbMovieUrl = (id: number) => `https://www.themoviedb.org/movie/${id}`
