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
