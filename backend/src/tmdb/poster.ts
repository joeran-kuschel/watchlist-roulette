const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w500'
// TMDB poster paths look like "/abc123.jpg"; anything else is never sent upstream.
const POSTER_PATH = /^\/[A-Za-z0-9_-]+\.(jpg|png)$/
const MAX_BYTES = 2 * 1024 * 1024
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png'])

export interface Poster {
  contentType: string
  body: Buffer
}

export type PosterFetcher = (posterPath: string) => Promise<Poster | null>

/** Loads a poster from TMDB's image server. Images need no token, so none is sent. `null` means TMDB has no such image. */
export function createPosterFetcher(fetchFn: typeof fetch = fetch): PosterFetcher {
  return async (posterPath) => {
    if (!POSTER_PATH.test(posterPath)) throw new Error('The stored poster path is not valid')
    const response = await fetchFn(`${IMAGE_BASE_URL}${posterPath}`, { signal: AbortSignal.timeout(10_000) })
    if (response.status === 404) return null
    if (!response.ok) throw new Error(`TMDB answered ${response.status}`)
    const contentType = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? ''
    if (!IMAGE_TYPES.has(contentType)) throw new Error('TMDB sent something that is not an image')
    const body = Buffer.from(await response.arrayBuffer())
    if (body.length > MAX_BYTES) throw new Error('The poster is larger than 2 MB')
    return { contentType, body }
  }
}
