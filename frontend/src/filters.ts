import { text } from './format'
import type { RandomParams } from './types'

export interface RouletteFilterInput {
  yearFrom: string
  yearTo: string
  genre: string
  country: string
  maxRuntime: string
}

export type RouletteFilterErrors = Partial<Record<keyof RouletteFilterInput, string>>

export const emptyFilters = (): RouletteFilterInput => ({
  yearFrom: '',
  yearTo: '',
  genre: '',
  country: '',
  maxRuntime: '',
})

export const MIN_YEAR = 1888
export const MAX_YEAR = 2100

function wholeNumber(text: string, min: number, max: number, what: string) {
  if (text === '') return { value: undefined }
  const value = Number(text)
  if (!Number.isInteger(value) || value < min || value > max) {
    return { error: `${what} must be a whole number between ${min} and ${max}.` }
  }
  return { value }
}

/** Turns the form's text into API parameters, or says which fields are wrong. */
export function parseRouletteFilters(input: RouletteFilterInput) {
  const errors: RouletteFilterErrors = {}
  const params: RandomParams = {}

  const from = wholeNumber(text(input.yearFrom), MIN_YEAR, MAX_YEAR, 'The first year')
  const to = wholeNumber(text(input.yearTo), MIN_YEAR, MAX_YEAR, 'The last year')
  const runtime = wholeNumber(text(input.maxRuntime), 1, 10000, 'The runtime')
  if (from.error) errors.yearFrom = from.error
  if (to.error) errors.yearTo = to.error
  if (runtime.error) errors.maxRuntime = runtime.error
  if (from.value !== undefined && to.value !== undefined && from.value > to.value) {
    errors.yearTo = 'The last year must not be before the first year.'
  }

  const country = text(input.country)
  if (country !== '' && !/^[A-Za-z]{2}$/.test(country)) {
    errors.country = 'Use a two-letter country code, for example JP.'
  }

  if (Object.keys(errors).length === 0) {
    if (from.value !== undefined) params.yearFrom = from.value
    if (to.value !== undefined) params.yearTo = to.value
    if (runtime.value !== undefined) params.maxRuntime = runtime.value
    if (country !== '') params.country = country.toUpperCase()
    if (input.genre !== '') params.genre = Number(input.genre)
  }
  return { params, errors }
}

export const hasFilters = (params: RandomParams) => Object.keys(params).length > 0
