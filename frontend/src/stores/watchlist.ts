import { ref } from 'vue'
import { defineStore } from 'pinia'
import { describeError, listFilms, updateFilm } from '../api'
import type { Film, ListParams } from '../types'

export type WatchlistStatus = 'idle' | 'loading' | 'ready' | 'error'

export const useWatchlistStore = defineStore('watchlist', () => {
  const items = ref<Film[]>([])
  const total = ref(0)
  const page = ref(1)
  const pageSize = ref(50)
  const status = ref<WatchlistStatus>('idle')
  const error = ref('')
  /** Spoken by a status region after an action; shown on the next screen too. */
  const notice = ref('')

  let latestLoad = 0

  async function load(params: ListParams) {
    const thisLoad = ++latestLoad
    status.value = 'loading'
    error.value = ''
    try {
      const result = await listFilms(params)
      if (thisLoad !== latestLoad) return // a newer request was made; its answer wins
      items.value = result.items
      total.value = result.total
      page.value = result.page
      pageSize.value = result.pageSize
      status.value = 'ready'
    } catch (e) {
      if (thisLoad !== latestLoad) return
      status.value = 'error'
      error.value = describeError(e)
    }
  }

  async function setWatched(film: Film, watched: boolean) {
    error.value = ''
    notice.value = ''
    try {
      const updated = await updateFilm(film.id, { watched })
      const index = items.value.findIndex((item) => item.id === film.id)
      if (index !== -1) items.value[index] = updated
      notice.value = `${film.title} is marked as ${watched ? 'watched' : 'unwatched'}.`
    } catch (e) {
      error.value = describeError(e)
    }
  }

  return { items, total, page, pageSize, status, error, notice, load, setWatched }
})
