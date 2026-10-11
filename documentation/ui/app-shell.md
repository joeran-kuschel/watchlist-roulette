# App shell

The frame around every screen, and the building blocks the screens share. Code is in `frontend/src/`.

## Layout

`components/AppLayout.vue` renders, in order: a skip link, the header with the main navigation, `<main id="main">` with the current screen, and the TMDB footer ([TMDB attribution](tmdb-attribution.md)).

- The navigation is a `<nav aria-label="Main">`. The link of the current page has `aria-current="page"`. Pages inside a section (`/watchlist/new`, `/watchlist/3`, `/watchlist/3/edit`) highlight their section but are not marked as the current page.
- `<main>` has `tabindex="-1"` so the router can move focus to it.

## Routes

| Path | Screen | Title |
|---|---|---|
| `/` | [Roulette](roulette.md) | Roulette |
| `/watchlist` | [Watchlist](watchlist.md) | Watchlist |
| `/watchlist/:id` | [Film details](film-details.md) | Film details |
| `/watchlist/new` | [Add / edit film](film-form.md) | Add film |
| `/watchlist/:id/edit` | [Add / edit film](film-form.md) | Edit film |
| `/watchlist/:id/match` | [TMDB match](tmdb-match.md) | Choose TMDB match |
| `/import` | [CSV import](import.md) | Import |
| anything else | not-found page | Page not found |

After every navigation (not on the first load) the router sets `document.title` to `<title> · Watchlist Roulette` and moves focus to `<main>`, so screen reader and keyboard users land at the top of the new content. Screens are loaded lazily.

## Talking to the backend

All requests go through `src/api.ts`; there is no other `fetch` call. Every failure throws an `ApiError` with `status` (`0` = server unreachable), `message`, `code` and the backend's validation `issues`. `describeError()` turns an error into a sentence for the user.

The browser calls `/api/...` on its own origin. In Docker Compose nginx forwards `/api` to the backend; the Vite dev server forwards it to `http://localhost:3000`. `API_PROXY_TARGET` overrides that target; it only affects `npm run dev` and is listed (commented) in `.env.example`; Compose does not use it.

The backend only accepts writes from origins listed in `CORS_ORIGIN`. With `npm run dev` the origin is `http://localhost:5173`, so that address must be in `CORS_ORIGIN` (it is in `.env.example`) or every save from the dev server answers `403`.

## Shared components

| Component | Purpose |
|---|---|
| `IconButton` | Icon-only button or link. Needs a `label` (its accessible name, with the film's name where it helps); the tooltip shows on hover and keyboard focus. Renders a `RouterLink` when given `to`. See "Tooltips" below. |
| `FormField` | Label, hint and error message for one control, wired with `for`, `aria-describedby` and `aria-invalid`. The control is placed in the slot and gets the attributes through the slot prop `attrs`. |
| `ErrorAlert` | An error in a `role="alert"` element, with room for a retry button. |
| `AppIcon` | The icons, inline SVG, hidden from assistive technology. |
| `BrandMark` | The logo in the header, see [Logo and favicon](branding.md). |
| `BackLink` | The "← Back to …" link at the top of the form and match pages (a plain link, not a landmark). |
| `PosterImage` | A film poster from the backend, with a placeholder. See [Posters](posters.md). |

## Styling

Plain CSS, no UI library. `src/styles/base.css` holds the design tokens (colors, fonts, sizes) as CSS variables and the shared classes (`.btn`, `.input`, `.card`, `.alert`, `.badge`, tables, `.sr-only`). Component-specific styles are scoped in the `.vue` file. See [UI design](design.md) for the look and the accessibility rules.

Buttons that submit a form keep their text (`.btn`); other actions are icon-only (`IconButton`).

## Tooltips of `IconButton`

The tooltip is the visible text of an icon-only button. It follows WCAG 1.4.13 (content on hover or focus) and 2.5.3 (label in name):

- It shows on hover and on keyboard focus. Touch screens have no hover, so touch users do not see it; the accessible name still reads out.
- **Dismissible:** Esc hides it, without moving the focus or the pointer. This works when the button has focus and also when only the pointer is on it (while hovered, the key is listened for on the window; the listener is removed when the pointer leaves or the button goes away). It comes back on the next hover or focus.
- **Hoverable:** the tooltip is a child of the button, so the pointer can move onto it and the button stays hovered. A small transparent bridge covers the gap between the two. The tooltip only takes the pointer while it is shown, so its invisible box never catches clicks. A click on the tooltip does nothing.
- **Disabled buttons show no tooltip.** Browsers differ on whether a disabled button fires pointer events, so Esc could not dismiss its tooltip reliably. The name is still read.
- **It can cover the control above it** while it is shown, because it takes the pointer. Esc (or moving away) closes it. On narrow screens the table's last column may clip it; the phone layout of the watchlist is tracked in #11.
- **Label in name:** when `tooltip` differs from `label`, the label must contain the tooltip text. The row buttons of the watchlist are named "Mark as watched: *Title*", "Mark as unwatched: *Title*", "Choose TMDB match: *Title*" and "Edit film: *Title*", with the tooltip showing the part before the colon. A test checks this for every icon button in the table.
