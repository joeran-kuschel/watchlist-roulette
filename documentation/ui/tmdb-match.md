# Choosing the TMDB match

Route `/watchlist/:id/match`. Fixes a film whose automatic TMDB lookup failed. Code: `views/MatchView.vue`, `tmdbId.ts`.

**← Back to watchlist**, **Cancel** and the redirect after saving lead to the watchlist as the user left it, with search, filters and page (see [Coming back from a film](watchlist.md#coming-back-from-a-film)).

## Why it works by id

The backend has no endpoint that lists TMDB candidates. A match is fixed by sending the TMDB id and its kind, movie or TV show (see [TMDB enrichment](../backend/tmdb-enrichment.md#fixing-a-match)). So the screen:

1. explains why the film has no match (from `tmdb.status`: `ambiguous`, `not_found`, `error`, `pending`, `matched`),
2. links to a TMDB search for the film's title (new tab),
3. takes the page address of the movie or TV show (or a number, which means a movie) and sends `PATCH /api/films/:id` with `{ "tmdbId": <id>, "tmdbMediaType": "movie" | "tv" }`.

## Input

`parseTmdbTitle()` accepts `https://www.themoviedb.org/movie/262543-joy` and `https://www.themoviedb.org/tv/1396` (also without `www`, with a trailing path) and returns the id and the kind. A bare number such as `262543` means a movie, because TMDB numbers movies and shows separately and a number alone cannot name a show; the hint under the field says so. Anything else shows "Enter the TMDB number or paste the movie or TV show page address…" and no request is sent. The search link goes to TMDB's search for all kinds of titles.

## Result

On success the watchlist announces "TMDB id saved for X. Its details load in the background." — the backend loads the movie's data in the background and the film is `pending` until then. Backend `409` (another film uses this id) is shown under the field; other errors in an alert.

## Possible later improvement

A candidate list (poster, year, director) like in the first design needs a backend endpoint that searches TMDB. See [UI design](design.md).
