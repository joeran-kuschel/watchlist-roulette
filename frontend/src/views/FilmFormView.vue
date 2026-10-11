<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ApiError, createFilm, deleteFilm, describeError, getFilm, updateFilm } from '../api'
import BackLink from '../components/BackLink.vue'
import ErrorAlert from '../components/ErrorAlert.vue'
import FormField from '../components/FormField.vue'
import {
  emptyFilmForm,
  FIELD_IDS,
  issuesToErrors,
  validateFilmForm,
  type FilmField,
  type FilmFormErrors,
} from '../filmForm'
import { useWatchlistStore } from '../stores/watchlist'

const route = useRoute()
const router = useRouter()
const watchlist = useWatchlistStore()

const filmId = computed(() => (route.params.id ? Number(route.params.id) : null))
const isEdit = computed(() => filmId.value !== null)

const values = reactive(emptyFilmForm())
const errors = ref<FilmFormErrors>({})
const loadError = ref('')
const submitError = ref('')
const loading = ref(false)
const saving = ref(false)
const confirmingDelete = ref(false)
const summary = ref<HTMLElement | null>(null)
const deleteButton = ref<HTMLElement | null>(null)
const keepButton = ref<HTMLElement | null>(null)
let savedTitle = ''

const problems = computed(() =>
  (Object.keys(errors.value) as FilmField[]).map((field) => ({
    id: FIELD_IDS[field],
    message: errors.value[field] as string,
  })),
)

async function load() {
  if (filmId.value === null) return
  loading.value = true
  loadError.value = ''
  try {
    const film = await getFilm(filmId.value)
    savedTitle = film.title
    Object.assign(values, {
      title: film.title,
      releaseYear: film.releaseYear === null ? '' : String(film.releaseYear),
      letterboxdUrl: film.letterboxdUrl ?? '',
      addedAt: film.addedAt,
    })
  } catch (e) {
    loadError.value = describeError(e)
  } finally {
    loading.value = false
  }
}
onMounted(load)

async function showProblems(next: FilmFormErrors) {
  errors.value = next
  await nextTick()
  summary.value?.focus()
}

async function submit() {
  submitError.value = ''
  const { errors: found, payload } = validateFilmForm(values)
  if (Object.keys(found).length > 0) return showProblems(found)
  errors.value = {}
  saving.value = true
  try {
    const film = isEdit.value
      ? await updateFilm(filmId.value as number, payload)
      : await createFilm(payload)
    watchlist.notice = `${film.title} was ${isEdit.value ? 'saved' : 'added'}.`
    await router.push(watchlist.listLocation)
  } catch (e) {
    if (e instanceof ApiError && e.status === 409) {
      await showProblems({ letterboxdUrl: 'Another film already uses this Letterboxd link.' })
    } else if (e instanceof ApiError && e.status === 400 && Object.keys(issuesToErrors(e.issues)).length) {
      await showProblems(issuesToErrors(e.issues))
    } else {
      submitError.value = describeError(e)
    }
  } finally {
    saving.value = false
  }
}

// The button that was pressed disappears, so focus goes to the one that replaces it (WCAG 2.4.3)
async function askToDelete() {
  confirmingDelete.value = true
  await nextTick()
  keepButton.value?.focus()
}

async function stopDeleting() {
  confirmingDelete.value = false
  await nextTick()
  deleteButton.value?.focus()
}

async function remove() {
  submitError.value = ''
  saving.value = true
  try {
    await deleteFilm(filmId.value as number)
    watchlist.notice = `${savedTitle} was deleted.`
    await router.push(watchlist.listLocation)
  } catch (e) {
    submitError.value = describeError(e)
    await stopDeleting()
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="page page--narrow">
    <BackLink :to="watchlist.listLocation">← Back to watchlist</BackLink>
    <h1>{{ isEdit ? 'Edit film' : 'Add film' }}</h1>
    <p class="lead">
      Poster, runtime and credits are filled in automatically from TMDB after saving.
    </p>

    <ErrorAlert v-if="loadError" :message="loadError">
      <button class="btn" type="button" @click="load">Try again</button>
    </ErrorAlert>
    <p v-else-if="loading" aria-busy="true" class="lead">Loading film…</p>

    <form v-else novalidate @submit.prevent="submit">
      <div v-if="problems.length" ref="summary" class="alert" role="alert" tabindex="-1">
        <h2>Please fix {{ problems.length }} {{ problems.length === 1 ? 'problem' : 'problems' }}</h2>
        <ul>
          <li v-for="problem in problems" :key="problem.id">
            <a :href="`#${problem.id}`">{{ problem.message }}</a>
          </li>
        </ul>
      </div>
      <ErrorAlert v-if="submitError" :message="submitError" />

      <FormField id="film-title" label="Title" required :error="errors.title" v-slot="{ attrs }">
        <input v-bind="attrs" v-model="values.title" class="input" type="text" autocomplete="off" />
      </FormField>
      <FormField
        id="film-year"
        label="Release year"
        hint="Optional. Helps TMDB find the right film."
        :error="errors.releaseYear"
        v-slot="{ attrs }"
      >
        <input
          v-bind="attrs"
          v-model="values.releaseYear"
          class="input input--short"
          type="number"
          inputmode="numeric"
        />
      </FormField>
      <FormField
        id="film-url"
        label="Letterboxd link"
        hint="Optional. Must start with https://"
        :error="errors.letterboxdUrl"
        v-slot="{ attrs }"
      >
        <input v-bind="attrs" v-model="values.letterboxdUrl" class="input" type="url" />
      </FormField>
      <FormField
        id="film-added"
        label="Date added"
        :hint="isEdit ? undefined : 'Optional. Today if empty.'"
        :error="errors.addedAt"
        v-slot="{ attrs }"
      >
        <input v-bind="attrs" v-model="values.addedAt" class="input input--short" type="date" />
      </FormField>

      <div class="btn-row">
        <button class="btn btn--primary" type="submit" :disabled="saving">
          {{ saving ? 'Saving…' : 'Save film' }}
        </button>
        <RouterLink class="btn" :to="watchlist.listLocation">Cancel</RouterLink>
      </div>

      <section v-if="isEdit" class="danger" aria-labelledby="danger-heading">
        <h2 id="danger-heading">Delete film</h2>
        <template v-if="!confirmingDelete">
          <p>Removes {{ savedTitle }} from your watchlist for good.</p>
          <button ref="deleteButton" class="btn" type="button" @click="askToDelete">
            Delete film…
          </button>
        </template>
        <template v-else>
          <p role="alert">Delete {{ savedTitle }}? This cannot be undone.</p>
          <div class="btn-row">
            <button class="btn btn--primary" type="button" :disabled="saving" @click="remove">
              Yes, delete it
            </button>
            <button ref="keepButton" class="btn" type="button" @click="stopDeleting">Keep film</button>
          </div>
        </template>
      </section>
    </form>
  </div>
</template>

<style scoped>
form {
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.input--short {
  max-width: 220px;
}
.danger {
  margin-top: 16px;
  padding-top: 24px;
  border-top: 1px solid var(--border);
}
.danger h2 {
  font-size: 1.25rem;
}
.danger p {
  color: var(--muted);
}
</style>
