# Posters

The browser never loads images from TMDB; the backend proxies them. `PosterImage.vue` points at `GET /api/films/:id/poster` (`posterUrl()` in `src/api.ts`) and is shown when the film has a `posterPath`.

## Backend route

`GET /api/films/:id/poster` is described in [TMDB enrichment](../backend/tmdb-enrichment.md#posters). If it answers with an error (no poster, TMDB down), `PosterImage` falls back to the "No poster" box, so nothing breaks.
