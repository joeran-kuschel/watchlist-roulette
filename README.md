# Watchlist Roulette

Keep a movie watchlist in a PostgreSQL database and let the app pick a random film to watch next. Films come from a Letterboxd or IMDb watchlist export (CSV) and are enriched with data from [TMDB](https://www.themoviedb.org).

![The roulette page showing Big Buck Bunny as tonight's film, with the filters on the left.](documentation/ui/images/roulette.png)

This product uses the TMDB API but is not endorsed or certified by TMDB.

## Run it

Needs Docker Desktop.

```sh
cp .env.example .env        # optional; add your TMDB token here
docker compose up --build
```

- App: http://localhost:8080 (the API is behind it at `/api`; the backend itself is not published)

Import your watchlist with the API for now (the UI is still to be built):

```sh
curl -F file=@watchlist.csv 'http://localhost:8080/api/films/import?dryRun=true'   # preview
curl -F file=@watchlist.csv http://localhost:8080/api/films/import                 # apply
curl http://localhost:8080/api/films/random
```

See [documentation/](documentation/README.md) for the API, the CSV format, the TMDB setup and the configuration.

## Run it on Kubernetes (Docker Desktop)

Together with the other apps on the cluster, at http://watchlist.local:

```sh
./k8s/deploy.sh
```

One-time setup (hosts entries, backups, updates): [k8s/README.md](k8s/README.md).

## Develop

```sh
cd backend  && npm install && npm run dev      # API on :3000, needs a database (DATABASE_URL)
cd frontend && npm install && npm run dev      # Vite on :5173, forwards /api to :3000
# or run the backend and the database in Compose, with the backend published on 127.0.0.1:3000:
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build backend
```

Tests and checks:

```sh
cd backend  && npm test && npm run type-check
cd frontend && npm run test:unit -- --run && npm run type-check && npm run lint
```

## Layout

- `frontend/`: Vue 3, Vite, Pinia
- `backend/`: Express, `pg`, TypeScript; SQL migrations in `backend/migrations/`
- `documentation/`: feature documentation

## Contributing and security

See [CONTRIBUTING.md](CONTRIBUTING.md). Report security problems privately, as described in [SECURITY.md](SECURITY.md). The project is released under the [MIT License](LICENSE).
