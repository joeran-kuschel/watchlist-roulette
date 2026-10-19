import request from 'supertest'
import { vi } from 'vitest'
import { createApp } from '../../src/app.js'
import type { Enricher } from '../../src/tmdb/enricher.js'
import type { PosterFetcher } from '../../src/tmdb/poster.js'

export function fakeEnricher(
  enabled = true,
): Enricher & { trigger: ReturnType<typeof vi.fn>; lookup: ReturnType<typeof vi.fn>; status: ReturnType<typeof vi.fn> } {
  return { enabled, trigger: vi.fn().mockResolvedValue(undefined), lookup: vi.fn().mockResolvedValue('done'),
    status: vi.fn().mockReturnValue({ enabled, running: false, total: 0, done: 0, lastRun: null }),
  }
}

export function testApp(enricher: Enricher = fakeEnricher(), corsOrigin?: string, fetchPoster?: PosterFetcher, rateLimitPerMinute?: number) {
  return request(createApp({ enricher, corsOrigin, fetchPoster, rateLimitPerMinute }))
}

export const HEADER = 'Date,Name,Year,Letterboxd URI\n'
