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
    expect(csv(HEADER)).toEqual({ source: 'letterboxd', rows: [], rejected: [] })
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
    expect(parse('﻿Date,Name,Year,Letterboxd URI\r\n')).toEqual({ source: 'letterboxd', rows: [], rejected: [] })
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

describe('parseWatchlistCsv with an IMDb export', () => {
  const IMDB_HEADER =
    'Position,Const,Created,Modified,Description,Title,URL,Title Type,IMDb Rating,Runtime (mins),Year,Genres,Num Votes,Release Date,Directors\n'
  const imdb = (...lines: string[]) => csv(IMDB_HEADER + lines.join('\n') + '\n')
  const movie = (id: string, title = 'Heat', extra: { created?: string; year?: string; type?: string; url?: string } = {}) =>
    `1,${id},${extra.created ?? '2022-03-14'},2022-03-14,,${title},${extra.url ?? `https://www.imdb.com/title/${id}/`},${extra.type ?? 'movie'},8.3,170,${extra.year ?? '1995'},"Crime, Drama",700000,1995-12-15,Michael Mann`

  it('is detected from the Const column and reads title, year, date and the canonical link', () => {
    expect(imdb(movie('tt0113277'))).toEqual({
      source: 'imdb',
      rows: [
        { line: 2, title: 'Heat', releaseYear: 1995, letterboxdUrl: 'https://www.imdb.com/title/tt0113277/', addedAt: '2022-03-14' },
      ],
      rejected: [],
    })
  })

  it('takes the title id from the URL when Const is empty, and builds the same canonical link', () => {
    const result = imdb(movie('', 'Heat', { url: 'https://m.imdb.com/title/tt0113277/?ref_=wl' }))
    expect(result.rows[0]?.letterboxdUrl).toBe('https://www.imdb.com/title/tt0113277/')
  })

  it('treats an empty Created and an empty Year as unknown', () => {
    const row = imdb(movie('tt0113277', 'Heat', { created: '', year: '' })).rows[0]
    expect(row).toMatchObject({ addedAt: null, releaseYear: null })
  })

  it('keeps TV series but rejects episodes, and reports every bad row with its line', () => {
    const result = imdb(
      movie('tt0903747', 'Breaking Bad', { type: 'tvSeries' }),
      movie('tt0959621', 'Pilot', { type: 'tvEpisode' }),
      movie('tt1', 'No id'),
      movie('tt0113277', '', {}),
      movie('tt0000001', 'Bad date', { created: 'Mon Mar 14 2022' }),
      movie('tt0000002', 'Bad year', { year: '1700' }),
    )
    expect(result.rows.map((r) => r.title)).toEqual(['Breaking Bad'])
    expect(result.rejected.map((r) => [r.line, r.reason])).toEqual([
      [3, 'TV episodes are not imported'],
      [4, 'Const is missing or not an IMDb title id (tt1234567)'],
      [5, 'Title is empty'],
      [6, 'Created "Mon Mar 14 2022" is not a valid YYYY-MM-DD date'],
      [7, 'Year "1700" is not a year between 1888 and 2100'],
    ])
  })

  it('keeps the link of a rejected row so its film is not removed', () => {
    expect(imdb(movie('tt0113277', 'Heat', { type: 'tvEpisode' })).rejected[0]?.letterboxdUrl).toBe(
      'https://www.imdb.com/title/tt0113277/',
    )
  })

  it('rejects a second row with the same title id', () => {
    const result = imdb(movie('tt0113277'), movie('tt0113277', 'Heat again'))
    expect(result.rows).toHaveLength(1)
    expect(result.rejected).toEqual([{ line: 3, reason: 'Duplicate IMDb title id (first seen in line 2)' }])
  })

  it('handles a BOM, CRLF and the header in any case and order', () => {
    const result = csv('\ufeffTITLE,year,const\r\nHeat,1995,tt0113277\r\n')
    expect(result.source).toBe('imdb')
    expect(result.rows[0]).toMatchObject({ title: 'Heat', releaseYear: 1995, addedAt: null })
  })

  it('names both supported formats when the header fits neither', () => {
    expect(() => csv('Foo,Bar\n1,2\n')).toThrow(/Letterboxd export .* or an IMDb export/)
  })

  it('rejects an IMDb file without a Title column', () => {
    expect(() => csv('Const,Year\ntt0113277,1995\n')).toThrowError(
      expect.objectContaining({ status: 400, message: expect.stringContaining('title') }),
    )
  })

  it('accepts title ids with 7 to 10 digits and rejects shorter, longer or upper-case ones', () => {
    const result = imdb(
      movie('tt0113277', 'Seven'),
      movie('tt1234567890', 'Ten'),
      movie('tt12345678901', 'Eleven', { url: '' }),
      movie('tt123456', 'Six', { url: '' }),
      movie('TT0113277', 'Upper', { url: '' }),
      movie('xtt0113277', 'Prefixed', { url: '' }),
    )
    expect(result.rows.map((r) => r.title)).toEqual(['Seven', 'Ten'])
    expect(result.rejected.map((r) => r.line)).toEqual([4, 5, 6, 7])
    expect(result.rejected.every((r) => r.letterboxdUrl === undefined)).toBe(true)
  })

  it('lets Const win over the URL, and a Const that is no id fall back to the URL', () => {
    expect(imdb(movie('tt0000001', 'A', { url: 'https://www.imdb.com/title/tt0000002/' })).rows[0]?.letterboxdUrl).toBe(
      'https://www.imdb.com/title/tt0000001/',
    )
    expect(imdb(movie('n/a', 'B', { url: 'https://www.imdb.com/title/tt0000002/' })).rows[0]?.letterboxdUrl).toBe(
      'https://www.imdb.com/title/tt0000002/',
    )
  })

  it('reads a row as a duplicate when Const and URL spell the same id differently', () => {
    const result = imdb(movie('tt0113277'), movie('', 'Again', { url: 'https://m.imdb.com/title/tt0113277/?ref_=x' }))
    expect(result.rejected).toEqual([{ line: 3, reason: 'Duplicate IMDb title id (first seen in line 2)' }])
  })

  it('recognises tvEpisode in any case and keeps other title types', () => {
    const result = imdb(
      movie('tt0000001', 'Ep', { type: 'TVEPISODE' }),
      movie('tt0000002', 'Short', { type: 'short' }),
      movie('tt0000003', 'Game', { type: 'videoGame' }),
      movie('tt0000004', 'Mini', { type: 'tvMiniSeries' }),
    )
    expect(result.rows.map((r) => r.title)).toEqual(['Short', 'Game', 'Mini'])
    expect(result.rejected).toHaveLength(1)
  })

  it('reads a file without a Title Type column and a Title longer than 500 characters is rejected', () => {
    const result = csv(`Const,Title\ntt0113277,Heat\ntt0000002,${'x'.repeat(501)}\n`)
    expect(result.rows).toHaveLength(1)
    expect(result.rejected).toEqual([
      { line: 3, reason: 'Title is longer than 500 characters', letterboxdUrl: 'https://www.imdb.com/title/tt0000002/' },
    ])
  })

  it('accepts the years 1888 and 2100 and rejects 1887, 2101 and text', () => {
    const result = imdb(
      movie('tt0000001', 'A', { year: '1888' }),
      movie('tt0000002', 'B', { year: '2100' }),
      movie('tt0000003', 'C', { year: '1887' }),
      movie('tt0000004', 'D', { year: '2101' }),
      movie('tt0000005', 'E', { year: '19x5' }),
    )
    expect(result.rows.map((r) => r.releaseYear)).toEqual([1888, 2100])
    expect(result.rejected.map((r) => r.line)).toEqual([4, 5, 6])
  })

  it('imports a film with a date in the future as given', () => {
    expect(imdb(movie('tt0000001', 'A', { created: '2999-01-01' })).rows[0]?.addedAt).toBe('2999-01-01')
  })

  it('still reads a file with both a Const and a Letterboxd URI column as Letterboxd', () => {
    expect(csv('Date,Name,Year,Letterboxd URI,Const\n2020-01-12,Joy,2015,https://boxd.it/1,tt1\n').source).toBe('letterboxd')
  })

  it('rejects the type "TV Episode" written with a space, and takes ids only from a /title/ link or a clean Const', () => {
    const result = imdb(
      movie('tt0959621', 'Pilot', { type: 'TV Episode' }),
      movie('foo tt0113277 bar', 'Loose const', { url: '' }),
      movie('', 'Other link', { url: 'https://evil.test/?x=tt0113277' }),
    )
    expect(result.rows).toEqual([])
    expect(result.rejected.map((r) => r.reason)).toEqual([
      'TV episodes are not imported',
      'Const is missing or not an IMDb title id (tt1234567)',
      'Const is missing or not an IMDb title id (tt1234567)',
    ])
  })
})
