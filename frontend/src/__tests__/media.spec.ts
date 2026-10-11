import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import { useMediaQuery } from '../media'

afterEach(() => vi.unstubAllGlobals())

describe('useMediaQuery', () => {
  it('uses the fallback without matchMedia', () => {
    expect(useMediaQuery('(min-width: 900px)').value).toBe(true)
    expect(useMediaQuery('(min-width: 900px)', false).value).toBe(false)
  })

  it('follows the query and stops listening when the scope ends', () => {
    let listener: (event: { matches: boolean }) => void = () => {}
    const removeEventListener = vi.fn<() => void>()
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      addEventListener: (_: string, fn: typeof listener) => (listener = fn),
      removeEventListener,
    }))
    const scope = effectScope()
    const matches = scope.run(() => useMediaQuery('(min-width: 900px)'))!
    expect(matches.value).toBe(false)
    listener({ matches: true })
    expect(matches.value).toBe(true)
    scope.stop()
    expect(removeEventListener).toHaveBeenCalled()
  })
})
