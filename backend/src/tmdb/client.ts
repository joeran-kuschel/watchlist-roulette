export interface TmdbSearchResult {
  id: number
  title: string
  original_title: string
  release_date?: string
}

export interface TmdbMovie {
  id: number
  title: string
  original_title: string
  tagline?: string
  overview?: string
  runtime?: number | null
  vote_average?: number
  vote_count?: number
  poster_path?: string | null
  backdrop_path?: string | null
  genres: { id: number; name: string }[]
  production_countries: { iso_3166_1: string }[]
  credits?: {
    cast: { id: number; name: string; order: number }[]
    crew: { id: number; name: string; job: string }[]
  }
}

/** What TMDB sends for a TV show; `tvToMovie` turns it into a `TmdbMovie`, the shape the model stores. */
export interface TmdbTv {
  id: number
  name: string
  original_name: string
  tagline?: string
  overview?: string
  episode_run_time?: number[]
  vote_average?: number
  vote_count?: number
  poster_path?: string | null
  backdrop_path?: string | null
  genres: { id: number; name: string }[]
  origin_country?: string[]
  created_by?: { id: number; name: string }[]
  credits?: { cast: { id: number; name: string; order: number }[] }
}

export type TmdbMediaType = 'movie' | 'tv'

export interface TmdbClient {
  searchMovie(title: string): Promise<TmdbSearchResult[]>
  getMovie(id: number): Promise<TmdbMovie | null>
  getTv(id: number): Promise<TmdbTv | null>
}

export class TmdbError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message)
  }
}

const BASE_URL = 'https://api.themoviedb.org/3'

/** Minimal TMDB v3 client authenticated with the API Read Access Token (sent as a bearer header, never in the URL). */
export function createTmdbClient(accessToken: string, language: string, fetchFn: typeof fetch = fetch): TmdbClient {
  async function get<T>(path: string, params: Record<string, string>): Promise<T | null> {
    const url = `${BASE_URL}${path}?${new URLSearchParams({ language, ...params })}`
    let response: Response
    try {
      response = await fetchFn(url, {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(10_000),
      })
    } catch (error) {
      throw new TmdbError(`TMDB is not reachable: ${(error as Error).message}`)
    }
    if (response.status === 404) return null
    if (!response.ok) throw new TmdbError(`TMDB answered ${response.status}`, response.status)
    try {
      return (await response.json()) as T
    } catch {
      throw new TmdbError('TMDB sent an answer that is not valid JSON')
    }
  }

  return {
    async searchMovie(title) {
      const params: Record<string, string> = { query: title, include_adult: 'false' }
      const data = await get<{ results: TmdbSearchResult[] }>('/search/movie', params)
      return Array.isArray(data?.results) ? data.results : []
    },
    getMovie: (id) => get<TmdbMovie>(`/movie/${id}`, { append_to_response: 'credits' }),
    getTv: (id) => get<TmdbTv>(`/tv/${id}`, { append_to_response: 'credits' }),
  }
}
