# Database

PostgreSQL 17. The schema is the numbered SQL files in `backend/migrations/`. Never edit a migration that has been applied; add a new file.

## `films`

| Column | Type | Notes |
|---|---|---|
| `id` | bigserial | primary key |
| `title` | text | required, not blank |
| `release_year` | smallint | 1888 to 2100, optional |
| `letterboxd_url` | text | unique, must start with `http://` or `https://`. Identifies a film in the CSV import |
| `added_at` | date | the "date added" from the CSV; defaults to today |
| `watched_at` | timestamptz | `NULL` = not watched. The random pick only draws films where it is `NULL` |
| `created_at`, `updated_at` | timestamptz | |
| `tmdb_id` | integer | unique together with `tmdb_media_type` |
| `tmdb_media_type` | text | `movie` (default) or `tv`. TMDB numbers movies and shows separately, so the same id can mean two different titles; one film per type and id (migration `003`) |
| `tmdb_status` | text | `pending`, `matched`, `ambiguous`, `not_found`, `error` |
| `tmdb_synced_at` | timestamptz | last TMDB attempt |
| `original_title`, `tagline`, `overview` | text | from TMDB |
| `runtime_minutes`, `vote_average`, `vote_count` | | from TMDB |
| `poster_path`, `backdrop_path` | text | TMDB image paths; the images are not stored |
| `countries` | text[] | ISO 3166-1 codes of the production countries |

## Related tables

- `genres` (`id` = TMDB genre id, `name`) and `film_genres` (film, genre)
- `people` (`id` = TMDB person id, `name`) and `film_credits` (film, person, `role` = `director` or `cast`, `position`)

Deleting a film deletes its genre and credit links.

## Applying migrations

Docker Compose mounts `backend/migrations/` into the Postgres image, which runs the files **once, on the first start with an empty volume**. For an existing database, run the new SQL file by hand, for example:

```bash
docker compose exec -T postgres psql -v ON_ERROR_STOP=1 --single-transaction -U watchlist -d watchlist < backend/migrations/003_tmdb_media_type.sql
```

Migration `003_tmdb_media_type.sql` (the `tmdb_media_type` column) is needed on every database that was created before it, before the version that uses it runs. See [Kubernetes](kubernetes.md) for the cluster's database.

**Order and rollback of 003.** Apply it *before* the new backend runs: the new code reads `tmdb_media_type`, so on a database without it a `PATCH` with a TMDB id answers `500`, the TMDB run stops (logged as "TMDB enrichment stopped") and the details page would link to a wrong address. Rolling the code back to the version before is safe for movies only: a show that was matched keeps its type `tv`, and the old code would look it up as a movie. Undoing the schema means removing the matched shows first, because the old unique key on `tmdb_id` alone cannot hold a movie and a show with the same number. The migration drops the old key by its default name `films_tmdb_id_key` and fails (and rolls back, with `--single-transaction`) if a hand-built database named it differently; fix the name in that case rather than skipping the step.

A remote database needs all migrations applied by hand.
