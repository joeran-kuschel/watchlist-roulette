<script setup lang="ts">
import { computed } from 'vue'
import { directorLabel, filmFacts, formatDate, isHttpUrl, joinNames, linkSite } from '../format'
import type { Film } from '../types'
import FilmFacts from './FilmFacts.vue'
import PosterImage from './PosterImage.vue'

const props = defineProps<{ film: Film }>()

const credits = computed(() =>
  [
    props.film.directors.length ? `${directorLabel(props.film)} ${joinNames(props.film.directors)}` : '',
    joinNames(props.film.genres),
  ]
    .filter(Boolean)
    .join(' · '),
)
</script>

<template>
  <article class="film-card card">
    <div class="film-card__poster">
      <PosterImage :film-id="film.id" :has-poster="film.posterPath !== null" />
    </div>
    <div class="film-card__body">
      <h2 class="film-card__title">{{ film.title }}</h2>
      <FilmFacts :facts="filmFacts(film)" />
      <p v-if="credits" class="film-card__credits">{{ credits }}</p>
      <p v-if="film.overview" class="film-card__overview">{{ film.overview }}</p>
      <p class="film-card__meta">
        On your list since {{ formatDate(film.addedAt) }}
        <template v-if="film.watchedAt"> · Watched {{ formatDate(film.watchedAt) }}</template>
        <template v-if="film.letterboxdUrl && isHttpUrl(film.letterboxdUrl)">
          ·
          <a :href="film.letterboxdUrl" target="_blank" rel="noopener noreferrer"
            >Open on {{ linkSite(film.letterboxdUrl) }}<span class="sr-only"> (opens in a new tab)</span></a
          >
        </template>
      </p>
    </div>
  </article>
</template>

<style scoped>
.film-card {
  display: flex;
  flex-wrap: wrap;
  gap: 32px;
}
.film-card__poster {
  flex: 0 0 220px;
  max-width: 100%;
}
.film-card__body {
  flex: 1 1 300px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.film-card__title {
  font-size: 2.75rem;
  font-weight: 800;
  overflow-wrap: anywhere;
}
.film-card__credits,
.film-card__overview {
  margin: 0;
  color: var(--text-soft);
  max-width: 60ch;
}
.film-card__overview {
  line-height: 1.6;
}
.film-card__meta {
  margin: 0;
  color: var(--muted);
  font-size: 0.875rem;
}
</style>
