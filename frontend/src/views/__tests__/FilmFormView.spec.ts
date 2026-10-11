import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import * as api from '../../api'
import { expectNoA11yViolations, makeFilm, mountWithApp } from '../../__tests__/helpers'
import { useWatchlistStore } from '../../stores/watchlist'
import FilmFormView from '../FilmFormView.vue'

vi.mock('../../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api')>()),
  getFilm: vi.fn<typeof import('../../api').getFilm>(),
  createFilm: vi.fn<typeof import('../../api').createFilm>(),
  updateFilm: vi.fn<typeof import('../../api').updateFilm>(),
  deleteFilm: vi.fn<typeof import('../../api').deleteFilm>(),
}))
const mocked = vi.mocked(api)

beforeEach(() => vi.resetAllMocks())
afterEach(() => (document.body.innerHTML = ''))

const errorsOf = (wrapper: Awaited<ReturnType<typeof mountWithApp>>['wrapper']) =>
  wrapper.findAll('[role="alert"] li').map((li) => li.text())

describe('FilmFormView: add', () => {
  it('shows an empty form', async () => {
    const { wrapper } = await mountWithApp(FilmFormView, '/watchlist/new')
    expect(wrapper.get('h1').text()).toBe('Add film')
    expect((wrapper.get('#film-title').element as HTMLInputElement).value).toBe('')
    expect(wrapper.find('.danger').exists()).toBe(false)
    expect(mocked.getFilm).not.toHaveBeenCalled()
    await expectNoA11yViolations(wrapper.element)
  })

  it('lists the problems in a summary that gets focus, and links them to the fields', async () => {
    const { wrapper } = await mountWithApp(FilmFormView, '/watchlist/new')
    await wrapper.get('#film-year').setValue('3962')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(mocked.createFilm).not.toHaveBeenCalled()
    expect(wrapper.get('[role="alert"] h2').text()).toBe('Please fix 2 problems')
    expect(errorsOf(wrapper)).toEqual(['Enter a title.', 'Enter a year between 1888 and 2100.'])
    expect(wrapper.get('[role="alert"] a').attributes('href')).toBe('#film-title')
    expect(wrapper.get('#film-title').attributes('aria-invalid')).toBe('true')
    expect(wrapper.get('#film-year').attributes('aria-describedby')).toContain('film-year-error')
    expect(document.activeElement).toBe(wrapper.get('[role="alert"]').element)
    await expectNoA11yViolations(wrapper.element)
  })

  it('says "problem" for a single one', async () => {
    const { wrapper } = await mountWithApp(FilmFormView, '/watchlist/new')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.get('[role="alert"] h2').text()).toBe('Please fix 1 problem')
  })

  it('creates the film, tells the watchlist and goes there', async () => {
    mocked.createFilm.mockResolvedValue(makeFilm({ title: 'Joy' }))
    const { wrapper, router } = await mountWithApp(FilmFormView, '/watchlist/new')
    await wrapper.get('#film-title').setValue('  Joy ')
    await wrapper.get('#film-year').setValue('2015')
    await wrapper.get('#film-url').setValue('https://boxd.it/8kEU')
    await wrapper.get('#film-added').setValue('2020-01-12')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(mocked.createFilm).toHaveBeenCalledWith({
      title: 'Joy',
      releaseYear: 2015,
      letterboxdUrl: 'https://boxd.it/8kEU',
      addedAt: '2020-01-12',
    })
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/watchlist'))
    expect(useWatchlistStore().notice).toBe('Joy was added.')
  })

  it('sends null for empty optional fields', async () => {
    mocked.createFilm.mockResolvedValue(makeFilm())
    const { wrapper } = await mountWithApp(FilmFormView, '/watchlist/new')
    await wrapper.get('#film-title').setValue('Joy')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(mocked.createFilm).toHaveBeenCalledWith({ title: 'Joy', releaseYear: null, letterboxdUrl: null })
  })

  it('shows a duplicate Letterboxd link as a field error', async () => {
    mocked.createFilm.mockRejectedValue(new api.ApiError(409, 'exists'))
    const { wrapper } = await mountWithApp(FilmFormView, '/watchlist/new')
    await wrapper.get('#film-title').setValue('Joy')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(errorsOf(wrapper)).toEqual(['Another film already uses this Letterboxd link.'])
    expect(wrapper.get('#film-url').attributes('aria-invalid')).toBe('true')
  })

  it('maps the backend validation issues to fields', async () => {
    mocked.createFilm.mockRejectedValue(
      new api.ApiError(400, 'Invalid request', undefined, [{ path: ['title'], message: 'Too long' }]),
    )
    const { wrapper } = await mountWithApp(FilmFormView, '/watchlist/new')
    await wrapper.get('#film-title').setValue('Joy')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(errorsOf(wrapper)).toEqual(['Too long'])
  })

  it('shows other errors in an alert and stays on the form', async () => {
    mocked.createFilm.mockRejectedValue(new api.ApiError(0, 'x'))
    const { wrapper, router } = await mountWithApp(FilmFormView, '/watchlist/new')
    await wrapper.get('#film-title').setValue('Joy')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toMatch(/Can't reach the server/)
    expect(router.currentRoute.value.path).toBe('/watchlist/new')
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeUndefined()
  })
})

describe('FilmFormView: edit', () => {
  beforeEach(() => mocked.getFilm.mockResolvedValue(makeFilm({ id: 9, title: 'Stalker', releaseYear: 1979, letterboxdUrl: null })))

  it('loads the film into the form', async () => {
    const { wrapper } = await mountWithApp(FilmFormView, '/watchlist/9/edit')
    expect(mocked.getFilm).toHaveBeenCalledWith(9)
    expect(wrapper.get('h1').text()).toBe('Edit film')
    expect((wrapper.get('#film-title').element as HTMLInputElement).value).toBe('Stalker')
    expect((wrapper.get('#film-year').element as HTMLInputElement).value).toBe('1979')
    expect((wrapper.get('#film-url').element as HTMLInputElement).value).toBe('')
    expect((wrapper.get('#film-added').element as HTMLInputElement).value).toBe('2025-03-12')
    await expectNoA11yViolations(wrapper.element)
  })

  it('saves changes with a patch, clearing emptied fields', async () => {
    mocked.updateFilm.mockResolvedValue(makeFilm({ title: 'Stalker' }))
    const { wrapper, router } = await mountWithApp(FilmFormView, '/watchlist/9/edit')
    await wrapper.get('#film-year').setValue('')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(mocked.updateFilm).toHaveBeenCalledWith(9, {
      title: 'Stalker',
      releaseYear: null,
      letterboxdUrl: null,
      addedAt: '2025-03-12',
    })
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/watchlist'))
    expect(useWatchlistStore().notice).toBe('Stalker was saved.')
  })

  it('shows a load error with a retry', async () => {
    mocked.getFilm.mockRejectedValueOnce(new api.ApiError(404, 'Film not found'))
    const { wrapper } = await mountWithApp(FilmFormView, '/watchlist/9/edit')
    expect(wrapper.get('[role="alert"]').text()).toContain('Film not found')
    expect(wrapper.find('form').exists()).toBe(false)
    await wrapper.get('[role="alert"] button').trigger('click')
    await flushPromises()
    expect(wrapper.find('form').exists()).toBe(true)
  })

  it('asks before deleting, and can be cancelled', async () => {
    const { wrapper } = await mountWithApp(FilmFormView, '/watchlist/9/edit')
    expect(wrapper.get('.danger').text()).toContain('Removes Stalker from your watchlist for good.')
    await wrapper.get('.danger button').trigger('click')
    expect(wrapper.get('.danger [role="alert"]').text()).toBe('Delete Stalker? This cannot be undone.')
    expect(mocked.deleteFilm).not.toHaveBeenCalled()
    const keep = wrapper.findAll('.danger button').find((b) => b.text() === 'Keep film')!
    await keep.trigger('click')
    expect(wrapper.find('.danger [role="alert"]').exists()).toBe(false)
    expect(mocked.deleteFilm).not.toHaveBeenCalled()
  })

  it('deletes after confirmation and goes back to the list', async () => {
    mocked.deleteFilm.mockResolvedValue(undefined)
    const { wrapper, router } = await mountWithApp(FilmFormView, '/watchlist/9/edit')
    await wrapper.get('.danger button').trigger('click')
    await wrapper.findAll('.danger button').find((b) => b.text() === 'Yes, delete it')!.trigger('click')
    await flushPromises()
    expect(mocked.deleteFilm).toHaveBeenCalledWith(9)
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/watchlist'))
    expect(useWatchlistStore().notice).toBe('Stalker was deleted.')
  })

  it('reports a failed delete and closes the question', async () => {
    mocked.deleteFilm.mockRejectedValue(new api.ApiError(404, 'Film not found'))
    const { wrapper, router } = await mountWithApp(FilmFormView, '/watchlist/9/edit')
    await wrapper.get('.danger button').trigger('click')
    await wrapper.findAll('.danger button').find((b) => b.text() === 'Yes, delete it')!.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/watchlist/9/edit')
    expect(wrapper.get('[role="alert"]').text()).toContain('Film not found')
    expect(wrapper.find('.danger [role="alert"]').exists()).toBe(false)
  })
})
