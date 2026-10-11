# Posters

The browser never loads images from TMDB; the backend proxies them. `PosterImage.vue` points at `GET /api/films/:id/poster` (`posterUrl()` in `src/api.ts`) and is shown when the film has a `posterPath`.

## Open item: the backend route

The backend does not have this route yet. It should:

- look up the film's `poster_path`, fetch `https://image.tmdb.org/t/p/<size><poster_path>` and stream it back with its content type,
- answer `404` when the film has no poster,
- send cache headers (the image for a path never changes), and not expose the TMDB token (images do not need it).

Until it exists, every poster request fails and the screens show the "No poster" placeholder: `PosterImage` falls back to it whenever the image fails to load, so nothing breaks.
