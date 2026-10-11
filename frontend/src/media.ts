import { onScopeDispose, ref, type Ref } from 'vue'

/** Follows a CSS media query. Without `matchMedia` (jsdom, old browsers) it stays at `fallback`. */
export function useMediaQuery(query: string, fallback = true): Ref<boolean> {
  const list = typeof window !== 'undefined' ? window.matchMedia?.(query) : undefined
  const matches = ref(list ? list.matches : fallback)
  if (list) {
    const update = (event: MediaQueryListEvent) => (matches.value = event.matches)
    list.addEventListener('change', update)
    onScopeDispose(() => list.removeEventListener('change', update))
  }
  return matches
}
