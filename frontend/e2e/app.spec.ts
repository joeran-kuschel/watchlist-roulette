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
  tmdb: { id: id * 10, mediaType: 'movie', status: 'matched', syncedAt: null },
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
    film(3, 'Cléo from 5 to 7', { tmdb: { id: null, mediaType: 'movie', status: 'ambiguous', syncedAt: null } }),
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

  await page.getByRole('button', { name: 'Mark as watched: Perfect Days' }).click()
  await expect(page.getByText('Perfect Days is marked as watched.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Mark as unwatched: Perfect Days' })).toBeVisible()

  await page.getByLabel('Search by title').fill('after')
  await page.getByRole('button', { name: 'Search' }).click()
  await expect(page).toHaveURL(/q=after/)
})

test('going back from a film keeps the search, filters and page of the watchlist', async ({ page }) => {
  const listUrl = /\/watchlist\?q=a&watched=false&sort=title&page=2$/
  await page.goto('/watchlist?q=a&watched=false&sort=title&page=2')
  await page.getByRole('link', { name: 'Perfect Days', exact: true }).click()
  await expect(page).toHaveURL(/\/watchlist\/1$/)

  await page.getByRole('link', { name: '← Back to watchlist' }).click()
  await expect(page).toHaveURL(listUrl)
  await expect(page.getByLabel('Search by title')).toHaveValue('a')
  await expect(page.getByLabel('Show')).toHaveValue('false')
  await expect(page.getByLabel('Sort by')).toHaveValue('title')

  // Cancel on the edit page leads back to the same list
  await page.getByRole('link', { name: 'Perfect Days', exact: true }).click()
  await page.getByRole('link', { name: 'Edit Perfect Days' }).click()
  await page.getByRole('link', { name: 'Cancel' }).click()
  await expect(page).toHaveURL(listUrl)
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

  // The Edit button of the details page shows the text "Edit", so its name is "Edit <title>"
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
  const button = page.getByRole('button', { name: 'Mark as watched: Perfect Days' })
  await button.focus()
  const tip = button.locator('.icon-button__tip')
  await expect(tip).toBeVisible()
  await expect(tip).toHaveText('Mark as watched')
  await page.keyboard.press('Escape')
  await expect(tip).toBeHidden()
})

// The layout is CSS only, so it is checked in a real browser. 320 px is the width WCAG 1.4.10 (reflow) names,
// 799 px is the widest card layout; from 801 px the table is back.
for (const width of [320, 375, 799]) {
  test(`the watchlist is one card per film without horizontal scrolling at ${width} px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 })
    await page.goto('/watchlist')
    await expect(page.getByRole('link', { name: 'Perfect Days', exact: true })).toBeVisible()

    const widths = await page.evaluate(() => ({
      page: document.documentElement.scrollWidth,
      screen: document.documentElement.clientWidth,
    }))
    expect(widths.page).toBeLessThanOrEqual(widths.screen)

    // every action button is on screen, and the status badges stay inside their card
    for (const button of await page.locator('tbody .icon-button').all()) {
      const box = (await button.boundingBox())!
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(width)
    }
    for (const card of await page.locator('tbody tr').all()) {
      const outer = (await card.boundingBox())!
      for (const badge of await card.locator('.badge').all()) {
        const box = (await badge.boundingBox())!
        expect(box.x + box.width).toBeLessThanOrEqual(outer.x + outer.width + 0.5)
      }
    }

    // the column headers are hidden but still there for screen readers, and the table is still a table
    await expect(page.getByRole('table', { name: 'Films on your watchlist' })).toHaveCount(1)
    await expect(page.getByRole('columnheader')).toHaveCount(5)
    expect((await page.locator('thead').boundingBox())!.width).toBeLessThanOrEqual(1)
    await expectAccessible(page)
  })
}

test('from 801 px the watchlist is a table with visible column headers again', async ({ page }) => {
  await page.setViewportSize({ width: 801, height: 800 })
  await page.goto('/watchlist')
  await expect(page.getByRole('columnheader', { name: 'Year' })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'Added' })).toBeVisible()
  const widths = await page.evaluate(() => ({
    page: document.documentElement.scrollWidth,
    screen: document.documentElement.clientWidth,
  }))
  expect(widths.page).toBeLessThanOrEqual(widths.screen)
})

test('a card with a very long title, no year and two badges stays inside the screen at 320 px, keyboard order is title, then actions', async ({
  page,
}) => {
  const longTitle = 'Supercalifragilisticexpialidocious'.repeat(3)
  const odd = film(7, longTitle, {
    releaseYear: null,
    watchedAt: '2025-03-04T10:00:00.000Z',
    tmdb: { id: null, mediaType: 'movie', status: 'ambiguous', syncedAt: null },
  })
  // registered after the shared stub, so it answers first
  await page.route('**/api/films?*', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ items: [odd], total: 1, page: 1, pageSize: 50 }),
    }),
  )
  await page.setViewportSize({ width: 320, height: 800 })
  await page.goto('/watchlist')
  const title = page.getByRole('link', { name: longTitle, exact: true })
  await expect(title).toBeVisible()

  const widths = await page.evaluate(() => ({
    page: document.documentElement.scrollWidth,
    screen: document.documentElement.clientWidth,
  }))
  expect(widths.page).toBeLessThanOrEqual(widths.screen)
  const card = (await page.locator('tbody tr').boundingBox())!
  const link = (await title.boundingBox())!
  expect(link.x + link.width).toBeLessThanOrEqual(card.x + card.width + 0.5)
  await expect(page.getByText('Watched 4 Mar 2025')).toBeVisible()
  await expect(page.getByText('Needs review: several TMDB matches')).toBeVisible()
  await expect(page.locator('tbody .watchlist__year')).toHaveText('—')
  await expectAccessible(page)

  await title.focus()
  for (const name of [
    `Mark as unwatched: ${longTitle}`,
    `Choose TMDB match: ${longTitle}`,
    `Edit film: ${longTitle}`,
  ]) {
    await page.keyboard.press('Tab')
    await expect(
      page.getByRole(name.startsWith('Mark') ? 'button' : 'link', { name }),
    ).toBeFocused()
  }
})

test('the pagination and the empty watchlist fit a 320 px screen', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 })
  await page.goto('/watchlist')
  await expect(page.getByRole('navigation', { name: 'Pagination' })).toBeVisible()
  const fitsNow = () =>
    page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)
  expect(await fitsNow()).toBe(true)
  for (const button of await page.locator('nav[aria-label="Pagination"] .icon-button').all()) {
    const box = (await button.boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(320)
  }
  await page.route('**/api/films?*', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ items: [], total: 0, page: 1, pageSize: 50 }),
    }),
  )
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Your watchlist is empty' })).toBeVisible()
  expect(await fitsNow()).toBe(true)
})

test('the card layout does not touch the table of rejected rows on the import page', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 })
  await page.goto('/import')
  await page.getByLabel('CSV file').setInputFiles({
    name: 'watchlist.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('Date,Name,Year,Letterboxd URI\n'),
  })
  await page.getByRole('button', { name: 'Check file' }).click()
  const table = page.getByRole('table', { name: 'Rejected rows' })
  await expect(table).toBeVisible()
  expect(await table.evaluate((t) => getComputedStyle(t).display)).toBe('table')
  expect(
    await page.locator('.table-wrap').evaluate((w) => getComputedStyle(w).borderTopWidth),
  ).toBe('1px')
  await expect(table.getByRole('columnheader', { name: 'Reason' })).toBeVisible()
})

// The CSS behind these (hoverable tooltip, bridge over the gap, no tooltip on disabled buttons) only runs in a real browser
test('a tooltip stays while the pointer moves onto it, Esc closes it without focus, a click on it does nothing', async ({
  page,
}) => {
  await page.goto('/watchlist')
  const link = page.getByRole('link', { name: 'Edit film: Perfect Days' })
  const tip = link.locator('.icon-button__tip')
  const button = (await link.boundingBox())!
  const overButton = () => page.mouse.move(button.x + button.width / 2, button.y + button.height / 2)

  await overButton()
  await expect(tip).toBeVisible()
  // Moves through the gap between the button and its tooltip, like a real pointer
  const box = (await tip.boundingBox())!
  const target = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  await page.mouse.move(target.x, target.y, { steps: 12 })
  await expect(tip).toBeVisible()
  expect(await tip.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('auto')

  // Only the pointer is on the button, nothing has keyboard focus
  expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('BODY')
  await page.keyboard.press('Escape')
  await expect(tip).toBeHidden()

  // It comes back on the next hover, and a click on it neither navigates nor hides it
  await page.mouse.move(0, 0)
  await overButton()
  await expect(tip).toBeVisible()
  await page.mouse.move(target.x, target.y, { steps: 12 })
  await page.mouse.click(target.x, target.y)
  await expect(page).toHaveURL(/\/watchlist$/)
  await expect(tip).toBeVisible()
})

test('a disabled icon button shows no tooltip but keeps its name', async ({ page }) => {
  await page.goto('/watchlist')
  const previous = page.getByRole('button', { name: 'Previous page' })
  await expect(previous).toBeDisabled()
  await previous.hover()
  await expect(previous.locator('.icon-button__tip')).toBeHidden()
  await expect(previous).toHaveAccessibleName('Previous page')
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
  await page.getByLabel('TMDB movie or TV show address or number').fill('nonsense')
  await page.getByRole('button', { name: 'Use this match' }).click()
  await expect(page.getByText('Enter the TMDB number')).toBeVisible()
})

test('the styled file chooser shows the file name, a focus ring and fits 320 px', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 })
  await page.goto('/import')
  const name = page.locator('#csv-name')
  await expect(name).toHaveText('No file chosen')
  await page.getByLabel('CSV file').setInputFiles({
    name: `${'very-long-file-name-'.repeat(12)}.csv`,
    mimeType: 'text/csv',
    buffer: Buffer.from('Date,Name,Year,Letterboxd URI\n'),
  })
  await expect(name).toContainText('very-long-file-name-')
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBe(true)
  // The input is visually hidden but not removed: it is 1 px big, focusable, and the styled button shows the ring
  const box = (await page.locator('#csv').boundingBox())!
  expect(box.width).toBeLessThanOrEqual(1)
  await page.locator('#csv').focus()
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.press('Tab')
  await expect(page.locator('#csv')).toBeFocused()
  const ring = await page.locator('.filepick__button').evaluate((b) => {
    const style = getComputedStyle(b)
    return { style: style.outlineStyle, width: parseFloat(style.outlineWidth) }
  })
  expect(ring.style).not.toBe('none')
  expect(ring.width).toBeGreaterThanOrEqual(2)
  await expectAccessible(page)
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
