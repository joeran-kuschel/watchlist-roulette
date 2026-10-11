import { describe, expect, it } from 'vitest'
import { chooseMatch } from '../src/tmdb/match.js'

const result = (id: number, title: string, date?: string, original = title) => ({
  id,
  title,
  original_title: original,
  release_date: date,
})
const joy = { title: 'Joy', releaseYear: 2015 }

describe('chooseMatch', () => {
  it('matches the single result with the same title and year', () => {
    expect(chooseMatch(joy, [result(1, 'Joy', '2015-12-25'), result(2, 'Joy', '1977-01-01')])).toEqual({
      status: 'matched',
      tmdbId: 1,
    })
  })

  it('ignores case, accents-free punctuation and spacing in titles', () => {
    expect(chooseMatch({ title: "Don't Look Up", releaseYear: 2021 }, [result(1, 'DON’T LOOK UP', '2021-12-05')])).toMatchObject({
      status: 'matched',
    })
  })

  it('matches on the original title too', () => {
    const film = { title: 'Amélie', releaseYear: 2001 }
    expect(chooseMatch(film, [result(1, 'Amélie', '2001-04-25', 'Le Fabuleux Destin d’Amélie Poulain')])).toMatchObject({ status: 'matched' })
    expect(chooseMatch({ title: 'Le Fabuleux Destin d’Amélie Poulain', releaseYear: 2001 }, [result(1, 'Amélie', '2001-04-25', 'Le Fabuleux Destin d’Amélie Poulain')])).toMatchObject({ status: 'matched' })
  })

  it('accepts a year that is one off', () => {
    expect(chooseMatch(joy, [result(1, 'Joy', '2016-01-01')])).toMatchObject({ status: 'matched' })
    expect(chooseMatch(joy, [result(1, 'Joy', '2017-01-01')])).toEqual({ status: 'not_found' })
  })

  it('prefers the exact year over a near one', () => {
    expect(chooseMatch(joy, [result(1, 'Joy', '2016-01-01'), result(2, 'Joy', '2015-06-01')])).toEqual({
      status: 'matched',
      tmdbId: 2,
    })
  })

  it('is ambiguous when two results fit equally well', () => {
    expect(chooseMatch(joy, [result(1, 'Joy', '2015-01-01'), result(2, 'Joy', '2015-09-01')])).toEqual({ status: 'ambiguous' })
  })

  it('is not found for no results or other titles', () => {
    expect(chooseMatch(joy, [])).toEqual({ status: 'not_found' })
    expect(chooseMatch(joy, [result(1, 'Joyful', '2015-01-01')])).toEqual({ status: 'not_found' })
  })

  it('without a year, matches a single title and flags several', () => {
    const noYear = { title: 'Joy', releaseYear: null }
    expect(chooseMatch(noYear, [result(1, 'Joy', '2015-01-01')])).toMatchObject({ status: 'matched' })
    expect(chooseMatch(noYear, [result(1, 'Joy', '2015-01-01'), result(2, 'Joy', '1977-01-01')])).toEqual({ status: 'ambiguous' })
  })

  it('treats a result without a release date as a candidate', () => {
    expect(chooseMatch(joy, [result(1, 'Joy')])).toMatchObject({ status: 'matched' })
  })
})
