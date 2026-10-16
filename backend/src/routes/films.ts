import { Router } from 'express'
import multer from 'multer'
import * as films from '../controllers/films.js'
import { importFilms } from '../controllers/importFilms.js'
import type { Enricher } from '../tmdb/enricher.js'
import type { PosterFetcher } from '../tmdb/poster.js'

const MAX_CSV_BYTES = 5 * 1024 * 1024
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_CSV_BYTES, files: 1 } })

export function filmRoutes(enricher: Enricher, fetchPoster: PosterFetcher): Router {
  const router = Router()
  router.get('/films', films.list)
  router.post('/films', films.create)
  router.post('/films/import', upload.single('file'), importFilms(enricher))
  router.get('/films/random', films.random)
  router.get('/films/:id', films.get)
  router.get('/films/:id/poster', films.poster(fetchPoster))
  router.patch('/films/:id', films.update(enricher))
  router.delete('/films/:id', films.remove)
  router.post('/films/:id/tmdb-lookup', films.lookupTmdb(enricher))
  router.post('/tmdb/sync', films.syncTmdb(enricher))
  router.get('/tmdb/sync', films.tmdbSyncStatus(enricher))
  return router
}
