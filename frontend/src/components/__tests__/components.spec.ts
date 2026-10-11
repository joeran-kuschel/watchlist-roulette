import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { expectNoA11yViolations, makeFilm, mountWithApp } from '../../__tests__/helpers'
import AppLayout from '../AppLayout.vue'
import ErrorAlert from '../ErrorAlert.vue'
import FilmCard from '../FilmCard.vue'
import FormField from '../FormField.vue'
import IconButton from '../IconButton.vue'
import ImportSummary from '../ImportSummary.vue'
import PosterImage from '../PosterImage.vue'
import TmdbAttribution from '../TmdbAttribution.vue'
import type { ImportReport } from '../../types'

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

  it('shows a different tooltip text than the full accessible name', () => {
    const wrapper = mount(IconButton, {
      props: { label: 'Mark Stalker as watched', tooltip: 'Mark as watched', icon: 'eye' },
    })
    expect(wrapper.get('button').attributes('aria-label')).toBe('Mark Stalker as watched')
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
    expect(wrapper.get('[role="img"]').attributes('aria-label')).toBe('TMDB logo')
    const link = wrapper.get('a')
    expect(link.attributes('href')).toBe('https://www.themoviedb.org/')
    expect(link.attributes('rel')).toContain('noopener')
    await expectNoA11yViolations(wrapper.element)
  })
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
})
