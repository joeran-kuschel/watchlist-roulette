import cors from 'cors'
import express, { type ErrorRequestHandler, type RequestHandler } from 'express'
import { rateLimit } from 'express-rate-limit'
import multer from 'multer'
import { ZodError } from 'zod'
import { getPool } from './config/database.js'
import { HttpError, isUniqueViolation } from './errors.js'
import { filmRoutes } from './routes/films.js'
import type { Enricher } from './tmdb/enricher.js'
import { createPosterFetcher, type PosterFetcher } from './tmdb/poster.js'

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ZodError) {
    res.status(400).json({ error: 'Invalid request', issues: error.issues.map(({ path, message }) => ({ path, message })) })
  } else if (error instanceof HttpError) {
    res.status(error.status).json({ error: error.message, ...(error.details as object | undefined) })
  } else if (error instanceof multer.MulterError) {
    res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: error.message })
  } else if (isUniqueViolation(error)) {
    res.status(409).json({ error: 'A film with this Letterboxd link or TMDB id already exists' })
  } else if (error?.type === 'entity.too.large') {
    res.status(413).json({ error: 'The request body is too large' })
  } else if (error?.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'The request body is not valid JSON' })
  } else if (error?.status >= 400 && error.status < 500) {
    // other body-parser errors, e.g. 415 for an unsupported charset or encoding
    res.status(error.status).json({ error: 'The request could not be read' })
  } else {
    console.error(error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

/**
 * A page on another site can submit a form (multipart, urlencoded) to this API without a CORS preflight.
 * Writes that carry an Origin must come from an allowed origin; requests without one (curl) pass.
 */
function sameOriginWrites(origins: string[]): RequestHandler {
  return (req, res, next) => {
    const safe = ['GET', 'HEAD', 'OPTIONS'].includes(req.method)
    const origin = req.get('Origin')
    if (safe || origin === undefined || origins.includes(origin)) return next()
    res.status(403).json({ error: 'This origin is not allowed to change data' })
  }
}

export interface AppOptions {
  enricher: Enricher
  /** Loads poster images from TMDB; replaced by a fake in tests. */
  fetchPoster?: PosterFetcher
  /** Comma-separated origins allowed to call the API from a browser. Without it, none are. */
  corsOrigin?: string
  /** Requests per minute and client for `/health` and `/api`; 600 by default. */
  rateLimitPerMinute?: number
}

export function createApp({ enricher, corsOrigin, fetchPoster = createPosterFetcher(), rateLimitPerMinute = 600 }: AppOptions) {
  const app = express()
  app.disable('x-powered-by')
  const origins = corsOrigin?.split(',').map((origin) => origin.trim()).filter(Boolean) ?? []
  if (origins.length > 0) app.use(cors({ origin: origins }))
  // Behind nginx every request comes from the proxy, so this is one shared budget, which is fine for one user.
  // The X-Forwarded-For check is off because the app does not trust that header to tell clients apart.
  const limiter = rateLimit({
    windowMs: 60_000,
    limit: rateLimitPerMinute,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    validate: { xForwardedForHeader: false },
    message: { error: 'Too many requests, try again in a minute' },
  })
  app.use(['/health', '/api'], limiter)
  app.use('/api', sameOriginWrites(origins))
  app.use(express.json({ limit: '100kb' }))

  app.get('/health', async (_req, res) => {
    await getPool().query('SELECT 1')
    res.json({ status: 'ok' })
  })
  app.use('/api', filmRoutes(enricher, fetchPoster))
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' })
  })
  app.use(errorHandler)
  return app
}
