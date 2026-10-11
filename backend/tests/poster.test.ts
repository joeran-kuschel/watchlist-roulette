import type { Pool } from 'pg'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPosterFetcher, type PosterFetcher } from '../src/tmdb/poster.js'
import { testApp } from './helpers/app.js'
import { createTestPool } from './helpers/testDb.js'

const image = (type = 'image/jpeg', status = 200) =>
  new Response(Buffer.from([1, 2, 3]), { status, headers: { 'content-type': type } })

describe('createPosterFetcher', () => {
  it('loads the w500 image without credentials', async () => {
    const fetchFn = vi.fn().mockResolvedValue(image('image/jpeg; charset=binary'))
    const poster = await createPosterFetcher(fetchFn)('/abc_1-x.jpg')
    expect(poster).toEqual({ contentType: 'image/jpeg', body: Buffer.from([1, 2, 3]) })
    expect(fetchFn.mock.calls[0]![0]).toBe('https://image.tmdb.org/t/p/w500/abc_1-x.jpg')
    expect(fetchFn.mock.calls[0]![1]).not.toHaveProperty('headers')
  })

  it('returns null when TMDB has no such image', async () => {
    const fetchFn = vi.fn().mockResolvedValue(image('text/html', 404))
    expect(await createPosterFetcher(fetchFn)('/a.jpg')).toBeNull()
  })

  it.each(['/../etc.jpg', 'a.jpg', '/a.gif', '/a/b.jpg', '/a.jpg?x=1', 'https://evil.test/a.jpg', ''])(
    'never requests the path %j',
    async (path) => {
      const fetchFn = vi.fn()
      await expect(createPosterFetcher(fetchFn)(path)).rejects.toThrow('not valid')
      expect(fetchFn).not.toHaveBeenCalled()
    },
  )

  it('rejects an image larger than 2 MB', async () => {
    const big = new Response(Buffer.alloc(2 * 1024 * 1024 + 1), { headers: { 'content-type': 'image/jpeg' } })
    await expect(createPosterFetcher(vi.fn().mockResolvedValue(big))('/a.jpg')).rejects.toThrow('2 MB')
  })

  it('fails on an upstream error and on a reply that is not an image', async () => {
    await expect(createPosterFetcher(vi.fn().mockResolvedValue(image('image/jpeg', 500)))('/a.jpg')).rejects.toThrow('500')
    await expect(createPosterFetcher(vi.fn().mockResolvedValue(image('text/html')))('/a.jpg')).rejects.toThrow('not an image')
  })

  it('accepts an upper-case content type and a png', async () => {
    const poster = await createPosterFetcher(vi.fn().mockResolvedValue(image('IMAGE/PNG')))('/a.png')
    expect(poster?.contentType).toBe('image/png')
  })

  it.each(['image/svg+xml', 'image/gif', 'application/octet-stream'])('rejects the content type %s', async (type) => {
    await expect(createPosterFetcher(vi.fn().mockResolvedValue(image(type)))('/a.jpg')).rejects.toThrow('not an image')
  })

  it('rejects a reply without a content type', async () => {
    const response = new Response(null, { status: 200 })
    response.headers.delete('content-type')
    await expect(createPosterFetcher(vi.fn().mockResolvedValue(response))('/a.jpg')).rejects.toThrow('not an image')
  })

  it('passes on a network failure and sets a timeout', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new TypeError('fetch failed'))
    await expect(createPosterFetcher(fetchFn)('/a.jpg')).rejects.toThrow('fetch failed')
    expect(fetchFn.mock.calls[0]![1].signal).toBeInstanceOf(AbortSignal)
  })
})

describe('GET /api/films/:id/poster', () => {
  let pool: Pool
  beforeEach(async () => {
    pool = await createTestPool()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  const film = async (posterPath: string | null) => {
    const res = await testApp().post('/api/films').send({ title: 'Joy' })
    await pool.query('UPDATE films SET poster_path = $1 WHERE id = $2', [posterPath, res.body.id])
    return res.body.id as number
  }

  it('streams the image with its type and cache headers', async () => {
    const fetchPoster: PosterFetcher = vi.fn().mockResolvedValue({ contentType: 'image/png', body: Buffer.from([9, 8]) })
    const id = await film('/p.png')
    const res = await testApp(undefined, undefined, fetchPoster).get(`/api/films/${id}/poster`)
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toBe('image/png')
    expect(res.headers['cache-control']).toBe('public, max-age=3600')
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(res.body).toEqual(Buffer.from([9, 8]))
    expect(fetchPoster).toHaveBeenCalledWith('/p.png')
  })

  it('answers 404 for an unknown film and for a film without a poster', async () => {
    const fetchPoster = vi.fn()
    expect((await testApp(undefined, undefined, fetchPoster).get('/api/films/999/poster')).status).toBe(404)
    const id = await film(null)
    expect((await testApp(undefined, undefined, fetchPoster).get(`/api/films/${id}/poster`)).status).toBe(404)
    expect(fetchPoster).not.toHaveBeenCalled()
  })

  it('answers 404 when TMDB has no image', async () => {
    const id = await film('/p.jpg')
    const res = await testApp(undefined, undefined, vi.fn().mockResolvedValue(null)).get(`/api/films/${id}/poster`)
    expect(res.status).toBe(404)
  })

  it('answers 502 when TMDB fails', async () => {
    const id = await film('/p.jpg')
    const res = await testApp(undefined, undefined, vi.fn().mockRejectedValue(new Error('down'))).get(`/api/films/${id}/poster`)
    expect(res.status).toBe(502)
    expect(res.body.error).toBe('The poster could not be loaded')
  })

  it('answers 400 for an id that is not a number', async () => {
    expect((await testApp().get('/api/films/abc/poster')).status).toBe(400)
  })

  it('answers 502 and does not call TMDB when the stored path is invalid', async () => {
    const id = await film('/../x.jpg')
    const fetchFn = vi.fn()
    const res = await testApp(undefined, undefined, createPosterFetcher(fetchFn)).get(`/api/films/${id}/poster`)
    expect(res.status).toBe(502)
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('does not treat "random" as a film id', async () => {
    const fetchPoster = vi.fn()
    const res = await testApp(undefined, undefined, fetchPoster).get('/api/films/random/poster')
    expect(res.status).toBe(400)
    expect(fetchPoster).not.toHaveBeenCalled()
  })

  it('serves a poster for a watched film', async () => {
    const id = await film('/p.jpg')
    await pool.query('UPDATE films SET watched_at = now() WHERE id = $1', [id])
    const fetchPoster = vi.fn().mockResolvedValue({ contentType: 'image/jpeg', body: Buffer.from([1]) })
    expect((await testApp(undefined, undefined, fetchPoster).get(`/api/films/${id}/poster`)).status).toBe(200)
  })
})
