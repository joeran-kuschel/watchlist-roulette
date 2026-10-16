# TMDB enrichment

Films are enriched with data from [The Movie Database](https://www.themoviedb.org): poster and backdrop paths, tagline, overview, runtime, rating, production countries, genres, director and the first ten cast members.

## Setup

Create an **API Read Access Token** in your TMDB account (Settings, API) and put it into `.env` as `TMDB_ACCESS_TOKEN`. It is sent as a bearer header, never in a URL. `TMDB_LANGUAGE` (default `en-US`) sets the language of the texts. Without a token, films stay `pending` and nothing is fetched.

## How it works

1. New films (import or `POST /api/films`) start as `pending`.
2. A background run handles the pending films one at a time, with a short pause between them. It starts after an import, after setting a TMDB id, when the backend starts, and through `POST /api/tmdb/sync`. Only one run happens at a time; a request that arrives during a run (a new import, a fixed match) is answered with one more run right after it, so no film is missed.
3. For a film without `tmdb_id`, it searches TMDB by title and picks a result:
   - the title (or original title) equals the film's, ignoring case and punctuation, and
   - the year is the film's year or one year off (festival premieres differ). An exact year beats a near one.
   - Exactly one candidate: **matched**. None: **not_found**. More than one: **ambiguous**.
4. For a match, it loads the movie with its credits and stores everything, replacing genres and credits.

## Status

| `tmdb.status` | Meaning |
|---|---|
| `pending` | not looked up yet |
| `matched` | data stored |
| `ambiguous` | several candidates, or the match already belongs to another film |
| `not_found` | no candidate, or TMDB does not know the id |
| `error` | the lookup failed in an unexpected way (for example a reply that can't be stored); `POST /api/tmdb/sync` retries these |

Trouble at TMDB itself (unreachable, rate limit `429`, `5xx`) leaves the film `pending`, and the run stops after three such failures in a row; the next import, restart or sync tries again. A rejected token (`401`) stops the run at once. A TMDB outage never fails an import.

## Fixing a match

List the films to fix with `GET /api/films?tmdbStatus=ambiguous` (or `not_found`). Find the id in the TMDB URL (`themoviedb.org/movie/<id>`) and send `PATCH /api/films/:id` with `{ "tmdbId": <id> }`. The film loads that movie's data. For a TV show use `themoviedb.org/tv/<id>` and add `"tmdbMediaType": "tv"` (see below).

## TV shows

TMDB treats a TV show as a different kind of title with its own numbers. A show is only matched by hand: send `{ "tmdbId": <id>, "tmdbMediaType": "tv" }` with the id from `themoviedb.org/tv/<id>`. The automatic title search only looks for movies, because a film title could match the wrong show. The media type is stored with the film (`tmdb.mediaType` in the API), and a run loads a film of type `tv` from `/tv/<id>` (`tmdb/client.ts`).

`tmdb/tv.ts` maps a show onto the movie shape the model stores, so the tables are the same:

| Show | Stored as |
|---|---|
| `name`, `original_name` | title data, original title |
| first of `episode_run_time` | `runtime_minutes` (the length of an episode; none if TMDB lists none) |
| `origin_country` | `countries` |
| `created_by` | the director role (shown as "Created by" in the UI) |
| genres, cast, poster, overview, rating | the same as for a movie |

## Posters

`GET /api/films/:id/poster` loads the film's poster from `https://image.tmdb.org/t/p/w500<poster_path>` and sends it back with its content type and `Cache-Control: public, max-age=3600` and `X-Content-Type-Options: nosniff`, so the browser never contacts TMDB. Code: `tmdb/poster.ts` (fetcher), `poster` in `controllers/films.ts`.

- Image requests need no token, so none is sent.
- The stored path must look like `/name.jpg` or `/name.png`; anything else is never requested.
- `404` for an unknown film, a film without a poster, or an image TMDB does not have. `502` when TMDB fails or sends something that is not a JPEG or PNG (the UI then shows its "No poster" box).
- Images larger than 2 MB are refused (`502`); the image is held in memory while it is sent.
- Nothing is cached on the server; the browser cache is enough for a single-user app. The URL is keyed by film id, so after a re-match the browser may show the old poster for up to an hour.

## Attribution

TMDB's terms require the notice "This product uses the TMDB API but is not endorsed or certified by TMDB." with their logo in the UI. It must be added when the UI shows TMDB data.

## Looking up one film

`POST /api/films/:id/tmdb-lookup` looks a single film up now and waits for the result, so the answer is the film with its new TMDB status. It is for a film that was added by hand (it stays `pending` until the next run), or that failed or was not found.

- It works for any film, whatever its status. A film that already has a TMDB id (for example one fixed with [Choose match](../ui/tmdb-match.md)) keeps it: the data is fetched again for that id. A film without one is searched by title, like in a run.
- A look-up never runs at the same time as a film of a run: a pass holds the lock for one film at a time, so a look-up goes next after the film that is being processed and does not wait for the whole pass (a long import must not make the button time out).
- `404` for an unknown film, `503` without `TMDB_ACCESS_TOKEN`. If TMDB is unreachable (network, `429`, `5xx`) or rejects the token (`401`), the answer is `502` with a sentence for the user and the film is left unchanged. Any other failure sets the film to `error` and is answered with `200`. The `503` and `502` bodies carry `"code": "tmdb_unavailable"`, so the UI knows the message is meant for the user.

## Checking again

`POST /api/tmdb/sync` starts a run that retries films in `error`. With the body `{ "includeUnmatched": true }` it also searches films again that ended as `not_found` or `ambiguous`, for example after TMDB has added a title.

- **Films matched by hand are never searched again.** A film that has a TMDB id (set with [Choose match](../ui/tmdb-match.md)) is not selected by `includeUnmatched`, so a re-search by title cannot undo the choice. Films that are already `matched` are never selected either. To look up such a film again use [the single look-up](#looking-up-one-film).
- A request that arrives while a run is going is answered with one more run, which has the retries of every request that asked for it.
- `GET /api/tmdb/sync` shows how far the run is. `running` is true while a run or the queued follow-up is going; `total` and `done` count the films of the current run (they start again when a follow-up run starts). `lastRun` is kept in memory only (gone after a restart) and has `matched`, `notFound`, `ambiguous` (needs review), `error`, `unreachable`, `stopped` (`token` if TMDB rejected the access token, `tmdb` after three failures in a row, otherwise `null`) and `finishedAt`, which changes with every run so a caller can tell a new summary from the old one. A film that could not be looked up because of a single TMDB failure stays as it was and is counted as `unreachable`.
- Films a run does not reach (after `stopped`) keep their status.
