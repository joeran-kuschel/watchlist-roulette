# Continuous integration

GitHub Actions checks every pull request and every push to `main`. The workflows are in `.github/workflows/`.

## CI (`ci.yml`)

| Job | What it runs |
|---|---|
| Backend (Node 22 and 24) | `npm ci`, type-check, `npm test`, build. A throwaway PostgreSQL 17 service is started and passed as `TEST_DATABASE_URL`, so the real-PostgreSQL tests run instead of being skipped. |
| Frontend (Node 22 and 24) | `npm ci`, type-check, `oxlint` and `eslint` (check only, without `--fix`), unit tests, build |
| Docker images | builds the backend and frontend images and validates `docker-compose.yml` |

The end-to-end tests (Playwright) are not part of CI: they need the full Compose stack. Run them locally (see [Testing the UI](../ui/testing.md)).

The workflow runs without secrets. Never put the TMDB token or other real credentials into a workflow; the tests use a fake TMDB client.

## CodeQL (`codeql.yml`)

Static analysis of the TypeScript code on every pull request, every push to `main` and weekly. GitHub offers code scanning for free on public repositories only, so the job is skipped while the repository is private.

## Dependabot (`dependabot.yml`)

Weekly update pull requests for the npm packages (backend and frontend), the Docker base images and the GitHub Actions used by the workflows.

## Requiring the checks

After the first run, add the CI jobs as required status checks in the branch protection rule of `main` (Settings → Branches), so a pull request can only be merged when they pass.
