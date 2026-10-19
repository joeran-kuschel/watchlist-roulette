<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ErrorAlert from '../components/ErrorAlert.vue'
import FormField from '../components/FormField.vue'
import AppIcon from '../components/AppIcon.vue'
import IconButton from '../components/IconButton.vue'
import PageNav from '../components/PageNav.vue'
import TmdbCheckPanel from '../components/TmdbCheckPanel.vue'
import TmdbOffNotice from '../components/TmdbOffNotice.vue'
import { formatDate, needsMatch, tmdbBadge } from '../format'
import { useMediaQuery } from '../media'
import { useTmdbStore } from '../stores/tmdb'
import { useWatchlistStore } from '../stores/watchlist'
import {
  ariaSort,
  fromQuery,
  nextSort,
  SORTS,
  TMDB_FILTERS,
  toListParams,
  toQuery,
  type SortColumn,
  type SortKey,
} from '../watchlistQuery'

const store = useWatchlistStore()
const tmdb = useTmdbStore()
const route = useRoute()
const router = useRouter()

const view = computed(() => fromQuery(route.query))
// What is typed or chosen in the form; it reaches the URL (and the list) on submit or change
const form = reactive({ q: '', watched: view.value.watched, tmdb: view.value.tmdb, sort: view.value.sort })

watch(
  () => route.query,
  () => {
    Object.assign(form, { q: view.value.q, watched: view.value.watched, tmdb: view.value.tmdb, sort: view.value.sort })
    store.rememberList(route.query)
    void store.load(toListParams(view.value))
  },
  { immediate: true },
)

// After a TMDB check the statuses of the films have changed
const reload = () => void store.load(toListParams(view.value))

// Below this width the table is shown as cards without visible column headers (same breakpoint as the CSS below),
// so the sort list is shown there instead. Without `matchMedia` the list is used, which works everywhere.
const cards = useMediaQuery('(max-width: 800px)')
const SORT_HEADERS: { column: SortColumn; label: string }[] = [
  { column: 'title', label: 'Title' },
  { column: 'year', label: 'Year' },
  { column: 'added', label: 'Added' },
]
// The list is replaced by a loading message while it reloads, which removes the header button that was used
let refocus: SortColumn | null = null
function sortBy(column: SortColumn) {
  const sort = nextSort(column, view.value.sort)
  refocus = column
  announced.value = `Sorted by ${SORTS[sort].label.toLowerCase()}`
  void router.push({ query: toQuery({ ...view.value, sort, page: 1 }) })
}
const sortIcon = (column: SortColumn) => {
  const state = ariaSort(column, view.value.sort)
  return state === 'ascending' ? 'arrow-up' : state === 'descending' ? 'arrow-down' : 'sort'
}
watch(
  () => store.status,
  async (status) => {
    if (!refocus || status === 'loading') return
    const column = refocus
    refocus = null // also after a failed reload, so a later load that no click caused does not take the focus
    if (status !== 'ready') return
    await nextTick()
    document.getElementById(`sort-${column}`)?.focus()
  },
)

const apply = () => {
  announced.value = '' // an earlier "Sorted by" message no longer applies
  return router.push({ query: toQuery({ ...form, page: 1 }) })
}
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

// A live region that already holds text when it appears is often not read out, so its text is set a tick later
const announced = ref('')
onMounted(async () => {
  void tmdb.load()
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

    <section v-if="tmdb.off" class="watchlist__tmdb-off" aria-labelledby="tmdb-off-heading">
      <h2 id="tmdb-off-heading">TMDB data</h2>
      <TmdbOffNotice />
    </section>
    <TmdbCheckPanel v-else @finished="reload" />

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
      <FormField v-if="cards" id="sort" label="Sort by" v-slot="{ attrs }">
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
      <PageNav
        v-if="pageCount > 1"
        class="watchlist__pages watchlist__pages--top"
        label="Pagination, top"
        :text="`Page ${store.page} of ${pageCount}`"
        :page="store.page"
        :page-count="pageCount"
        :to="goToPage"
      />
      <div class="table-wrap">
        <!-- The roles repeat what the elements already mean. On small screens CSS turns the rows into cards, and
             some screen readers (VoiceOver) then drop the table meaning unless it is stated -->
        <table class="watchlist__table" role="table">
          <caption class="sr-only">
            Films on your watchlist
          </caption>
          <thead role="rowgroup">
            <tr role="row">
              <th
                v-for="header in SORT_HEADERS"
                :key="header.column"
                scope="col"
                role="columnheader"
                :aria-sort="ariaSort(header.column, view.sort)"
              >
                <template v-if="cards">{{ header.label }}</template>
                <button
                  v-else
                  :id="`sort-${header.column}`"
                  class="watchlist__sort"
                  type="button"
                  @click="sortBy(header.column)"
                >
                  {{ header.label }}<AppIcon :name="sortIcon(header.column)" :size="16" />
                </button>
              </th>
              <th scope="col" role="columnheader">Status</th>
              <th scope="col" role="columnheader"><span class="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody role="rowgroup">
            <tr v-for="film in store.items" :key="film.id" role="row">
              <th scope="row" role="rowheader">
                <RouterLink class="watchlist__title" :to="`/watchlist/${film.id}`">{{ film.title }}</RouterLink>
              </th>
              <td role="cell" class="watchlist__year">{{ film.releaseYear ?? '—' }}</td>
              <td role="cell" class="watchlist__added">{{ formatDate(film.addedAt) }}</td>
              <td role="cell" class="watchlist__status-cell">
                <div class="watchlist__status">
                  <span v-if="film.watchedAt" class="badge badge--done"
                    >Watched {{ formatDate(film.watchedAt) }}</span
                  >
                  <span v-else class="badge">To watch</span>
                  <span v-if="tmdbBadge(film)" class="badge badge--warn">{{ tmdbBadge(film) }}</span>
                  <span v-else-if="film.tmdb.status === 'pending'" class="badge">{{
                    tmdb.off ? 'TMDB data is off' : 'Waiting for TMDB data'
                  }}</span>
                </div>
              </td>
              <td role="cell" class="watchlist__actions">
                <IconButton
                  v-if="film.watchedAt"
                  :label="`Mark as unwatched: ${film.title}`"
                  tooltip="Mark as unwatched"
                  icon="eye-off"
                  @click="store.setWatched(film, false)"
                />
                <IconButton
                  v-else
                  :label="`Mark as watched: ${film.title}`"
                  tooltip="Mark as watched"
                  icon="eye"
                  @click="store.setWatched(film, true)"
                />
                <IconButton
                  v-if="needsMatch(film) && !tmdb.off"
                  :label="`Choose TMDB match: ${film.title}`"
                  tooltip="Choose TMDB match"
                  icon="match"
                  :to="`/watchlist/${film.id}/match`"
                />
                <IconButton
                  :label="`Edit film: ${film.title}`"
                  tooltip="Edit film"
                  icon="pencil"
                  :to="`/watchlist/${film.id}/edit`"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <PageNav
        class="watchlist__pages"
        label="Pagination, bottom"
        :text="rangeText"
        :page="store.page"
        :page-count="pageCount"
        :to="goToPage"
      />
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
.watchlist__tmdb-off {
  margin: 24px 0 0;
}
.watchlist__tmdb-off h2 {
  font-size: 1.125rem;
  margin: 0 0 8px;
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
/* Phones and small tablets: one card per film instead of a table that is wider than the screen (WCAG 1.4.10).
   The markup stays a table; the column headers are hidden visually but stay for screen readers. */
@media (max-width: 800px) {
  .table-wrap {
    overflow: visible;
    border: 0;
    background: none;
  }
  .watchlist__table {
    min-width: 0;
  }
  .watchlist__table,
  .watchlist__table tbody {
    display: block;
  }
  .watchlist__table thead {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  .watchlist__table tbody tr {
    display: grid;
    grid-template-columns: auto 1fr;
    grid-template-areas:
      'title title'
      'year added'
      'status status'
      'actions actions';
    gap: 8px 6px;
    margin-bottom: 12px;
    padding: 16px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--surface);
  }
  .watchlist__table tbody tr > * {
    padding: 0;
    border: 0;
  }
  .watchlist__table tbody th {
    grid-area: title;
    overflow-wrap: anywhere;
  }
  .watchlist__year {
    grid-area: year;
  }
  .watchlist__added {
    grid-area: added;
  }
  .watchlist__year,
  .watchlist__added {
    color: var(--muted);
    font-size: 0.875rem;
  }
  /* The second declaration has an empty alternative text after the slash, which keeps this decoration out of the
     reading of screen readers (they get the column name from the table). Browsers that do not know that syntax
     (Firefox before 128, Safari before 17.4) skip it and keep the first one, so the label is never lost. */
  .watchlist__added::before {
    content: '· Added ';
    content: '· Added ' / '';
  }
  .watchlist__status-cell {
    grid-area: status;
  }
  .watchlist__actions {
    grid-area: actions;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    text-align: left;
    white-space: normal;
  }
  .watchlist__actions > * + * {
    margin-left: 0;
  }
}
.watchlist__pages {
  margin-top: 20px;
}
.watchlist__pages--top {
  margin: 0 0 12px;
}
/* A header button looks like the header text, with an arrow for the sort state */
.watchlist__sort {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: var(--target);
  padding: 0 4px;
  margin: 0 -4px;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.watchlist__sort:hover {
  text-decoration: underline;
}
</style>
