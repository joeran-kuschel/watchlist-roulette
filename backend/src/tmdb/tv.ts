import type { TmdbMovie, TmdbTv } from './client.js'

/**
 * Maps a TMDB TV show onto the movie shape the model stores: the episode length stands in for the runtime
 * (the first one TMDB lists, if any), the creators are kept in the director role.
 */
export function tvToMovie(tv: TmdbTv): TmdbMovie {
  return {
    id: tv.id,
    title: tv.name,
    original_title: tv.original_name,
    tagline: tv.tagline,
    overview: tv.overview,
    runtime: tv.episode_run_time?.[0] ?? null,
    vote_average: tv.vote_average,
    vote_count: tv.vote_count,
    poster_path: tv.poster_path,
    backdrop_path: tv.backdrop_path,
    genres: tv.genres,
    production_countries: (tv.origin_country ?? []).map((code) => ({ iso_3166_1: code })),
    credits: {
      cast: tv.credits?.cast ?? [],
      crew: (tv.created_by ?? []).map((person) => ({ ...person, job: 'Director' })),
    },
  }
}
