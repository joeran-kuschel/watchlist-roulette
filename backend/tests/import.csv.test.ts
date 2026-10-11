import { describe, expect, it } from 'vitest'
import { parseWatchlistCsv } from '../src/import/csv.js'

const csv = (text: string) => parseWatchlistCsv(Buffer.from(text))
const HEADER = 'Date,Name,Year,Letterboxd URI\n'

describe('parseWatchlistCsv', () => {
  it('reads a Letterboxd export row', () => {
    const { rows, rejected } = csv(`${HEADER}2020-01-12,Joy,2015,https://boxd.it/8kEU\n`)
    expect(rejected).toEqual([])
    expect(rows).toEqual([
      { line: 2, title: 'Joy', releaseYear: 2015, letterboxdUrl: 'https://boxd.it/8kEU', addedAt: '2020-01-12' },
    ])
  })

  it('handles a BOM, CRLF line endings and header case', () => {
    const { rows } = csv('﻿date,NAME,year,letterboxd uri\r\n2020-01-12,Joy,2015,https://boxd.it/1\r\n')
    expect(rows).toHaveLength(1)
  })

  it('keeps commas, quotes and line breaks inside quoted titles', () => {
    const { rows } = csv(`${HEADER}2020-01-12,"Hello, ""World""\nPart 2",2015,https://boxd.it/1\n`)
    expect(rows[0]?.title).toBe('Hello, "World"\nPart 2')
  })

  it('keeps non-ASCII titles', () => {
    expect(csv(`${HEADER}2020-01-12,Amélie 千と千尋,2001,https://boxd.it/1\n`).rows[0]?.title).toBe(
      'Amélie 千と千尋',
    )
  })

  it('accepts an empty year as unknown', () => {
    expect(csv(`${HEADER}2020-01-12,Joy,,https://boxd.it/1\n`).rows[0]?.releaseYear).toBeNull()
  })

  it('ignores empty lines and returns nothing for a header-only file', () => {
    expect(csv(HEADER)).toEqual({ rows: [], rejected: [] })
    expect(csv(`${HEADER}\n2020-01-12,Joy,2015,https://boxd.it/1\n\n`).rows).toHaveLength(1)
  })

  it('rejects a file with a missing column', () => {
    expect(() => csv('Date,Name,Year\n2020-01-12,Joy,2015\n')).toThrow(/letterboxd uri/)
  })

  it('rejects an empty file', () => {
    expect(() => csv('')).toThrow()
  })

  it.each([
    ['an empty name', '2020-01-12, ,2015,https://boxd.it/1', /Name is empty/],
    ['a bad date', '12.01.2020,Joy,2015,https://boxd.it/1', /not a valid YYYY-MM-DD/],
    ['an impossible date', '2020-02-30,Joy,2015,https://boxd.it/1', /not a valid YYYY-MM-DD/],
    ['a non-numeric year', '2020-01-12,Joy,abc,https://boxd.it/1', /not a year/],
    ['a year out of range', '2020-01-12,Joy,1700,https://boxd.it/1', /not a year/],
    ['a missing link', '2020-01-12,Joy,2015,', /Letterboxd URI/],
    ['a javascript: link', '2020-01-12,Joy,2015,javascript:alert(1)', /Letterboxd URI/],
  ])('reports a row with %s with its line number', (_name, row, reason) => {
    const { rows, rejected } = csv(`${HEADER}2020-01-12,Ok,2000,https://boxd.it/0\n${row}\n`)
    expect(rows).toHaveLength(1)
    expect(rejected).toEqual([expect.objectContaining({ line: 3, reason: expect.stringMatching(reason) })])
  })

  it('remembers the link of a rejected row that has a usable one', () => {
    const { rejected } = csv(`${HEADER}2020-01-12,Joy,abc,https://boxd.it/9\n`)
    expect(rejected[0]?.letterboxdUrl).toBe('https://boxd.it/9')
  })

  it('rejects the second row with the same link', () => {
    const { rows, rejected } = csv(
      `${HEADER}2020-01-12,Joy,2015,https://boxd.it/1\n2020-01-13,Joy again,2015,https://boxd.it/1\n`,
    )
    expect(rows).toHaveLength(1)
    expect(rejected[0]).toMatchObject({ line: 3, reason: expect.stringContaining('line 2') })
  })

  it('reports an unreadable row and keeps the others', () => {
    const { rows, rejected } = csv(`${HEADER}2020-01-12,"Broken,2015,https://boxd.it/1\n`)
    expect(rows).toEqual([])
    expect(rejected.length).toBeGreaterThan(0)
  })

  it('reads a large file', () => {
    const lines = Array.from({ length: 5000 }, (_, i) => `2020-01-12,Film ${i},2000,https://boxd.it/${i}`)
    expect(csv(`${HEADER}${lines.join('\n')}\n`).rows).toHaveLength(5000)
  })
})

describe('parseWatchlistCsv edge cases', () => {
  const parse = (csv: string) => parseWatchlistCsv(Buffer.from(csv))

  it('reads columns in any order and ignores extra columns', () => {
    const { rows, rejected } = parse(
      'Rating,Letterboxd URI,Year,Name,Tags,Date\n4,https://boxd.it/1,2015,Joy,"a,b",2020-01-12\n',
    )
    expect(rejected).toEqual([])
    expect(rows).toEqual([
      { line: 2, title: 'Joy', releaseYear: 2015, letterboxdUrl: 'https://boxd.it/1', addedAt: '2020-01-12' },
    ])
  })

  it('reports a row with more or fewer fields than the header instead of dropping it', () => {
    const { rows, rejected } = parse(
      `${HEADER}2020-01-12,Joy,2015,https://boxd.it/1,extra,fields\n2020-01-12,Short\n2020-01-12,Fine,2016,https://boxd.it/3\n`,
    )
    expect(rows.map((r) => r.title)).toEqual(['Joy', 'Fine'])
    expect(rejected).toEqual([expect.objectContaining({ line: 3 })])
  })

  it('numbers lines by their place in the file, also after blank lines and multi-line titles', () => {
    const csv = `${HEADER}\n2020-01-12,"Two\nlines",2015,https://boxd.it/1\n\n2020-01-12,,2015,https://boxd.it/2\n`
    // physical lines: 1 header, 2 blank, 3-4 first record, 5 blank, 6 bad record
    expect(parse(csv).rejected.map((r) => r.line)).toEqual([6])
  })

  it('reports a rejected row once, sorted by line, together with duplicates', () => {
    const { rejected } = parse(
      `${HEADER}2020-01-12,A,2015,https://boxd.it/1\n2020-01-12,,2015,https://boxd.it/2\n2020-01-12,A again,2015,https://boxd.it/1\n2020-01-12,C,abc,https://boxd.it/3\n`,
    )
    expect(rejected.map((r) => r.line)).toEqual([3, 4, 5])
  })

  it.each(['2020-13-01', '2020-00-10', '2020-02-30', '2020-01-12 10:00', '12/01/2020', '2020-1-2', '', 'yesterday'])(
    'rejects the date "%s" without throwing',
    (date) => {
      const { rows, rejected } = parse(`${HEADER}${date},Joy,2015,https://boxd.it/1\n`)
      expect(rows).toEqual([])
      expect(rejected).toEqual([expect.objectContaining({ line: 2, reason: expect.stringContaining('date') })])
    },
  )

  it.each(['1887', '2101', '20.15', 'abc', '1e3', '0x7C0', '-2015'])('rejects the year "%s"', (year) => {
    const { rows, rejected } = parse(`${HEADER}2020-01-12,Joy,${year},https://boxd.it/1\n`)
    expect(rows).toEqual([])
    expect(rejected).toHaveLength(1)
  })

  it('trims spaces around every field and accepts the year limits', () => {
    const { rows } = parse(`${HEADER} 2020-01-12 , Joy , 1888 , https://boxd.it/1 \n2020-01-12,Late,2100,https://boxd.it/2\n`)
    expect(rows.map((r) => [r.title, r.releaseYear, r.letterboxdUrl])).toEqual([
      ['Joy', 1888, 'https://boxd.it/1'],
      ['Late', 2100, 'https://boxd.it/2'],
    ])
  })

  it('accepts a title of 500 characters and rejects one of 501', () => {
    const csv = (n: number) => `${HEADER}2020-01-12,${'x'.repeat(n)},2015,https://boxd.it/1\n`
    expect(parse(csv(500)).rows).toHaveLength(1)
    expect(parse(csv(501)).rejected).toHaveLength(1)
  })

  it('rejects links that are not http(s) and does not protect a film by such a link', () => {
    const { rows, rejected } = parse(`${HEADER}2020-01-12,Joy,2015,javascript:alert(1)\n2020-01-12,Two,2015,ftp://boxd.it/2\n`)
    expect(rows).toEqual([])
    expect(rejected).toHaveLength(2)
    expect(rejected.every((r) => r.letterboxdUrl === undefined)).toBe(true)
  })

  it('reads a last line without a line break and a header-only file with BOM and CRLF', () => {
    expect(parse(`${HEADER}2020-01-12,Joy,2015,https://boxd.it/1`).rows).toHaveLength(1)
    expect(parse('﻿Date,Name,Year,Letterboxd URI\r\n')).toEqual({ rows: [], rejected: [] })
  })

  it('rejects a file whose only content is blank lines', () => {
    expect(() => parse('\n\n')).toThrow(/empty|missing/i)
  })

  it('rejects a binary file with a 400 error instead of crashing', () => {
    expect(() => parse('\u0000\u0001\u0002')).toThrow(expect.objectContaining({ status: 400 }))
  })
})

describe('row limit', () => {
  const rows = (n: number) => Array.from({ length: n }, (_, i) => `2020-01-12,Film ${i},2000,https://boxd.it/${i}`).join('\n')

  it('accepts 20,000 rows', () => {
    expect(csv(`${HEADER}${rows(20_000)}\n`).rows).toHaveLength(20_000)
  })

  it('rejects more than 20,000 rows with 413', () => {
    expect(() => csv(`${HEADER}${rows(20_001)}\n`)).toThrowError(expect.objectContaining({ status: 413 }))
  })
})
