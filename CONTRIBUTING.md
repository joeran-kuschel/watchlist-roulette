# Contributing

Thanks for your interest. This is a personal project, so please open an issue to discuss a bigger change before you start on a pull request.

## Set up

Use Node 22.18+ or 24.12+. How to run the app, the dev servers and the tests is in the [README](README.md).

## Making a change

1. Branch off `main`; do not commit to `main` directly.
2. Keep the change small and focused. Match the style of the surrounding code and avoid unrelated refactoring.
3. Add tests for what you change. Run the tests that your change affects; the whole suite runs before a merge:
   ```sh
   cd backend  && npm test && npm run type-check
   cd frontend && npm run test:unit -- --run && npm run type-check && npm run lint
   ```
4. Document the change in `documentation/`, and add a line to `Unreleased` in [CHANGELOG.md](CHANGELOG.md), written for the app's user.
5. Open a pull request and describe what changed and why.

## Rules that matter

- **Database:** schema changes are new numbered files in `backend/migrations/`; never edit an existing one. After adding one, run `./k8s/generate-init-scripts.sh`. A test fails if the generated file is out of date.
- **Configuration:** settings come from environment variables. Add a new one to `.env.example`, `docker-compose.yml` and the docs.
- **Secrets:** never commit real credentials or tokens, and never put the TMDB token into tests. Tests must not leave data in a real database.
- **UI:** it has to be accessible (target WCAG 2.2 level AA) and is English only. New components get an `axe` check.
- **Deployment:** the app has to keep working with Docker Compose and on Kubernetes (`./k8s/deploy.sh`).

## License

By contributing you agree that your work is released under the [MIT License](LICENSE).
