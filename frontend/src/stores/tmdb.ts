import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { getTmdbCheck } from '../api'

export const useTmdbStore = defineStore('tmdb', () => {
  /** Whether the backend has a TMDB token. `null` until it is known, or when the question failed. */
  const enabled = ref<boolean | null>(null)
  /** TMDB is known to be off. Not true while unknown: a missing hint is better than a wrong one. */
  const off = computed(() => enabled.value === false)

  let loading: Promise<void> | undefined

  /** Asks the backend; only "on" is remembered, so a token added later shows up when the user opens a screen again. */
  function load(): Promise<void> {
    loading ??= getTmdbCheck()
      .then((state) => {
        enabled.value = state.enabled
        if (!state.enabled) loading = undefined
      })
      .catch(() => {
        loading = undefined
      })
    return loading
  }

  return { enabled, off, load }
})
