import { describe, expect, it, vi } from 'vitest'
import { TmdbError, createTmdbClient } from '../src/tmdb/client.js'

const respond = (status: number, body: unknown = {}) =>
  vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }))

describe('createTmdbClient', () => {
  it('searches with the token in a header and the language in the URL', async () => {
    const fetchFn = respond(200, { results: [{ id: 1, title: 'Joy', original_title: 'Joy' }] })
    const results = await createTmdbClient('secret-token', 'de-DE', fetchFn).searchMovie('Joy & Co')

    expect(results).toHaveLength(1)
    const [url, init] = fetchFn.mock.calls[0]!
    expect(url).toContain('/search/movie?')
    expect(url).toContain('language=de-DE')
    expect(url).toContain('query=Joy+%26+Co')
    expect(url).not.toContain('secret-token')
    expect(init.headers.Authorization).toBe('Bearer secret-token')
  })

  it('loads a movie with its credits', async () => {
    const fetchFn = respond(200, { id: 5, genres: [], production_countries: [] })
    await createTmdbClient('t', 'en-US', fetchFn).getMovie(5)
    expect(fetchFn.mock.calls[0]![0]).toContain('/movie/5?')
    expect(fetchFn.mock.calls[0]![0]).toContain('append_to_response=credits')
  })

  it('returns null for an unknown movie', async () => {
    expect(await createTmdbClient('t', 'en-US', respond(404)).getMovie(5)).toBeNull()
  })

  it('throws a TmdbError with the status for other failures', async () => {
    await expect(createTmdbClient('t', 'en-US', respond(401)).getMovie(5)).rejects.toMatchObject({
      status: 401,
      message: 'TMDB answered 401',
    })
  })

  it('throws a TmdbError when TMDB is not reachable', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))
    await expect(createTmdbClient('t', 'en-US', fetchFn).getMovie(5)).rejects.toBeInstanceOf(TmdbError)
  })
})

describe('createTmdbClient with unexpected answers', () => {
  const raw = (body: string, status = 200) => vi.fn().mockResolvedValue(new Response(body, { status }))

  it('throws a TmdbError, not a SyntaxError, for an answer that is not JSON', async () => {
    const client = createTmdbClient('t', 'en-US', raw('<html>Bad gateway</html>'))
    await expect(client.getMovie(5)).rejects.toBeInstanceOf(TmdbError)
    await expect(client.searchMovie('Joy')).rejects.toBeInstanceOf(TmdbError)
  })

  it.each([
    ['no results field', {}],
    ['a null results field', { results: null }],
    ['a results field that is not a list', { results: { id: 1 } }],
    ['a results field that is a string', { results: 'none' }],
  ])('finds nothing for %s', async (_name, body) => {
    expect(await createTmdbClient('t', 'en-US', respond(200, body)).searchMovie('Joy')).toEqual([])
  })

  it('finds nothing when the search answers 404', async () => {
    expect(await createTmdbClient('t', 'en-US', respond(404)).searchMovie('Joy')).toEqual([])
  })

  it('throws a TmdbError with the status when the search fails', async () => {
    await expect(createTmdbClient('t', 'en-US', respond(429)).searchMovie('Joy')).rejects.toMatchObject({ status: 429 })
    await expect(createTmdbClient('t', 'en-US', respond(500)).searchMovie('Joy')).rejects.toMatchObject({ status: 500 })
  })

  it('sends a timeout signal and encodes non-ASCII and special characters in the query', async () => {
    const fetchFn = respond(200, { results: [] })
    await createTmdbClient('t', 'en-US', fetchFn).searchMovie('Amélie? #1 & 日本')
    const [url, init] = fetchFn.mock.calls[0]!
    expect(new URL(url).searchParams.get('query')).toBe('Amélie? #1 & 日本')
    expect(new URL(url).searchParams.get('include_adult')).toBe('false')
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('throws a TmdbError when the request times out', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new DOMException('The operation was aborted due to timeout', 'TimeoutError'))
    await expect(createTmdbClient('t', 'en-US', fetchFn).searchMovie('Joy')).rejects.toBeInstanceOf(TmdbError)
  })
})
