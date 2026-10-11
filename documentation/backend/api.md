# API

JSON over HTTP, under `/api`. There is no login: the API is only reachable from the local machine in the Compose setup.

Errors have the form `{ "error": "message" }`; validation errors (`400`) add `issues: [{ path, message }]`. Unexpected errors answer `500` without details.

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | `{ "status": "ok" }` if the database answers |
| GET | `/api/films` | List films |
| POST | `/api/films` | Add a film |
| GET | `/api/films/:id` | One film |
| PATCH | `/api/films/:id` | Edit a film, mark it watched or unwatched, set its TMDB id |
| DELETE | `/api/films/:id` | Delete a film (`204`) |
| GET | `/api/films/random` | Pick a random unwatched film |
| GET | `/api/films/:id/poster` | The film's poster image, see [TMDB enrichment](tmdb-enrichment.md#posters) |
| POST | `/api/films/import` | Import a CSV, see [CSV import](csv-import.md) |
| POST | `/api/tmdb/sync` | Start a TMDB run that also retries films in `error` (`202`; `503` without a TMDB token) |

## A film

```json
{
  "id": 1, "title": "Joy", "releaseYear": 2015, "letterboxdUrl": "https://boxd.it/8kEU",
  "addedAt": "2020-01-12", "watchedAt": null,
  "tmdb": { "id": 262543, "status": "matched", "syncedAt": "2026-10-11T12:00:00.000Z" },
  "originalTitle": "Joy", "tagline": "…", "overview": "…", "runtimeMinutes": 124,
  "voteAverage": 6.6, "voteCount": 4000, "posterPath": "/p.jpg", "backdropPath": "/b.jpg",
  "countries": ["US"], "genres": [{ "id": 18, "name": "Drama" }],
  "directors": [{ "id": 9, "name": "…" }], "cast": [{ "id": 1, "name": "…" }]
}
```

## `GET /api/films`

Query parameters, all optional: `q` (title contains, case-insensitive), `watched` (`true`, `false`, `all`; default `all`), `genre` (TMDB genre id), `tmdbStatus`, `sort` (`added_at`, `release_year`, `title`; default `added_at`), `order` (`asc`, `desc`; default `desc`), `page` (default 1), `pageSize` (default 50, max 200). Films without a value sort last.

Answer: `{ items, total, page, pageSize }`.

## `POST /api/films`

Body: `title` (required), `releaseYear`, `letterboxdUrl` (http/https), `addedAt` (`YYYY-MM-DD`). Unknown fields are rejected. Answers `201`; `409` if the link exists.

## `PATCH /api/films/:id`

Any of: `title`, `releaseYear` (or `null`), `letterboxdUrl` (or `null`), `addedAt`, `watched` (`true` sets `watchedAt` unless already set, `false` clears it), `tmdbId`. At least one field is required.

Setting `tmdbId` puts the film back to `pending` and starts a TMDB run that loads this id's data. `409` if another film already has that id.

## `GET /api/films/random`

Query parameters, all optional: `yearFrom`, `yearTo`, `genre`, `country` (ISO code, e.g. `US`), `maxRuntime` (minutes). Only unwatched films are drawn; films without the filtered data (for example no runtime yet) are left out when that filter is set. Answers `404` with a message when nothing matches.

## Limits and protection

JSON bodies up to 100 kB (`413` above); CSV uploads up to 5 MB and 20,000 rows (`413` above). CORS: only the origins in `CORS_ORIGIN` may call the API from a browser.

A web page on another site can submit a form to `localhost` without any CORS check, so every write (POST, PATCH, DELETE) that carries an `Origin` header must come from an origin in `CORS_ORIGIN`; otherwise the answer is `403` and nothing changes. Requests without an `Origin` header (curl, scripts) are not affected. Reads are not restricted.
