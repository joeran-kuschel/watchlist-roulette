# Choosing the TMDB match

Route `/watchlist/:id/match`. Fixes a film whose automatic TMDB lookup failed. Code: `views/MatchView.vue`, `tmdbId.ts`.

## Why it works by id

The backend has no endpoint that lists TMDB candidates. A match is fixed by sending the TMDB movie id (see [TMDB enrichment](../backend/tmdb-enrichment.md#fixing-a-match)). So the screen:

1. explains why the film has no match (from `tmdb.status`: `ambiguous`, `not_found`, `error`, `pending`, `matched`),
2. links to a TMDB search for the film's title (new tab),
3. takes the movie's page address (or the number in it) and sends `PATCH /api/films/:id` with `{ "tmdbId": <id> }`.

## Input

`parseTmdbId()` accepts `262543` or `https://www.themoviedb.org/movie/262543-joy` (also without `www`, with a trailing path). Anything else shows "Enter the TMDB number or paste the movie page address…" and no request is sent.

## Result

On success the watchlist announces "TMDB id saved for X. Its details load in the background." — the backend loads the movie's data in the background and the film is `pending` until then. Backend `409` (another film uses this id) is shown under the field; other errors in an alert.

## Possible later improvement

A candidate list (poster, year, director) like in the first design needs a backend endpoint that searches TMDB. See [UI design](design.md).
