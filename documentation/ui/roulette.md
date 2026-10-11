# Roulette

Route `/`. Picks a random unwatched film. Code: `views/RouletteView.vue`, `stores/roulette.ts`, `filters.ts`, `components/FilmCard.vue`.

## What the user does

- The screen picks a film when it opens. Coming back keeps the filters (they live in the roulette store) and the last pick, which is reloaded: if it was watched or deleted in the meantime, a new film is picked with the same filters.
- While a pick is loading, **Spin again** is disabled, and an answer that arrives after a newer spin is dropped, so the screen always shows the last pick.
- **Spin again** (round icon button, or Enter in a filter field) picks another film with the current filters.
- **Mark as watched** marks the shown film; it is excluded from future spins. The button is disabled once the film is watched.
- Optional filters: release year from/to, genre, country code, max runtime. **Clear filters** empties them.

## Backend

- `GET /api/films/random` with the filters as query parameters. The backend does the picking and only draws unwatched films, so the choice does not depend on what the screen has loaded.
- `PATCH /api/films/:id` with `{ "watched": true }`.

## Filters

`filters.ts` checks the fields before a request, with the backend's limits: years 1888 to 2100 (and "to" not before "from"), runtime a whole number of at least 1, country two letters (sent upper case). Errors are shown under the field and no request is sent. The genre list is TMDB's fixed list (`genres.ts`), because the backend has no genre endpoint.

## States

| State | Shown |
|---|---|
| loading | "Picking a film…" (`aria-busy`) |
| a film | the film card |
| `404` without filters | "Nothing to spin", with links to import and add |
| `404` with filters | "No film fits these filters" |
| server unreachable or error | an alert with the message and **Try again** |

A visually hidden `role="status"` element announces what happened ("Picked X", "X is marked as watched…", "Picking a film…").

## Accessibility notes

- The result region is announced through the status text, not by making the whole card live, so screen readers say the title instead of the full card.
- `v-model` on a number input gives a number, not text; `filters.ts` accepts both (found by a test).
