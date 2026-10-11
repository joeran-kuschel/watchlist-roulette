# Film details

Route `/watchlist/:id`. A page about one film, with a few quick actions (no delete). Code: `views/FilmDetailsView.vue`, `tmdbTitleUrl()` in `tmdbId.ts`. The facts (year, runtime, rating, country) are built by `filmFacts()` in `format.ts` and shown by `components/FilmFacts.vue`; the [roulette](roulette.md) card uses the same two, in a compact inline layout, and this page in a grid with genres and director added.

## What the user does

- Opens it by clicking a film's title in the [watchlist](watchlist.md). The link opens in the same tab. **← Back to watchlist** returns to the list with the search, filters, sort and page the user left (see [Coming back from a film](watchlist.md#coming-back-from-a-film)); after a reload it leads to the plain list.
- Reads everything the app knows about the film.
- Uses the buttons next to the title, in this order:
  - **Mark as watched** / **Mark as unwatched** (the text follows the film's state). It sends the same `PATCH /api/films/:id` with `{ watched }` as the list's button. When it succeeds, the "Watched <date>" line and the button update and a visually hidden `role="status"` message says "<Title> is marked as watched." (or "unwatched."). A failure shows an alert (`role="alert"`) and leaves the film as it was. While the request runs the button is marked `aria-disabled` and clicks are ignored; it is deliberately not `disabled`, because a disabled button that has the keyboard focus loses it in Firefox and Safari.
  - **Choose TMDB match**, a link to the [match page](tmdb-match.md), only for a film whose TMDB status needs a fix (`ambiguous`, `not_found` or `error`, the rule `needsMatch()` in `format.ts`, shared with the watchlist row).
  - **Edit**, which opens the [film form](film-form.md).
- Deleting a film stays in the watchlist.

## What it shows

The poster (the [poster proxy](posters.md), or the "No poster" box), then:

- the title as the page heading, the original title when it differs, and the tagline,
- year, runtime, TMDB rating with the number of votes, countries, genres and director (for a TV show: "Episode runtime" and "Created by"),
- when the film was added and whether it was watched,
- the **Overview** and the **Cast** (the first ten names TMDB lists),
- a **Links** section with **Letterboxd** and **The Movie Database (TMDB)**.

Anything TMDB has not delivered yet (a pending, not found or ambiguous film) is left out instead of shown empty. The Letterboxd link only appears when the film has a web address, and the TMDB link only when the film has a TMDB id (`https://www.themoviedb.org/movie/<id>`, or `/tv/<id>` for a TV show, from the stored media type). A film with neither has no Links section. Both links open in a new tab, with `rel="noopener noreferrer"` and a hidden "(opens in a new tab)" in their names. The Letterboxd address is only rendered as a link when it starts with `http:` or `https:`.

## Backend

`GET /api/films/:id`, see [API](../backend/api.md). The poster comes from `GET /api/films/:id/poster`.

## States

| State | Shown |
|---|---|
| loading | "Loading film…" (`aria-busy`) |
| a film | the page |
| `404` | the heading "Film not found" and an alert with the message, no retry button |
| server unreachable or error | an alert with the message and **Try again** |

## Accessibility notes

- One `h1` (the title), `h2` for each section, each section labelled by its heading.
- **Mark as watched** and **Choose TMDB match** are named by their visible text. **Edit** has the accessible name "Edit <title>", which starts with its visible text (WCAG 2.5.3). The buttons wrap onto further lines on narrow screens (320 px).
- The page title is "Film details" like the other routes; focus moves on navigation as described in [App shell](app-shell.md).
