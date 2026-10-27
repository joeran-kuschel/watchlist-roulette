import { describe, expect, it } from 'vitest'
import { bigBuckBunny, elephantsDream, films } from '../../screenshots/sampleFilms'

// The sample films feed the documentation screenshots (documentation/ui/screenshots.md). sampleFilms.ts is typed as
// Film and type-checked (tsconfig.node.json); these tests cover what types cannot: unique ids, plausible values and
// the watched rule that the screenshots rely on.

describe('screenshot sample films', () => {
  it('have unique ids and titles', () => {
    expect(new Set(films.map((f) => f.id)).size).toBe(films.length)
    expect(new Set(films.map((f) => f.title)).size).toBe(films.length)
  })

  describe.each(films.map((f) => [f.title, f] as const))('%s', (_title, f) => {
    it('has a TMDB poster path, a plausible year and runtime, and an ISO added date', () => {
      expect(f.posterPath).toMatch(/^\/[A-Za-z0-9]+\.jpg$/)
      expect(f.releaseYear).toBeGreaterThanOrEqual(1888)
      expect(f.releaseYear).toBeLessThanOrEqual(new Date().getFullYear())
      expect(f.runtimeMinutes).toBeGreaterThan(0)
      expect(f.tmdb.id).toBeGreaterThan(0)
      expect(f.addedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })
  })

  it('has exactly one watched film, Elephants Dream, watched after it was added', () => {
    expect(films.filter((f) => f.watchedAt).map((f) => f.title)).toEqual([elephantsDream.title])
    expect(elephantsDream.watchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/)
    expect(Date.parse(elephantsDream.watchedAt!)).toBeGreaterThanOrEqual(Date.parse(elephantsDream.addedAt))
  })

  it('gives the film on the roulette and details pages an overview, genres and a director, and leaves it unwatched', () => {
    expect(bigBuckBunny.watchedAt).toBeNull()
    expect(bigBuckBunny.overview).toBeTruthy()
    expect(bigBuckBunny.genres.length).toBeGreaterThan(0)
    expect(bigBuckBunny.directors.length).toBeGreaterThan(0)
  })
})
