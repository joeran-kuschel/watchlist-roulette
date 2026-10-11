import type {
  ApplyImportOptions,
  Film,
  FilmInput,
  FilmPage,
  FilmPatch,
  ImportReport,
  ListParams,
  RandomParams,
} from './types'

export interface ApiIssue {
  path: (string | number)[]
  message: string
}

/** Thrown for every failed request. `status` is `0` when the server could not be reached. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
    readonly issues: ApiIssue[] = [],
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/** A sentence for the user; unreachable server and server faults get fixed wording. */
export function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 0) {
      return "Can't reach the server. Check that the app is running, then try again."
    }
    if (error.status >= 500) return 'The server had a problem. Try again in a moment.'
    return error.message
  }
  return 'Something went wrong.'
}

const BASE = '/api'

function toQuery(params: object): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value))
  }
  const text = search.toString()
  return text ? `?${text}` : ''
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${BASE}${path}`, init)
  } catch {
    throw new ApiError(0, 'The server could not be reached')
  }
  if (response.status === 204) return undefined as T
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    throw new ApiError(
      response.status,
      body?.error ?? 'Something went wrong',
      body?.code,
      body?.issues ?? [],
    )
  }
  return body as T
}

const json = (method: string, payload: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
})

export const listFilms = (params: ListParams = {}) =>
  request<FilmPage>(`/films${toQuery(params)}`)

export const getFilm = (id: number) => request<Film>(`/films/${id}`)

export const randomFilm = (params: RandomParams = {}) =>
  request<Film>(`/films/random${toQuery(params)}`)

export const createFilm = (input: FilmInput) => request<Film>('/films', json('POST', input))

export const updateFilm = (id: number, patch: FilmPatch) =>
  request<Film>(`/films/${id}`, json('PATCH', patch))

export const deleteFilm = (id: number) => request<void>(`/films/${id}`, { method: 'DELETE' })

function importForm(file: File, options: ApplyImportOptions = {}): FormData {
  const form = new FormData()
  form.append('file', file)
  if (options.removalToken) form.append('removalToken', options.removalToken)
  if (options.confirmLargeRemoval) form.append('confirmLargeRemoval', 'true')
  return form
}

/** Reports what an import would do and writes nothing. */
export const previewImport = (file: File) =>
  request<ImportReport>('/films/import?dryRun=true', { method: 'POST', body: importForm(file) })

export const applyImport = (file: File, options: ApplyImportOptions = {}) =>
  request<ImportReport>('/films/import', { method: 'POST', body: importForm(file, options) })

/**
 * The poster comes through the backend, so the browser never contacts TMDB.
 * The backend route streams the film's TMDB poster (see documentation/backend/tmdb-enrichment.md).
 */
export const posterUrl = (filmId: number) => `${BASE}/films/${filmId}/poster`
