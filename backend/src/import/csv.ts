import { parse } from 'csv-parse/sync'
import { HttpError } from '../errors.js'
import { httpUrl, parseIsoDate, releaseYear } from '../validation.js'

export interface ImportRow {
  line: number
  title: string
  releaseYear: number | null
  letterboxdUrl: string
  addedAt: string
}

export interface RejectedRow {
  line: number
  reason: string
  /** Set when the row's link is usable, so a film with this link is not removed because its row was rejected. */
  letterboxdUrl?: string
}

export interface ParsedCsv {
  rows: ImportRow[]
  rejected: RejectedRow[]
}

const HEADERS = { date: 'date', name: 'name', year: 'year', url: 'letterboxd uri' } as const

function readHeader(header: string[]): string[] {
  const names = header.map((name) => name.trim().toLowerCase())
  const missing = Object.values(HEADERS).filter((name) => !names.includes(name))
  if (missing.length > 0) {
    throw new HttpError(400, `The CSV is missing the column(s): ${missing.join(', ')}`)
  }
  return names
}

type Fields = Record<string, string | undefined>

function toRow(fields: Fields, line: number): ImportRow | RejectedRow {
  const url = fields[HEADERS.url]?.trim() ?? ''
  const usableUrl = httpUrl.safeParse(url).success ? url : undefined
  const reject = (reason: string): RejectedRow => ({ line, reason, letterboxdUrl: usableUrl })

  const title = fields[HEADERS.name]?.trim() ?? ''
  if (!title) return reject('Name is empty')
  if (title.length > 500) return reject('Name is longer than 500 characters')
  if (!usableUrl) return reject('Letterboxd URI is missing or not an http(s) link')

  const date = fields[HEADERS.date]?.trim() ?? ''
  if (!parseIsoDate(date).success) return reject(`Date "${date}" is not a valid YYYY-MM-DD date`)

  const yearText = fields[HEADERS.year]?.trim() ?? ''
  let year: number | null = null
  if (yearText !== '') {
    const parsed = releaseYear.safeParse(Number(yearText))
    if (!/^\d{1,4}$/.test(yearText) || !parsed.success) return reject(`Year "${yearText}" is not a year between 1888 and 2100`)
    year = parsed.data as number
  }
  return { line, title, releaseYear: year, letterboxdUrl: usableUrl, addedAt: date }
}

const MAX_ROWS = 20_000

type CsvRecord = { record: Fields; info: { lines: number } }

function readRecords(file: Buffer, rejected: RejectedRow[]): CsvRecord[] {
  let headerSeen = false
  let records: CsvRecord[]
  try {
    records = parse(file, {
      bom: true,
      columns: (header: string[]) => {
        headerSeen = true
        return readHeader(header)
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
  if (!headerSeen) throw new HttpError(400, 'The CSV file is empty')
  if (records.length > MAX_ROWS) throw new HttpError(413, `The CSV has more than ${MAX_ROWS} rows`)
  return records
}

/** Parses a Letterboxd watchlist export (Date, Name, Year, Letterboxd URI). Bad rows are reported, not dropped. */
export function parseWatchlistCsv(file: Buffer): ParsedCsv {
  const rejected: RejectedRow[] = []
  const rows: ImportRow[] = []
  const firstLineOfUrl = new Map<string, number>()
  for (const { record, info } of readRecords(file, rejected)) {
    const result = toRow(record, info.lines)
    if (!('title' in result)) {
      rejected.push(result)
      continue
    }
    const first = firstLineOfUrl.get(result.letterboxdUrl)
    if (first !== undefined) {
      rejected.push({ line: result.line, reason: `Duplicate Letterboxd URI (first seen in line ${first})` })
      continue
    }
    firstLineOfUrl.set(result.letterboxdUrl, result.line)
    rows.push(result)
  }
  return { rows, rejected: rejected.sort((a, b) => a.line - b.line) }
}
