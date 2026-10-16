import request from 'supertest'
import { vi } from 'vitest'
import { createApp } from '../../src/app.js'
import type { Enricher } from '../../src/tmdb/enricher.js'
import type { PosterFetcher } from '../../src/tmdb/poster.js'

export function fakeEnricher(
  enabled = true,
): Enricher & { trigger: ReturnType<typeof vi.fn>; lookup: ReturnType<typeof vi.fn> } {
  return { enabled, trigger: vi.fn().mockResolvedValue(undefined), lookup: vi.fn().mockResolvedValue('done') }
}

export function testApp(enricher: Enricher = fakeEnricher(), corsOrigin?: string, fetchPoster?: PosterFetcher) {
  return request(createApp({ enricher, corsOrigin, fetchPoster }))
}

export const HEADER = 'Date,Name,Year,Letterboxd URI\n'
