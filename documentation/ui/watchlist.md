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

A real `<table>` with a hidden caption, column headers and the title as row header. The title links to the film's [details page](film-details.md), in the same tab; the Letterboxd and TMDB links are on that page. The status column shows "To watch" or "Watched <date>", and a warning badge for `ambiguous` ("Needs review: several TMDB matches"), `not_found` and `error` lookups. A film that is still `pending` shows a neutral badge "Waiting for TMDB data" (no warning color and no **Choose match** button, because nothing is wrong yet); it goes away once the lookup has run and the list is loaded again (the screen does not refresh by itself). Without a `TMDB_ACCESS_TOKEN` every film stays pending, so every film shows it. `matched` films show nothing extra.

### On small screens

Up to 800 px wide (phones and small tablets) the table does not fit, so each film is shown as a **card** instead (WCAG 1.4.10, reflow: no horizontal scrolling at 320 px). It is still the same `<table>`; only CSS changes (`WatchlistView.vue`, media query `max-width: 800px`):

- the title (the link to the film's page), then "year · Added *date*", then the status badges, then the action buttons, which are always on screen,
- the column headers are hidden visually but stay in the page for screen readers,
- the word "Added" before the date is drawn by CSS with an empty alternative text, so screen readers do not read it twice (they get the column name from the table). Browsers that do not know that syntax (Firefox before 128, Safari before 17.4) keep a plain version of it, so the label is never lost; there a screen reader may read "Added" twice.

Because some screen readers (VoiceOver) drop the table meaning when a table is styled as blocks, the table, row groups, rows, headers and cells carry explicit ARIA roles (`table`, `rowgroup`, `row`, `columnheader`, `rowheader`, `cell`). They repeat what the elements already mean, on purpose. Above 800 px (and at widths in between, such as 800.4 px when zoomed) the normal table is shown, with a minimum width of 720 px; the card layout is the only thing the media query changes.

The layout is checked in a real browser (`e2e/app.spec.ts`) at 320, 375 and 799 px (no page wider than the screen, every action button on screen, headers hidden but present) and at 801 px (table with visible headers).

## States

Loading, load error with **Try again**, an empty list ("Your watchlist is empty", with links to import and add), and no results for a search ("No films match your search", with **Reset search**). A `role="status"` line below the filters announces results of actions ("X is marked as watched.", "X was added.") and is cleared when the screen is left.
