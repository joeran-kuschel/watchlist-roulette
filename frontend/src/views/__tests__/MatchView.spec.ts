import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import * as api from '../../api'
import { expectNoA11yViolations, makeFilm, mountWithApp } from '../../__tests__/helpers'
import { useWatchlistStore } from '../../stores/watchlist'
import MatchView from '../MatchView.vue'

vi.mock('../../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api')>()),
  getFilm: vi.fn<typeof import('../../api').getFilm>(),
  updateFilm: vi.fn<typeof import('../../api').updateFilm>(),
}))
const mocked = vi.mocked(api)

const ambiguous = makeFilm({
  id: 3,
  title: 'Cléo from 5 to 7',
  releaseYear: 1962,
  tmdb: { id: null, status: 'ambiguous', syncedAt: null },
})

beforeEach(() => {
  vi.resetAllMocks()
  mocked.getFilm.mockResolvedValue(ambiguous)
})
afterEach(() => (document.body.innerHTML = ''))

describe('MatchView', () => {
  it('explains the problem and links to a TMDB search for the title', async () => {
    const { wrapper } = await mountWithApp(MatchView, '/watchlist/3/match')
    expect(mocked.getFilm).toHaveBeenCalledWith(3)
    expect(wrapper.get('h1').text()).toBe('Choose the TMDB match')
    expect(wrapper.text()).toContain('Cléo from 5 to 7')
    expect(wrapper.text()).toContain('(1962)')
    expect(wrapper.text()).toContain('TMDB found several films with this title')
    const link = wrapper.get('ol a')
    expect(link.attributes('href')).toBe('https://www.themoviedb.org/search/movie?query=Cl%C3%A9o%20from%205%20to%207')
    expect(link.attributes('rel')).toContain('noopener')
    await expectNoA11yViolations(wrapper.element)
  })

  it.each([
    ['not_found', 'TMDB found no film with this title.'],
    ['error', 'TMDB could not be reached'],
    ['pending', 'has not been looked up yet'],
    ['matched', 'already matched'],
  ] as const)('explains the %s status', async (status, text) => {
    mocked.getFilm.mockResolvedValue(makeFilm({ tmdb: { id: null, status, syncedAt: null } }))
    const { wrapper } = await mountWithApp(MatchView, '/watchlist/3/match')
    expect(wrapper.text()).toContain(text)
  })

  it('saves the id from a pasted address and returns to the list', async () => {
    mocked.updateFilm.mockResolvedValue(ambiguous)
    const { wrapper, router } = await mountWithApp(MatchView, '/watchlist/3/match')
    await wrapper.get('#tmdb-id').setValue('https://www.themoviedb.org/movie/262543-joy')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(mocked.updateFilm).toHaveBeenCalledWith(3, { tmdbId: 262543 })
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/watchlist'))
    expect(useWatchlistStore().notice).toBe('TMDB id saved for Cléo from 5 to 7. Its details load in the background.')
  })

  it('accepts the bare number', async () => {
    mocked.updateFilm.mockResolvedValue(ambiguous)
    const { wrapper } = await mountWithApp(MatchView, '/watchlist/3/match')
    await wrapper.get('#tmdb-id').setValue('262543')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(mocked.updateFilm).toHaveBeenCalledWith(3, { tmdbId: 262543 })
  })

  it('rejects input without an id and does not call the server', async () => {
    const { wrapper } = await mountWithApp(MatchView, '/watchlist/3/match')
    await wrapper.get('#tmdb-id').setValue('https://example.com/movie/12')
    await wrapper.get('form').trigger('submit')
    expect(mocked.updateFilm).not.toHaveBeenCalled()
    expect(wrapper.get('#tmdb-id').attributes('aria-invalid')).toBe('true')
    expect(wrapper.get('#tmdb-id-error').text()).toMatch(/Enter the TMDB number/)
    await expectNoA11yViolations(wrapper.element)
  })

  it('says when another film already uses the id', async () => {
    mocked.updateFilm.mockRejectedValue(new api.ApiError(409, 'exists'))
    const { wrapper, router } = await mountWithApp(MatchView, '/watchlist/3/match')
    await wrapper.get('#tmdb-id').setValue('12')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('#tmdb-id-error').text()).toBe('Another film on your list already uses this TMDB movie.')
    expect(router.currentRoute.value.path).toBe('/watchlist/3/match')
  })

  it('shows other errors in an alert', async () => {
    mocked.updateFilm.mockRejectedValue(new api.ApiError(0, 'x'))
    const { wrapper } = await mountWithApp(MatchView, '/watchlist/3/match')
    await wrapper.get('#tmdb-id').setValue('12')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toMatch(/Can't reach the server/)
  })

  it('shows a load error with a retry', async () => {
    mocked.getFilm.mockRejectedValueOnce(new api.ApiError(404, 'Film not found'))
    const { wrapper } = await mountWithApp(MatchView, '/watchlist/3/match')
    expect(wrapper.get('[role="alert"]').text()).toContain('Film not found')
    await wrapper.get('[role="alert"] button').trigger('click')
    await flushPromises()
    expect(wrapper.find('form').exists()).toBe(true)
  })
})

describe('MatchView: edge cases', () => {
  const submitWith = async (wrapper: Awaited<ReturnType<typeof mountWithApp>>['wrapper'], value: string) => {
    await wrapper.get('#tmdb-id').setValue(value)
    await wrapper.get('form').trigger('submit')
    await flushPromises()
  }

  it('shows a loading message and no form while the film loads', async () => {
    mocked.getFilm.mockReturnValue(new Promise(() => {}))
    const { wrapper } = await mountWithApp(MatchView, '/watchlist/3/match')
    expect(wrapper.get('[aria-busy="true"]').text()).toBe('Loading film…')
    expect(wrapper.find('form').exists()).toBe(false)
  })

  it('shows a film that was deleted (404) as an error without a form', async () => {
    mocked.getFilm.mockRejectedValue(new api.ApiError(404, 'Film not found'))
    const { wrapper } = await mountWithApp(MatchView, '/watchlist/3/match')
    expect(wrapper.get('[role="alert"]').text()).toContain('Film not found')
    expect(wrapper.find('form').exists()).toBe(false)
    await expectNoA11yViolations(wrapper.element)
  })

  it('says the server is unreachable when loading', async () => {
    mocked.getFilm.mockRejectedValue(new api.ApiError(0, 'x'))
    const { wrapper } = await mountWithApp(MatchView, '/watchlist/3/match')
    expect(wrapper.get('[role="alert"]').text()).toMatch(/Can't reach the server/)
  })

  it('leaves out the year in brackets when the film has none', async () => {
    mocked.getFilm.mockResolvedValue(makeFilm({ title: 'Rare', releaseYear: null }))
    const { wrapper } = await mountWithApp(MatchView, '/watchlist/3/match')
    expect(wrapper.get('.lead').text()).not.toContain('(')
  })

  it.each(['', '   ', '0', 'abc', 'https://www.themoviedb.org/tv/12'])('rejects %j without calling the server', async (value) => {
    const { wrapper } = await mountWithApp(MatchView, '/watchlist/3/match')
    await submitWith(wrapper, value)
    expect(mocked.updateFilm).not.toHaveBeenCalled()
    expect(wrapper.get('#tmdb-id-error').text()).toMatch(/Enter the TMDB number/)
  })

  it('removes the field error when the next try works', async () => {
    mocked.updateFilm.mockResolvedValue(ambiguous)
    const { wrapper } = await mountWithApp(MatchView, '/watchlist/3/match')
    await submitWith(wrapper, 'abc')
    expect(wrapper.find('#tmdb-id-error').exists()).toBe(true)
    await submitWith(wrapper, '12')
    expect(wrapper.find('#tmdb-id-error').exists()).toBe(false)
    expect(mocked.updateFilm).toHaveBeenCalledWith(3, { tmdbId: 12 })
  })

  it('shows "Saving…" and a disabled button while the request runs', async () => {
    mocked.updateFilm.mockReturnValue(new Promise(() => {}))
    const { wrapper } = await mountWithApp(MatchView, '/watchlist/3/match')
    await submitWith(wrapper, '12')
    const save = wrapper.get('button[type="submit"]')
    expect(save.text()).toBe('Saving…')
    expect(save.attributes('disabled')).toBeDefined()
  })

  it.each([
    [404, 'Film not found', 'Film not found'],
    [400, 'Invalid request', 'Invalid request'],
    [500, 'boom', 'The server had a problem. Try again in a moment.'],
  ])('shows a %i on save as an alert, not as a field error', async (status, message, shown) => {
    mocked.updateFilm.mockRejectedValue(new api.ApiError(status, message))
    const { wrapper, router } = await mountWithApp(MatchView, '/watchlist/3/match')
    await submitWith(wrapper, '12')
    expect(wrapper.get('[role="alert"]').text()).toContain(shown)
    expect(wrapper.find('#tmdb-id-error').exists()).toBe(false)
    expect(router.currentRoute.value.path).toBe('/watchlist/3/match')
    expect(useWatchlistStore().notice).toBe('')
  })

  it('clears the alert of an earlier failed save on the next try', async () => {
    mocked.updateFilm.mockRejectedValueOnce(new api.ApiError(500, 'boom'))
    mocked.updateFilm.mockResolvedValueOnce(ambiguous)
    const { wrapper } = await mountWithApp(MatchView, '/watchlist/3/match')
    await submitWith(wrapper, '12')
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    await submitWith(wrapper, '12')
    expect(mocked.updateFilm).toHaveBeenCalledTimes(2)
  })

  it('has no axe violations with an alert and a field error', async () => {
    mocked.updateFilm.mockRejectedValue(new api.ApiError(0, 'x'))
    const { wrapper } = await mountWithApp(MatchView, '/watchlist/3/match')
    await submitWith(wrapper, '12')
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    await expectNoA11yViolations(wrapper.element)
    await submitWith(wrapper, 'abc')
    expect(wrapper.find('#tmdb-id-error').exists()).toBe(true)
    await expectNoA11yViolations(wrapper.element)
  })

  it('links back to the watchlist twice (breadcrumb and Cancel)', async () => {
    const { wrapper } = await mountWithApp(MatchView, '/watchlist/3/match')
    expect(wrapper.findAll('a[href="/watchlist"]').map((a) => a.text())).toEqual(['← Back to watchlist', 'Cancel'])
  })

  it('opens the TMDB search in a new tab and says so', async () => {
    const { wrapper } = await mountWithApp(MatchView, '/watchlist/3/match')
    const link = wrapper.get('ol a')
    expect(link.attributes('target')).toBe('_blank')
    expect(link.text()).toContain('opens in a new tab')
  })
})
