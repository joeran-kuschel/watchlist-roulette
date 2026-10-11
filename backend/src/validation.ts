import { z } from 'zod'

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a date as YYYY-MM-DD')
  .refine((value) => {
    // year 0000 is valid for JS Date but not for PostgreSQL
    const date = new Date(value)
    return !value.startsWith('0000') && !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value)
  }, 'Not a real calendar date')

export const releaseYear = z.number().int().min(1888).max(2100)
export const httpUrl = z.url({ protocol: /^https?$/ }).max(2000)
export const parseIsoDate = (value: string) => isoDate.safeParse(value)

const INT4_MAX = 2_147_483_647
const INT2_MAX = 32_767

const title = z.string().trim().min(1).max(500)

export const filmCreateSchema = z
  .object({
    title,
    releaseYear: releaseYear.nullable().optional(),
    letterboxdUrl: httpUrl.nullable().optional(),
    addedAt: isoDate.optional(),
  })
  .strict()

export const filmPatchSchema = z
  .object({
    title: title.optional(),
    releaseYear: releaseYear.nullable().optional(),
    letterboxdUrl: httpUrl.nullable().optional(),
    addedAt: isoDate.optional(),
    watched: z.boolean().optional(),
    tmdbId: z.number().int().positive().max(INT4_MAX).optional(),
  })
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, 'Send at least one field to change')

const int = z.coerce.number().int()

export const idParamSchema = z.object({ id: int.positive().max(Number.MAX_SAFE_INTEGER) })

export const listQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  watched: z.enum(['true', 'false', 'all']).default('all'),
  genre: int.max(INT4_MAX).optional(),
  tmdbStatus: z.enum(['pending', 'matched', 'ambiguous', 'not_found', 'error']).optional(),
  sort: z.enum(['added_at', 'release_year', 'title']).default('added_at'),
  order: z.enum(['asc', 'desc']).default('desc'),
  page: int.min(1).max(1_000_000).default(1),
  pageSize: int.min(1).max(200).default(50),
})

export const randomQuerySchema = z.object({
  yearFrom: int.min(1888).max(2100).optional(),
  yearTo: int.min(1888).max(2100).optional(),
  genre: int.max(INT4_MAX).optional(),
  country: z
    .string()
    .regex(/^[A-Za-z]{2}$/)
    .transform((value) => value.toUpperCase())
    .optional(),
  maxRuntime: int.positive().max(INT2_MAX).optional(),
})

export type FilmCreate = z.infer<typeof filmCreateSchema>
export type FilmPatch = z.infer<typeof filmPatchSchema>
export type ListQuery = z.infer<typeof listQuerySchema>
export type RandomQuery = z.infer<typeof randomQuerySchema>
