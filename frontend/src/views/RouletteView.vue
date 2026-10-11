<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import FilmCard from '../components/FilmCard.vue'
import ErrorAlert from '../components/ErrorAlert.vue'
import FormField from '../components/FormField.vue'
import IconButton from '../components/IconButton.vue'
import { emptyFilters, hasFilters, parseRouletteFilters, type RouletteFilterErrors } from '../filters'
import { GENRES } from '../genres'
import { useRouletteStore } from '../stores/roulette'
import type { RandomParams } from '../types'

const store = useRouletteStore()
const filters = reactive(emptyFilters())
const errors = ref<RouletteFilterErrors>({})
const lastParams = ref<RandomParams>({})

async function spin() {
  const parsed = parseRouletteFilters(filters)
  errors.value = parsed.errors
  if (Object.keys(parsed.errors).length > 0) return
  lastParams.value = parsed.params
  await store.spin(parsed.params)
}

function clearFilters() {
  Object.assign(filters, emptyFilters())
  errors.value = {}
}

onMounted(() => {
  if (store.status === 'idle') void spin()
})

const announcement = computed(() => {
  if (store.error) return store.error
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
      <form id="filter-form" novalidate @submit.prevent="spin">
        <h2 id="filters-heading" class="roulette__filters-title">Filters (optional)</h2>
        <fieldset class="roulette__years">
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
        <FormField id="genre" label="Genre" v-slot="{ attrs }">
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
          <input v-bind="attrs" v-model="filters.country" class="input" type="text" maxlength="2" />
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
        <template v-if="hasFilters(lastParams)">
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
