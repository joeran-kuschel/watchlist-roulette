import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ApiError,
  applyImport,
  createFilm,
  deleteFilm,
  describeError,
  getFilm,
  listFilms,
  posterUrl,
  previewImport,
  randomFilm,
  updateFilm,
} from '../api'

const respond = (body: unknown, status = 200) =>
  Promise.resolve(new Response(body === undefined ? null : JSON.stringify(body), { status }))

const fetchMock = vi.fn<typeof fetch>()
vi.stubGlobal('fetch', fetchMock)

afterEach(() => fetchMock.mockReset())

describe('api requests', () => {
  it('builds the query string and skips empty values', async () => {
    fetchMock.mockReturnValue(respond({ items: [], total: 0, page: 1, pageSize: 50 }))
    await listFilms({ q: 'stalker', watched: 'false', page: 2, sort: undefined })
    expect(fetchMock).toHaveBeenCalledWith('/api/films?q=stalker&watched=false&page=2', undefined)
  })

  it('sends no query string without parameters', async () => {
    fetchMock.mockReturnValue(respond({}))
    await randomFilm()
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/films/random')
  })

  it('passes the random filters', async () => {
    fetchMock.mockReturnValue(respond({}))
    await randomFilm({ yearFrom: 1990, country: 'JP', maxRuntime: 90 })
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/films/random?yearFrom=1990&country=JP&maxRuntime=90')
  })

  it('gets one film', async () => {
    fetchMock.mockReturnValue(respond({ id: 4 }))
    expect(await getFilm(4)).toEqual({ id: 4 })
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/films/4')
  })

  it('posts and patches JSON', async () => {
    fetchMock.mockReturnValue(respond({ id: 1 }, 201))
    await createFilm({ title: 'Joy' })
    await updateFilm(1, { watched: true })
    const [create, patch] = fetchMock.mock.calls
    expect(create![1]).toMatchObject({ method: 'POST', body: '{"title":"Joy"}' })
    expect(create![1]!.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(patch![0]).toBe('/api/films/1')
    expect(patch![1]).toMatchObject({ method: 'PATCH', body: '{"watched":true}' })
  })

  it('treats 204 as success without a body', async () => {
    fetchMock.mockReturnValue(respond(undefined, 204))
    await expect(deleteFilm(3)).resolves.toBeUndefined()
    expect(fetchMock.mock.calls[0]![1]).toEqual({ method: 'DELETE' })
  })
})

describe('api errors', () => {
  it('throws an ApiError with status, message, code and issues', async () => {
    fetchMock.mockReturnValue(
      respond({ error: 'Invalid request', code: 'x', issues: [{ path: ['title'], message: 'Required' }] }, 400),
    )
    const error = await createFilm({ title: '' }).catch((e) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({
      status: 400,
      message: 'Invalid request',
      code: 'x',
      issues: [{ path: ['title'], message: 'Required' }],
    })
  })

  it('uses status 0 when the server cannot be reached', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    const error = await listFilms().catch((e) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(0)
  })

  it('copes with an error answer that is not JSON', async () => {
    fetchMock.mockReturnValue(Promise.resolve(new Response('<html>', { status: 502 })))
    const error = await listFilms().catch((e) => e)
    expect(error).toMatchObject({ status: 502, message: 'Something went wrong', issues: [] })
  })

  it('describes errors for the user', () => {
    expect(describeError(new ApiError(0, 'x'))).toMatch(/Can't reach the server/)
    expect(describeError(new ApiError(500, 'Internal server error'))).toMatch(/server had a problem/)
    expect(describeError(new ApiError(404, 'Film not found'))).toBe('Film not found')
    expect(describeError(new Error('boom'))).toBe('Something went wrong.')
  })
})

describe('import requests', () => {
  const file = new File(['a,b'], 'watchlist.csv', { type: 'text/csv' })

  it('previews with dryRun and the file as multipart field "file"', async () => {
    fetchMock.mockReturnValue(respond({ applied: false }))
    await previewImport(file)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('/api/films/import?dryRun=true')
    expect(init!.method).toBe('POST')
    expect((init!.body as FormData).get('file')).toBe(file)
    expect(init!.headers).toBeUndefined()
  })

  it('applies with the removal token and the large-removal confirmation', async () => {
    fetchMock.mockReturnValue(respond({ applied: true }))
    await applyImport(file, { removalToken: 'tok', confirmLargeRemoval: true })
    const body = fetchMock.mock.calls[0]![1]!.body as FormData
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/films/import')
    expect(body.get('removalToken')).toBe('tok')
    expect(body.get('confirmLargeRemoval')).toBe('true')
  })

  it('leaves the optional fields out when not given', async () => {
    fetchMock.mockReturnValue(respond({ applied: true }))
    await applyImport(file)
    const body = fetchMock.mock.calls[0]![1]!.body as FormData
    expect(body.has('removalToken')).toBe(false)
    expect(body.has('confirmLargeRemoval')).toBe(false)
  })
})

describe('posterUrl', () => {
  it('points at the backend, not at TMDB', () => {
    expect(posterUrl(7)).toBe('/api/films/7/poster')
  })
})
