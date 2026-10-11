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

List the films to fix with `GET /api/films?tmdbStatus=ambiguous` (or `not_found`). Find the id in the TMDB URL (`themoviedb.org/movie/<id>`) and send `PATCH /api/films/:id` with `{ "tmdbId": <id> }`. The film loads that movie's data.

## Attribution

TMDB's terms require the notice "This product uses the TMDB API but is not endorsed or certified by TMDB." with their logo in the UI. It must be added when the UI shows TMDB data.
