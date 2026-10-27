import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { test, expect, type Page } from '@playwright/test'
import { bigBuckBunny, elephantsDream, films, sintel, tearsOfSteel } from './sampleFilms'

const OUT = resolve(import.meta.dirname, '../../documentation/ui/images')
mkdirSync(OUT, { recursive: true })

const posters = new Map<string, Buffer>()

/** Answers the API in the browser, so no database and no TMDB token are needed. Posters come from TMDB's image server. */
async function stubApi(page: Page) {
  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname.replace('/api', '')
    const json = (body: unknown) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) })

    if (path === '/films/random') return json(bigBuckBunny)
    if (path === '/films/import') {
      return json({
        source: 'letterboxd',
        applied: false,
        inserted: 3,
        updated: 0,
        unchanged: 0,
        skipped: [],
        removed: [],
        keptWatched: [{ id: elephantsDream.id, title: elephantsDream.title, releaseYear: elephantsDream.releaseYear }],
        rejected: [{ line: 5, reason: 'Name is empty' }],
        removalToken: 'sample',
        requiresLargeRemovalConfirmation: false,
      })
    }
    if (path === '/films' && request.method() === 'GET') {
      return json({ items: films, total: films.length, page: 1, pageSize: 50 })
    }
    const poster = /^\/films\/(\d+)\/poster$/.exec(path)
    if (poster) {
      const film = films.find((f) => f.id === Number(poster[1]))
      if (!film?.posterPath) return route.fulfill({ status: 404 })
      if (!posters.has(film.posterPath)) {
        const response = await fetch(`https://image.tmdb.org/t/p/w500${film.posterPath}`).catch((error: Error) => {
          throw new Error(`Poster ${film.posterPath} could not be loaded (is the internet connection up?): ${error.message}`)
        })
        if (!response.ok) throw new Error(`Poster ${film.posterPath}: HTTP ${response.status}`)
        posters.set(film.posterPath, Buffer.from(await response.arrayBuffer()))
      }
      return route.fulfill({ contentType: 'image/jpeg', body: posters.get(film.posterPath)! })
    }
    const one = /^\/films\/(\d+)$/.exec(path)
    const found = films.find((f) => f.id === Number(one?.[1]))
    if (found) return json(found)
    return route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"Not found"}' })
  })
}

async function shoot(page: Page, name: string) {
  // wait for the posters, then give fonts and layout a moment to settle
  await page.waitForFunction(() => [...document.images].every((img) => img.complete && img.naturalWidth > 0))
  await page.evaluate(() => document.fonts.ready)
  writeFileSync(resolve(OUT, `${name}.png`), await page.screenshot({ fullPage: true }))
}

test.beforeEach(async ({ page }) => {
  await stubApi(page)
})

test('roulette', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 2, name: bigBuckBunny.title })).toBeVisible()
  await shoot(page, 'roulette')
})

test('watchlist', async ({ page }) => {
  await page.goto('/watchlist')
  for (const { title } of [sintel, tearsOfSteel]) {
    await expect(page.getByRole('link', { name: title, exact: true })).toBeVisible()
  }
  await shoot(page, 'watchlist')
})

test('import', async ({ page }) => {
  await page.goto('/import')
  await page.locator('#csv').setInputFiles({
    name: 'watchlist.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('Date,Name,Year,Letterboxd URI\n'),
  })
  await page.getByRole('button', { name: 'Check file' }).click()
  await expect(page.getByRole('heading', { name: 'Check result' })).toBeVisible()
  await shoot(page, 'import')
})

test('film details', async ({ page }) => {
  await page.goto(`/watchlist/${bigBuckBunny.id}`)
  await expect(page.getByRole('heading', { level: 1, name: bigBuckBunny.title })).toBeVisible()
  await shoot(page, 'film-details')
})
