import type { Request, Response } from 'express'
import { HttpError, notFound } from '../errors.js'
import * as films from '../models/film.js'
import type { Enricher } from '../tmdb/enricher.js'
import type { PosterFetcher } from '../tmdb/poster.js'
import {
  filmCreateSchema,
  filmPatchSchema,
  idParamSchema,
  listQuerySchema,
  randomQuerySchema,
  syncBodySchema,
} from '../validation.js'

// Tells the UI that the message is a sentence for the user, not a reply from a proxy in front of the API
const TMDB_UNAVAILABLE = { code: 'tmdb_unavailable' }

export const list = async (req: Request, res: Response) => {
  res.json(await films.listFilms(listQuerySchema.parse(req.query)))
}

export const random = async (req: Request, res: Response) => {
  res.json(await films.randomFilm(randomQuerySchema.parse(req.query)))
}

export const get = async (req: Request, res: Response) => {
  res.json(await films.getFilm(idParamSchema.parse(req.params).id))
}

export const poster = (fetchPoster: PosterFetcher) => async (req: Request, res: Response) => {
  const { posterPath } = await films.getFilm(idParamSchema.parse(req.params).id)
  if (!posterPath) throw notFound('Poster')
  let image
  try {
    image = await fetchPoster(posterPath)
  } catch (error) {
    console.error('Poster could not be loaded:', (error as Error).message)
    throw new HttpError(502, 'The poster could not be loaded')
  }
  if (!image) throw notFound('Poster')
  res
    .set({ 'Content-Type': image.contentType, 'Cache-Control': 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff' })
    .send(image.body)
}

export const create = async (req: Request, res: Response) => {
  res.status(201).json(await films.createFilm(filmCreateSchema.parse(req.body)))
}

export const update = (enricher: Enricher) => async (req: Request, res: Response) => {
  const patch = filmPatchSchema.parse(req.body)
  const film = await films.updateFilm(idParamSchema.parse(req.params).id, patch)
  if (patch.tmdbId !== undefined) void enricher.trigger()
  res.json(film)
}

export const remove = async (req: Request, res: Response) => {
  await films.deleteFilm(idParamSchema.parse(req.params).id)
  res.status(204).end()
}

export const syncTmdb = (enricher: Enricher) => async (req: Request, res: Response) => {
  const { includeUnmatched } = syncBodySchema.parse(req.body ?? {})
  if (!enricher.enabled) {
    throw new HttpError(503, 'TMDB is not configured. Set TMDB_ACCESS_TOKEN.', TMDB_UNAVAILABLE)
  }
  void enricher.trigger({ retryErrors: true, retryUnmatched: includeUnmatched })
  res.status(202).json({ started: true })
}

export const tmdbSyncStatus = (enricher: Enricher) => async (_req: Request, res: Response) => {
  res.json(enricher.status())
}

const LOOKUP_FAILURES = {
  unreachable: 'TMDB could not be reached. Try again later.',
  token_rejected: 'TMDB rejected the access token. Check TMDB_ACCESS_TOKEN.',
} as const

/** Looks the film up on TMDB now and answers with the film as it is afterwards. */
export const lookupTmdb = (enricher: Enricher) => async (req: Request, res: Response) => {
  const { id } = idParamSchema.parse(req.params)
  await films.getFilm(id)
  if (!enricher.enabled) {
    throw new HttpError(503, 'TMDB is not configured. Set TMDB_ACCESS_TOKEN.', TMDB_UNAVAILABLE)
  }
  const result = await enricher.lookup(id)
  if (result === 'no_such_film') throw notFound()
  if (result === 'unreachable' || result === 'token_rejected') throw new HttpError(502, LOOKUP_FAILURES[result], TMDB_UNAVAILABLE)
  res.json(await films.getFilm(id))
}
