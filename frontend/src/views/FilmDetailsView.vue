<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useWatchlistStore } from '../stores/watchlist'
import { ApiError, describeError, getFilm } from '../api'
import BackLink from '../components/BackLink.vue'
import ErrorAlert from '../components/ErrorAlert.vue'
import FilmFacts from '../components/FilmFacts.vue'
import PosterImage from '../components/PosterImage.vue'
import { directorLabel, filmFacts, formatDate, isHttpUrl, joinNames } from '../format'
import { tmdbTitleUrl } from '../tmdbId'
import type { Film } from '../types'

const route = useRoute()
const watchlist = useWatchlistStore()

const film = ref<Film | null>(null)
const error = ref('')
const notFound = ref(false)

// Counts the requests, so a slow answer for an earlier film never overwrites the one that was asked for last
let latestRequest = 0

async function load() {
  const request = ++latestRequest
  error.value = ''
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
            <h1>{{ film.title }}</h1>
            <p v-if="showOriginalTitle" class="details__original">Original title: {{ film.originalTitle }}</p>
            <p v-if="film.tagline" class="details__tagline">{{ film.tagline }}</p>
          </div>
          <RouterLink class="btn" :to="`/watchlist/${film.id}/edit`" :aria-label="`Edit ${film.title}`">Edit</RouterLink>
        </div>

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
