<script setup lang="ts">
import { computed } from 'vue'
import { formatDate, formatRuntime, isHttpUrl, joinNames } from '../format'
import type { Film } from '../types'
import PosterImage from './PosterImage.vue'

const props = defineProps<{ film: Film }>()

const facts = computed(() => {
  const { film } = props
  return [
    { label: 'Year', value: film.releaseYear },
    { label: 'Runtime', value: formatRuntime(film.runtimeMinutes) },
    {
      label: 'Rating',
      value: film.voteAverage === null ? null : `${film.voteAverage.toFixed(1)} / 10`,
    },
    { label: 'Country', value: film.countries.join(', ') || null },
  ].filter((fact) => fact.value !== null && fact.value !== '')
})
const credits = computed(() =>
  [
    props.film.directors.length ? `Directed by ${joinNames(props.film.directors)}` : '',
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
      <dl v-if="facts.length" class="film-card__facts">
        <div v-for="fact in facts" :key="fact.label">
          <dt>{{ fact.label }}</dt>
          <dd>{{ fact.value }}</dd>
        </div>
      </dl>
      <p v-if="credits" class="film-card__credits">{{ credits }}</p>
      <p v-if="film.overview" class="film-card__overview">{{ film.overview }}</p>
      <p class="film-card__meta">
        On your list since {{ formatDate(film.addedAt) }}
        <template v-if="film.watchedAt"> · Watched {{ formatDate(film.watchedAt) }}</template>
        <template v-if="film.letterboxdUrl && isHttpUrl(film.letterboxdUrl)">
          ·
          <a :href="film.letterboxdUrl" target="_blank" rel="noopener noreferrer"
            >Open on Letterboxd<span class="sr-only"> (opens in a new tab)</span></a
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
.film-card__facts {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 24px;
  margin: 0;
  color: var(--text-soft);
}
.film-card__facts div {
  display: flex;
  gap: 6px;
}
.film-card__facts dt {
  color: var(--muted);
}
.film-card__facts dd {
  margin: 0;
  font-weight: 700;
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
