import request from 'supertest'
import { vi } from 'vitest'
import { createApp } from '../../src/app.js'
import type { Enricher } from '../../src/tmdb/enricher.js'

export function fakeEnricher(enabled = true): Enricher & { trigger: ReturnType<typeof vi.fn> } {
  return { enabled, trigger: vi.fn().mockResolvedValue(undefined) }
}

export function testApp(enricher: Enricher = fakeEnricher(), corsOrigin?: string) {
  return request(createApp({ enricher, corsOrigin }))
}

export const HEADER = 'Date,Name,Year,Letterboxd URI\n'
