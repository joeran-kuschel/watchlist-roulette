<template>
  <footer class="tmdb">
    <!-- The official TMDB logo, unmodified (see documentation/ui/tmdb-attribution.md) -->
    <img class="tmdb__logo" src="/tmdb-logo.svg" alt="TMDB" width="108" height="14" />
    <p>
      This product uses the TMDB API but is not endorsed or certified by TMDB. Film data and posters
      are provided by
      <a href="https://www.themoviedb.org/" target="_blank" rel="noopener noreferrer"
        >TMDB<span class="sr-only"> (opens in a new tab)</span></a
      >.
    </p>
  </footer>
</template>

<style scoped>
.tmdb {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px 24px;
  padding: 24px 48px;
  border-top: 1px solid var(--border);
  color: var(--muted);
  font-size: 0.875rem;
}
.tmdb p {
  margin: 0;
  max-width: 72ch;
}
.tmdb__logo {
  display: block;
  height: 14px;
  width: auto;
}
@media (max-width: 640px) {
  .tmdb {
    padding: 24px 16px;
  }
}
</style>
