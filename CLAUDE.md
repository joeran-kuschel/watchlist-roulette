# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Watchlist Roulette: keep a movie watchlist in a database and let the app pick a random film to watch next. Films are imported from a CSV (name, date added, Letterboxd link, release year).

## Rules

- Plan first, ask before changing code
- Don't refactor without permission
- Data has to be persistently stored in PostgreSQL
- Tool should run in Docker Desktop (Docker Compose) now, with the option to run on Kubernetes later. Keep config in environment variables so both work
- Add test cases for everything we implement
- The UI has to be accessible and adhere to W3C and WAI standards (target: WCAG 2.2 level AA)
- Be lean in the code: avoid duplicated code and tight coupling
- Documentation is key: document every feature in Markdown files in `documentation/`, in dedicated chapters, split into UI (`documentation/ui/`) and Backend (`documentation/backend/`)
- During development, only run new tests and the tests affected by the changed code, not the entire test suite (see "Single test file / test name" under Commands)
- Do not commit and push without being asked
- Before every push, run the entire test suite (backend and frontend); push only when it passes
- Every feature, fix or removal adds an entry to `Unreleased` in `CHANGELOG.md` in the same branch, written for the app's user; the `code-reviewer` checks it
- Once an implemented GitHub issue is pushed to `main`, close it on GitHub with a comment linking the commit that implemented it, e.g. `gh issue close <number> --comment "Implemented in https://github.com/joeran-kuschel/watchlist-roulette/commit/<sha>"`
- Tests and sample data never stay in the real database. Tests use pg-mem; if a browser review, a manual check or a seed put films or other rows into the real database, remove them right after, before reporting it as done. Look at what you delete first (title, creation time) and never touch the user's own data. The user's CSV import is their data, not sample data
- A test that documents a known bug (one the user decided to fix later) is marked `it.fails` with a `// BUG:` comment until the bug is fixed
- Every code change (fix, new feature, refactoring) goes into its own branch, which is merged back into `main` once finished. Never commit code changes to `main` directly
- Every new feature is shown in the browser before the merge process starts: check out the branch, start the dev server with `preview_start`, and let the user look at it. Change requests from that review are done on the branch first; the merge process below starts only after the user approves
- Before every merge, run the `test-engineer` agent (`.claude/agents/test-engineer.md`) on everything the merge brings in. It writes the missing tests and reports coverage gaps and bugs. Every bug it finds is fixed on the branch before the `code-reviewer` runs; a known bug never goes into `main`. Also use it after implementing a feature or fix outside the merge process
- Before every merge, run the `code-reviewer` agent (`.claude/agents/code-reviewer.md`) one time, after the `test-engineer` has finished and the bugs it found are fixed, on everything the merge brings in, including the tests the `test-engineer` added and the bug fixes. Fix its findings or discuss them before merging. These fixes go straight to the final full test run; neither agent runs again
- Run the entire test suite (backend and frontend), plus `npm run type-check` and `npm run lint` in `frontend/`, before every merge, as the last step after all fixes. If it fails, fix the cause and run it again; neither agent runs again on these fixes. Merge only when it passes

## Current decisions

- Run locally with Docker Compose on Docker Desktop. Kubernetes manifests (`k8s/`) come later; do not add them before it is asked for.
- The watchlist lives in a PostgreSQL container with a named volume. A remote database must stay possible through `DATABASE_URL`.
- Films are imported from a user-provided CSV with the columns: movie name, date added, Letterboxd link, release year. The exact header names and date format are confirmed when the file arrives; the import must report rows it rejects instead of skipping them silently.
- User-facing docs (README.md) are written in English. Feature documentation in `documentation/` is English too.
- The UI is English only for now. No translation tooling until the user asks for it.

## Stack

- **Frontend** (`frontend/`): Vue 3 (`<script setup>`, TypeScript), Vite, Pinia, Vue Router. Tests: Vitest + Vue Test Utils, Playwright for e2e. Lint: oxlint + ESLint, format: Prettier
- **Backend** (`backend/`, not created yet): Node.js 24, Express, `pg`, TypeScript. Structure: `src/routes`, `src/controllers`, `src/models`, `src/config`. Tests: Vitest, with pg-mem for SQL
- **Database**: PostgreSQL. Schema in `backend/migrations/*.sql`
- **Deployment**: `docker-compose.yml` (frontend served by nginx, backend, postgres). Kubernetes later

Feature details, endpoints and known gaps are documented per feature in `documentation/` (index: `documentation/README.md`).

## Architecture

- **Backend:** `routes → controllers → models`. Models query the shared `pg` pool from `config/database.js` directly (parameterized queries only). Business rules live in the controllers.
- **Frontend:** API calls go through one module (`src/api.ts`) that throws a typed error with the HTTP status (`0` = server unreachable); stores (Pinia) and components use it, with no raw `fetch` elsewhere. Errors are shown in an element with `role="alert"`.
- **Random pick:** done by the backend (`GET /api/films/random`) so the choice is testable and does not depend on what the client has loaded. Watched films are excluded.
- **CSV import:** parsing and validation are a separate backend module from the controller, so they can be tested without HTTP or a database.

## Commands

Use Node 22.18+ or 24.12+ (see `engines` in `frontend/package.json`).

```bash
# Frontend (run in frontend/)
cd frontend
npm run dev
npm run build            # type-check + build
npm run type-check
npm run lint
npm run test:unit        # watch mode; add -- --run for a single run
npm run test:e2e

# Single test file / test name
cd frontend && npx vitest run src/components/__tests__/Foo.spec.ts -t "name of the test"
cd backend && npx vitest run tests/film.model.test.ts -t "name of the test"

# Run everything in Docker Desktop
docker compose up --build
docker compose down        # keeps the database volume
docker compose down -v     # deletes the database volume (and all data)
```

## Configuration

- Configuration comes from environment variables (`DATABASE_URL`, `DB_SSL`, `CORS_ORIGIN`, …), documented in `.env.example` and passed by `docker-compose.yml`. Add every new setting to both and to the docs.
- `DB_SSL` (`"true"`/`"false"`) turns SSL on for the database connection, independent of `NODE_ENV`.
- Credentials in the repo are local placeholders only. Real secrets never go into git.

## Migrations

- Schema changes are new numbered files in `backend/migrations/`; never edit an applied migration.
- Postgres runs init scripts only on first start with an empty volume. An existing volume needs the SQL applied by hand (or a migration runner, once we add one — ask first).
- A remote database needs the schema applied by hand.

## Testing

- Backend model tests run real SQL against the migrations in pg-mem; controller tests mock the model and use a fake `res`.
- Frontend unit tests sit next to the code in `__tests__/` folders (the create-vue layout) and use Vitest + Vue Test Utils. Add an `axe` accessibility check for every new component.
- axe runs in jsdom, where color contrast can't be checked. Check contrast in a real browser.
- e2e tests live in `frontend/e2e/` (Playwright) and need the Compose stack or a dev server with a test database, never the user's real data.
