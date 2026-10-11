import { ref } from 'vue'
import { defineStore } from 'pinia'
import { ApiError, describeError, randomFilm, updateFilm } from '../api'
import type { Film, RandomParams } from '../types'

export type RouletteStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error'

export const useRouletteStore = defineStore('roulette', () => {
  const film = ref<Film | null>(null)
  const status = ref<RouletteStatus>('idle')
  const error = ref('')
  const notice = ref('')

  async function spin(params: RandomParams = {}) {
    status.value = 'loading'
    error.value = ''
    notice.value = ''
    try {
      film.value = await randomFilm(params)
      status.value = 'ready'
    } catch (e) {
      film.value = null
      if (e instanceof ApiError && e.status === 404) {
        status.value = 'empty'
      } else {
        status.value = 'error'
        error.value = describeError(e)
      }
    }
  }

  async function markWatched() {
    if (!film.value) return
    error.value = ''
    try {
      film.value = await updateFilm(film.value.id, { watched: true })
      notice.value = `${film.value.title} is marked as watched and will not come up again.`
    } catch (e) {
      error.value = describeError(e)
    }
  }

  return { film, status, error, notice, spin, markWatched }
})
