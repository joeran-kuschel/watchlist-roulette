import type { Request, Response } from 'express'
import { z } from 'zod'
import { HttpError } from '../errors.js'
import { applyImport, previewImport } from '../import/service.js'
import type { Enricher } from '../tmdb/enricher.js'

const querySchema = z.object({ dryRun: z.enum(['true', 'false']).default('false') })
const fieldsSchema = z.object({
  removalToken: z.string().max(100).optional(),
  confirmLargeRemoval: z.enum(['true', 'false']).default('false'),
})

export const importFilms = (enricher: Enricher) => async (req: Request, res: Response) => {
  if (!req.file) throw new HttpError(400, 'Upload the CSV as the multipart field "file"')
  const { dryRun } = querySchema.parse(req.query)
  if (dryRun === 'true') {
    res.json(await previewImport(req.file.buffer))
    return
  }
  const fields = fieldsSchema.parse(req.body ?? {})
  const report = await applyImport(req.file.buffer, {
    removalToken: fields.removalToken,
    confirmLargeRemoval: fields.confirmLargeRemoval === 'true',
  })
  void enricher.trigger()
  res.json(report)
}
