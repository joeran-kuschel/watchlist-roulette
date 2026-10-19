import { reactive, ref } from 'vue'
import { defineStore } from 'pinia'
import { ApiError, describeError, getFilm, randomFilm, updateFilm } from '../api'
import { emptyFilters } from '../filters'
import type { Film, RandomParams } from '../types'

export type RouletteStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error'

export const useRouletteStore = defineStore('roulette', () => {
  const film = ref<Film | null>(null)
  const status = ref<RouletteStatus>('idle')
  const error = ref('')
  const notice = ref('')
  // Kept here, not in the screen, so they survive leaving and coming back
  const filters = reactive(emptyFilters())
  const lastParams = ref<RandomParams>({})
  // True while the pick on screen is the one made on arrival, before the user pressed Spin
  const automatic = ref(false)

  // Answers that arrive after a newer request was made are dropped, so the last press wins
  let latest = 0

  async function spin(params: RandomParams = {}, onArrival = false) {
    const mine = ++latest
    automatic.value = onArrival
    status.value = 'loading'
    error.value = ''
    notice.value = ''
    lastParams.value = params
    try {
      const picked = await randomFilm(params)
      if (mine !== latest) return
      film.value = picked
      status.value = 'ready'
    } catch (e) {
      if (mine !== latest) return
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
    notice.value = ''
    const mine = latest
    try {
      const updated = await updateFilm(film.value.id, { watched: true })
      if (mine !== latest) return // spun to another film meanwhile
      film.value = updated
      notice.value = `${updated.title} is marked as watched and will not come up again.`
    } catch (e) {
      if (mine === latest) error.value = describeError(e)
    }
  }

  /** The kept pick may have been changed or deleted elsewhere; reload it, or pick a new one if it is gone. */
  async function refresh() {
    if (status.value !== 'ready' || !film.value) return
    const mine = latest
    try {
      const current = await getFilm(film.value.id)
      if (mine !== latest) return
      film.value = current
      if (current.watchedAt) await spin(lastParams.value, automatic.value)
    } catch (e) {
      if (mine !== latest) return
      if (e instanceof ApiError && e.status === 404) await spin(lastParams.value, automatic.value)
    }
  }

  return { film, status, error, notice, filters, lastParams, automatic, spin, markWatched, refresh }
})
