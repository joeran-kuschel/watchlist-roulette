import type { Pool } from 'pg'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { dateOnly } from '../src/dates.js'
import { createTestPool } from './helpers/testDb.js'
import { HEADER, fakeEnricher, testApp } from './helpers/app.js'

let pool: Pool
beforeEach(async () => {
  pool = await createTestPool()
})

const line = (n: number, extra = '') => `2020-01-0${n},Film ${n}${extra},200${n},https://boxd.it/${n}\n`
const titles = async () => (await pool.query('SELECT title FROM films ORDER BY id')).rows.map((r) => r.title)

const upload = (csv: string, { dryRun = false, fields = {} }: { dryRun?: boolean; fields?: Record<string, string> } = {}, enricher = fakeEnricher()) => {
  const req = testApp(enricher).post(`/api/films/import${dryRun ? '?dryRun=true' : ''}`)
  for (const [key, value] of Object.entries(fields)) req.field(key, value)
  return req.attach('file', Buffer.from(csv), 'watchlist.csv')
}

describe('POST /api/films/import?dryRun=true', () => {
  it('reports what would change and writes nothing', async () => {
    const res = await upload(HEADER + line(1) + line(2), { dryRun: true })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ applied: false, inserted: 2, updated: 0, removed: [] })
    expect(await titles()).toEqual([])
  })

  it('lists the films that would be removed and the watched ones that are kept', async () => {
    await upload(HEADER + line(1) + line(2) + line(3))
    await pool.query(`UPDATE films SET watched_at = now() WHERE title = 'Film 3'`)
    const res = await upload(HEADER + line(1), { dryRun: true })
    expect(res.body.removed.map((f: { title: string }) => f.title)).toEqual(['Film 2'])
    expect(res.body.keptWatched.map((f: { title: string }) => f.title)).toEqual(['Film 3'])
    expect(res.body.removalToken).toEqual(expect.any(String))
  })

  it('reports rejected rows', async () => {
    const res = await upload(HEADER + line(1) + '2020-01-01,,2000,https://boxd.it/9\n', { dryRun: true })
    expect(res.body.rejected).toEqual([{ line: 3, reason: 'Name is empty' }])
  })
})

describe('POST /api/films/import', () => {
  it('inserts the rows and starts the TMDB enrichment', async () => {
    const enricher = fakeEnricher()
    const res = await upload(HEADER + line(1) + line(2), {}, enricher)
    expect(res.body).toMatchObject({ applied: true, inserted: 2 })
    expect(await titles()).toEqual(['Film 1', 'Film 2'])
    expect(enricher.trigger).toHaveBeenCalled()
  })

  it('importing the same file twice creates no duplicates', async () => {
    await upload(HEADER + line(1) + line(2))
    const res = await upload(HEADER + line(1) + line(2))
    expect(res.body).toMatchObject({ inserted: 0, updated: 0, unchanged: 2 })
    expect(await titles()).toHaveLength(2)
  })

  it('updates changed rows but keeps the watched date and the TMDB data', async () => {
    await upload(HEADER + line(1))
    await pool.query(`UPDATE films SET watched_at = now(), tmdb_id = 7, tmdb_status = 'matched', overview = 'plot'`)
    const res = await upload(HEADER + '2021-05-05,Film One,2001,https://boxd.it/1\n')
    expect(res.body.updated).toBe(1)
    const { rows } = await pool.query('SELECT * FROM films')
    expect(rows[0]).toMatchObject({ title: 'Film One', tmdb_id: 7, overview: 'plot', tmdb_status: 'matched' })
    expect(rows[0].watched_at).not.toBeNull()
  })

  it('removes a missing film only with the token from the preview', async () => {
    await upload(HEADER + line(1) + line(2) + line(3) + line(4))
    const csv = HEADER + line(1) + line(2) + line(3)

    const noToken = await upload(csv)
    expect(noToken.status).toBe(409)
    expect(noToken.body).toMatchObject({ code: 'removal_not_confirmed', removed: [{ title: 'Film 4' }] })
    expect(await titles()).toHaveLength(4)

    const preview = await upload(csv, { dryRun: true })
    const applied = await upload(csv, { fields: { removalToken: preview.body.removalToken } })
    expect(applied.status).toBe(200)
    expect(applied.body.removed).toHaveLength(1)
    expect(await titles()).toEqual(['Film 1', 'Film 2', 'Film 3'])
  })

  it('refuses a stale token when the list of removals changed after the preview', async () => {
    await upload(HEADER + line(1) + line(2) + line(3) + line(4))
    const csv = HEADER + line(1) + line(2) + line(3)
    const preview = await upload(csv, { dryRun: true })
    await pool.query(`DELETE FROM films WHERE title = 'Film 4'`)
    await upload(HEADER + line(1) + line(2) + line(3))
    await pool.query(`INSERT INTO films (title, letterboxd_url) VALUES ('New', 'https://boxd.it/77')`)
    const res = await upload(csv, { fields: { removalToken: preview.body.removalToken } })
    expect(res.status).toBe(409)
    expect(await titles()).toContain('New')
  })

  it('needs an explicit confirmation to remove more than half of the unwatched films', async () => {
    await upload(HEADER + line(1) + line(2) + line(3))
    const csv = HEADER + line(1)
    const preview = await upload(csv, { dryRun: true })
    expect(preview.body.requiresLargeRemovalConfirmation).toBe(true)

    const fields = { removalToken: preview.body.removalToken }
    const refused = await upload(csv, { fields })
    expect(refused.status).toBe(409)
    expect(refused.body.code).toBe('large_removal')
    expect(await titles()).toHaveLength(3)

    const confirmed = await upload(csv, { fields: { ...fields, confirmLargeRemoval: 'true' } })
    expect(confirmed.status).toBe(200)
    expect(await titles()).toEqual(['Film 1'])
  })

  it('does not remove a film because its row was rejected', async () => {
    await upload(HEADER + line(1) + line(2))
    const res = await upload(HEADER + line(1) + '2020-01-02,Film 2,abc,https://boxd.it/2\n')
    expect(res.status).toBe(200)
    expect(res.body.rejected).toHaveLength(1)
    expect(await titles()).toEqual(['Film 1', 'Film 2'])
  })

  it('never removes films that were added by hand without a link', async () => {
    await testApp().post('/api/films').send({ title: 'By hand' })
    await upload(HEADER + line(1))
    expect(await titles()).toEqual(['By hand', 'Film 1'])
  })
})

describe('upload errors', () => {
  it('answers 400 without a file, for a wrong header and for an empty file', async () => {
    expect((await testApp().post('/api/films/import')).status).toBe(400)
    expect((await upload('Name,Year\nJoy,2015\n')).status).toBe(400)
    expect((await upload('')).status).toBe(400)
  })

  it('answers 413 for a file above the size limit', async () => {
    const res = await upload(HEADER + 'x'.repeat(6 * 1024 * 1024))
    expect(res.status).toBe(413)
  })

  it('answers 400 for an unknown form value', async () => {
    const res = await upload(HEADER + line(1), { fields: { confirmLargeRemoval: 'maybe' } })
    expect(res.status).toBe(400)
  })
})

describe('import edge cases', () => {
  const seed = async (n: number) => {
    let csv = HEADER
    for (let i = 1; i <= n; i++) csv += line(i)
    await upload(csv)
    return csv
  }
  const rowsOf = (...numbers: number[]) => HEADER + numbers.map((n) => line(n)).join('')

  it('updates a row that changes only the title', async () => {
    await seed(2)
    const res = await upload(HEADER + '2020-01-01,Renamed,2001,https://boxd.it/1\n' + line(2))
    expect(res.body).toMatchObject({ inserted: 0, updated: 1, unchanged: 1 })
    expect(await titles()).toEqual(['Renamed', 'Film 2'])
  })

  it('updates a film whose year is blanked in the file, and leaves an unknown year unchanged', async () => {
    await seed(1)
    expect((await upload(HEADER + '2020-01-01,Film 1,,https://boxd.it/1\n')).body.updated).toBe(1)
    expect((await pool.query('SELECT release_year FROM films')).rows[0].release_year).toBeNull()
    expect((await upload(HEADER + '2020-01-01,Film 1,,https://boxd.it/1\n')).body).toMatchObject({ updated: 0, unchanged: 1 })
  })

  it('reads columns in another order and ignores extra columns', async () => {
    const res = await upload('Extra,Letterboxd URI,Name,Year,Date\nx,https://boxd.it/1,Joy,2015,2020-01-12\n')
    expect(res.body).toMatchObject({ inserted: 1, rejected: [] })
    expect(await titles()).toEqual(['Joy'])
  })

  it('removes nothing and keeps everything when the file has only rejected rows with usable links', async () => {
    await seed(2)
    const res = await upload(HEADER + '2020-01-01,,2001,https://boxd.it/1\n2020-01-02,Film 2,abc,https://boxd.it/2\n')
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ inserted: 0, updated: 0, unchanged: 0, removed: [] })
    expect(res.body.rejected).toHaveLength(2)
    expect(await titles()).toEqual(['Film 1', 'Film 2'])
  })

  it('treats a rejected row without a usable link as no protection for any film', async () => {
    await seed(2)
    const preview = await upload(HEADER + '2020-01-01,Film 1,2001,not a link\n', { dryRun: true })
    expect(preview.body.rejected).toHaveLength(1)
    expect(preview.body.removed.map((f: { title: string }) => f.title)).toEqual(['Film 1', 'Film 2'])
  })

  it('reports the rejected rows of a file that has nothing else', async () => {
    const res = await upload(HEADER + '2020-01-01,,2001,https://boxd.it/1\n')
    expect(res.body.rejected).toEqual([{ line: 2, reason: 'Name is empty' }])
    expect(await titles()).toEqual([])
  })

  describe('large-removal boundary', () => {
    it('lets removing exactly half of the unwatched films through with the token only', async () => {
      await seed(4)
      const csv = rowsOf(1, 2)
      const preview = await upload(csv, { dryRun: true })
      expect(preview.body.requiresLargeRemovalConfirmation).toBe(false)
      const res = await upload(csv, { fields: { removalToken: preview.body.removalToken } })
      expect(res.status).toBe(200)
      expect(await titles()).toEqual(['Film 1', 'Film 2'])
    })

    it('needs the confirmation for one film more than half', async () => {
      await seed(5)
      const csv = rowsOf(1, 2)
      const preview = await upload(csv, { dryRun: true })
      expect(preview.body.requiresLargeRemovalConfirmation).toBe(true)
      const res = await upload(csv, { fields: { removalToken: preview.body.removalToken } })
      expect(res.status).toBe(409)
      expect(res.body.code).toBe('large_removal')
      expect(await titles()).toHaveLength(5)
    })

    it('counts only unwatched films as the base', async () => {
      await seed(4)
      await pool.query(`UPDATE films SET watched_at = now() WHERE title IN ('Film 1', 'Film 2')`)
      // 2 unwatched films left (3 and 4); removing one of them is exactly half
      const preview = await upload(rowsOf(1, 2, 3), { dryRun: true })
      expect(preview.body.requiresLargeRemovalConfirmation).toBe(false)
      const larger = await upload(rowsOf(1, 2), { dryRun: true })
      expect(larger.body.requiresLargeRemovalConfirmation).toBe(true)
    })

    it('does not accept the confirmation without the removal token', async () => {
      await seed(3)
      const res = await upload(HEADER, { fields: { confirmLargeRemoval: 'true' } })
      expect(res.status).toBe(409)
      expect(res.body.code).toBe('removal_not_confirmed')
      expect(await titles()).toHaveLength(3)
    })

    it('treats a header-only file as removing every unwatched film', async () => {
      await seed(2)
      await pool.query(`UPDATE films SET watched_at = now() WHERE title = 'Film 2'`)
      const preview = await upload(HEADER, { dryRun: true })
      expect(preview.body.requiresLargeRemovalConfirmation).toBe(true)
      expect(preview.body.keptWatched.map((f: { title: string }) => f.title)).toEqual(['Film 2'])
      const res = await upload(HEADER, { fields: { removalToken: preview.body.removalToken, confirmLargeRemoval: 'true' } })
      expect(res.status).toBe(200)
      expect(await titles()).toEqual(['Film 2'])
    })
  })

  describe('removal token', () => {
    it('is not needed when nothing is removed, and a made-up token does no harm', async () => {
      await seed(2)
      const csv = rowsOf(1, 2, 3)
      const preview = await upload(csv, { dryRun: true })
      expect(preview.body.removed).toEqual([])
      expect(preview.body.removalToken).toEqual(expect.any(String))
      expect((await upload(csv)).status).toBe(200)
      expect(await titles()).toHaveLength(3)
      expect((await upload(csv, { fields: { removalToken: 'made-up' } })).status).toBe(200)
    })

    it('is the same for the same removals and different for other removals', async () => {
      await seed(4)
      const a = await upload(rowsOf(1, 2, 3), { dryRun: true })
      const again = await upload(rowsOf(1, 2, 3), { dryRun: true })
      const b = await upload(rowsOf(1, 2), { dryRun: true })
      expect(again.body.removalToken).toBe(a.body.removalToken)
      expect(b.body.removalToken).not.toBe(a.body.removalToken)
    })

    it('needs no token for a film that was marked watched after the preview', async () => {
      await seed(4)
      const csv = rowsOf(1, 2, 3)
      const preview = await upload(csv, { dryRun: true })
      await pool.query(`UPDATE films SET watched_at = now() WHERE title = 'Film 4'`)
      // Film 4 is now kept, so the removal list is empty and the old token is irrelevant
      const res = await upload(csv, { fields: { removalToken: preview.body.removalToken } })
      expect(res.status).toBe(200)
      expect(res.body.removed).toEqual([])
      expect(await titles()).toContain('Film 4')
    })

    it('is refused when another film became removable after the preview', async () => {
      await seed(4)
      const csv = rowsOf(1, 2, 3)
      const preview = await upload(csv, { dryRun: true })
      await pool.query(`INSERT INTO films (title, letterboxd_url) VALUES ('Late', 'https://boxd.it/99')`)
      const res = await upload(csv, { fields: { removalToken: preview.body.removalToken } })
      expect(res.status).toBe(409)
      expect(res.body.removed.map((f: { title: string }) => f.title)).toEqual(['Film 4', 'Late'])
      expect(await titles()).toHaveLength(5)
    })

    it('answers 400 for a token above 100 characters', async () => {
      const res = await upload(rowsOf(1), { fields: { removalToken: 'x'.repeat(101) } })
      expect(res.status).toBe(400)
    })
  })

  describe('enrichment trigger', () => {
    it('is not started by a preview or a refused import', async () => {
      await seed(3)
      const enricher = fakeEnricher()
      await upload(rowsOf(1), { dryRun: true }, enricher)
      await upload(rowsOf(1), {}, enricher)
      expect(enricher.trigger).not.toHaveBeenCalled()
    })
  })

  describe('upload shape', () => {
    it('answers 400 when the file is sent under another field name', async () => {
      const res = await testApp().post('/api/films/import').attach('csv', Buffer.from(rowsOf(1)), 'watchlist.csv')
      expect(res.status).toBe(400)
      expect(res.body.error).toBeTypeOf('string')
      expect(await titles()).toEqual([])
    })

    it('answers 400 when two files are sent', async () => {
      const res = await testApp()
        .post('/api/films/import')
        .attach('file', Buffer.from(rowsOf(1)), 'a.csv')
        .attach('file', Buffer.from(rowsOf(2)), 'b.csv')
      expect(res.status).toBe(400)
      expect(await titles()).toEqual([])
    })

    it('answers 400 when the CSV is sent as a JSON body instead of a file', async () => {
      const res = await testApp().post('/api/films/import').send({ file: rowsOf(1) })
      expect(res.status).toBe(400)
    })

    it('answers 400 for an invalid dryRun value', async () => {
      const res = await testApp().post('/api/films/import?dryRun=yes').attach('file', Buffer.from(rowsOf(1)), 'a.csv')
      expect(res.status).toBe(400)
    })

    it('rejects a row with an empty date, keeps the other rows and answers 200', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const res = await upload(HEADER + line(1) + ',Film 2,2002,https://boxd.it/2\n')
      spy.mockRestore()
      expect(res.status).toBe(200)
      expect(res.body.rejected).toEqual([expect.objectContaining({ line: 3 })])
      expect(await titles()).toEqual(['Film 1'])
    })
  })
})

describe('film marked watched while an import is applied', () => {
  it('survives even though the plan listed it for removal', async () => {
    const { applyPlan } = await import('../src/models/filmImport.js')
    const { getPool } = await import('../src/config/database.js')
    await upload(HEADER + line(1) + line(2))
    const film = (await pool.query(`SELECT id FROM films WHERE title = 'Film 2'`)).rows[0]
    await pool.query('UPDATE films SET watched_at = now() WHERE id = $1', [film.id])
    const plan = {
      toInsert: [], toUpdate: [], toSkip: [], unchanged: 0, keptWatched: [], unwatchedCount: 2,
      toRemove: [{ id: Number(film.id), title: 'Film 2', releaseYear: 2002, letterboxdUrl: 'https://boxd.it/2', addedAt: '2020-01-02', watched: false }],
    }
    await applyPlan(plan, getPool())
    expect(await titles()).toEqual(['Film 1', 'Film 2'])
  })
})

describe('POST /api/films/import with an IMDb export', () => {
  const IMDB_HEADER = 'Position,Const,Created,Modified,Description,Title,URL,Title Type,Year\n'
  const imdbLine = (n: number, created = '2022-03-1' + n) =>
    `${n},tt000000${n},${created},${created},,IMDb ${n},https://www.imdb.com/title/tt000000${n}/,movie,199${n}\n`
  const dates = async () =>
    (await pool.query('SELECT title, added_at FROM films ORDER BY id')).rows.map((r) => ({ title: r.title, d: dateOnly(r.added_at) }))

  it('previews and imports it, and reports the detected format', async () => {
    const preview = await upload(IMDB_HEADER + imdbLine(1) + imdbLine(2), { dryRun: true })
    expect(preview.body).toMatchObject({ source: 'imdb', applied: false, inserted: 2 })
    expect(await titles()).toEqual([])
    const res = await upload(IMDB_HEADER + imdbLine(1) + imdbLine(2))
    expect(res.body).toMatchObject({ source: 'imdb', applied: true, inserted: 2 })
    expect(await dates()).toEqual([
      { title: 'IMDb 1', d: '2022-03-11' },
      { title: 'IMDb 2', d: '2022-03-12' },
    ])
  })

  it('gives a film without a date the import day, and keeps its date on the next import', async () => {
    await upload(IMDB_HEADER + imdbLine(1, ''))
    const today = dateOnly((await pool.query('SELECT CURRENT_DATE AS d')).rows[0].d)
    expect(await dates()).toEqual([{ title: 'IMDb 1', d: today }])
    await pool.query(`UPDATE films SET added_at = '2020-05-05'`)
    const res = await upload(IMDB_HEADER + imdbLine(1, ''))
    expect(res.body).toMatchObject({ inserted: 0, updated: 0, unchanged: 1 })
    expect(await dates()).toEqual([{ title: 'IMDb 1', d: '2020-05-05' }])
  })

  it('importing it twice changes nothing, and a Letterboxd import keeps the IMDb films', async () => {
    await upload(IMDB_HEADER + imdbLine(1))
    expect((await upload(IMDB_HEADER + imdbLine(1))).body).toMatchObject({ inserted: 0, unchanged: 1, removed: [] })
    const res = await upload(HEADER + line(1), { dryRun: true })
    expect(res.body).toMatchObject({ source: 'letterboxd', inserted: 1, removed: [] })
  })

  it('an IMDb import does not remove Letterboxd films', async () => {
    await upload(HEADER + line(1) + line(2))
    const res = await upload(IMDB_HEADER + imdbLine(3), { dryRun: true })
    expect(res.body).toMatchObject({ inserted: 1, removed: [], requiresLargeRemovalConfirmation: false })
  })

  it('reports tvEpisode rows and keeps the film of a rejected row', async () => {
    await upload(IMDB_HEADER + imdbLine(1) + imdbLine(2))
    const episode = imdbLine(1).replace(',movie,', ',tvEpisode,')
    const res = await upload(IMDB_HEADER + episode + imdbLine(2), { dryRun: true })
    expect(res.body.rejected).toEqual([
      { line: 2, reason: 'TV episodes are not imported' },
    ])
    expect(res.body.removed).toEqual([])
  })

  it('removes only IMDb films with the preview token, and updates a title but keeps the date', async () => {
    await upload(HEADER + line(1))
    await upload(IMDB_HEADER + imdbLine(1) + imdbLine(2))
    const csv = IMDB_HEADER + imdbLine(1, '').replace('IMDb 1', 'Renamed')
    const preview = await upload(csv, { dryRun: true })
    expect(preview.body).toMatchObject({ updated: 1, removed: [{ title: 'IMDb 2' }] })
    const res = await upload(csv, { fields: { removalToken: preview.body.removalToken, confirmLargeRemoval: 'true' } })
    expect(res.status).toBe(200)
    expect(await dates()).toEqual([
      { title: 'Film 1', d: '2020-01-01' },
      { title: 'Renamed', d: '2022-03-11' },
    ])
  })

  it('takes the title id from the URL when Const is empty and does not duplicate on re-import', async () => {
    const csv = 'Const,Title,URL\n,Heat,https://m.imdb.com/title/tt0113277/?ref_=wl\n'
    await upload(csv)
    const res = await upload(csv)
    expect(res.body).toMatchObject({ source: 'imdb', inserted: 0, unchanged: 1 })
    expect((await pool.query('SELECT letterboxd_url FROM films')).rows).toEqual([
      { letterboxd_url: 'https://www.imdb.com/title/tt0113277/' },
    ])
  })

  it('does not remove a manually added film with an IMDb link when a Letterboxd file is imported', async () => {
    await pool.query(`INSERT INTO films (title, letterboxd_url) VALUES ('Manual', 'https://www.imdb.com/title/tt0113277/')`)
    const res = await upload(HEADER + line(1), { dryRun: true })
    expect(res.body.removed).toEqual([])
  })

  it('rejects a file that is neither format with a 400 naming both', async () => {
    const res = await upload('Foo,Bar\n1,2\n')
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/IMDb export/)
  })
})

describe('POST /api/films/import skips a film that is in both exports', () => {
  const IMDB_HEADER = 'Position,Const,Created,Title,URL,Title Type,Year\n'
  const heat = '1,tt0113277,2022-03-14,HEAT,https://www.imdb.com/title/tt0113277/,movie,2000\n'
  const other = '2,tt0000002,2022-03-15,Other,https://www.imdb.com/title/tt0000002/,movie,2005\n'
  const letterboxdHeat = '2020-01-01,Heat,2000,https://boxd.it/heat\n'

  it('reports the skipped row with the film it matches, adds nothing for it, and does so on every import', async () => {
    await upload(HEADER + letterboxdHeat)
    const check = await upload(IMDB_HEADER + heat + other, { dryRun: true })
    expect(check.body).toMatchObject({ source: 'imdb', inserted: 1, removed: [] })
    expect(check.body.skipped).toEqual([
      { line: 2, title: 'HEAT', releaseYear: 2000, existing: { id: expect.any(Number), title: 'Heat', releaseYear: 2000 } },
    ])
    expect((await upload(IMDB_HEADER + heat + other)).body).toMatchObject({ applied: true, inserted: 1 })
    expect(await titles()).toEqual(['Heat', 'Other'])
    const again = await upload(IMDB_HEADER + heat + other)
    expect(again.body).toMatchObject({ inserted: 0, updated: 0, unchanged: 1 })
    expect(again.body.skipped).toHaveLength(1)
    expect(await titles()).toEqual(['Heat', 'Other'])
  })

  it('also skips a Letterboxd row for a film that came from IMDb', async () => {
    await upload(IMDB_HEADER + heat)
    const res = await upload(HEADER + letterboxdHeat)
    expect(res.body).toMatchObject({ source: 'letterboxd', inserted: 0 })
    expect(res.body.skipped).toHaveLength(1)
    expect(await titles()).toEqual(['HEAT'])
  })

  it('has an empty skipped list when nothing matches', async () => {
    expect((await upload(HEADER + line(1), { dryRun: true })).body.skipped).toEqual([])
  })
})

describe('skipping a film that is in both exports: more cases', () => {
  const IMDB_HEADER = 'Position,Const,Created,Title,URL,Title Type,Year\n'
  const imdb = (n: number, title: string, year: number) =>
    `${n},tt000000${n},2022-03-14,${title},https://www.imdb.com/title/tt000000${n}/,movie,${year}\n`

  it('skips both rows of a file that match the same film and lists the film for each', async () => {
    await upload(HEADER + '2020-01-01,Heat,2000,https://boxd.it/heat\n')
    const res = await upload(IMDB_HEADER + imdb(1, 'Heat', 2000) + imdb(2, 'HEAT', 2000), { dryRun: true })
    expect(res.body).toMatchObject({ inserted: 0 })
    expect(res.body.skipped.map((s: { line: number; existing: { title: string } }) => [s.line, s.existing.title])).toEqual([
      [2, 'Heat'],
      [3, 'Heat'],
    ])
  })

  it('skips a row that matches a watched film and leaves that film as it is', async () => {
    await upload(HEADER + '2020-01-01,Heat,2000,https://boxd.it/heat\n')
    await pool.query(`UPDATE films SET watched_at = now()`)
    const res = await upload(IMDB_HEADER + imdb(1, 'Heat', 2000))
    expect(res.body).toMatchObject({ applied: true, inserted: 0, removed: [], keptWatched: [] })
    expect(res.body.skipped).toHaveLength(1)
    expect((await pool.query('SELECT watched_at FROM films')).rows).toHaveLength(1)
  })

  it('applies against the films stored at apply time, not those of the preview', async () => {
    const file = IMDB_HEADER + imdb(1, 'Heat', 2000)
    expect((await upload(file, { dryRun: true })).body).toMatchObject({ inserted: 1, skipped: [] })
    await upload(HEADER + '2020-01-01,Heat,2000,https://boxd.it/heat\n')
    const res = await upload(file)
    expect(res.body).toMatchObject({ applied: true, inserted: 0 })
    expect(res.body.skipped).toHaveLength(1)
    expect(await titles()).toEqual(['Heat'])
  })

  it('does not change the removal token or the removals of the other source', async () => {
    await upload(HEADER + '2020-01-01,Heat,2000,https://boxd.it/heat\n' + line(1))
    const res = await upload(IMDB_HEADER + imdb(1, 'Heat', 2000), { dryRun: true })
    expect(res.body.removed).toEqual([])
    expect(res.body.skipped).toHaveLength(1)
    expect(res.body.requiresLargeRemovalConfirmation).toBe(false)
  })

  it('does not skip a film without a year', async () => {
    await upload(HEADER + '2020-01-01,Heat,,https://boxd.it/heat\n')
    const res = await upload(IMDB_HEADER + imdb(1, 'Heat', 2000))
    expect(res.body).toMatchObject({ inserted: 1, skipped: [] })
  })

  it('has the skipped list in both the preview and the applied report', async () => {
    await upload(HEADER + '2020-01-01,Heat,2000,https://boxd.it/heat\n')
    for (const dryRun of [true, false]) {
      const res = await upload(IMDB_HEADER + imdb(1, 'Heat', 2000), { dryRun })
      expect(res.body.skipped[0]).toEqual({ line: 2, title: 'Heat', releaseYear: 2000, existing: expect.objectContaining({ title: 'Heat', releaseYear: 2000 }) })
      expect(typeof res.body.skipped[0].releaseYear).toBe('number')
    }
  })
})
