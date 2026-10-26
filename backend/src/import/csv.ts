import { parse } from 'csv-parse/sync'
import { HttpError } from '../errors.js'
import { httpUrl, parseIsoDate, releaseYear } from '../validation.js'

/** The kind of export a file is, told apart by its header. */
export type ImportSource = 'letterboxd' | 'imdb'

export interface ImportRow {
  line: number
  title: string
  releaseYear: number | null
  /** The film's link, which identifies it: the Letterboxd URI, or the canonical IMDb title link. */
  letterboxdUrl: string
  /** null when the file has no date for the film; a new film then gets the import day, an existing one keeps its date. */
  addedAt: string | null
}

export interface RejectedRow {
  line: number
  reason: string
  /** Set when the row's link is usable, so a film with this link is not removed because its row was rejected. */
  letterboxdUrl?: string
}

export interface ParsedCsv {
  source: ImportSource
  rows: ImportRow[]
  rejected: RejectedRow[]
}

const LETTERBOXD = { date: 'date', name: 'name', year: 'year', url: 'letterboxd uri' } as const
const IMDB = { id: 'const', title: 'title', url: 'url', year: 'year', created: 'created', type: 'title type' } as const

const NOT_SUPPORTED =
  'Use a Letterboxd export (Date, Name, Year, Letterboxd URI) or an IMDb export (Const, Title, Year, Created, URL)'

/** An IMDb export has a Const column; everything else is read as a Letterboxd export, as before. */
function readHeader(header: string[]): { names: string[]; source: ImportSource } {
  const names = header.map((name) => name.trim().toLowerCase())
  if (names.includes(IMDB.id) && !names.includes(LETTERBOXD.url)) {
    if (!names.includes(IMDB.title)) throw new HttpError(400, `The CSV is missing the column(s): ${IMDB.title}`)
    return { names, source: 'imdb' }
  }
  const missing = Object.values(LETTERBOXD).filter((name) => !names.includes(name))
  if (missing.length > 0) {
    throw new HttpError(400, `The CSV is missing the column(s): ${missing.join(', ')}. ${NOT_SUPPORTED}`)
  }
  return { names, source: 'letterboxd' }
}

type Fields = Record<string, string | undefined>

type Parsed = ImportRow | RejectedRow

function readYear(text: string): { year: number | null } | { error: string } {
  if (text === '') return { year: null }
  const parsed = releaseYear.safeParse(Number(text))
  if (!/^\d{1,4}$/.test(text) || !parsed.success) return { error: `Year "${text}" is not a year between 1888 and 2100` }
  return { year: parsed.data as number }
}

function letterboxdRow(fields: Fields, line: number): Parsed {
  const url = fields[LETTERBOXD.url]?.trim() ?? ''
  const usableUrl = httpUrl.safeParse(url).success ? url : undefined
  const reject = (reason: string): RejectedRow => ({ line, reason, letterboxdUrl: usableUrl })

  const title = fields[LETTERBOXD.name]?.trim() ?? ''
  if (!title) return reject('Name is empty')
  if (title.length > 500) return reject('Name is longer than 500 characters')
  if (!usableUrl) return reject('Letterboxd URI is missing or not an http(s) link')

  const date = fields[LETTERBOXD.date]?.trim() ?? ''
  if (!parseIsoDate(date).success) return reject(`Date "${date}" is not a valid YYYY-MM-DD date`)

  const year = readYear(fields[LETTERBOXD.year]?.trim() ?? '')
  if ('error' in year) return reject(year.error)
  return { line, title, releaseYear: year.year, letterboxdUrl: usableUrl, addedAt: date }
}

const IMDB_CONST = /^tt\d{7,10}$/
const IMDB_URL_ID = /\/title\/(tt\d{7,10})(?:[/?#]|$)/
const imdbLink = (id: string) => `https://www.imdb.com/title/${id}/`

function imdbRow(fields: Fields, line: number): Parsed {
  // the title id identifies the film; it comes from Const, or from the URL when Const is empty
  const constText = fields[IMDB.id]?.trim() ?? ''
  const id = IMDB_CONST.test(constText) ? constText : IMDB_URL_ID.exec(fields[IMDB.url]?.trim() ?? '')?.[1]
  const link = id ? imdbLink(id) : undefined
  const reject = (reason: string): RejectedRow => ({ line, reason, letterboxdUrl: link })

  const title = fields[IMDB.title]?.trim() ?? ''
  if (!title) return reject('Title is empty')
  if (title.length > 500) return reject('Title is longer than 500 characters')
  if (!link) return reject('Const is missing or not an IMDb title id (tt1234567)')
  if (fields[IMDB.type]?.replace(/[\s_-]/g, '').toLowerCase() === 'tvepisode') return reject('TV episodes are not imported')

  const created = fields[IMDB.created]?.trim() ?? ''
  if (created !== '' && !parseIsoDate(created).success) return reject(`Created "${created}" is not a valid YYYY-MM-DD date`)

  const year = readYear(fields[IMDB.year]?.trim() ?? '')
  if ('error' in year) return reject(year.error)
  return { line, title, releaseYear: year.year, letterboxdUrl: link, addedAt: created === '' ? null : created }
}

const MAX_ROWS = 20_000

type CsvRecord = { record: Fields; info: { lines: number } }

function readRecords(file: Buffer, rejected: RejectedRow[]): { records: CsvRecord[]; source: ImportSource } {
  let source: ImportSource | undefined
  let records: CsvRecord[]
  try {
    records = parse(file, {
      bom: true,
      columns: (header: string[]) => {
        const read = readHeader(header)
        source = read.source
        return read.names
      },
      skip_empty_lines: true,
      relax_column_count: true,
      relax_column_count_more: true,
      skip_records_with_error: true,
      on_skip: (error: unknown) => {
        const { lines, message } = error as { lines?: number; message?: string }
        rejected.push({ line: lines ?? 0, reason: `Unreadable row: ${message}` })
      },
      info: true,
    })
  } catch (error) {
    if (error instanceof HttpError) throw error
    throw new HttpError(400, `The file is not a readable CSV: ${(error as Error).message}`)
  }
  if (!source) throw new HttpError(400, 'The CSV file is empty')
  if (records.length > MAX_ROWS) throw new HttpError(413, `The CSV has more than ${MAX_ROWS} rows`)
  return { records, source }
}

/** Parses a Letterboxd or IMDb watchlist export, told apart by the header. Bad rows are reported, not dropped. */
export function parseWatchlistCsv(file: Buffer): ParsedCsv {
  const rejected: RejectedRow[] = []
  const rows: ImportRow[] = []
  const firstLineOfUrl = new Map<string, number>()
  const { records, source } = readRecords(file, rejected)
  const toRow = source === 'imdb' ? imdbRow : letterboxdRow
  const duplicate = source === 'imdb' ? 'IMDb title id' : 'Letterboxd URI'
  for (const { record, info } of records) {
    const result = toRow(record, info.lines)
    if (!('title' in result)) {
      rejected.push(result)
      continue
    }
    const first = firstLineOfUrl.get(result.letterboxdUrl)
    if (first !== undefined) {
      rejected.push({ line: result.line, reason: `Duplicate ${duplicate} (first seen in line ${first})` })
      continue
    }
    firstLineOfUrl.set(result.letterboxdUrl, result.line)
    rows.push(result)
  }
  return { source, rows, rejected: rejected.sort((a, b) => a.line - b.line) }
}
