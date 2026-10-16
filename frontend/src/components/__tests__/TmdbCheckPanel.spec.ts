import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import * as api from '../../api'
import { expectNoA11yViolations } from '../../__tests__/helpers'
import type { TmdbCheck, TmdbCheckSummary } from '../../types'
import TmdbCheckPanel from '../TmdbCheckPanel.vue'

vi.mock('../../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api')>()),
  startTmdbCheck: vi.fn<typeof import('../../api').startTmdbCheck>(),
  getTmdbCheck: vi.fn<typeof import('../../api').getTmdbCheck>(),
}))
const mocked = vi.mocked(api)

const run = (extra: Partial<TmdbCheckSummary> = {}): TmdbCheckSummary => ({
  matched: 0,
  notFound: 0,
  ambiguous: 0,
  error: 0,
  unreachable: 0,
  stopped: null,
  finishedAt: '2026-10-16T10:00:00.000Z',
  ...extra,
})
const state = (extra: Partial<TmdbCheck> = {}): TmdbCheck => ({
  enabled: true,
  running: false,
  total: 0,
  done: 0,
  lastRun: null,
  ...extra,
})

const OLD = run({ finishedAt: '2026-10-15T10:00:00.000Z' })
const NEW = run({ finishedAt: '2026-10-16T10:00:00.000Z' })

beforeEach(() => {
  vi.useFakeTimers()
  vi.resetAllMocks()
  mocked.startTmdbCheck.mockResolvedValue({ started: true })
})
afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})

const mountPanel = () => mount(TmdbCheckPanel, { attachTo: document.body })
const settle = () => vi.advanceTimersByTimeAsync(0)
const button = (wrapper: ReturnType<typeof mountPanel>) => wrapper.get('button')
const notice = (wrapper: ReturnType<typeof mountPanel>) => wrapper.get('[role="status"]').text()
async function click(wrapper: ReturnType<typeof mountPanel>) {
  await button(wrapper).trigger('click')
  await settle()
}

describe('TmdbCheckPanel', () => {
  it('shows the button and the option, checked by default, with an empty notice', () => {
    const wrapper = mountPanel()
    expect(button(wrapper).text()).toBe('Check TMDB again')
    const box = wrapper.get('input[type="checkbox"]')
    expect((box.element as HTMLInputElement).checked).toBe(true)
    expect(wrapper.text()).toContain('Also retry films that were not found or need review')
    expect(notice(wrapper)).toBe('')
    expect(mocked.getTmdbCheck).not.toHaveBeenCalled()
  })

  // axe waits on real timers, so these tests do not use the fake ones
  describe('accessibility', () => {
    beforeEach(() => vi.useRealTimers())

    it('has no axe violations idle and while running', async () => {
      const wrapper = mountPanel()
      await expectNoA11yViolations(wrapper.element)
      mocked.getTmdbCheck.mockResolvedValueOnce(state()).mockResolvedValue(state({ running: true, total: 5, done: 2 }))
      await button(wrapper).trigger('click')
      await flushPromises()
      expect(button(wrapper).text()).toBe('Checking… 2 of 5')
      await expectNoA11yViolations(wrapper.element)
      wrapper.unmount() // clears the poll timer
    })

    it('has no axe violations with a summary or an error', async () => {
      const wrapper = mountPanel()
      mocked.getTmdbCheck.mockResolvedValueOnce(state()).mockResolvedValue(state({ total: 5, done: 5, lastRun: NEW }))
      await button(wrapper).trigger('click')
      await flushPromises()
      expect(notice(wrapper)).toContain('TMDB check finished')
      await expectNoA11yViolations(wrapper.element)

      mocked.getTmdbCheck.mockRejectedValue(new api.ApiError(0, 'down'))
      await button(wrapper).trigger('click')
      await flushPromises()
      expect(wrapper.find('[role="alert"]').exists()).toBe(true)
      await expectNoA11yViolations(wrapper.element)
    })
  })

  it('starts the check with the option as set and announces it', async () => {
    mocked.getTmdbCheck.mockResolvedValue(state({ running: true, total: 3, done: 0 }))
    const wrapper = mountPanel()
    await click(wrapper)
    expect(mocked.startTmdbCheck).toHaveBeenCalledExactlyOnceWith(true)
    expect(notice(wrapper)).toBe('Checking TMDB…')
  })

  it('sends includeUnmatched false when the option is unchecked', async () => {
    mocked.getTmdbCheck.mockResolvedValue(state({ running: true, total: 3 }))
    const wrapper = mountPanel()
    await wrapper.get('input[type="checkbox"]').setValue(false)
    await click(wrapper)
    expect(mocked.startTmdbCheck).toHaveBeenCalledWith(false)
  })

  it('shows the progress in the button, marks it aria-disabled and disables the option', async () => {
    mocked.getTmdbCheck.mockResolvedValueOnce(state()).mockResolvedValue(state({ running: true, total: 12, done: 4 }))
    const wrapper = mountPanel()
    await click(wrapper)
    expect(button(wrapper).text()).toBe('Checking… 4 of 12')
    expect(button(wrapper).attributes('aria-disabled')).toBe('true')
    expect(button(wrapper).attributes('disabled')).toBeUndefined()
    expect(wrapper.get('input[type="checkbox"]').attributes('disabled')).toBeDefined()
  })

  it('polls every 2 seconds and updates the progress', async () => {
    mocked.getTmdbCheck
      .mockResolvedValueOnce(state()) // before the start
      .mockResolvedValueOnce(state({ running: true, total: 10, done: 1 }))
      .mockResolvedValueOnce(state({ running: true, total: 10, done: 6 }))
    const wrapper = mountPanel()
    await click(wrapper)
    expect(button(wrapper).text()).toBe('Checking… 1 of 10')
    expect(mocked.getTmdbCheck).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1999)
    expect(mocked.getTmdbCheck).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(mocked.getTmdbCheck).toHaveBeenCalledTimes(3)
    expect(button(wrapper).text()).toBe('Checking… 6 of 10')
  })

  it('ignores a second click while the check runs', async () => {
    mocked.getTmdbCheck.mockResolvedValue(state({ running: true, total: 3 }))
    const wrapper = mountPanel()
    await click(wrapper)
    await click(wrapper)
    expect(mocked.startTmdbCheck).toHaveBeenCalledTimes(1)
  })

  it('ignores a double click before the first answer arrives', async () => {
    mocked.getTmdbCheck.mockResolvedValue(state({ running: true, total: 3 }))
    const wrapper = mountPanel()
    await button(wrapper).trigger('click')
    await button(wrapper).trigger('click')
    await settle()
    expect(mocked.startTmdbCheck).toHaveBeenCalledTimes(1)
  })

  it('shows the summary, emits finished and stops polling when the check is done', async () => {
    mocked.getTmdbCheck
      .mockResolvedValueOnce(state({ lastRun: OLD }))
      .mockResolvedValueOnce(state({ running: true, total: 4, done: 2 }))
      .mockResolvedValue(state({ total: 4, done: 4, lastRun: run({ matched: 2, notFound: 1, ambiguous: 1 }) }))
    const wrapper = mountPanel()
    await click(wrapper)
    expect(wrapper.emitted('finished')).toBeUndefined()
    await vi.advanceTimersByTimeAsync(2000)
    expect(notice(wrapper)).toBe('TMDB check finished: 2 matched, 1 not found, 1 needs review.')
    expect(button(wrapper).text()).toBe('Check TMDB again')
    expect(button(wrapper).attributes('aria-disabled')).toBeUndefined()
    expect(wrapper.emitted('finished')).toHaveLength(1)
    const calls = mocked.getTmdbCheck.mock.calls.length
    await vi.advanceTimersByTimeAsync(10_000)
    expect(mocked.getTmdbCheck).toHaveBeenCalledTimes(calls)
  })

  it('says "need review" for several films and mentions failures only when there are some', async () => {
    mocked.getTmdbCheck
      .mockResolvedValueOnce(state())
      .mockResolvedValue(state({ total: 6, done: 6, lastRun: run({ matched: 1, ambiguous: 2, error: 3 }) }))
    const wrapper = mountPanel()
    await click(wrapper)
    expect(notice(wrapper)).toBe('TMDB check finished: 1 matched, 0 not found, 2 need review, 3 failed.')
  })

  it('says nothing was to check when the run had no films', async () => {
    mocked.getTmdbCheck.mockResolvedValueOnce(state()).mockResolvedValue(state({ lastRun: NEW }))
    const wrapper = mountPanel()
    await click(wrapper)
    expect(notice(wrapper)).toBe('Nothing to check: no film is waiting for TMDB.')
    expect(wrapper.emitted('finished')).toHaveLength(1)
  })

  it('does not show an old summary when no new run has finished', async () => {
    mocked.getTmdbCheck.mockResolvedValue(state({ total: 3, done: 3, lastRun: OLD }))
    const wrapper = mountPanel()
    await click(wrapper)
    expect(notice(wrapper)).toBe('The check did not finish. Try again.')
  })

  it('says how many films could not be reached', async () => {
    mocked.getTmdbCheck
      .mockResolvedValueOnce(state())
      .mockResolvedValue(state({ total: 3, done: 3, lastRun: run({ matched: 1, unreachable: 2 }) }))
    const wrapper = mountPanel()
    await click(wrapper)
    expect(notice(wrapper)).toBe('TMDB check finished: 1 matched, 0 not found, 0 need review, 2 could not be reached.')
  })

  it.each([
    ['token', 'It stopped early because TMDB rejected the access token.'],
    ['tmdb', 'It stopped early because TMDB is having trouble. Try again later.'],
  ] as const)('says why the check stopped early (%s)', async (stopped, sentence) => {
    mocked.getTmdbCheck
      .mockResolvedValueOnce(state())
      .mockResolvedValue(state({ total: 9, done: 2, lastRun: run({ matched: 2, stopped }) }))
    const wrapper = mountPanel()
    await click(wrapper)
    expect(notice(wrapper)).toBe(`TMDB check finished: 2 matched, 0 not found, 0 need review. ${sentence}`)
  })

  it('reports a stopped run even when it found no film to look up', async () => {
    mocked.getTmdbCheck
      .mockResolvedValueOnce(state())
      .mockResolvedValue(state({ total: 0, lastRun: run({ stopped: 'token' }) }))
    const wrapper = mountPanel()
    await click(wrapper)
    expect(notice(wrapper)).toContain('rejected the access token')
  })

  it('shows the sentence of the server when TMDB is not configured', async () => {
    mocked.getTmdbCheck.mockResolvedValue(state({ enabled: false }))
    mocked.startTmdbCheck.mockRejectedValue(
      new api.ApiError(503, 'TMDB is not configured. Set TMDB_ACCESS_TOKEN.', 'tmdb_unavailable'),
    )
    const wrapper = mountPanel()
    await click(wrapper)
    expect(wrapper.get('[role="alert"]').text()).toContain('TMDB is not configured. Set TMDB_ACCESS_TOKEN.')
    expect(notice(wrapper)).toBe('')
    expect(button(wrapper).text()).toBe('Check TMDB again')
    expect(wrapper.emitted('finished')).toBeUndefined()
  })

  it('shows a fixed sentence when the server cannot be reached', async () => {
    mocked.getTmdbCheck.mockResolvedValue(state())
    mocked.startTmdbCheck.mockRejectedValue(new api.ApiError(0, 'The server could not be reached'))
    const wrapper = mountPanel()
    await click(wrapper)
    expect(wrapper.get('[role="alert"]').text()).toContain("Can't reach the server")
  })

  it('does not show a proxy 503 text as if it were from TMDB', async () => {
    mocked.getTmdbCheck.mockResolvedValue(state())
    mocked.startTmdbCheck.mockRejectedValue(new api.ApiError(503, '<html>Bad gateway</html>'))
    const wrapper = mountPanel()
    await click(wrapper)
    expect(wrapper.get('[role="alert"]').text()).toContain('The server had a problem')
  })

  it('shows an alert when reading the status before the start fails', async () => {
    mocked.getTmdbCheck.mockRejectedValue(new api.ApiError(500, 'boom'))
    const wrapper = mountPanel()
    await click(wrapper)
    expect(wrapper.get('[role="alert"]').text()).toContain('The server had a problem')
    expect(mocked.startTmdbCheck).not.toHaveBeenCalled()
  })

  it('shows an alert and allows a new try when polling fails', async () => {
    mocked.getTmdbCheck
      .mockResolvedValueOnce(state())
      .mockResolvedValueOnce(state({ running: true, total: 5, done: 1 }))
      .mockRejectedValueOnce(new api.ApiError(0, 'down'))
    const wrapper = mountPanel()
    await click(wrapper)
    await vi.advanceTimersByTimeAsync(2000)
    expect(wrapper.get('[role="alert"]').text()).toContain("Can't reach the server")
    expect(button(wrapper).text()).toBe('Check TMDB again')
    expect(notice(wrapper)).toBe('') // the old "Checking TMDB…" is gone
    expect(wrapper.emitted('finished')).toBeUndefined()
    mocked.getTmdbCheck.mockResolvedValue(state({ running: true, total: 5 }))
    await click(wrapper)
    expect(mocked.startTmdbCheck).toHaveBeenCalledTimes(2)
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it('clears an earlier error when a new check starts', async () => {
    mocked.getTmdbCheck.mockResolvedValue(state({ running: true, total: 2 }))
    mocked.startTmdbCheck.mockRejectedValueOnce(new api.ApiError(400, 'Invalid request'))
    const wrapper = mountPanel()
    await click(wrapper)
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    await click(wrapper)
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it('stops polling and does not emit when unmounted during a check', async () => {
    mocked.getTmdbCheck.mockResolvedValue(state({ running: true, total: 5, done: 1 }))
    const wrapper = mountPanel()
    await click(wrapper)
    const calls = mocked.getTmdbCheck.mock.calls.length
    wrapper.unmount()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(mocked.getTmdbCheck).toHaveBeenCalledTimes(calls)
    expect(wrapper.emitted('finished')).toBeUndefined()
  })

  it('does not emit when unmounted while a poll is in flight', async () => {
    let answer!: (value: TmdbCheck) => void
    mocked.getTmdbCheck
      .mockResolvedValueOnce(state())
      .mockReturnValueOnce(new Promise((resolve) => (answer = resolve)))
    const wrapper = mountPanel()
    await click(wrapper)
    wrapper.unmount()
    answer(state({ lastRun: NEW, total: 1, done: 1 }))
    await settle()
    expect(wrapper.emitted('finished')).toBeUndefined()
  })
})
