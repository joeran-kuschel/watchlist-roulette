# Continuous integration

GitHub Actions checks every pull request and every push to `main`. The workflows are in `.github/workflows/`.

## CI (`ci.yml`)

| Job | What it runs |
|---|---|
| Backend (Node 26) | `npm ci`, type-check, `oxlint` and the Prettier check (check only, without `--fix` or `--write`), `npm test`, build. A throwaway PostgreSQL 17 service is started and passed as `TEST_DATABASE_URL`, so the real-PostgreSQL tests run instead of being skipped. |
| Frontend (Node 26) | `npm ci`, type-check, `oxlint`, `eslint` and the Prettier check (check only, without `--fix` or `--write`), unit tests, build |
| Docker images | builds the backend and frontend images and validates `docker-compose.yml` on its own and merged with `docker-compose.dev.yml` |

## Formatting and linting

- **Prettier** (one `.prettierrc.json` in the repo root: no semicolons, single quotes, 100 columns) formats the code of both packages: `ts`, `mts`, `js` and `mjs` files in the backend, and also `vue` and `css` files in the frontend (the globs are in the `format` scripts). `npm run format` writes the changes, `npm run format:check` is what CI runs. Markdown, JSON and YAML are not checked.
- **oxlint** runs in both packages (`.oxlintrc.json` in each, rule category `correctness` as error). `npm run lint` fixes what it can; CI runs `npx oxlint .` without `--fix`.
- **ESLint** (with the Vue, Playwright and Vitest plugins) runs in the frontend only. The backend has no ESLint: `typescript-eslint` does not support TypeScript 7 yet (its peer range ends below 6.1), and the backend uses TypeScript 7. Add it when it does.
- The check steps are inside the existing CI jobs, so the job names and the required status checks of `main` are unchanged.
- The commit that formatted all existing code is listed in `.git-blame-ignore-revs`, so `git blame` skips it. GitHub honors the file; locally run `git config blame.ignoreRevsFile .git-blame-ignore-revs` once.

The Node version is set in `.nvmrc`, in `engines` of both `package.json` files (and lock files), in both Dockerfiles and in `ci.yml`. `backend/tests/node-version.test.ts` fails when they differ, so a Node upgrade changes all of them together.

The end-to-end tests (Playwright) are not part of CI. They stub the API in the browser, so they need no database, only the Vite dev server. Run them locally (see [Testing the UI](../ui/testing.md)).

The workflow runs without secrets. Never put the TMDB token or other real credentials into a workflow; the tests use a fake TMDB client.

## CodeQL (`codeql.yml`)

Static analysis of the TypeScript code on every pull request, every push to `main` and weekly. GitHub offers code scanning for free on public repositories only, so the job is skipped while the repository is private.

## Dependabot (`dependabot.yml`)

Weekly update pull requests for the npm packages (backend and frontend), the Docker base images and the GitHub Actions used by the workflows.

## Requiring the checks

After the first run, add the CI jobs as required status checks in the branch protection rule of `main` (Settings → Branches), so a pull request can only be merged when they pass.
