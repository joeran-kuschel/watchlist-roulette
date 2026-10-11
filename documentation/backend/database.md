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
| `tmdb_id` | integer | unique |
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
docker compose exec -T postgres psql -U watchlist -d watchlist < backend/migrations/003_example.sql
```

A remote database needs all migrations applied by hand.
