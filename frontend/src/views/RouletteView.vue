<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import AppIcon from '../components/AppIcon.vue'
import FilmCard from '../components/FilmCard.vue'
import ErrorAlert from '../components/ErrorAlert.vue'
import FormField from '../components/FormField.vue'
import IconButton from '../components/IconButton.vue'
import {
  countActiveFilters,
  emptyFilters,
  hasFilters,
  parseRouletteFilters,
  type RouletteFilterErrors,
} from '../filters'
import { GENRES } from '../genres'
import { useMediaQuery } from '../media'
import { useRouletteStore } from '../stores/roulette'

const store = useRouletteStore()
const filters = store.filters
const errors = ref<RouletteFilterErrors>({})
const form = ref<HTMLFormElement | null>(null)

// Side by side with the result, the filters are always shown. Stacked above it (same breakpoint
// as the CSS below), they sit in a collapsible panel so the pick is not pushed off screen.
const sideBySide = useMediaQuery('(min-width: 900px)')
const panelOpen = ref(false)
const filtersShown = computed(() => sideBySide.value || panelOpen.value)
const activeFilters = computed(() => countActiveFilters(filters))

function syncPanel(event: Event) {
  if (!sideBySide.value) panelOpen.value = (event.target as HTMLDetailsElement).open
}

async function spin() {
  const parsed = parseRouletteFilters(filters)
  errors.value = parsed.errors
  if (Object.keys(parsed.errors).length > 0) {
    // The errors sit in the filters, which may be off screen or collapsed: show them and bring
    // the user to the first wrong field
    if (!sideBySide.value) {
      panelOpen.value = true
      await nextTick()
      form.value?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
    }
    return
  }
  await store.spin(parsed.params)
}

function clearFilters() {
  Object.assign(filters, emptyFilters())
  errors.value = {}
}

onMounted(() => {
  if (store.status === 'idle') void spin()
  else void store.refresh()
})

const announcement = computed(() => {
  if (store.notice) return store.notice
  if (store.status === 'loading') return 'Picking a film…'
  if (store.status === 'ready' && store.film) return `Picked ${store.film.title}`
  if (store.status === 'empty') return 'No film to pick.'
  return ''
})
const isWatched = computed(() => store.film?.watchedAt != null)
</script>

<template>
  <div class="page roulette">
    <section class="roulette__filters" aria-labelledby="filters-heading">
      <h1>Tonight's film</h1>
      <p class="lead">Narrow the pool, or just spin.</p>
      <details class="roulette__panel" :open="filtersShown" @toggle="syncPanel">
        <summary class="roulette__summary">
          <span
            >Filters<template v-if="activeFilters"> ({{ activeFilters }} active)</template></span
          >
          <AppIcon class="roulette__chevron" name="chevron-down" />
        </summary>
        <form id="filter-form" ref="form" novalidate @submit.prevent="spin">
          <h2
            id="filters-heading"
            class="roulette__filters-title"
            :class="{ 'sr-only': !sideBySide }"
          >
            Filters (optional)
          </h2>
          <fieldset class="roulette__years roulette__wide">
            <legend>Release year</legend>
            <FormField id="year-from" label="From" :error="errors.yearFrom" v-slot="{ attrs }">
              <input
                v-bind="attrs"
                v-model="filters.yearFrom"
                class="input"
                type="number"
                inputmode="numeric"
                placeholder="1970"
              />
            </FormField>
            <FormField id="year-to" label="To" :error="errors.yearTo" v-slot="{ attrs }">
              <input
                v-bind="attrs"
                v-model="filters.yearTo"
                class="input"
                type="number"
                inputmode="numeric"
                placeholder="2026"
              />
            </FormField>
          </fieldset>
          <FormField id="genre" label="Genre" class="roulette__wide" v-slot="{ attrs }">
            <select v-bind="attrs" v-model="filters.genre" class="input">
              <option value="">Any genre</option>
              <option v-for="genre in GENRES" :key="genre.id" :value="String(genre.id)">
                {{ genre.name }}
              </option>
            </select>
          </FormField>
          <FormField
            id="country"
            label="Country code"
            hint="Two letters, for example JP or FR"
            :error="errors.country"
            v-slot="{ attrs }"
          >
            <input
              v-bind="attrs"
              v-model="filters.country"
              class="input"
              type="text"
              maxlength="2"
            />
          </FormField>
          <FormField
            id="max-runtime"
            label="Max runtime (minutes)"
            :error="errors.maxRuntime"
            v-slot="{ attrs }"
          >
            <input
              v-bind="attrs"
              v-model="filters.maxRuntime"
              class="input"
              type="number"
              inputmode="numeric"
              placeholder="120"
            />
          </FormField>
          <IconButton label="Clear filters" icon="x" @click="clearFilters" />
        </form>
      </details>
    </section>

    <section class="roulette__result" aria-labelledby="pick-heading">
      <h2 id="pick-heading" class="sr-only">Your pick</h2>
      <p class="sr-only" role="status">{{ announcement }}</p>

      <ErrorAlert v-if="store.error" :message="store.error">
        <button v-if="store.status === 'error'" class="btn" type="button" @click="spin">
          Try again
        </button>
      </ErrorAlert>

      <p v-if="store.status === 'loading'" class="card roulette__loading" aria-busy="true">
        Picking a film…
      </p>
      <FilmCard v-else-if="store.status === 'ready' && store.film" :film="store.film" />
      <div v-else-if="store.status === 'empty'" class="card">
        <template v-if="hasFilters(store.lastParams)">
          <h2>No film fits these filters</h2>
          <p class="lead">Loosen a filter and spin again.</p>
        </template>
        <template v-else>
          <h2>Nothing to spin</h2>
          <p class="lead">
            Your watchlist is empty, or you have watched everything on it. Import a CSV or add a
            film.
          </p>
          <div class="btn-row">
            <RouterLink class="btn btn--primary" to="/import">Import from CSV</RouterLink>
            <RouterLink class="btn" to="/watchlist/new">Add a film</RouterLink>
          </div>
        </template>
      </div>

      <div class="roulette__actions">
        <IconButton
          label="Spin again"
          icon="spin"
          variant="primary"
          large
          type="submit"
          form="filter-form"
          :disabled="store.status === 'loading'"
        />
        <IconButton
          v-if="store.status === 'ready' && store.film"
          label="Mark as watched"
          icon="eye"
          large
          :disabled="isWatched"
          @click="store.markWatched()"
        />
      </div>
      <p class="roulette__note">Marking a film as watched removes it from future spins.</p>
    </section>
  </div>
</template>

<style scoped>
/* 900px = filters (280) + result (560) + gap (40) + page padding; keep in sync with `sideBySide` */
.roulette {
  display: flex;
  flex-wrap: wrap;
  gap: 40px;
  align-items: flex-start;
}
.roulette__filters {
  flex: 1 1 280px;
  max-width: 340px;
  min-width: 0;
}
.roulette__result {
  flex: 999 1 560px;
  min-width: 0;
}
form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.roulette__filters-title {
  font-family: var(--font-body);
  font-size: 0.875rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
}
.roulette__years {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}
.roulette__years legend {
  flex-basis: 100%;
  float: left;
}
.roulette__years .field {
  flex: 1;
}
.roulette__filters :deep(.icon-button) {
  align-self: flex-start;
  width: var(--target);
  height: var(--target);
}
/* Wide: the panel is always open and has no toggle */
.roulette__summary {
  display: none;
}
@media (max-width: 899.98px) {
  .roulette__filters {
    flex-basis: 100%;
    max-width: none;
  }
  .roulette__summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    list-style: none;
    min-height: var(--target);
    padding: 0 12px;
    border: 1px solid var(--border-strong);
    border-radius: 8px;
    font-weight: 700;
    cursor: pointer;
  }
  .roulette__summary::-webkit-details-marker {
    display: none;
  }
  .roulette__chevron {
    transition: transform 0.15s;
  }
  .roulette__panel[open] .roulette__chevron {
    transform: rotate(180deg);
  }
  .roulette__panel[open] .roulette__summary {
    margin-bottom: 16px;
  }
  /* Short fields share a row; the years and the genre list take the full width */
  form {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px 12px;
  }
  /* A hint makes one field taller: keep the inputs of a row level */
  .roulette__filters :deep(.field > .input) {
    margin-top: auto;
  }
  .roulette__wide,
  .roulette__filters form > :deep(.icon-button) {
    grid-column: 1 / -1;
  }
}
.roulette__loading {
  margin: 0;
  color: var(--muted);
}
.roulette__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: center;
  margin-top: 32px;
}
.roulette__note {
  margin: 16px 0 0;
  color: var(--muted);
  font-size: 0.875rem;
}
</style>
