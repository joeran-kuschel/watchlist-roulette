import { createRequire } from 'node:module'
import { test, expect, type Page } from '@playwright/test'

// The API is stubbed in the browser: these tests never touch a database, real or test.
const axePath = createRequire(import.meta.url).resolve('axe-core')

const film = (id: number, title: string, extra: Record<string, unknown> = {}) => ({
  id,
  title,
  releaseYear: 2000 + id,
  letterboxdUrl: `https://boxd.it/${id}`,
  addedAt: '2025-03-12',
  watchedAt: null,
  tmdb: { id: id * 10, status: 'matched', syncedAt: null },
  originalTitle: null,
  tagline: null,
  overview: 'A sample overview that is long enough to wrap onto more than one line in the film card.',
  runtimeMinutes: 100,
  voteAverage: 7.4,
  voteCount: 10,
  posterPath: null,
  backdropPath: null,
  countries: ['JP'],
  genres: [{ id: 18, name: 'Drama' }],
  directors: [{ id: 1, name: 'Sample Director' }],
  cast: [],
  ...extra,
})

async function stubApi(page: Page) {
  const films = [
    film(1, 'Perfect Days'),
    film(2, 'Aftersun', { watchedAt: '2025-03-04T10:00:00.000Z' }),
    film(3, 'Cléo from 5 to 7', { tmdb: { id: null, status: 'ambiguous', syncedAt: null } }),
  ]
  const calls: string[] = []
  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname.replace('/api', '')
    calls.push(`${request.method()} ${path}${url.search}`)
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

    if (path === '/films/random') return json(films.find((f) => !f.watchedAt))
    if (path === '/films/import') {
      return json({
        applied: url.searchParams.get('dryRun') !== 'true',
        inserted: 2,
        updated: 1,
        unchanged: 10,
        removed: [{ id: 9, title: 'Metropolis', releaseYear: 1927 }],
        keptWatched: [],
        rejected: [{ line: 5, reason: 'Name is empty' }],
        removalToken: 'tok',
        requiresLargeRemovalConfirmation: false,
      })
    }
    if (path === '/films' && request.method() === 'GET') {
      return json({ items: films, total: films.length, page: 1, pageSize: 50 })
    }
    if (path === '/films' && request.method() === 'POST') {
      const created = film(10, request.postDataJSON().title)
      films.push(created)
      return json(created, 201)
    }
    const match = /^\/films\/(\d+)$/.exec(path)
    const found = films.find((f) => f.id === Number(match?.[1]))
    if (match && found && request.method() === 'GET') return json(found)
    if (match && found && request.method() === 'PATCH') {
      const patch = request.postDataJSON()
      if ('watched' in patch) found.watchedAt = patch.watched ? '2026-10-11T10:00:00.000Z' : null
      return json(found)
    }
    return json({ error: 'Not found' }, 404)
  })
  return calls
}

/** Runs axe on the app in the real browser, where color contrast can be checked too (not on the dev-only Vue DevTools overlay). */
async function expectAccessible(page: Page) {
  await page.addScriptTag({ path: axePath })
  const violations = await page.evaluate(async () => {
    // @ts-expect-error axe is injected above
    const results = await window.axe.run('#app', { rules: { region: { enabled: false } } })
    return results.violations.map(
      (v: { id: string; help: string; nodes: { html: string }[] }) => `${v.id}: ${v.help} (${v.nodes[0]?.html.slice(0, 120)})`,
    )
  })
  expect(violations).toEqual([])
}

test.beforeEach(async ({ page }) => {
  await stubApi(page)
})

test('roulette picks a film, spins again and marks it as watched', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 2, name: 'Perfect Days' })).toBeVisible()
  await expect(page).toHaveTitle('Roulette · Watchlist Roulette')
  await expectAccessible(page)

  await page.getByRole('button', { name: 'Spin again' }).click()
  await expect(page.getByRole('heading', { level: 2, name: 'Perfect Days' })).toBeVisible()

  await page.getByRole('button', { name: 'Mark as watched' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'marked as watched' })).toBeAttached()
  await expect(page.getByRole('button', { name: 'Mark as watched' })).toBeDisabled()
})

test('the roulette form shows errors for invalid filters', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Country code').fill('J1')
  await page.getByRole('button', { name: 'Spin again' }).click()
  await expect(page.getByText('Use a two-letter country code')).toBeVisible()
})

test('the watchlist lists films, can be searched and updates a film', async ({ page }) => {
  await page.goto('/watchlist')
  await expect(page.getByRole('row')).toHaveCount(4)
  await expect(page.getByText('Needs review: several TMDB matches')).toBeVisible()
  await expectAccessible(page)

  await page.getByRole('button', { name: 'Mark Perfect Days as watched' }).click()
  await expect(page.getByText('Perfect Days is marked as watched.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Mark Perfect Days as unwatched' })).toBeVisible()

  await page.getByLabel('Search by title').fill('after')
  await page.getByRole('button', { name: 'Search' }).click()
  await expect(page).toHaveURL(/q=after/)
})

test('a film title opens its details page with links and an Edit button', async ({ page }) => {
  await page.goto('/watchlist')
  await page.getByRole('link', { name: 'Perfect Days', exact: true }).click()
  await expect(page).toHaveURL(/\/watchlist\/1$/)
  await expect(page).toHaveTitle('Film details · Watchlist Roulette')
  await expect(page.getByRole('heading', { level: 1, name: 'Perfect Days' })).toBeVisible()
  await expect(page.getByRole('link', { name: /Letterboxd/ })).toHaveAttribute('href', 'https://boxd.it/1')
  await expect(page.getByRole('link', { name: /The Movie Database/ })).toHaveAttribute(
    'href',
    'https://www.themoviedb.org/movie/10',
  )
  await expectAccessible(page)

  await page.getByRole('link', { name: 'Edit Perfect Days' }).click()
  await expect(page).toHaveURL(/\/watchlist\/1\/edit$/)
})

test('the details page of an unknown film says so', async ({ page }) => {
  await page.goto('/watchlist/99')
  await expect(page.getByRole('heading', { level: 1, name: 'Film not found' })).toBeVisible()
  await expect(page.getByRole('alert')).toBeVisible()
})

test('icon buttons show a tooltip on keyboard focus that Esc dismisses', async ({ page }) => {
  await page.goto('/watchlist')
  const button = page.getByRole('button', { name: 'Mark Perfect Days as watched' })
  await button.focus()
  const tip = button.locator('.icon-button__tip')
  await expect(tip).toBeVisible()
  await expect(tip).toHaveText('Mark as watched')
  await page.keyboard.press('Escape')
  await expect(tip).toBeHidden()
})

test('adding a film: errors first, then success', async ({ page }) => {
  await page.goto('/watchlist/new')
  await expectAccessible(page)
  await page.getByRole('button', { name: 'Save film' }).click()
  await expect(page.getByRole('alert')).toBeFocused()
  await expect(page.getByRole('link', { name: 'Enter a title.' })).toBeVisible()
  await expectAccessible(page)

  await page.getByLabel(/^Title/).fill('Joy')
  await page.getByRole('button', { name: 'Save film' }).click()
  await expect(page).toHaveURL(/\/watchlist$/)
  await expect(page.getByText('Joy was added.')).toBeVisible()
})

test('choosing a TMDB match from a pasted address', async ({ page }) => {
  await page.goto('/watchlist/3/match')
  await expect(page.getByRole('heading', { name: 'Choose the TMDB match' })).toBeVisible()
  await expectAccessible(page)
  await page.getByLabel('TMDB movie address or number').fill('nonsense')
  await page.getByRole('button', { name: 'Use this match' }).click()
  await expect(page.getByText('Enter the TMDB number')).toBeVisible()
})

test('importing a CSV: check, confirm the removal, import', async ({ page }) => {
  await page.goto('/import')
  await expectAccessible(page)
  await page.getByLabel('CSV file').setInputFiles({
    name: 'watchlist.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('Date,Name,Year,Letterboxd URI\n'),
  })
  await page.getByRole('button', { name: 'Check file' }).click()
  await expect(page.getByRole('heading', { name: 'Check result' })).toBeFocused()
  await expect(page.getByText('Metropolis (1927)')).toBeVisible()
  await expect(page.getByText('Name is empty')).toBeVisible()
  await expectAccessible(page)

  const importButton = page.getByRole('button', { name: 'Import films' })
  await expect(importButton).toBeDisabled()
  await page.getByLabel(/I understand that 1 film will be removed/).check()
  await importButton.click()
  await expect(page.getByRole('heading', { name: 'Import finished' })).toBeVisible()
})

test('keyboard users can skip to the main content', async ({ page }) => {
  await page.goto('/')
  await page.keyboard.press('Tab')
  const skip = page.getByRole('link', { name: 'Skip to main content' })
  await expect(skip).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('main')).toBeFocused()
})

test('the favicon files are served and the header shows the logo', async ({ page, request }) => {
  await page.goto('/')
  for (const [path, type] of [
    ['/favicon.svg', 'image/svg+xml'],
    ['/favicon.ico', 'image/'],
    ['/apple-touch-icon.png', 'image/png'],
  ] as const) {
    const response = await request.get(path)
    expect(response.ok(), path).toBe(true)
    expect(response.headers()['content-type']).toContain(type)
  }
  const links = await page.locator('head link[rel~="icon"], head link[rel="apple-touch-icon"]').evaluateAll(
    (els) => els.map((el) => el.getAttribute('href')),
  )
  expect(links).toEqual(['/favicon.svg', '/favicon.ico', '/apple-touch-icon.png'])
  await expect(page.locator('header svg[aria-hidden="true"]').first()).toBeVisible()
  await expect(page.locator('header')).toContainText('Watchlist Roulette')
})

test('an unknown address shows the not-found page', async ({ page }) => {
  await page.goto('/nope')
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()
  await expectAccessible(page)
})
