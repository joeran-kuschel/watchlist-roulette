import type { Pool } from 'pg'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestPool } from './helpers/testDb.js'
import { fakeEnricher, testApp } from './helpers/app.js'

let pool: Pool
beforeEach(async () => {
  pool = await createTestPool()
})

const add = (title: string, extra: object = {}) => testApp().post('/api/films').send({ title, ...extra })

describe('POST /api/films', () => {
  it('creates a film', async () => {
    const res = await add('Joy', { releaseYear: 2015, letterboxdUrl: 'https://boxd.it/1', addedAt: '2020-01-12' })
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ title: 'Joy', releaseYear: 2015, addedAt: '2020-01-12', watchedAt: null })
  })

  it.each([
    ['a blank title', { title: '  ' }],
    ['an unknown field', { title: 'A', watched: true }],
    ['a year out of range', { title: 'A', releaseYear: 1500 }],
    ['a javascript: link', { title: 'A', letterboxdUrl: 'javascript:alert(1)' }],
    ['an impossible date', { title: 'A', addedAt: '2020-02-30' }],
  ])('answers 400 for %s', async (_name, body) => {
    const res = await testApp().post('/api/films').send(body)
    expect(res.status).toBe(400)
    expect(res.body.issues.length).toBeGreaterThan(0)
  })

  it('answers 409 for a link that already exists', async () => {
    await add('Joy', { letterboxdUrl: 'https://boxd.it/1' })
    const res = await add('Other', { letterboxdUrl: 'https://boxd.it/1' })
    expect(res.status).toBe(409)
  })

  it('answers 400 for a body that is not JSON', async () => {
    const res = await testApp().post('/api/films').set('Content-Type', 'application/json').send('{nope')
    expect(res.status).toBe(400)
  })
})

describe('GET /api/films', () => {
  it('lists films with paging info and applies the query', async () => {
    await add('Alpha')
    await add('Beta')
    const res = await testApp().get('/api/films?q=alp&pageSize=10')
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ total: 1, page: 1, pageSize: 10 })
    expect(res.body.items[0].title).toBe('Alpha')
  })

  it.each(['pending', 'matched', 'ambiguous', 'not_found', 'error'])('accepts tmdbStatus=%s and filters by it', async (status) => {
    const { id } = (await add('Tagged')).body
    await add('Other')
    await pool.query(`UPDATE films SET tmdb_status = $1 WHERE id = $2`, [status, id])
    const res = await testApp().get(`/api/films?tmdbStatus=${status}`)
    expect(res.status).toBe(200)
    expect(res.body.items.map((f: { title: string }) => f.title)).toContain('Tagged')
    expect(res.body.items.every((f: { tmdb: { status: string } }) => f.tmdb.status === status)).toBe(true)
  })

  it('answers 400 for an unknown tmdbStatus', async () => {
    expect((await testApp().get('/api/films?tmdbStatus=nope')).status).toBe(400)
    expect((await testApp().get('/api/films?tmdbStatus=')).status).toBe(400)
  })

  it('answers 400 for an invalid query', async () => {
    expect((await testApp().get('/api/films?sort=password')).status).toBe(400)
    expect((await testApp().get('/api/films?pageSize=5000')).status).toBe(400)
  })
})

describe('GET /api/films/:id', () => {
  it('answers 404 for an unknown film and 400 for a bad id', async () => {
    expect((await testApp().get('/api/films/999')).status).toBe(404)
    expect((await testApp().get('/api/films/abc')).status).toBe(400)
  })
})

describe('PATCH /api/films/:id', () => {
  it('edits a film and marks it watched', async () => {
    const { id } = (await add('Joy')).body
    const res = await testApp().patch(`/api/films/${id}`).send({ title: 'Joy!', watched: true })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ title: 'Joy!' })
    expect(res.body.watchedAt).not.toBeNull()
  })

  it('answers 400 for an empty patch and 404 for an unknown film', async () => {
    const { id } = (await add('Joy')).body
    expect((await testApp().patch(`/api/films/${id}`).send({})).status).toBe(400)
    expect((await testApp().patch('/api/films/999').send({ title: 'x' })).status).toBe(404)
  })

  it('sets a TMDB id and starts the enrichment', async () => {
    const enricher = fakeEnricher()
    const { id } = (await add('Joy')).body
    const res = await testApp(enricher).patch(`/api/films/${id}`).send({ tmdbId: 262543 })
    expect(res.body.tmdb).toMatchObject({ id: 262543, status: 'pending' })
    expect(enricher.trigger).toHaveBeenCalled()
  })

  it('does not start the enrichment for other changes', async () => {
    const enricher = fakeEnricher()
    const { id } = (await add('Joy')).body
    await testApp(enricher).patch(`/api/films/${id}`).send({ title: 'x' })
    expect(enricher.trigger).not.toHaveBeenCalled()
  })

  it('answers 409 when another film has the TMDB id', async () => {
    const a = (await add('A')).body
    const b = (await add('B')).body
    await testApp().patch(`/api/films/${a.id}`).send({ tmdbId: 5 })
    expect((await testApp().patch(`/api/films/${b.id}`).send({ tmdbId: 5 })).status).toBe(409)
  })
})

describe('DELETE /api/films/:id', () => {
  it('deletes a film with 204 and then answers 404', async () => {
    const { id } = (await add('Joy')).body
    expect((await testApp().delete(`/api/films/${id}`)).status).toBe(204)
    expect((await testApp().delete(`/api/films/${id}`)).status).toBe(404)
  })
})

describe('GET /api/films/random', () => {
  it('returns an unwatched film', async () => {
    await add('Joy')
    const res = await testApp().get('/api/films/random')
    expect(res.body.title).toBe('Joy')
  })

  it('answers 404 with a message when nothing matches', async () => {
    const res = await testApp().get('/api/films/random')
    expect(res.status).toBe(404)
    expect(res.body.error).toMatch(/No unwatched film/)
  })

  it('answers 400 for bad filters', async () => {
    expect((await testApp().get('/api/films/random?country=USA')).status).toBe(400)
    expect((await testApp().get('/api/films/random?yearFrom=abc')).status).toBe(400)
  })

  it('is not mistaken for a film id', async () => {
    expect((await testApp().get('/api/films/random')).status).not.toBe(400)
  })
})

describe('POST /api/tmdb/sync', () => {
  it('starts a run that retries errors', async () => {
    const enricher = fakeEnricher()
    const res = await testApp(enricher).post('/api/tmdb/sync')
    expect(res.status).toBe(202)
    expect(enricher.trigger).toHaveBeenCalledWith({ retryErrors: true })
  })

  it('answers 503 when TMDB is not configured', async () => {
    expect((await testApp(fakeEnricher(false)).post('/api/tmdb/sync')).status).toBe(503)
  })
})

describe('app', () => {
  it('answers /health when the database works', async () => {
    expect((await testApp().get('/health')).body).toEqual({ status: 'ok' })
  })

  it('answers 404 JSON for unknown API paths', async () => {
    const res = await testApp().get('/api/nope')
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'Not found' })
  })

  it('hides internal errors behind a 500', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { getPool } = await import('../src/config/database.js')
    vi.spyOn(getPool(), 'query').mockRejectedValueOnce(new Error('secret connection string'))
    const res = await testApp().get('/health')
    expect(res.status).toBe(500)
    expect(JSON.stringify(res.body)).not.toContain('secret')
    spy.mockRestore()
  })

  it('allows only the configured CORS origins', async () => {
    const allowed = await testApp(fakeEnricher(), 'http://localhost:5173').get('/health').set('Origin', 'http://localhost:5173')
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173')
    const other = await testApp(fakeEnricher(), 'http://localhost:5173').get('/health').set('Origin', 'http://evil.example')
    expect(other.headers['access-control-allow-origin']).toBeUndefined()
    const none = await testApp().get('/health').set('Origin', 'http://localhost:5173')
    expect(none.headers['access-control-allow-origin']).toBeUndefined()
  })
})

describe('dates', () => {
  it.each(['2020-13-01', '2020-00-10', '2020-04-31', '2021-02-29', 'yesterday', ''])('answers 400, not 500, for the date %s', async (addedAt) => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await add('A', { addedAt })
    spy.mockRestore()
    expect(res.status).toBe(400)
  })

  it('accepts 29 February in a leap year', async () => {
    expect((await add('A', { addedAt: '2020-02-29' })).status).toBe(201)
  })
})

describe('PATCH /api/films/:id edge cases', () => {
  const patch = (id: number | string, body: object) => testApp().patch(`/api/films/${id}`).send(body)

  it.each([
    ['title', { title: null }],
    ['watched', { watched: null }],
    ['addedAt', { addedAt: null }],
    ['tmdbId', { tmdbId: null }],
    ['a blank title', { title: '   ' }],
    ['a title above 500 characters', { title: 'x'.repeat(501) }],
    ['a non-boolean watched', { watched: 'yes' }],
    ['a zero TMDB id', { tmdbId: 0 }],
    ['a negative TMDB id', { tmdbId: -3 }],
    ['a fractional TMDB id', { tmdbId: 1.5 }],
    ['an unknown field', { title: 'x', id: 7 }],
    ['a non-http link', { letterboxdUrl: 'ftp://boxd.it/1' }],
  ])('answers 400 for %s and changes nothing', async (_name, body) => {
    const { id } = (await add('Joy', { releaseYear: 2015 })).body
    expect((await patch(id, body)).status).toBe(400)
    expect((await testApp().get(`/api/films/${id}`)).body).toMatchObject({ title: 'Joy', releaseYear: 2015 })
  })

  it('clears the year and the link with null', async () => {
    const { id } = (await add('Joy', { releaseYear: 2015, letterboxdUrl: 'https://boxd.it/1' })).body
    const res = await patch(id, { releaseYear: null, letterboxdUrl: null })
    expect(res.body).toMatchObject({ releaseYear: null, letterboxdUrl: null })
  })

  it('applies a TMDB id together with other fields', async () => {
    const enricher = fakeEnricher()
    const { id } = (await add('Joy')).body
    const res = await testApp(enricher).patch(`/api/films/${id}`).send({ tmdbId: 7, title: 'Joy!', watched: true })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ title: 'Joy!', tmdb: { id: 7, status: 'pending' } })
    expect(res.body.watchedAt).not.toBeNull()
    expect(enricher.trigger).toHaveBeenCalledTimes(1)
  })

  it('does not start the enrichment when the patch is refused', async () => {
    const enricher = fakeEnricher()
    const a = (await add('A')).body
    const b = (await add('B')).body
    await patch(a.id, { tmdbId: 5 })
    await testApp(enricher).patch(`/api/films/${b.id}`).send({ tmdbId: 5 })
    await testApp(enricher).patch(`/api/films/${b.id}`).send({ tmdbId: 6, unknown: 1 })
    expect(enricher.trigger).not.toHaveBeenCalled()
  })

  it('does not change the film when the TMDB id is taken (other fields of the same patch included)', async () => {
    const a = (await add('A')).body
    const b = (await add('B')).body
    await patch(a.id, { tmdbId: 5 })
    expect((await patch(b.id, { tmdbId: 5, title: 'B2' })).status).toBe(409)
    expect((await testApp().get(`/api/films/${b.id}`)).body.title).toBe('B')
  })

  it('answers 409 when the new link belongs to another film', async () => {
    await add('A', { letterboxdUrl: 'https://boxd.it/1' })
    const b = (await add('B', { letterboxdUrl: 'https://boxd.it/2' })).body
    expect((await patch(b.id, { letterboxdUrl: 'https://boxd.it/1' })).status).toBe(409)
  })

  it('un-watches a film and keeps the first watched date when watched is sent twice', async () => {
    const { id } = (await add('Joy')).body
    const first = (await patch(id, { watched: true })).body.watchedAt
    expect((await patch(id, { watched: true })).body.watchedAt).toBe(first)
    expect((await patch(id, { watched: false })).body.watchedAt).toBeNull()
  })

  it.each(['0', '-1', '1.5', 'abc'])('answers 400 for the id %s', async (id) => {
    expect((await patch(id, { title: 'x' })).status).toBe(400)
  })

  it('answers 400 for a request without a body', async () => {
    const { id } = (await add('Joy')).body
    expect((await testApp().patch(`/api/films/${id}`)).status).toBe(400)
  })
})

describe('request body limits', () => {
  it('answers 413, not 500, for a JSON body above the limit', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await add('A', { overview: 'x'.repeat(200 * 1024) })
    spy.mockRestore()
    expect(res.status).toBe(413)
  })
})

describe('GET /api/films paging and filters', () => {
  const ids = (res: { body: { items: { id: number }[] } }) => res.body.items.map((f) => f.id)

  it('returns an empty page, with the total, beyond the last page', async () => {
    await add('A')
    await add('B')
    const res = await testApp().get('/api/films?page=3&pageSize=2')
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ items: [], total: 2, page: 3, pageSize: 2 })
  })

  it.each([
    ['release_year', 'asc'],
    ['release_year', 'desc'],
    ['title', 'asc'],
    ['added_at', 'desc'],
  ])('shows every film exactly once when paging through ties sorted by %s %s', async (sort, order) => {
    for (let i = 0; i < 7; i++) {
      await add(`Same`, { releaseYear: i < 4 ? 2000 : null, addedAt: '2020-01-01' })
    }
    const seen: number[] = []
    for (let page = 1; page <= 4; page++) {
      seen.push(...ids(await testApp().get(`/api/films?sort=${sort}&order=${order}&page=${page}&pageSize=2`)))
    }
    expect(seen).toHaveLength(7)
    expect(new Set(seen).size).toBe(7)
  })

  it('puts films without a year last in both directions', async () => {
    await add('None')
    await add('Old', { releaseYear: 1950 })
    await add('New', { releaseYear: 2020 })
    const title = (order: string) =>
      testApp().get(`/api/films?sort=release_year&order=${order}`).then((r) => r.body.items.map((f: { title: string }) => f.title))
    expect(await title('asc')).toEqual(['Old', 'New', 'None'])
    expect(await title('desc')).toEqual(['New', 'Old', 'None'])
  })

  it('counts only the films that match when filters are combined', async () => {
    const a = (await add('Alpha one')).body
    await add('Alpha two')
    await add('Beta')
    await testApp().patch(`/api/films/${a.id}`).send({ watched: true })
    const res = await testApp().get('/api/films?q=alpha&watched=false&tmdbStatus=pending&pageSize=1')
    expect(res.body).toMatchObject({ total: 1 })
    expect(res.body.items[0].title).toBe('Alpha two')
  })

  it('answers 400 for a search text above 200 characters and for a repeated parameter', async () => {
    expect((await testApp().get(`/api/films?q=${'x'.repeat(201)}`)).status).toBe(400)
    expect((await testApp().get('/api/films?watched=true&watched=false')).status).toBe(400)
  })
})

describe('GET /api/films/random with combined filters', () => {
  const setup = async () => {
    const film = async (title: string, year: number | null, runtime: number | null, countries: string[]) => {
      const { id } = (await add(title, year === null ? {} : { releaseYear: year })).body
      await pool.query(`UPDATE films SET runtime_minutes = $1, countries = $2 WHERE id = $3`, [runtime, countries, id])
      return id as number
    }
    await film('Short US 1990', 1990, 80, ['US'])
    await film('Long US 2000', 2000, 180, ['US'])
    await film('Short FR 2000', 2000, 90, ['FR'])
    await film('Unknown', null, null, [])
  }
  const titles = async (query: string) => {
    const seen = new Set<string>()
    for (let i = 0; i < 40; i++) {
      const res = await testApp().get(`/api/films/random?${query}`)
      if (res.status === 200) seen.add(res.body.title)
    }
    return [...seen].sort()
  }

  it('only picks films that satisfy every filter', async () => {
    await setup()
    expect(await titles('yearFrom=2000&yearTo=2000&country=us&maxRuntime=200')).toEqual(['Long US 2000'])
    expect(await titles('yearFrom=1990&maxRuntime=100')).toEqual(['Short FR 2000', 'Short US 1990'])
  })

  it('accepts a lower-case country code and leaves out films without a year when a year filter is set', async () => {
    await setup()
    expect(await titles('country=fr')).toEqual(['Short FR 2000'])
    expect(await titles('yearTo=2100')).not.toContain('Unknown')
  })

  it('answers 404 with the no-match message when yearFrom is after yearTo', async () => {
    await setup()
    const res = await testApp().get('/api/films/random?yearFrom=2010&yearTo=1990')
    expect(res.status).toBe(404)
    expect(res.body.error).toMatch(/No unwatched film/)
  })

  it('answers 404 when the only matching film is watched', async () => {
    await setup()
    await pool.query(`UPDATE films SET watched_at = now() WHERE title = 'Long US 2000'`)
    expect((await testApp().get('/api/films/random?yearFrom=2000&country=US&maxRuntime=200')).status).toBe(404)
  })

  it.each(['yearFrom=1700', 'yearTo=2200', 'maxRuntime=0', 'maxRuntime=-5', 'genre=abc', 'country=U'])(
    'answers 400 for %s',
    async (query) => {
      expect((await testApp().get(`/api/films/random?${query}`)).status).toBe(400)
    },
  )
})

describe('CORS', () => {
  const origin = (list: string | undefined, from: string) =>
    testApp(fakeEnricher(), list).get('/health').set('Origin', from).then((r) => r.headers['access-control-allow-origin'])

  it('allows every origin of a comma-separated list, with spaces around the commas', async () => {
    const list = 'http://localhost:5173 , http://localhost:8080,'
    expect(await origin(list, 'http://localhost:5173')).toBe('http://localhost:5173')
    expect(await origin(list, 'http://localhost:8080')).toBe('http://localhost:8080')
    expect(await origin(list, 'http://localhost:9999')).toBeUndefined()
  })

  it('allows no origin for an empty or blank list', async () => {
    expect(await origin('', 'http://localhost:5173')).toBeUndefined()
    expect(await origin(' , ', 'http://localhost:5173')).toBeUndefined()
  })

  it('does not allow a different scheme or port of an allowed origin', async () => {
    expect(await origin('http://localhost:5173', 'https://localhost:5173')).toBeUndefined()
    expect(await origin('http://localhost:5173', 'http://localhost:51730')).toBeUndefined()
  })

  it('answers the preflight of a PATCH and a DELETE', async () => {
    for (const method of ['PATCH', 'DELETE']) {
      const res = await testApp(fakeEnricher(), 'http://localhost:5173')
        .options('/api/films/1')
        .set('Origin', 'http://localhost:5173')
        .set('Access-Control-Request-Method', method)
        .set('Access-Control-Request-Headers', 'content-type')
      expect(res.status).toBe(204)
      expect(res.headers['access-control-allow-methods']).toContain(method)
    }
  })
})

describe('cross-site writes', () => {
  const app = (origin = 'http://localhost:8080') => testApp(fakeEnricher(), origin)

  it('rejects a write from a page on another origin with 403 and changes nothing', async () => {
    const res = await app().post('/api/films').set('Origin', 'http://evil.example').send({ title: 'Evil' })
    expect(res.status).toBe(403)
    expect((await testApp().get('/api/films')).body.total).toBe(0)
  })

  it('rejects a cross-site multipart import, which needs no CORS preflight', async () => {
    const res = await app()
      .post('/api/films/import')
      .set('Origin', 'http://evil.example')
      .attach('file', Buffer.from('Date,Name,Year,Letterboxd URI\n'), 'w.csv')
    expect(res.status).toBe(403)
  })

  it.each(['patch', 'delete'] as const)('rejects %s from another origin', async (method) => {
    const res = await app()[method]('/api/films/1').set('Origin', 'http://evil.example').send({ title: 'x' })
    expect(res.status).toBe(403)
  })

  it('allows writes from the configured origin and from clients without an Origin', async () => {
    expect((await app().post('/api/films').set('Origin', 'http://localhost:8080').send({ title: 'A' })).status).toBe(201)
    expect((await testApp().post('/api/films').send({ title: 'B' })).status).toBe(201)
  })

  it('rejects every write with an Origin when no origin is configured', async () => {
    const res = await testApp().post('/api/films').set('Origin', 'http://localhost:8080').send({ title: 'A' })
    expect(res.status).toBe(403)
  })

  it('still allows reads from any origin (the browser keeps the answer unreadable)', async () => {
    expect((await app().get('/api/films').set('Origin', 'http://evil.example')).status).toBe(200)
  })
})

describe('body errors', () => {
  it('answers 415 for an unsupported charset instead of 500', async () => {
    const res = await testApp()
      .post('/api/films')
      .set('Content-Type', 'application/json; charset=klingon')
      .send('{"title":"A"}')
    expect(res.status).toBe(415)
  })
})
