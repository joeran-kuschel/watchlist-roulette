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

describe('FilmFormView: more cases', () => {
  const stalker = () => makeFilm({ id: 9, title: 'Stalker', releaseYear: 1979, letterboxdUrl: null })
  const submit = async (wrapper: Awaited<ReturnType<typeof mountWithApp>>['wrapper']) => {
    await wrapper.get('form').trigger('submit')
    await flushPromises()
  }
  const button = (wrapper: Awaited<ReturnType<typeof mountWithApp>>['wrapper'], name: string) =>
    wrapper.findAll('button').find((b) => b.text() === name)!

  it('counts several problems at once and links each to its field', async () => {
    const { wrapper } = await mountWithApp(FilmFormView, '/watchlist/new')
    await wrapper.get('#film-year').setValue('1700')
    await wrapper.get('#film-url').setValue('ftp://x.org')
    await wrapper.get('#film-added').setValue('2025-03-12')
    await submit(wrapper)
    expect(wrapper.get('[role="alert"] h2').text()).toBe('Please fix 3 problems')
    expect(wrapper.findAll('[role="alert"] li a').map((a) => a.attributes('href'))).toEqual([
      '#film-title',
      '#film-year',
      '#film-url',
    ])
  })

  it('rejects a title of 501 characters and names the limit', async () => {
    const { wrapper } = await mountWithApp(FilmFormView, '/watchlist/new')
    await wrapper.get('#film-title').setValue('x'.repeat(501))
    await submit(wrapper)
    expect(errorsOf(wrapper)).toEqual(['The title can have at most 500 characters.'])
  })

  it('sends a non-ASCII title unchanged', async () => {
    mocked.createFilm.mockResolvedValue(makeFilm())
    const { wrapper } = await mountWithApp(FilmFormView, '/watchlist/new')
    await wrapper.get('#film-title').setValue('千と千尋の神隠し – Cléo 🎬')
    await submit(wrapper)
    expect(mocked.createFilm).toHaveBeenCalledWith(expect.objectContaining({ title: '千と千尋の神隠し – Cléo 🎬' }))
  })

  it('removes the summary and sends the form once the problems are fixed', async () => {
    mocked.createFilm.mockResolvedValue(makeFilm())
    const { wrapper } = await mountWithApp(FilmFormView, '/watchlist/new')
    await submit(wrapper)
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    await wrapper.get('#film-title').setValue('Joy')
    await submit(wrapper)
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(mocked.createFilm).toHaveBeenCalledTimes(1)
  })

  it('shows "Saving…" and cannot be sent twice while the request runs', async () => {
    mocked.createFilm.mockReturnValue(new Promise(() => {}))
    const { wrapper } = await mountWithApp(FilmFormView, '/watchlist/new')
    await wrapper.get('#film-title').setValue('Joy')
    await submit(wrapper)
    const save = wrapper.get('button[type="submit"]')
    expect(save.text()).toBe('Saving…')
    expect(save.attributes('disabled')).toBeDefined()
  })

  it('shows a server fault as an alert without a field error', async () => {
    mocked.createFilm.mockRejectedValue(new api.ApiError(500, 'boom'))
    const { wrapper } = await mountWithApp(FilmFormView, '/watchlist/new')
    await wrapper.get('#film-title').setValue('Joy')
    await submit(wrapper)
    expect(wrapper.get('[role="alert"]').text()).toContain('The server had a problem')
    expect(wrapper.find('[aria-invalid="true"]').exists()).toBe(false)
  })

  it('shows a 400 whose issues match no field as an alert with the message', async () => {
    mocked.createFilm.mockRejectedValue(
      new api.ApiError(400, 'Invalid request', undefined, [{ path: ['other'], message: 'x' }]),
    )
    const { wrapper } = await mountWithApp(FilmFormView, '/watchlist/new')
    await wrapper.get('#film-title').setValue('Joy')
    await submit(wrapper)
    expect(wrapper.get('[role="alert"]').text()).toContain('Invalid request')
    expect(wrapper.find('[aria-invalid="true"]').exists()).toBe(false)
  })

  it('maps several backend issues to several fields', async () => {
    mocked.createFilm.mockRejectedValue(
      new api.ApiError(400, 'Invalid request', undefined, [
        { path: ['releaseYear'], message: 'Too early' },
        { path: ['letterboxdUrl'], message: 'Not a link' },
      ]),
    )
    const { wrapper } = await mountWithApp(FilmFormView, '/watchlist/new')
    await wrapper.get('#film-title').setValue('Joy')
    await submit(wrapper)
    expect(errorsOf(wrapper)).toEqual(['Too early', 'Not a link'])
    expect(document.activeElement).toBe(wrapper.get('[role="alert"]').element)
  })

  it('has no axe violations with a submit error and with the problem summary', async () => {
    mocked.createFilm.mockRejectedValue(new api.ApiError(0, 'x'))
    const { wrapper } = await mountWithApp(FilmFormView, '/watchlist/new')
    await submit(wrapper)
    await expectNoA11yViolations(wrapper.element)
    await wrapper.get('#film-title').setValue('Joy')
    await submit(wrapper)
    expect(wrapper.get('[role="alert"]').text()).toMatch(/Can't reach the server/)
    await expectNoA11yViolations(wrapper.element)
  })

  it('has a way back to the watchlist from the back link and from Cancel', async () => {
    const { wrapper } = await mountWithApp(FilmFormView, '/watchlist/new')
    expect(wrapper.get('.back a').attributes('href')).toBe('/watchlist')
    expect(wrapper.findAll('a').find((a) => a.text() === 'Cancel')!.attributes('href')).toBe('/watchlist')
  })

  it('only offers "Today if empty" when adding', async () => {
    const add = await mountWithApp(FilmFormView, '/watchlist/new')
    expect(add.wrapper.text()).toContain('Today if empty')
    add.wrapper.unmount()
    mocked.getFilm.mockResolvedValue(stalker())
    const edit = await mountWithApp(FilmFormView, '/watchlist/9/edit')
    expect(edit.wrapper.text()).not.toContain('Today if empty')
  })

  it('shows a loading message while the film loads', async () => {
    mocked.getFilm.mockReturnValue(new Promise(() => {}))
    const { wrapper } = await mountWithApp(FilmFormView, '/watchlist/9/edit')
    expect(wrapper.get('[aria-busy="true"]').text()).toBe('Loading film…')
    expect(wrapper.find('form').exists()).toBe(false)
  })

  it('shows an unreachable server on load, with the delete section hidden', async () => {
    mocked.getFilm.mockRejectedValue(new api.ApiError(0, 'x'))
    const { wrapper } = await mountWithApp(FilmFormView, '/watchlist/9/edit')
    expect(wrapper.get('[role="alert"]').text()).toMatch(/Can't reach the server/)
    expect(wrapper.find('.danger').exists()).toBe(false)
    await expectNoA11yViolations(wrapper.element)
  })

  it('shows a duplicate link on save of an edit', async () => {
    mocked.getFilm.mockResolvedValue(stalker())
    mocked.updateFilm.mockRejectedValue(new api.ApiError(409, 'exists'))
    const { wrapper } = await mountWithApp(FilmFormView, '/watchlist/9/edit')
    await submit(wrapper)
    expect(errorsOf(wrapper)).toEqual(['Another film already uses this Letterboxd link.'])
  })

  it('says so when the film was deleted elsewhere before saving', async () => {
    mocked.getFilm.mockResolvedValue(stalker())
    mocked.updateFilm.mockRejectedValue(new api.ApiError(404, 'Film not found'))
    const { wrapper, router } = await mountWithApp(FilmFormView, '/watchlist/9/edit')
    await submit(wrapper)
    expect(wrapper.get('[role="alert"]').text()).toContain('Film not found')
    expect(router.currentRoute.value.path).toBe('/watchlist/9/edit')
  })

  it('does not save unsaved edits when asking to confirm a delete', async () => {
    mocked.getFilm.mockResolvedValue(stalker())
    const { wrapper } = await mountWithApp(FilmFormView, '/watchlist/9/edit')
    await wrapper.get('#film-title').setValue('Changed')
    await wrapper.get('.danger button').trigger('click')
    expect(wrapper.get('.danger').text()).toContain('Delete Stalker?')
    expect(mocked.updateFilm).not.toHaveBeenCalled()
  })

  it('reports a failed delete (server down) without leaving and without a notice', async () => {
    mocked.getFilm.mockResolvedValue(stalker())
    mocked.deleteFilm.mockRejectedValue(new api.ApiError(0, 'x'))
    const { wrapper } = await mountWithApp(FilmFormView, '/watchlist/9/edit')
    await wrapper.get('.danger button').trigger('click')
    await button(wrapper, 'Yes, delete it').trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toMatch(/Can't reach the server/)
    expect(useWatchlistStore().notice).toBe('')
  })

  it('has no axe violations while asking to confirm the delete', async () => {
    mocked.getFilm.mockResolvedValue(stalker())
    const { wrapper } = await mountWithApp(FilmFormView, '/watchlist/9/edit')
    await wrapper.get('.danger button').trigger('click')
    expect(wrapper.find('.danger [role="alert"]').exists()).toBe(true)
    await expectNoA11yViolations(wrapper.element)
  })

  it('moves focus into the confirmation when "Delete film…" is pressed', async () => {
    mocked.getFilm.mockResolvedValue(stalker())
    const { wrapper } = await mountWithApp(FilmFormView, '/watchlist/9/edit')
    const trigger = wrapper.get('.danger button')
    ;(trigger.element as HTMLElement).focus()
    await trigger.trigger('click')
    await flushPromises()
    expect(wrapper.get('.danger').element.contains(document.activeElement)).toBe(true)
  })

  it('returns focus to "Delete film…" after choosing "Keep film"', async () => {
    mocked.getFilm.mockResolvedValue(stalker())
    const { wrapper } = await mountWithApp(FilmFormView, '/watchlist/9/edit')
    await wrapper.get('.danger button').trigger('click')
    const keep = button(wrapper, 'Keep film')
    ;(keep.element as HTMLElement).focus()
    await keep.trigger('click')
    await flushPromises()
    expect(document.activeElement).toBe(button(wrapper, 'Delete film…').element)
  })

  it('keeps focus on the page after a failed delete', async () => {
    mocked.getFilm.mockResolvedValue(stalker())
    mocked.deleteFilm.mockRejectedValue(new api.ApiError(500, 'boom'))
    const { wrapper } = await mountWithApp(FilmFormView, '/watchlist/9/edit')
    await wrapper.get('.danger button').trigger('click')
    const yes = button(wrapper, 'Yes, delete it')
    ;(yes.element as HTMLElement).focus()
    await yes.trigger('click')
    await flushPromises()
    expect(document.activeElement).not.toBe(document.body)
  })
})
