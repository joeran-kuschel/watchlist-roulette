import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestPool } from './helpers/testDb.js'
import { testApp } from './helpers/app.js'

describe('rate limit', () => {
  beforeEach(async () => {
    await createTestPool()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('answers 429 once the budget for /health and /api is used up', async () => {
    const app = testApp(undefined, undefined, undefined, 2)
    expect((await app.get('/health')).status).toBe(200)
    expect((await app.get('/api/nothing')).status).toBe(404)
    const limited = await app.get('/health')
    expect(limited.status).toBe(429)
    expect(limited.body).toEqual({ error: 'Too many requests, try again in a minute' })
    expect((await app.get('/api/films')).status).toBe(429)
  })

  it('allows normal use with the default budget', async () => {
    const app = testApp()
    for (let i = 0; i < 30; i++) expect((await app.get('/health')).status).toBe(200)
  })

  it('answers 429 with the JSON error on write routes too', async () => {
    const app = testApp(undefined, undefined, undefined, 1)
    expect((await app.post('/api/films').send({ title: 'A' })).status).toBe(201)
    for (const res of [
      await app.post('/api/films').send({ title: 'B' }),
      await app.patch('/api/films/1').send({ title: 'C' }),
      await app.delete('/api/films/1'),
      await app.post('/api/films/import').attach('file', Buffer.from('x'), 'a.csv'),
    ]) {
      expect(res.status).toBe(429)
      expect(res.body).toEqual({ error: 'Too many requests, try again in a minute' })
    }
  })

  it('does not store a film when the request is limited', async () => {
    const app = testApp(undefined, undefined, undefined, 2)
    await app.get('/health')
    await app.get('/health')
    await app.post('/api/films').send({ title: 'Blocked' })
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.now() + 61_000)
    expect((await app.get('/api/films')).body).toEqual(expect.objectContaining({ items: [], total: 0 }))
  })

  it('serves requests again after the one-minute window', async () => {
    const app = testApp(undefined, undefined, undefined, 1)
    expect((await app.get('/health')).status).toBe(200)
    expect((await app.get('/health')).status).toBe(429)
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.now() + 61_000)
    expect((await app.get('/health')).status).toBe(200)
  })

  it('tells the client how long to wait', async () => {
    const app = testApp(undefined, undefined, undefined, 1)
    await app.get('/health')
    const limited = await app.get('/health')
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0)
    expect(Number(limited.headers['retry-after'])).toBeLessThanOrEqual(60)
    expect(limited.headers['ratelimit']).toBeDefined()
    expect(limited.headers['x-ratelimit-limit']).toBeUndefined()
  })

  it('keeps a separate budget per app instance', async () => {
    const first = testApp(undefined, undefined, undefined, 1)
    await first.get('/health')
    expect((await first.get('/health')).status).toBe(429)
    expect((await testApp(undefined, undefined, undefined, 1).get('/health')).status).toBe(200)
  })

  it('does not limit routes outside /health and /api', async () => {
    const app = testApp(undefined, undefined, undefined, 1)
    await app.get('/health')
    expect((await app.get('/elsewhere')).status).toBe(404)
    expect((await app.get('/elsewhere')).headers['ratelimit']).toBeUndefined()
  })

  it('counts requests from different X-Forwarded-For addresses against one budget', async () => {
    const app = testApp(undefined, undefined, undefined, 1)
    expect((await app.get('/health').set('X-Forwarded-For', '1.1.1.1')).status).toBe(200)
    expect((await app.get('/health').set('X-Forwarded-For', '2.2.2.2')).status).toBe(429)
  })

  describe('with CORS', () => {
    const origin = 'http://localhost:5173'

    it('sends CORS headers on a 429 so the browser can read it', async () => {
      const app = testApp(undefined, origin, undefined, 1)
      await app.get('/health').set('Origin', origin)
      const res = await app.get('/health').set('Origin', origin)
      expect(res.status).toBe(429)
      expect(res.headers['access-control-allow-origin']).toBe(origin)
    })

    it('answers a preflight request without using up the budget', async () => {
      const app = testApp(undefined, origin, undefined, 1)
      const preflight = await app
        .options('/api/films')
        .set('Origin', origin)
        .set('Access-Control-Request-Method', 'POST')
      expect(preflight.status).toBe(204)
      expect((await app.get('/health')).status).toBe(200)
    })

    it('answers 429 instead of 403 for a write from a foreign origin once the budget is gone', async () => {
      const app = testApp(undefined, origin, undefined, 2)
      const foreign = () => app.post('/api/films').set('Origin', 'http://evil.example').send({ title: 'Evil' })
      expect((await foreign()).status).toBe(403)
      expect((await foreign()).status).toBe(403)
      expect((await foreign()).status).toBe(429)
    })

    it('does not send CORS headers to a foreign origin on a 429', async () => {
      const app = testApp(undefined, origin, undefined, 1)
      await app.get('/health')
      const res = await app.get('/health').set('Origin', 'http://evil.example')
      expect(res.status).toBe(429)
      expect(res.headers['access-control-allow-origin']).toBeUndefined()
    })
  })
})
