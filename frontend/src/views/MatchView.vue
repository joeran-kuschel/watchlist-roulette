<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ApiError, describeError, getFilm, updateFilm } from '../api'
import BackLink from '../components/BackLink.vue'
import ErrorAlert from '../components/ErrorAlert.vue'
import FormField from '../components/FormField.vue'
import { parseTmdbId, tmdbSearchUrl } from '../tmdbId'
import { useWatchlistStore } from '../stores/watchlist'
import type { Film } from '../types'

const route = useRoute()
const router = useRouter()
const watchlist = useWatchlistStore()

const film = ref<Film | null>(null)
const loadError = ref('')
const submitError = ref('')
const fieldError = ref('')
const input = ref('')
const saving = ref(false)

const reason = computed(
  () =>
    ({
      ambiguous: 'TMDB found several films with this title, or the best match belongs to another film on your list.',
      not_found: 'TMDB found no film with this title.',
      error: 'TMDB could not be reached when this film was looked up.',
      pending: 'This film has not been looked up yet.',
      matched: 'This film is already matched. Saving another id replaces its TMDB data.',
    })[film.value?.tmdb.status ?? 'pending'],
)

async function load() {
  loadError.value = ''
  try {
    film.value = await getFilm(Number(route.params.id))
  } catch (e) {
    loadError.value = describeError(e)
  }
}
onMounted(load)

async function submit() {
  submitError.value = ''
  const tmdbId = parseTmdbId(input.value)
  if (tmdbId === null) {
    fieldError.value = 'Enter the TMDB number or paste the movie page address from themoviedb.org.'
    return
  }
  fieldError.value = ''
  saving.value = true
  try {
    const updated = await updateFilm(Number(route.params.id), { tmdbId })
    watchlist.notice = `TMDB id saved for ${updated.title}. Its details load in the background.`
    await router.push('/watchlist')
  } catch (e) {
    if (e instanceof ApiError && e.status === 409) {
      fieldError.value = 'Another film on your list already uses this TMDB movie.'
    } else {
      submitError.value = describeError(e)
    }
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="page page--narrow">
    <BackLink to="/watchlist">← Back to watchlist</BackLink>
    <h1>Choose the TMDB match</h1>

    <ErrorAlert v-if="loadError" :message="loadError">
      <button class="btn" type="button" @click="load">Try again</button>
    </ErrorAlert>
    <p v-else-if="!film" aria-busy="true" class="lead">Loading film…</p>

    <template v-else>
      <p class="lead">
        Your film: <strong>{{ film.title }}</strong
        ><template v-if="film.releaseYear"> ({{ film.releaseYear }})</template>. {{ reason }}
      </p>

      <ol class="steps">
        <li>
          <a :href="tmdbSearchUrl(film.title)" target="_blank" rel="noopener noreferrer"
            >Search TMDB for “{{ film.title }}”<span class="sr-only"> (opens in a new tab)</span></a
          >
          and open the right film.
        </li>
        <li>Copy the address of that page (or the number in it) and paste it below.</li>
      </ol>

      <ErrorAlert v-if="submitError" :message="submitError" />
      <form novalidate @submit.prevent="submit">
        <FormField
          id="tmdb-id"
          label="TMDB movie address or number"
          hint="For example https://www.themoviedb.org/movie/262543-joy or 262543"
          :error="fieldError"
          v-slot="{ attrs }"
        >
          <input v-bind="attrs" v-model="input" class="input" type="text" autocomplete="off" />
        </FormField>
        <div class="btn-row">
          <button class="btn btn--primary" type="submit" :disabled="saving">
            {{ saving ? 'Saving…' : 'Use this match' }}
          </button>
          <RouterLink class="btn" to="/watchlist">Cancel</RouterLink>
        </div>
      </form>
    </template>
  </div>
</template>

<style scoped>
.steps {
  margin: 0 0 24px;
  padding-left: 24px;
  color: var(--text-soft);
  line-height: 1.7;
}
form {
  display: flex;
  flex-direction: column;
  gap: 24px;
}
</style>
