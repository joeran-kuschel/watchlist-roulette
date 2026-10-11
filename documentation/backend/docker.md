# Running with Docker Compose

```bash
cp .env.example .env     # optional: only needed to change defaults or set the TMDB token
docker compose up --build
```

| Service | Address | Notes |
|---|---|---|
| frontend | http://localhost:8080 | nginx; forwards `/api` and `/health` to the backend |
| backend | http://localhost:3000 | Express API |
| postgres | not published | named volume `pgdata` |

Ports are bound to `127.0.0.1` because the API has no login. The containers restart automatically (`restart: unless-stopped`), and the backend closes the database pool cleanly on `docker compose down`.

```bash
docker compose down        # stops; the database volume stays
docker compose down -v     # also deletes the volume and all data
```

## Configuration

All settings are environment variables, listed in `.env.example`: `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `DATABASE_URL`, `DB_SSL`, `CORS_ORIGIN`, `TMDB_ACCESS_TOKEN`, `TMDB_LANGUAGE`. The credentials in the repo are local placeholders.

`DATABASE_URL` overrides the built-in Postgres connection, which makes a remote database possible (apply `backend/migrations/` by hand, see [Database](database.md)). `DB_SSL=true` turns SSL on for the connection.

## Development without Docker

Run the database with Compose (`docker compose up postgres`, then publish its port yourself if needed), `cd backend && npm run dev`, and `cd frontend && npm run dev`. The Vite dev server forwards `/api` to `http://localhost:3000`.

## Kubernetes

See [Kubernetes](kubernetes.md). The same images run there; the frontend image reads `BACKEND_URL` for where `/api` is forwarded to (Compose uses the default `http://backend:3000`).
