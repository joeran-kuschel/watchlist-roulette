<template>
  <footer class="tmdb">
    <!-- Placeholder: replace with the official TMDB logo, see documentation/ui/tmdb-attribution.md -->
    <span class="tmdb__logo" role="img" aria-label="TMDB logo">TMDB LOGO</span>
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
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 88px;
  height: 22px;
  border: 1px dashed var(--border-strong);
  border-radius: 4px;
  font-size: 0.6875rem;
  letter-spacing: 0.06em;
}
@media (max-width: 640px) {
  .tmdb {
    padding: 24px 16px;
  }
}
</style>
