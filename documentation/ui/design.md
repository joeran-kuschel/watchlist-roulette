# UI design

Design reference for the three screens of Watchlist Roulette. It is the starting point for the Vue implementation; the implemented UI is documented in its own chapters as it is built.

The mockups are static HTML in [`design/`](design/). They are the exported files of the design canvas (`.dc.html`). They are not run by the app, and their `support.js` script is not included, so open them as reference or in the design canvas.

| Screen | Mockup | Route (planned) | Backend |
| --- | --- | --- | --- |
| Roulette | [`roulette.dc.html`](design/roulette.dc.html) | `/` | `GET /api/films/random`, `PATCH /api/films/:id` (watched) |
| Watchlist | [`watchlist.dc.html`](design/watchlist.dc.html) | `/watchlist` | `GET /api/films`, `PATCH /api/films/:id` |
| Import | [`import.dc.html`](design/import.dc.html) | `/import` | `POST /api/films/import` (with and without `?dryRun=true`) |
| Add / edit film | [`film-form.dc.html`](design/film-form.dc.html) | `/watchlist/new`, `/watchlist/:id/edit` | `POST /api/films`, `PATCH /api/films/:id` |
| Choose TMDB match | [`match-picker.dc.html`](design/match-picker.dc.html) | `/watchlist/:id/match` | `PATCH /api/films/:id` with `tmdbId` |
| Empty, loading, error states | [`states.dc.html`](design/states.dc.html) | (parts of the screens above) | none |

The endpoints are those of the backend API (`documentation/backend/api.md` on the backend branch). The implemented screens are described in their own chapters, listed in the [documentation index](../README.md).

## Screens

### Roulette

- Optional filters that match the random query: release year from/to, genre, country (two letters), max runtime.
- Result card: poster, title, year, runtime, rating, country, director, genres, overview, date added, Letterboxd link.
- Actions: **Spin again**, **Mark as watched** (watched films are excluded from later spins).
- The result sits in a `role="status"` region so a new pick is announced.

### Watchlist

- Search by title, filter (all / unwatched / watched), sort (date added, release year, title), pagination.
- Table with real headers; per-row action to mark watched or unwatched.
- Films without a clean TMDB match show a status (`ambiguous`, `not_found`) with a follow-up action.
- "Add film" and the per-row "Edit" and "Choose match" actions are links to the pages below.

### Add / edit film

- A page, not a dialog: no focus trap to build, and the browser back button works.
- Fields: title (required), release year, Letterboxd link, date added; limits come from `filmCreateSchema` in `backend/src/validation.ts`.
- On submit errors the form shows an error summary (`role="alert"`) with links to the fields; each invalid field has `aria-invalid` and its message linked through `aria-describedby`.

### Choose TMDB match

- For films whose `tmdb.status` is `ambiguous`, `not_found` or `error`.
- The backend cannot list TMDB candidates, so the screen explains the problem, links to a TMDB search for the title, and takes the movie's address or number (see [TMDB match](tmdb-match.md)). A first design with a candidate list needs a backend search endpoint.

### States

- Empty watchlist, no film fits the filters, everything watched, no search results, loading (`aria-busy` plus a status message), and server unreachable (`role="alert"` with a "Try again" button).

### Import

- Two steps like the backend: **Check file** (nothing changes) shows added, updated, unchanged and removed films plus rejected rows; **Import films** applies it, after the user confirms the removals.
- Rejected rows are listed with line number and reason. Rows are never skipped silently.

## Look

- Dark ground `#12141A`, surface `#1C1F27`, border `#3A3F4B`, text `#F2EFE8`, muted text `#B4B8C2`.
- Accent `#FF6B47` (buttons use dark text `#12141A`), focus ring `#FFD166`.
- Fonts: Bricolage Grotesque (headings), Hanken Grotesk (body).

## Accessibility (WCAG 2.2 AA)

- Skip link, landmarks (`header`, `nav`, `main`), `aria-current="page"` in the navigation.
- Every field has a visible label; hints are linked with `aria-describedby`.
- Interactive targets are at least 44 px; focus is clearly visible.
- Action buttons are icon-only (spin, mark watched/unwatched, edit, choose match, add film, clear filters, previous/next page). Each has an `aria-label` with the full action (including the film name in table rows), an `aria-hidden` icon and a tooltip shown on hover and keyboard focus. Buttons that submit a form (Save film, Import films, Use selected match, Search TMDB) keep their text, because an icon alone is too ambiguous there.
- Implementation: the tooltip must be dismissible with Esc and stay visible while hovered (WCAG 1.4.13), and the visible tooltip text must match the start of the accessible name (WCAG 2.5.3), for example the tooltip "Edit film" and the name "Edit film: Perfect Days". Use one shared `IconButton` component for this; the details are in [App shell](app-shell.md#tooltips-of-iconbutton).
- Status is never conveyed by color alone.
- Colors were chosen for AA contrast but **not yet measured in a browser**; do that during implementation (axe in jsdom cannot check contrast).

## TMDB attribution

TMDB's terms require the TMDB logo and this notice wherever TMDB data is shown:

> This product uses the TMDB API but is not endorsed or certified by TMDB.

- Every screen has a footer with the logo and the notice (one footer component in Vue).
- The mockups (`design/*.dc.html`) show a labelled placeholder for the logo and are intentionally left as they are; they are drawings, not the app. The implementation uses the **official** logo from <https://www.themoviedb.org/about/logos-attribution>, unmodified and smaller than the app's own logo (see [TMDB attribution](tmdb-attribution.md)).

## Posters

Poster images are not loaded from TMDB by the browser. The backend proxies them, so the browser only talks to this app. The proxy endpoint and caching are decided in the backend chapter.

## Known gaps

- Posters are placeholders; real images come from the poster proxy.
- The header and footer are repeated in each mockup; in Vue they become one layout component.
- Deleting a film (a confirmation on the edit page) is built but not drawn in the mockups.
