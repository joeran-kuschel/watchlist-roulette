import type { Film } from './types'

const dateFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

/** `2025-03-12` or an ISO timestamp -> `12 Mar 2025`. */
export const formatDate = (iso: string) => dateFormat.format(new Date(iso))

export const formatRuntime = (minutes: number | null) => (minutes === null ? null : `${minutes} min`)

/** A trimmed string from a form value; `v-model` on a number input yields a number, not text. */
export const text = (value: unknown) => String(value ?? '').trim()

/** Only web links are rendered as links; the backend stores only these, this is the second line of defense. */
export function isHttpUrl(text: string) {
  try {
    return ['http:', 'https:'].includes(new URL(text).protocol)
  } catch {
    return false
  }
}

export const joinNames = (people: { name: string }[]) => people.map((p) => p.name).join(', ')

export interface Fact {
  label: string
  value: string | number
}

/** Year, runtime, rating and country of a film, without the ones it does not have. `detailed` adds the vote count. */
export function filmFacts(film: Film, detailed = false): Fact[] {
  const votes = detailed && film.voteCount ? ` (${film.voteCount.toLocaleString('en-GB')} votes)` : ''
  const facts: { label: string; value: string | number | null }[] = [
    { label: 'Year', value: film.releaseYear },
    { label: film.tmdb.mediaType === 'tv' ? 'Episode runtime' : 'Runtime', value: formatRuntime(film.runtimeMinutes) },
    {
      label: detailed ? 'TMDB rating' : 'Rating',
      value: film.voteAverage === null ? null : `${film.voteAverage.toFixed(1)} / 10${votes}`,
    },
    { label: 'Country', value: film.countries.join(', ') || null },
  ]
  return facts.filter((fact): fact is Fact => fact.value !== null && fact.value !== '')
}

/** TMDB lists the creators of a show where it lists the director of a movie. */
export const directorLabel = (film: Film) => (film.tmdb.mediaType === 'tv' ? 'Created by' : 'Directed by')
