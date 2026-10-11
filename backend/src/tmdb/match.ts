import type { TmdbSearchResult } from './client.js'

export type MatchResult =
  | { status: 'matched'; tmdbId: number }
  | { status: 'ambiguous' | 'not_found' }

const normalize = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
const yearOf = (result: TmdbSearchResult) => Number(result.release_date?.slice(0, 4)) || null

/**
 * Picks the TMDB movie for a watchlist film. A result counts when its title (or original title) equals the film's
 * and its year is within one year (festival premieres differ). An exact year beats a near one; if that still leaves
 * more than one candidate, the match is ambiguous and a person decides.
 */
export function chooseMatch(film: { title: string; releaseYear: number | null }, results: TmdbSearchResult[]): MatchResult {
  const wanted = normalize(film.title)
  const candidates = results.filter((result) => {
    const sameTitle = [result.title, result.original_title].some((name) => normalize(name) === wanted)
    if (!sameTitle) return false
    const year = yearOf(result)
    return film.releaseYear === null || year === null || Math.abs(year - film.releaseYear) <= 1
  })
  if (candidates.length === 0) return { status: 'not_found' }
  const exact = candidates.filter((result) => yearOf(result) === film.releaseYear)
  const best = exact.length > 0 ? exact : candidates
  return best.length === 1 ? { status: 'matched', tmdbId: best[0]!.id } : { status: 'ambiguous' }
}
