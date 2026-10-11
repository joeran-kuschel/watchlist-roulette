# Watchlist

Route `/watchlist`. All films in a table. Code: `views/WatchlistView.vue`, `stores/watchlist.ts`, `watchlistQuery.ts`.

## What the user does

- **Search** by title (Enter or the Search button), **Show** all/unwatched/watched, **Sort by** date added, release year or title. Changing a select applies at once.
- Per film, as icon buttons: mark watched/unwatched, edit ([film form](film-form.md)), and for films with a TMDB problem **Choose match** ([TMDB match](tmdb-match.md)).
- **Add film** (plus button) opens the [film form](film-form.md).
- 50 films per page, with Previous/Next.

## State in the URL

The screen's state lives in the query string, so a search can be bookmarked and the back button works: `?q=…&watched=false&sort=year-asc&page=2`. Only non-default values are written. `watchlistQuery.ts` reads and writes it; unknown values fall back to the defaults.

Sort choices: `added-desc` (default), `added-asc`, `year-desc`, `year-asc`, `title`. They map to the backend's `sort` and `order`.

## Backend

- `GET /api/films` with `q`, `watched`, `sort`, `order`, `page`, `pageSize`.
- `PATCH /api/films/:id` with `{ "watched": true | false }`; the row is replaced by the answer.

## Table

A real `<table>` with a hidden caption, column headers and the title as row header. The title links to Letterboxd (new tab) when the film has a link. The status column shows "To watch" or "Watched <date>", and a warning badge for `ambiguous` ("Needs review: several TMDB matches"), `not_found` and `error` lookups; `pending` and `matched` show nothing extra.

## States

Loading, load error with **Try again**, an empty list ("Your watchlist is empty", with links to import and add), and no results for a search ("No films match your search", with **Reset search**). A `role="status"` line below the filters announces results of actions ("X is marked as watched.", "X was added.") and is cleared when the screen is left.
