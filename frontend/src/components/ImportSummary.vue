<script setup lang="ts">
import type { ImportedFilmRef, ImportReport } from '../types'

defineProps<{ report: ImportReport }>()

const formats = { letterboxd: 'Letterboxd export', imdb: 'IMDb export' } as const

const label = (film: ImportedFilmRef) => (film.releaseYear ? `${film.title} (${film.releaseYear})` : film.title)
</script>

<template>
  <div class="summary">
    <p class="summary__note">
      Detected: {{ formats[report.source] }}.
      <template v-if="report.source === 'imdb'">Only films that came from IMDb can be removed by this file.</template>
    </p>

    <dl class="summary__counts card">
      <div>
        <dt>{{ report.applied ? 'Added' : 'Will be added' }}</dt>
        <dd>{{ report.inserted }}</dd>
      </div>
      <div>
        <dt>{{ report.applied ? 'Updated' : 'Will be updated' }}</dt>
        <dd>{{ report.updated }}</dd>
      </div>
      <div>
        <dt>Unchanged</dt>
        <dd>{{ report.unchanged }}</dd>
      </div>
      <div>
        <dt>{{ report.applied ? 'Removed' : 'Will be removed' }}</dt>
        <dd>{{ report.removed.length }}</dd>
      </div>
      <div :class="{ 'summary__warn': report.rejected.length > 0 }">
        <dt>Rejected rows</dt>
        <dd>{{ report.rejected.length }}</dd>
      </div>
    </dl>

    <section v-if="report.removed.length" aria-labelledby="removed-heading">
      <h3 id="removed-heading">
        {{ report.applied ? 'Removed from your list' : 'These films are not in the file and will be removed' }}
      </h3>
      <ul>
        <li v-for="film in report.removed" :key="film.id">{{ label(film) }}</li>
      </ul>
    </section>

    <section v-if="report.keptWatched.length" aria-labelledby="kept-heading">
      <h3 id="kept-heading">Kept because you watched them</h3>
      <p class="summary__note">These films are not in the file, but they stay on your list.</p>
      <ul>
        <li v-for="film in report.keptWatched" :key="film.id">{{ label(film) }}</li>
      </ul>
    </section>

    <section v-if="report.rejected.length" class="alert" aria-labelledby="rejected-heading">
      <h3 id="rejected-heading">
        {{ report.rejected.length }} {{ report.rejected.length === 1 ? 'row was' : 'rows were' }} rejected
      </h3>
      <div class="table-wrap">
        <table>
          <caption class="sr-only">
            Rejected rows
          </caption>
          <thead>
            <tr>
              <th scope="col">Line</th>
              <th scope="col">Reason</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in report.rejected" :key="row.line">
              <th scope="row">{{ row.line }}</th>
              <td>{{ row.reason }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<style scoped>
.summary {
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.summary__counts {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 40px;
  margin: 0;
  padding: 20px 24px;
}
.summary__counts dt {
  color: var(--muted);
}
.summary__counts dd {
  margin: 0;
  font-size: 1.75rem;
  font-weight: 700;
}
.summary__warn dd {
  color: var(--warn);
}
h3 {
  font-size: 1.125rem;
  margin-bottom: 8px;
}
.summary__note {
  margin: 0 0 8px;
  color: var(--muted);
}
ul {
  margin: 0;
  padding-left: 20px;
}
</style>
