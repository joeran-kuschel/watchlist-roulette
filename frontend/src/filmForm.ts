import type { ApiIssue } from './api'
import { isHttpUrl, text } from './format'
import { MAX_YEAR, MIN_YEAR } from './filters'
import type { FilmInput } from './types'

export interface FilmFormValues {
  title: string
  releaseYear: string
  letterboxdUrl: string
  addedAt: string
}

export type FilmField = keyof FilmFormValues
export type FilmFormErrors = Partial<Record<FilmField, string>>

/** Where each field's error links to in the error summary. */
export const FIELD_IDS: Record<FilmField, string> = {
  title: 'film-title',
  releaseYear: 'film-year',
  letterboxdUrl: 'film-url',
  addedAt: 'film-added',
}

export const emptyFilmForm = (): FilmFormValues => ({
  title: '',
  releaseYear: '',
  letterboxdUrl: '',
  addedAt: '',
})

function isRealDate(text: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false
  const date = new Date(text) // Invalid Date for month 00 or 13, which has no ISO string
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(text)
}

/** Checks the form like the backend does, so most mistakes are caught before a request. */
export function validateFilmForm(values: FilmFormValues) {
  const errors: FilmFormErrors = {}
  const title = text(values.title)
  const year = text(values.releaseYear)
  const url = text(values.letterboxdUrl)

  if (title === '') errors.title = 'Enter a title.'
  else if (title.length > 500) errors.title = 'The title can have at most 500 characters.'

  if (year !== '' && !(Number.isInteger(Number(year)) && Number(year) >= MIN_YEAR && Number(year) <= MAX_YEAR)) {
    errors.releaseYear = `Enter a year between ${MIN_YEAR} and ${MAX_YEAR}.`
  }
  if (url !== '' && !isHttpUrl(url)) errors.letterboxdUrl = 'Enter a link that starts with https://.'
  if (values.addedAt !== '' && !isRealDate(values.addedAt)) errors.addedAt = 'Enter a real date.'

  const payload: FilmInput = {
    title,
    releaseYear: year === '' ? null : Number(year),
    letterboxdUrl: url === '' ? null : url,
    ...(values.addedAt === '' ? {} : { addedAt: values.addedAt }),
  }
  return { errors, payload }
}

const API_FIELDS: Record<string, FilmField> = {
  title: 'title',
  releaseYear: 'releaseYear',
  letterboxdUrl: 'letterboxdUrl',
  addedAt: 'addedAt',
}

/** Maps the backend's validation issues to the form's fields. Unknown paths are ignored. */
export function issuesToErrors(issues: ApiIssue[]): FilmFormErrors {
  const errors: FilmFormErrors = {}
  for (const issue of issues) {
    const field = API_FIELDS[String(issue.path[0])]
    if (field && !errors[field]) errors[field] = issue.message
  }
  return errors
}
