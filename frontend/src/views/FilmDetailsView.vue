<script setup lang="ts">
import { computed, nextTick, onMounted, ref, useTemplateRef, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useWatchlistStore } from '../stores/watchlist'
import { ApiError, describeError, getFilm, lookupFilmOnTmdb, updateFilm } from '../api'
import BackLink from '../components/BackLink.vue'
import ErrorAlert from '../components/ErrorAlert.vue'
import FilmFacts from '../components/FilmFacts.vue'
import PosterImage from '../components/PosterImage.vue'
import { canLookUp, directorLabel, filmFacts, formatDate, isHttpUrl, joinNames, needsMatch } from '../format'
import { tmdbTitleUrl } from '../tmdbId'
import type { Film } from '../types'

const route = useRoute()
const watchlist = useWatchlistStore()

const film = ref<Film | null>(null)
const error = ref('')
const notFound = ref(false)
const actionError = ref('')
const notice = ref('')
// The film whose watched state is being saved. Per film, so a slow request for the film the user left
// does not block the button of the next one
const savingId = ref<number | null>(null)
// The film that is being looked up on TMDB (same reasoning as `savingId`)
const lookingUpId = ref<number | null>(null)
const heading = useTemplateRef<HTMLHeadingElement>('heading')

// Counts the requests, so a slow answer for an earlier film never overwrites the one that was asked for last
let latestRequest = 0

async function load() {
  const request = ++latestRequest
  error.value = ''
  actionError.value = ''
  notice.value = ''
  notFound.value = false
  try {
    const loaded = await getFilm(Number(route.params.id))
    if (request === latestRequest) film.value = loaded
  } catch (e) {
    if (request !== latestRequest) return
    notFound.value = e instanceof ApiError && e.status === 404
    error.value = describeError(e)
  }
}
onMounted(load)
// The router reuses this component when only the id changes
watch(
  () => route.params.id,
  (id) => {
    if (id === undefined) return
    film.value = null
    void load()
  },
)

async function setWatched(current: Film, watched: boolean) {
  if (savingId.value === current.id) return // a click while the request runs
  savingId.value = current.id
  actionError.value = ''
  notice.value = ''
  try {
    const updated = await updateFilm(current.id, { watched })
    if (film.value?.id !== current.id) return
    film.value = updated
    notice.value = `${current.title} is marked as ${watched ? 'watched' : 'unwatched'}.`
  } catch (e) {
    if (film.value?.id === current.id) actionError.value = describeError(e)
  } finally {
    if (savingId.value === current.id) savingId.value = null
  }
}

// What the user hears after a look-up, by the film's new TMDB status
const LOOKUP_RESULTS: Record<Film['tmdb']['status'], string> = {
  matched: 'was matched on TMDB.',
  ambiguous: 'has several possible matches on TMDB. Choose the match.',
  not_found: 'was not found on TMDB.',
  error: 'could not be looked up on TMDB.',
  pending: 'is still waiting for TMDB.',
}

async function lookUp(current: Film) {
  if (lookingUpId.value === current.id) return // a click while the request runs
  lookingUpId.value = current.id
  actionError.value = ''
  notice.value = ''
  try {
    const updated = await lookupFilmOnTmdb(current.id)
    if (film.value?.id !== current.id) return
    film.value = updated
    notice.value = `Look-up finished: ${updated.title} ${LOOKUP_RESULTS[updated.tmdb.status]}`
    // The button is gone when the film is matched; keep the focus on the page instead of losing it
    if (!canLookUp(updated)) {
      await nextTick()
      heading.value?.focus()
    }
  } catch (e) {
    // The API words TMDB problems (not set up, not reachable, rejected our token) for the user; a bare 502 from a proxy is not
    const tmdbProblem = e instanceof ApiError && e.code === 'tmdb_unavailable'
    if (film.value?.id === current.id) actionError.value = tmdbProblem ? e.message : describeError(e)
  } finally {
    if (lookingUpId.value === current.id) lookingUpId.value = null
  }
}

const facts = computed(() => {
  const f = film.value
  if (!f) return []
  return [
    ...filmFacts(f, true),
    { label: 'Genres', value: joinNames(f.genres) },
    { label: directorLabel(f), value: joinNames(f.directors) },
  ].filter((fact) => fact.value !== '')
})
const showOriginalTitle = computed(() => film.value?.originalTitle && film.value.originalTitle !== film.value.title)
const links = computed(() => {
  const f = film.value
  if (!f) return []
  return [
    f.letterboxdUrl && isHttpUrl(f.letterboxdUrl) ? { name: 'Letterboxd', href: f.letterboxdUrl } : null,
    f.tmdb.id !== null ? { name: 'The Movie Database (TMDB)', href: tmdbTitleUrl(f.tmdb.id, f.tmdb.mediaType) } : null,
  ].filter((link) => link !== null)
})
</script>

<template>
  <div class="page">
    <BackLink :to="watchlist.listLocation">← Back to watchlist</BackLink>

    <template v-if="error">
      <h1 v-if="notFound">Film not found</h1>
      <h1 v-else>Film details</h1>
      <ErrorAlert :message="error">
        <button v-if="!notFound" class="btn" type="button" @click="load">Try again</button>
      </ErrorAlert>
    </template>
    <template v-else-if="!film">
      <h1>Film details</h1>
      <p aria-busy="true" class="lead">Loading film…</p>
    </template>

    <article v-else class="details">
      <div class="details__poster">
        <PosterImage :film-id="film.id" :has-poster="film.posterPath !== null" />
      </div>
      <div class="details__body">
        <div class="details__head">
          <div>
            <h1 ref="heading" tabindex="-1">{{ film.title }}</h1>
            <p v-if="showOriginalTitle" class="details__original">Original title: {{ film.originalTitle }}</p>
            <p v-if="film.tagline" class="details__tagline">{{ film.tagline }}</p>
          </div>
          <div class="details__actions">
            <!-- aria-disabled, not disabled: a disabled button that has the focus loses it in Firefox and Safari -->
            <button
              class="btn"
              type="button"
              :aria-disabled="savingId === film.id ? 'true' : undefined"
              @click="setWatched(film, !film.watchedAt)"
            >
              {{ film.watchedAt ? 'Mark as unwatched' : 'Mark as watched' }}
            </button>
            <button
              v-if="canLookUp(film)"
              class="btn"
              type="button"
              :aria-disabled="lookingUpId === film.id ? 'true' : undefined"
              @click="lookUp(film)"
            >
              {{ lookingUpId === film.id ? 'Looking up…' : 'Look up on TMDB' }}
            </button>
            <RouterLink v-if="needsMatch(film)" class="btn" :to="`/watchlist/${film.id}/match`">Choose TMDB match</RouterLink>
            <RouterLink class="btn" :to="`/watchlist/${film.id}/edit`" :aria-label="`Edit ${film.title}`">Edit</RouterLink>
          </div>
        </div>
        <ErrorAlert v-if="actionError" :message="actionError" />
        <p class="sr-only" role="status">{{ notice }}</p>

        <FilmFacts :facts="facts" layout="grid" />

        <p class="details__meta">
          On your list since {{ formatDate(film.addedAt) }}
          <template v-if="film.watchedAt"> · Watched {{ formatDate(film.watchedAt) }}</template>
          <template v-else> · Not watched yet</template>
        </p>

        <section v-if="film.overview" aria-labelledby="overview-heading">
          <h2 id="overview-heading">Overview</h2>
          <p class="details__text">{{ film.overview }}</p>
        </section>

        <section v-if="film.cast.length" aria-labelledby="cast-heading">
          <h2 id="cast-heading">Cast</h2>
          <p class="details__text">{{ joinNames(film.cast) }}</p>
        </section>

        <section v-if="links.length" aria-labelledby="links-heading">
          <h2 id="links-heading">Links</h2>
          <ul class="details__links">
            <li v-for="link in links" :key="link.name">
              <a :href="link.href" target="_blank" rel="noopener noreferrer"
                >{{ link.name }}<span class="sr-only"> (opens in a new tab)</span></a
              >
            </li>
          </ul>
        </section>
      </div>
    </article>
  </div>
</template>

<style scoped>
.details {
  display: flex;
  flex-wrap: wrap;
  gap: 32px;
}
.details__poster {
  flex: 0 0 260px;
  max-width: 100%;
}
.details__body {
  flex: 1 1 320px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.details__head {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}
.details__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
h1 {
  overflow-wrap: anywhere;
}
.details__original,
.details__tagline {
  margin: 8px 0 0;
  color: var(--text-soft);
}
.details__tagline {
  font-style: italic;
}
.details__meta {
  margin: 0;
  color: var(--muted);
  font-size: 0.875rem;
}
h2 {
  font-size: 1.125rem;
  margin: 0 0 8px;
}
.details__text {
  margin: 0;
  color: var(--text-soft);
  max-width: 60ch;
  line-height: 1.6;
}
.details__links {
  margin: 0;
  padding-left: 20px;
  line-height: 1.8;
}
</style>
