<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ErrorAlert from '../components/ErrorAlert.vue'
import FormField from '../components/FormField.vue'
import IconButton from '../components/IconButton.vue'
import { formatDate } from '../format'
import { useWatchlistStore } from '../stores/watchlist'
import type { Film } from '../types'
import { fromQuery, SORTS, TMDB_FILTERS, toListParams, toQuery, type SortKey } from '../watchlistQuery'

const store = useWatchlistStore()
const route = useRoute()
const router = useRouter()

const view = computed(() => fromQuery(route.query))
// What is typed or chosen in the form; it reaches the URL (and the list) on submit or change
const form = reactive({ q: '', watched: view.value.watched, tmdb: view.value.tmdb, sort: view.value.sort })

watch(
  () => route.query,
  () => {
    Object.assign(form, { q: view.value.q, watched: view.value.watched, tmdb: view.value.tmdb, sort: view.value.sort })
    void store.load(toListParams(view.value))
  },
  { immediate: true },
)

const apply = () => router.push({ query: toQuery({ ...form, page: 1 }) })
const goToPage = (page: number) => ({ query: toQuery({ ...view.value, page }) })

const pageCount = computed(() => Math.max(1, Math.ceil(store.total / store.pageSize)))
const rangeText = computed(() => {
  if (store.total === 0) return 'No films'
  if (store.items.length === 0) return `No films on this page, ${store.total} in total`
  const start = (store.page - 1) * store.pageSize + 1
  const end = Math.min(store.page * store.pageSize, store.total)
  return `Showing ${start}–${end} of ${store.total}`
})
const isFiltered = computed(() => view.value.q !== '' || view.value.watched !== 'all' || view.value.tmdb !== 'all')

const tmdbBadge = (film: Film) =>
  ({
    ambiguous: 'Needs review: several TMDB matches',
    not_found: 'Not found on TMDB',
    error: 'TMDB lookup failed',
  })[film.tmdb.status as string]
const needsMatch = (film: Film) => Boolean(tmdbBadge(film))

// A live region that already holds text when it appears is often not read out, so its text is set a tick later
const announced = ref('')
onMounted(async () => {
  await nextTick()
  announced.value = store.notice
})
watch(
  () => store.notice,
  (notice) => (announced.value = notice),
)

onBeforeUnmount(() => (store.notice = ''))
</script>

<template>
  <div class="page">
    <div class="watchlist__head">
      <div>
        <h1>Watchlist</h1>
        <p class="lead">
          {{ store.status === 'ready' ? `${store.total} ${isFiltered ? 'matching ' : ''}films` : 'Loading…' }}
        </p>
      </div>
      <IconButton label="Add film" icon="plus" variant="primary" to="/watchlist/new" />
    </div>

    <form role="search" aria-label="Filter watchlist" class="watchlist__filters" @submit.prevent="apply">
      <FormField id="search" label="Search by title" class="watchlist__search" v-slot="{ attrs }">
        <input v-bind="attrs" v-model="form.q" class="input" type="search" />
      </FormField>
      <FormField id="watched" label="Show" v-slot="{ attrs }">
        <select v-bind="attrs" v-model="form.watched" class="input" @change="apply">
          <option value="all">All films</option>
          <option value="false">Unwatched</option>
          <option value="true">Watched</option>
        </select>
      </FormField>
      <FormField id="tmdb" label="TMDB status" v-slot="{ attrs }">
        <select v-bind="attrs" v-model="form.tmdb" class="input" @change="apply">
          <option value="all">Any status</option>
          <option v-for="(label, status) in TMDB_FILTERS" :key="status" :value="status">{{ label }}</option>
        </select>
      </FormField>
      <FormField id="sort" label="Sort by" v-slot="{ attrs }">
        <select v-bind="attrs" v-model="form.sort" class="input" @change="apply">
          <option v-for="(option, key) in SORTS" :key="key" :value="key as SortKey">
            {{ option.label }}
          </option>
        </select>
      </FormField>
      <button class="btn" type="submit">Search</button>
    </form>

    <p class="watchlist__notice" role="status">{{ announced }}</p>
    <ErrorAlert v-if="store.error" :message="store.error">
      <button class="btn" type="button" @click="store.load(toListParams(view))">Try again</button>
    </ErrorAlert>

    <p v-if="store.status === 'loading'" class="lead" aria-busy="true">Loading films…</p>

    <div v-else-if="store.status === 'ready' && store.total === 0" class="card">
      <template v-if="isFiltered">
        <h2>No films match your search</h2>
        <p class="lead">Try a shorter title or another filter.</p>
        <RouterLink class="btn" to="/watchlist">Reset search</RouterLink>
      </template>
      <template v-else>
        <h2>Your watchlist is empty</h2>
        <p class="lead">Import your Letterboxd export or add a first film.</p>
        <div class="btn-row">
          <RouterLink class="btn btn--primary" to="/import">Import from CSV</RouterLink>
          <RouterLink class="btn" to="/watchlist/new">Add a film</RouterLink>
        </div>
      </template>
    </div>

    <template v-else-if="store.status === 'ready'">
      <div class="table-wrap">
        <table class="watchlist__table">
          <caption class="sr-only">
            Films on your watchlist
          </caption>
          <thead>
            <tr>
              <th scope="col">Title</th>
              <th scope="col">Year</th>
              <th scope="col">Added</th>
              <th scope="col">Status</th>
              <th scope="col"><span class="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="film in store.items" :key="film.id">
              <th scope="row">
                <RouterLink class="watchlist__title" :to="`/watchlist/${film.id}`">{{ film.title }}</RouterLink>
              </th>
              <td>{{ film.releaseYear ?? '—' }}</td>
              <td>{{ formatDate(film.addedAt) }}</td>
              <td>
                <div class="watchlist__status">
                  <span v-if="film.watchedAt" class="badge badge--done"
                    >Watched {{ formatDate(film.watchedAt) }}</span
                  >
                  <span v-else class="badge">To watch</span>
                  <span v-if="tmdbBadge(film)" class="badge badge--warn">{{ tmdbBadge(film) }}</span>
                  <span v-else-if="film.tmdb.status === 'pending'" class="badge">Waiting for TMDB data</span>
                </div>
              </td>
              <td class="watchlist__actions">
                <IconButton
                  v-if="film.watchedAt"
                  :label="`Mark ${film.title} as unwatched`"
                  tooltip="Mark as unwatched"
                  icon="eye-off"
                  @click="store.setWatched(film, false)"
                />
                <IconButton
                  v-else
                  :label="`Mark ${film.title} as watched`"
                  tooltip="Mark as watched"
                  icon="eye"
                  @click="store.setWatched(film, true)"
                />
                <IconButton
                  v-if="needsMatch(film)"
                  :label="`Choose TMDB match for ${film.title}`"
                  tooltip="Choose TMDB match"
                  icon="match"
                  :to="`/watchlist/${film.id}/match`"
                />
                <IconButton
                  :label="`Edit ${film.title}`"
                  tooltip="Edit film"
                  icon="pencil"
                  :to="`/watchlist/${film.id}/edit`"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <nav class="watchlist__pages" aria-label="Pagination">
        <p>{{ rangeText }}</p>
        <div class="btn-row">
          <IconButton v-if="store.page > 1" label="Previous page" icon="left" :to="goToPage(store.page - 1)" />
          <IconButton v-else label="Previous page" icon="left" disabled />
          <IconButton v-if="store.page < pageCount" label="Next page" icon="right" :to="goToPage(store.page + 1)" />
          <IconButton v-else label="Next page" icon="right" disabled />
        </div>
      </nav>
    </template>
  </div>
</template>

<style scoped>
.watchlist__head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
}
.watchlist__head .lead {
  margin-bottom: 0;
}
.watchlist__filters {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: flex-end;
  margin: 24px 0;
}
.watchlist__search {
  flex: 1 1 260px;
}
.watchlist__filters .btn {
  min-height: var(--target);
}
.watchlist__notice {
  min-height: 1.5em;
  margin: 0 0 12px;
  color: var(--muted);
}
.watchlist__table {
  min-width: 720px;
}
.watchlist__title {
  color: var(--text);
}
.watchlist__status {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.watchlist__actions {
  text-align: right;
  white-space: nowrap;
}
.watchlist__actions > * + * {
  margin-left: 8px;
}
.watchlist__pages {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 20px;
  color: var(--muted);
}
.watchlist__pages p {
  margin: 0;
}
</style>
