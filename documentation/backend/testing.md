# Testing

`cd backend && npm test` runs everything; `npx vitest run tests/<file> -t "name"` runs one test.

| Layer | Files | How |
|---|---|---|
| Models and SQL | `film.model`, `migrations` | real SQL against the migrations in pg-mem (`tests/helpers/testDb.ts`) |
| HTTP API | `films.api`, `import.api` | Express app through supertest, pg-mem database, fake TMDB enricher |
| Pure logic | `import.csv`, `import.plan`, `tmdb.match`, `validation` | no database |
| TMDB | `tmdb.client`, `tmdb.enricher` | fake `fetch` and fake client, pg-mem database |
| Real PostgreSQL | `postgres.integration` | skipped unless `TEST_DATABASE_URL` is set |
| Pool | `database` | idle-client errors are handled |
| Documentation | `docs-images` | every image in the Markdown files exists, has alt text, is used and is small; no database |

## What pg-mem does not cover

pg-mem has no `btrim()` (the helper registers a stand-in), no regex operator and no `LIKE ... ESCAPE`, and it does not roll back failed transactions reliably. The real-PostgreSQL tests cover the escaping of `%` and `_` in the title search, real array and date types, and the rollback of a failed import.

```bash
docker run --rm -d --name wr-test-pg -p 55432:5432 -e POSTGRES_PASSWORD=test postgres:17-alpine
TEST_DATABASE_URL=postgres://postgres:test@localhost:55432/postgres npm test
docker rm -f wr-test-pg
```

The integration tests **drop and recreate the `public` schema** of that database: only point them at a throwaway one.
