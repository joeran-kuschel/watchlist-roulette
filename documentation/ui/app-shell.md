# App shell

The frame around every screen, and the building blocks the screens share. Code is in `frontend/src/`.

## Layout

`components/AppLayout.vue` renders, in order: a skip link, the header with the main navigation, `<main id="main">` with the current screen, and the TMDB footer ([TMDB attribution](tmdb-attribution.md)).

- The navigation is a `<nav aria-label="Main">`. The link of the current page has `aria-current="page"`. Pages inside a section (`/watchlist/new`, `/watchlist/3/edit`) highlight their section but are not marked as the current page.
- `<main>` has `tabindex="-1"` so the router can move focus to it.

## Routes

| Path | Screen | Title |
|---|---|---|
| `/` | [Roulette](roulette.md) | Roulette |
| `/watchlist` | [Watchlist](watchlist.md) | Watchlist |
| `/watchlist/new` | [Add / edit film](film-form.md) | Add film |
| `/watchlist/:id/edit` | [Add / edit film](film-form.md) | Edit film |
| `/watchlist/:id/match` | [TMDB match](tmdb-match.md) | Choose TMDB match |
| `/import` | [CSV import](import.md) | Import |
| anything else | not-found page | Page not found |

After every navigation (not on the first load) the router sets `document.title` to `<title> · Watchlist Roulette` and moves focus to `<main>`, so screen reader and keyboard users land at the top of the new content. Screens are loaded lazily.

## Talking to the backend

All requests go through `src/api.ts`; there is no other `fetch` call. Every failure throws an `ApiError` with `status` (`0` = server unreachable), `message`, `code` and the backend's validation `issues`. `describeError()` turns an error into a sentence for the user.

The browser calls `/api/...` on its own origin. In Docker Compose nginx forwards `/api` to the backend; the Vite dev server forwards it to `http://localhost:3000`. `API_PROXY_TARGET` overrides that target; it only affects `npm run dev` (add it to `.env.example` when this branch is merged with the Compose setup).

The backend only accepts writes from origins listed in `CORS_ORIGIN`. With `npm run dev` the origin is `http://localhost:5173`, so that address must be in `CORS_ORIGIN` (it is in `.env.example`) or every save from the dev server answers `403`.

## Shared components

| Component | Purpose |
|---|---|
| `IconButton` | Icon-only button or link. Needs a `label` (its accessible name, with the film's name where it helps); the tooltip shows on hover and keyboard focus and Esc dismisses it (WCAG 1.4.13). Renders a `RouterLink` when given `to`. |
| `FormField` | Label, hint and error message for one control, wired with `for`, `aria-describedby` and `aria-invalid`. The control is placed in the slot and gets the attributes through the slot prop `attrs`. |
| `ErrorAlert` | An error in a `role="alert"` element, with room for a retry button. |
| `AppIcon` | The icons, inline SVG, hidden from assistive technology. |
| `BackLink` | The "← Back to …" link at the top of the form and match pages (a plain link, not a landmark). |
| `PosterImage` | A film poster from the backend, with a placeholder. See [Posters](posters.md). |

## Styling

Plain CSS, no UI library. `src/styles/base.css` holds the design tokens (colors, fonts, sizes) as CSS variables and the shared classes (`.btn`, `.input`, `.card`, `.alert`, `.badge`, tables, `.sr-only`). Component-specific styles are scoped in the `.vue` file. See [UI design](design.md) for the look and the accessibility rules.

Buttons that submit a form keep their text (`.btn`); other actions are icon-only (`IconButton`).
