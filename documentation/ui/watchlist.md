# Watchlist

Route `/watchlist`. All films in a table. Code: `views/WatchlistView.vue`, `stores/watchlist.ts`, `watchlistQuery.ts`.

## What the user does

- **Search** by title (Enter or the Search button), **Show** all/unwatched/watched, **TMDB status**, **Sort by** date added, release year or title. Changing a select applies at once.
- Per film, as icon buttons: mark watched/unwatched, edit ([film form](film-form.md)), and for films with a TMDB problem **Choose match** ([TMDB match](tmdb-match.md)).
- **Add film** (plus button) opens the [film form](film-form.md).
- 50 films per page, with Previous/Next.

## State in the URL

The screen's state lives in the query string, so a search can be bookmarked and the back button works: `?q=…&watched=false&tmdb=ambiguous&sort=year-asc&page=2`. Only non-default values are written. `watchlistQuery.ts` reads and writes it; unknown values fall back to the defaults.

TMDB status choices (`tmdb`): `pending` (Pending), `ambiguous` (Needs review), `not_found` (Not found), `error` (Lookup failed), `matched` (Matched); the default is any status. One status at a time. The names are short versions of the badge texts in the table (the badges are defined in `WatchlistView.vue`, the filter names in `watchlistQuery.ts`), and the value is sent as the backend's `tmdbStatus`. An unknown value in the URL is ignored. Use it to find films that need attention, for example **Needs review**, then **Choose match**.

Sort choices: `added-desc` (default), `added-asc`, `year-desc`, `year-asc`, `title`. They map to the backend's `sort` and `order`.

## Backend

- `GET /api/films` with `q`, `watched`, `tmdbStatus`, `sort`, `order`, `page`, `pageSize`.
- `PATCH /api/films/:id` with `{ "watched": true | false }`; the row is replaced by the answer.

## Table

A real `<table>` with a hidden caption, column headers and the title as row header. The title links to Letterboxd (new tab) when the film has a link. The status column shows "To watch" or "Watched <date>", and a warning badge for `ambiguous` ("Needs review: several TMDB matches"), `not_found` and `error` lookups. A film that is still `pending` shows a neutral badge "Waiting for TMDB data" (no warning color and no **Choose match** button, because nothing is wrong yet); it goes away once the lookup has run and the list is loaded again (the screen does not refresh by itself). Without a `TMDB_ACCESS_TOKEN` every film stays pending, so every film shows it. `matched` films show nothing extra.

## States

Loading, load error with **Try again**, an empty list ("Your watchlist is empty", with links to import and add), and no results for a search ("No films match your search", with **Reset search**). A `role="status"` line below the filters announces results of actions ("X is marked as watched.", "X was added.") and is cleared when the screen is left.
