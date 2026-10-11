import { afterEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { expectNoA11yViolations, makeFilm, mountWithApp } from '../../__tests__/helpers'
import AppIcon from '../AppIcon.vue'
import AppLayout from '../AppLayout.vue'
import BrandMark from '../BrandMark.vue'
import ErrorAlert from '../ErrorAlert.vue'
import FilmCard from '../FilmCard.vue'
import FilmFacts from '../FilmFacts.vue'
import FormField from '../FormField.vue'
import IconButton from '../IconButton.vue'
import ImportSummary from '../ImportSummary.vue'
import PosterImage from '../PosterImage.vue'
import TmdbAttribution from '../TmdbAttribution.vue'
import type { ImportReport } from '../../types'

enableAutoUnmount(afterEach)
afterEach(() => {
  document.body.innerHTML = ''
})

describe('IconButton', () => {
  it('is a button named by its label, with the icon hidden from assistive technology', async () => {
    const wrapper = mount(IconButton, { props: { label: 'Spin again', icon: 'spin' }, attachTo: document.body })
    const button = wrapper.get('button')
    expect(button.attributes('aria-label')).toBe('Spin again')
    expect(button.attributes('type')).toBe('button')
    expect(wrapper.get('svg').attributes('aria-hidden')).toBe('true')
    expect(wrapper.get('.icon-button__tip').text()).toBe('Spin again')
    await expectNoA11yViolations(wrapper.element)
  })

  it('shows a shorter tooltip text than the full accessible name', () => {
    const wrapper = mount(IconButton, {
      props: { label: 'Mark as watched: Stalker', tooltip: 'Mark as watched', icon: 'eye' },
    })
    expect(wrapper.get('button').attributes('aria-label')).toBe('Mark as watched: Stalker')
    expect(wrapper.get('.icon-button__tip').text()).toBe('Mark as watched')
  })

  it('hides the tooltip on Esc and shows it again on the next hover or focus', async () => {
    const wrapper = mount(IconButton, { props: { label: 'Edit', icon: 'pencil' }, attachTo: document.body })
    const tip = () => wrapper.get('.icon-button__tip')
    expect(tip().isVisible()).toBe(true)
    await wrapper.get('button').trigger('keydown', { key: 'Escape' })
    expect(tip().isVisible()).toBe(false)
    await wrapper.get('button').trigger('mouseenter')
    expect(tip().isVisible()).toBe(true)
    await wrapper.get('button').trigger('keydown', { key: 'Escape' })
    await wrapper.get('button').trigger('focus')
    expect(tip().isVisible()).toBe(true)
  })

  it('passes disabled and click through to the button', async () => {
    const wrapper = mount(IconButton, { props: { label: 'Next page', icon: 'right' }, attrs: { disabled: true } })
    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
    const clicked = mount(IconButton, { props: { label: 'Go', icon: 'plus' }, attrs: { onClick: () => 'x' } })
    await clicked.get('button').trigger('click')
  })

  it('renders a link when given a route', async () => {
    const { wrapper } = await mountWithApp(IconButton, '/', {
      props: { label: 'Edit Joy', icon: 'pencil', to: '/watchlist/1/edit' },
    })
    const link = wrapper.get('a')
    expect(link.attributes('href')).toBe('/watchlist/1/edit')
    expect(link.attributes('aria-label')).toBe('Edit Joy')
    expect(wrapper.find('button').exists()).toBe(false)
    await expectNoA11yViolations(wrapper.element)
  })
})

describe('FormField', () => {
  const field = (props: object) =>
    mount(FormField, {
      props: { id: 'f', label: 'Title', ...props },
      slots: { default: '<template #default="{ attrs }"><input v-bind="attrs" /></template>' },
      attachTo: document.body,
    })

  it('connects label, hint and error to the control', async () => {
    const wrapper = field({ hint: 'Some hint', error: 'Bad value', required: true })
    const input = wrapper.get('input')
    expect(wrapper.get('label').attributes('for')).toBe('f')
    expect(wrapper.get('label').text()).toBe('Title (required)')
    expect(input.attributes('id')).toBe('f')
    expect(input.attributes('aria-invalid')).toBe('true')
    expect(input.attributes('aria-describedby')).toBe('f-hint f-error')
    expect(wrapper.get('#f-error').text()).toBe('Bad value')
    await expectNoA11yViolations(wrapper.element)
  })

  it('has no description or invalid state without hint and error', () => {
    const input = field({}).get('input')
    expect(input.attributes('aria-describedby')).toBeUndefined()
    expect(input.attributes('aria-invalid')).toBeUndefined()
  })
})

describe('ErrorAlert', () => {
  it('is an alert with the message and optional actions', async () => {
    const wrapper = mount(ErrorAlert, {
      props: { message: 'Nope' },
      slots: { default: '<button>Retry</button>' },
      attachTo: document.body,
    })
    expect(wrapper.get('[role="alert"]').text()).toContain('Nope')
    expect(wrapper.text()).toContain('Retry')
    await expectNoA11yViolations(wrapper.element)
  })
})

describe('PosterImage', () => {
  it('loads the poster through the backend', () => {
    const wrapper = mount(PosterImage, { props: { filmId: 5, hasPoster: true } })
    expect(wrapper.get('img').attributes('src')).toBe('/api/films/5/poster')
    expect(wrapper.get('img').attributes('alt')).toBe('')
  })

  it('shows a placeholder without a poster', () => {
    const wrapper = mount(PosterImage, { props: { filmId: 5, hasPoster: false } })
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.text()).toBe('No poster')
  })

  it('falls back to the placeholder when the image fails, and tries again for another film', async () => {
    const wrapper = mount(PosterImage, { props: { filmId: 5, hasPoster: true } })
    await wrapper.get('img').trigger('error')
    expect(wrapper.find('img').exists()).toBe(false)
    await wrapper.setProps({ filmId: 6 })
    expect(wrapper.get('img').attributes('src')).toBe('/api/films/6/poster')
  })
})

describe('FilmCard', () => {
  it('says "Created by" and "Episode runtime" for a TV show', () => {
    const show = makeFilm({ tmdb: { id: 1396, mediaType: 'tv', status: 'matched', syncedAt: null } })
    const text = mount(FilmCard, { props: { film: show } }).text()
    expect(text).toContain('Created by Wim Wenders')
    expect(text).not.toContain('Directed by')
    expect(text).toContain('Episode runtime')
  })

  it('shows the film details', async () => {
    const wrapper = mount(FilmCard, { props: { film: makeFilm() }, attachTo: document.body })
    const text = wrapper.text()
    expect(wrapper.get('h2').text()).toBe('Perfect Days')
    expect(text).toContain('2023')
    expect(text).toContain('124 min')
    expect(text).toContain('7.9 / 10')
    expect(text).toContain('JP')
    expect(text).toContain('Directed by Wim Wenders · Drama')
    expect(text).toContain('A janitor in Tokyo')
    expect(text).toContain('On your list since 12 Mar 2025')
    const link = wrapper.get('a')
    expect(link.attributes('href')).toBe('https://boxd.it/abc')
    expect(link.attributes('rel')).toContain('noopener')
    expect(link.text()).toContain('opens in a new tab')
    await expectNoA11yViolations(wrapper.element)
  })

  it('leaves out what the film does not have', () => {
    const wrapper = mount(FilmCard, {
      props: {
        film: makeFilm({
          releaseYear: null,
          runtimeMinutes: null,
          voteAverage: null,
          countries: [],
          genres: [],
          directors: [],
          overview: null,
          letterboxdUrl: null,
          posterPath: null,
        }),
      },
    })
    expect(wrapper.find('dl').exists()).toBe(false)
    expect(wrapper.find('a').exists()).toBe(false)
    expect(wrapper.find('.film-card__credits').exists()).toBe(false)
    expect(wrapper.find('.film-card__overview').exists()).toBe(false)
    expect(wrapper.text()).toContain('No poster')
  })

  it('shows when the film was watched', () => {
    const wrapper = mount(FilmCard, { props: { film: makeFilm({ watchedAt: '2026-01-05T10:00:00.000Z' }) } })
    expect(wrapper.text()).toContain('Watched 5 Jan 2026')
  })
})

describe('TmdbAttribution', () => {
  it('shows the required notice, the logo and a link to TMDB', async () => {
    const wrapper = mount(TmdbAttribution, { attachTo: document.body })
    expect(wrapper.text()).toContain(
      'This product uses the TMDB API but is not endorsed or certified by TMDB.',
    )
    const logo = wrapper.get('img.tmdb__logo')
    expect(logo.attributes('alt')).toBe('TMDB')
    // the test runner inlines small assets; the production build keeps the path (see branding.spec.ts)
    expect(logo.attributes('src')).toMatch(/^(\/tmdb-logo\.svg|data:image\/svg\+xml,)/)
    expect(wrapper.find('[role="img"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('TMDB LOGO')
    const link = wrapper.get('a')
    expect(link.attributes('href')).toBe('https://www.themoviedb.org/')
    expect(link.attributes('rel')).toContain('noopener')
    await expectNoA11yViolations(wrapper.element)
  })
})

describe('TmdbAttribution logo size', () => {
  it('is reserved with a width and a height, so the footer does not jump, and stays below the header logo', () => {
    const logo = mount(TmdbAttribution).get('img.tmdb__logo')
    const height = Number(logo.attributes('height'))
    expect(Number(logo.attributes('width'))).toBe(108)
    expect(height).toBe(14)
    // TMDB's terms ask for a logo that is less prominent than the app's own (36 px in the header)
    expect(height).toBeLessThan(36)
  })

  it.each(['/import', '/', '/watchlist', '/no-such-page'])(
    'keeps the logo and the notice in the footer on %s',
    async (path) => {
      const { wrapper } = await mountWithApp(AppLayout, path)
      expect(wrapper.findAll('footer img[alt="TMDB"]')).toHaveLength(1)
      expect(wrapper.find('footer a[href="https://www.themoviedb.org/"]').exists()).toBe(true)
      expect(wrapper.get('footer').text()).toContain('not endorsed or certified by TMDB')
    },
  )
})

describe('AppLayout', () => {
  it('has a skip link, landmarks and the attribution footer', async () => {
    const { wrapper } = await mountWithApp(AppLayout, '/import')
    expect(wrapper.get('a.skip').attributes('href')).toBe('#main')
    expect(wrapper.find('header').exists()).toBe(true)
    expect(wrapper.get('nav').attributes('aria-label')).toBe('Main')
    expect(wrapper.get('main#main').attributes('tabindex')).toBe('-1')
    expect(wrapper.find('footer').text()).toContain('TMDB')
    await expectNoA11yViolations(wrapper.element)
  })

  it('marks only the current page with aria-current', async () => {
    const { wrapper } = await mountWithApp(AppLayout, '/watchlist')
    const current = wrapper.findAll('nav a[aria-current="page"]')
    expect(current.map((a) => a.text())).toEqual(['Watchlist'])
    expect(wrapper.findAll('nav a').map((a) => a.text())).toEqual(['Roulette', 'Watchlist', 'Import'])
  })

  it('highlights the section for nested pages without calling them the current page', async () => {
    const { wrapper } = await mountWithApp(AppLayout, '/watchlist/new')
    const watchlist = wrapper.findAll('nav a')[1]!
    expect(watchlist.classes()).toContain('is-section')
    expect(watchlist.attributes('aria-current')).toBeUndefined()
    expect(wrapper.findAll('nav a')[0]!.classes()).not.toContain('is-section')
  })

  it('only marks Roulette on the home page', async () => {
    const { wrapper } = await mountWithApp(AppLayout, '/')
    expect(wrapper.findAll('nav a[aria-current="page"]').map((a) => a.text())).toEqual(['Roulette'])
  })
})

describe('ImportSummary', () => {
  const report = (patch: Partial<ImportReport> = {}): ImportReport => ({
    applied: false,
    inserted: 12,
    updated: 3,
    unchanged: 480,
    removed: [{ id: 7, title: 'Metropolis', releaseYear: 1927 }],
    keptWatched: [{ id: 8, title: 'Stalker', releaseYear: null }],
    rejected: [{ line: 5, reason: 'Name is empty' }],
    requiresLargeRemovalConfirmation: false,
    ...patch,
  })

  it('lists counts, removals, kept films and rejected rows for a check', async () => {
    const wrapper = mount(ImportSummary, { props: { report: report() }, attachTo: document.body })
    const text = wrapper.text()
    expect(text).toContain('Will be added12')
    expect(text).toContain('Will be updated3')
    expect(text).toContain('Unchanged480')
    expect(text).toContain('Will be removed1')
    expect(text).toContain('Rejected rows1')
    expect(text).toContain('Metropolis (1927)')
    expect(text).toContain('Kept because you watched them')
    expect(wrapper.get('li:last-of-type, ul li').text()).toBeTruthy()
    expect(text).toContain('1 row was rejected')
    expect(wrapper.get('tbody th').text()).toBe('5')
    expect(wrapper.get('tbody td').text()).toBe('Name is empty')
    await expectNoA11yViolations(wrapper.element)
  })

  it('uses past tense after the import', () => {
    const text = mount(ImportSummary, { props: { report: report({ applied: true }) } }).text()
    expect(text).toContain('Added12')
    expect(text).toContain('Removed1')
    expect(text).toContain('Removed from your list')
  })

  it('hides the sections that are empty', () => {
    const wrapper = mount(ImportSummary, {
      props: { report: report({ removed: [], keptWatched: [], rejected: [{ line: 1, reason: 'a' }, { line: 2, reason: 'b' }] }) },
    })
    expect(wrapper.find('#removed-heading').exists()).toBe(false)
    expect(wrapper.find('#kept-heading').exists()).toBe(false)
    expect(wrapper.text()).toContain('2 rows were rejected')
    expect(mount(ImportSummary, { props: { report: report({ rejected: [] }) } }).find('table').exists()).toBe(false)
  })

  it('shows a film without a year by title only', () => {
    const text = mount(ImportSummary, { props: { report: report() } }).text()
    expect(text).toContain('Stalker')
    expect(text).not.toContain('Stalker (')
  })

  it('shows a header-only file (nothing to do) as zero counts without sections', async () => {
    const wrapper = mount(ImportSummary, {
      props: {
        report: report({ inserted: 0, updated: 0, unchanged: 0, removed: [], keptWatched: [], rejected: [] }),
      },
      attachTo: document.body,
    })
    expect(wrapper.findAll('dd').map((dd) => dd.text())).toEqual(['0', '0', '0', '0', '0'])
    expect(wrapper.findAll('section')).toHaveLength(0)
    await expectNoA11yViolations(wrapper.element)
  })

  it('lists every rejected row with its line number and keeps non-ASCII reasons', () => {
    const wrapper = mount(ImportSummary, {
      props: { report: report({ rejected: [{ line: 2, reason: 'Jahr ungültig: 日本' }, { line: 40, reason: 'Name is empty' }] }) },
    })
    expect(wrapper.findAll('tbody tr').map((tr) => tr.text())).toEqual(['2Jahr ungültig: 日本', '40Name is empty'])
    expect(wrapper.findAll('thead th').length).toBeGreaterThan(0)
  })

  it('has no axe violations after the import with every section', async () => {
    const wrapper = mount(ImportSummary, { props: { report: report({ applied: true }) }, attachTo: document.body })
    expect(wrapper.findAll('section')).toHaveLength(3)
    await expectNoA11yViolations(wrapper.element)
  })
})

describe('AppIcon', () => {
  const names = ['spin', 'eye', 'eye-off', 'pencil', 'match', 'plus', 'left', 'right', 'chevron-down', 'x', 'alert'] as const

  it.each(names)('draws the %s icon, hidden from assistive technology', (name) => {
    const svg = mount(AppIcon, { props: { name } }).get('svg')
    expect(svg.attributes('aria-hidden')).toBe('true')
    expect(svg.attributes('focusable')).toBe('false')
    expect(svg.get('path').attributes('d')).toMatch(/^M/)
  })

  it('is 24 px by default and takes a custom size', () => {
    expect(mount(AppIcon, { props: { name: 'plus' } }).get('svg').attributes()).toMatchObject({ width: '24', height: '24' })
    expect(mount(AppIcon, { props: { name: 'plus', size: 16 } }).get('svg').attributes()).toMatchObject({
      width: '16',
      height: '16',
    })
  })

  it('draws every icon on a 24 px grid', () => {
    for (const name of names) {
      expect(mount(AppIcon, { props: { name } }).get('svg').attributes('viewBox')).toBe('0 0 24 24')
    }
  })

  it('draws a different shape for every icon', () => {
    const shapes = names.map((name) => mount(AppIcon, { props: { name } }).get('path').attributes('d'))
    expect(new Set(shapes).size).toBe(names.length)
  })
})

describe('IconButton: edge cases', () => {
  it('hides the tooltip on Esc for the link variant too, and keeps focus where it was', async () => {
    const { wrapper } = await mountWithApp(IconButton, '/', { props: { label: 'Edit Joy', icon: 'pencil', to: '/watchlist/1/edit' } })
    const link = wrapper.get('a')
    ;(link.element as HTMLElement).focus()
    await link.trigger('keydown', { key: 'Escape' })
    expect(wrapper.get('.icon-button__tip').isVisible()).toBe(false)
    expect(document.activeElement).toBe(link.element)
  })

  it('does not hide the tooltip for other keys', async () => {
    const wrapper = mount(IconButton, { props: { label: 'Edit', icon: 'pencil' }, attachTo: document.body })
    await wrapper.get('button').trigger('keydown', { key: 'Enter' })
    expect(wrapper.get('.icon-button__tip').isVisible()).toBe(true)
  })

  it('keeps the tooltip out of the accessibility tree so the name is read once', () => {
    const wrapper = mount(IconButton, { props: { label: 'Edit', icon: 'pencil' } })
    expect(wrapper.get('.icon-button__tip').attributes('aria-hidden')).toBe('true')
  })

  it('does not fire click on a disabled button', async () => {
    let clicks = 0
    const wrapper = mount(IconButton, {
      props: { label: 'Next page', icon: 'right' },
      attrs: { disabled: true, onClick: () => clicks++ },
    })
    await wrapper.get('button').trigger('click')
    expect(clicks).toBe(0)
  })

  it('can be a submit button of another form', () => {
    const wrapper = mount(IconButton, { props: { label: 'Spin', icon: 'spin' }, attrs: { type: 'submit', form: 'f' } })
    expect(wrapper.get('button').attributes()).toMatchObject({ type: 'submit', form: 'f' })
  })

  it('has no axe violations for the large primary variant', async () => {
    const wrapper = mount(IconButton, {
      props: { label: 'Spin again', icon: 'spin', variant: 'primary', large: true },
      attachTo: document.body,
    })
    expect(wrapper.get('button').attributes('aria-label')).toBe('Spin again')
    await expectNoA11yViolations(wrapper.element)
  })
})

describe('PosterImage: edge cases', () => {
  it('keeps the placeholder when the same film is picked again after a failure', async () => {
    const wrapper = mount(PosterImage, { props: { filmId: 5, hasPoster: true } })
    await wrapper.get('img').trigger('error')
    await wrapper.setProps({ hasPoster: true })
    expect(wrapper.find('img').exists()).toBe(false)
  })

  it('hides the placeholder text from assistive technology and has no axe violations', async () => {
    const wrapper = mount(PosterImage, { props: { filmId: 5, hasPoster: false }, attachTo: document.body })
    expect(wrapper.get('span').attributes('aria-hidden')).toBe('true')
    await expectNoA11yViolations(wrapper.element)
  })

  it('shows the placeholder when a poster appears for a film that had none and loads it', async () => {
    const wrapper = mount(PosterImage, { props: { filmId: 5, hasPoster: false } })
    await wrapper.setProps({ hasPoster: true })
    expect(wrapper.get('img').attributes('src')).toBe('/api/films/5/poster')
  })
})

describe('FormField: edge cases', () => {
  const field = (props: object) =>
    mount(FormField, {
      props: { id: 'f', label: 'Title', ...props },
      slots: { default: '<template #default="{ attrs }"><input v-bind="attrs" /></template>' },
      attachTo: document.body,
    })

  it('describes the control by the hint alone, or by the error alone', () => {
    expect(field({ hint: 'h' }).get('input').attributes('aria-describedby')).toBe('f-hint')
    expect(field({ error: 'e' }).get('input').attributes('aria-describedby')).toBe('f-error')
  })

  it('shows no "(required)" text unless required', () => {
    expect(field({}).get('label').text()).toBe('Title')
  })

  it('ignores an empty error text', () => {
    const wrapper = field({ error: '' })
    expect(wrapper.find('.field__error').exists()).toBe(false)
    expect(wrapper.get('input').attributes('aria-invalid')).toBeUndefined()
  })
})

describe('FilmCard: edge cases', () => {
  it('shows a long title and a non-ASCII title unchanged', () => {
    const title = '千と千尋の神隠し '.repeat(30).trim()
    expect(mount(FilmCard, { props: { film: makeFilm({ title }) } }).get('h2').text()).toBe(title)
  })

  it('shows a rating of 0 and a runtime of 0 instead of hiding them', () => {
    const text = mount(FilmCard, { props: { film: makeFilm({ voteAverage: 0, runtimeMinutes: 0 }) } }).text()
    expect(text).toContain('0.0 / 10')
    expect(text).toContain('0 min')
  })

  it('lists several countries, directors and genres', () => {
    const text = mount(FilmCard, {
      props: {
        film: makeFilm({
          countries: ['JP', 'FR'],
          directors: [{ id: 1, name: 'A' }, { id: 2, name: 'B' }],
          genres: [{ id: 18, name: 'Drama' }, { id: 35, name: 'Comedy' }],
        }),
      },
    }).text()
    expect(text).toContain('JP, FR')
    expect(text).toContain('Directed by A, B · Drama, Comedy')
  })

  it('shows genres without directors', () => {
    const wrapper = mount(FilmCard, { props: { film: makeFilm({ directors: [] }) } })
    expect(wrapper.get('.film-card__credits').text()).toBe('Drama')
  })
})

describe('AppLayout: edge cases', () => {
  it('shows no section highlight on an unknown page', async () => {
    const { wrapper } = await mountWithApp(AppLayout, '/nope')
    expect(wrapper.findAll('nav a[aria-current="page"]')).toHaveLength(0)
    expect(wrapper.findAll('nav a.is-section')).toHaveLength(0)
  })

  it('highlights the Watchlist section on the edit and match pages (and the details page, without aria-current)', async () => {
    for (const path of ['/watchlist/3', '/watchlist/3/edit', '/watchlist/3/match']) {
      const { wrapper } = await mountWithApp(AppLayout, path)
      expect(wrapper.findAll('nav a')[1]!.classes()).toContain('is-section')
      expect(wrapper.findAll('nav a[aria-current="page"]')).toHaveLength(0)
      wrapper.unmount()
    }
  })

  it('moves the first Tab stop to the skip link', async () => {
    const { wrapper } = await mountWithApp(AppLayout, '/')
    const first = wrapper.element.querySelector('a[href], button')
    expect(first?.classList.contains('skip')).toBe(true)
  })
})

describe('FilmFacts', () => {
  const facts = [
    { label: 'Year', value: 2023 },
    { label: 'Runtime', value: '124 min' },
  ]

  it('renders each fact as a term and its value in a description list', async () => {
    const wrapper = mount(FilmFacts, { props: { facts }, attachTo: document.body })
    expect(wrapper.findAll('dt').map((e) => e.text())).toEqual(['Year', 'Runtime'])
    expect(wrapper.findAll('dd').map((e) => e.text())).toEqual(['2023', '124 min'])
    await expectNoA11yViolations(wrapper.element)
  })

  it('is inline by default and a grid on request', () => {
    expect(mount(FilmFacts, { props: { facts } }).get('dl').classes()).toContain('facts--inline')
    expect(mount(FilmFacts, { props: { facts, layout: 'grid' } }).get('dl').classes()).toContain('facts--grid')
  })

  it('renders nothing for an empty list, so no empty <dl> reaches assistive technology', () => {
    expect(mount(FilmFacts, { props: { facts: [] } }).find('dl').exists()).toBe(false)
  })
})

describe('BrandMark', () => {
  it('draws the film ring: a ring in the text color around a dot in the accent color', () => {
    const svg = mount(BrandMark).get('svg')
    expect(svg.attributes('viewBox')).toBe('0 0 64 64')
    const [ring, dot] = svg.findAll('circle')
    expect(ring!.attributes('stroke')).toBe('currentColor')
    expect(ring!.attributes('stroke-dasharray')).toBeDefined()
    expect(dot!.attributes('fill')).toBe('var(--accent)')
  })

  it('is decorative and 32 px by default, or the given size', () => {
    const svg = mount(BrandMark).get('svg')
    expect(svg.attributes('aria-hidden')).toBe('true')
    expect(svg.attributes('focusable')).toBe('false')
    expect(svg.attributes()).toMatchObject({ width: '32', height: '32' })
    expect(mount(BrandMark, { props: { size: 48 } }).get('svg').attributes()).toMatchObject({ width: '48', height: '48' })
  })

  it('is shown in the page header next to the app name, with the name as the only text', async () => {
    const { wrapper } = await mountWithApp(AppLayout, '/')
    const brand = wrapper.get('.layout__brand')
    expect(brand.find('svg').attributes('aria-hidden')).toBe('true')
    expect(brand.text()).toBe('Watchlist Roulette')
  })
})

describe('IconButton tooltip (WCAG 1.4.13)', () => {
  const esc = () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
  const tipOf = (wrapper: ReturnType<typeof mount>) => wrapper.get('.icon-button__tip')

  it('is dismissed with Esc while only the pointer is on the button, without focus', async () => {
    const wrapper = mount(IconButton, { props: { label: 'Edit', icon: 'pencil' }, attachTo: document.body })
    await wrapper.get('button').trigger('mouseenter')
    expect(document.activeElement).not.toBe(wrapper.get('button').element)
    esc()
    await wrapper.vm.$nextTick()
    expect(tipOf(wrapper).isVisible()).toBe(false)
  })

  it('comes back on the next hover after it was dismissed', async () => {
    const wrapper = mount(IconButton, { props: { label: 'Edit', icon: 'pencil' }, attachTo: document.body })
    await wrapper.get('button').trigger('mouseenter')
    esc()
    await wrapper.get('button').trigger('mouseleave')
    await wrapper.get('button').trigger('mouseenter')
    expect(tipOf(wrapper).isVisible()).toBe(true)
  })

  it('ignores keys other than Esc while hovered', async () => {
    const wrapper = mount(IconButton, { props: { label: 'Edit', icon: 'pencil' }, attachTo: document.body })
    await wrapper.get('button').trigger('mouseenter')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    await wrapper.vm.$nextTick()
    expect(tipOf(wrapper).isVisible()).toBe(true)
  })

  it('stops listening for Esc when the pointer leaves, and when the button is removed', async () => {
    const remove = vi.spyOn(window, 'removeEventListener')
    const wrapper = mount(IconButton, { props: { label: 'Edit', icon: 'pencil' }, attachTo: document.body })
    await wrapper.get('button').trigger('mouseenter')
    await wrapper.get('button').trigger('mouseleave')
    expect(remove).toHaveBeenCalledWith('keydown', expect.any(Function))
    esc()
    await wrapper.vm.$nextTick()
    expect(tipOf(wrapper).isVisible()).toBe(true)

    await wrapper.get('button').trigger('mouseenter')
    remove.mockClear()
    wrapper.unmount()
    expect(remove).toHaveBeenCalledWith('keydown', expect.any(Function))
    remove.mockRestore()
  })

  it('keeps the tooltip inside the button, so hovering it keeps the button hovered', () => {
    const wrapper = mount(IconButton, { props: { label: 'Edit', icon: 'pencil' } })
    expect(wrapper.get('button').element.contains(tipOf(wrapper).element)).toBe(true)
  })

  it('does nothing when the tooltip itself is clicked', async () => {
    let clicks = 0
    const wrapper = mount(IconButton, { props: { label: 'Go', icon: 'plus' }, attrs: { onClick: () => clicks++ } })
    await tipOf(wrapper).trigger('click')
    expect(clicks).toBe(0)
    await wrapper.get('button').trigger('click')
    expect(clicks).toBe(1)
  })

  it('does not navigate when the tooltip of a link is clicked', async () => {
    const { wrapper, router } = await mountWithApp(IconButton, '/', {
      props: { label: 'Edit film: Joy', icon: 'pencil', to: '/watchlist/1/edit' },
    })
    await tipOf(wrapper).trigger('click')
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/'))
    await wrapper.get('a').trigger('click')
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/watchlist/1/edit'))
  })

  it('registers a single Esc listener when the pointer enters twice, and one leave removes it', async () => {
    const add = vi.spyOn(window, 'addEventListener')
    const wrapper = mount(IconButton, { props: { label: 'Edit', icon: 'pencil' }, attachTo: document.body })
    await wrapper.get('button').trigger('mouseenter')
    await wrapper.get('button').trigger('mouseenter')
    const calls = add.mock.calls.filter(([type]) => type === 'keydown')
    expect(new Set(calls.map(([, fn]) => fn)).size).toBe(1)
    add.mockRestore()
    await wrapper.get('button').trigger('mouseleave')
    esc()
    await wrapper.vm.$nextTick()
    expect(tipOf(wrapper).isVisible()).toBe(true)
  })

  it('dismisses only the tooltips of hovered buttons when Esc is pressed', async () => {
    const a = mount(IconButton, { props: { label: 'A', icon: 'pencil' }, attachTo: document.body })
    const b = mount(IconButton, { props: { label: 'B', icon: 'pencil' }, attachTo: document.body })
    await a.get('button').trigger('mouseenter')
    esc()
    await a.vm.$nextTick()
    expect(tipOf(a).isVisible()).toBe(false)
    expect(tipOf(b).isVisible()).toBe(true)
  })

  it('does not react to Esc after it was removed while hovered', async () => {
    const wrapper = mount(IconButton, { props: { label: 'Edit', icon: 'pencil' }, attachTo: document.body })
    await wrapper.get('button').trigger('mouseenter')
    wrapper.unmount()
    expect(() => esc()).not.toThrow()
  })

  it('shows the tooltip again on focus after Esc dismissed it, and Esc on the focused button dismisses it', async () => {
    const wrapper = mount(IconButton, { props: { label: 'Edit', icon: 'pencil' }, attachTo: document.body })
    await wrapper.get('button').trigger('mouseenter')
    esc()
    await wrapper.get('button').trigger('mouseleave')
    await wrapper.get('button').trigger('focus')
    expect(tipOf(wrapper).isVisible()).toBe(true)
    await wrapper.get('button').trigger('keydown', { key: 'Escape' })
    expect(tipOf(wrapper).isVisible()).toBe(false)
  })

  it('keeps the tooltip out of the accessibility tree, so the name is read once', () => {
    const wrapper = mount(IconButton, { props: { label: 'Edit', icon: 'pencil' } })
    expect(tipOf(wrapper).attributes('aria-hidden')).toBe('true')
  })
})
