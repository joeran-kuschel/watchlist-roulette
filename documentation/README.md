# Documentation

Every feature is documented here, split into UI and backend.

## Backend

- [Database](backend/database.md): tables, constraints, migrations
- [API](backend/api.md): endpoints, parameters, errors
- [CSV import](backend/csv-import.md): file format, dry-run preview, removal rules
- [TMDB enrichment](backend/tmdb-enrichment.md): matching, stored data, fixing matches
- [Docker Compose](backend/docker.md): running the app locally, configuration
- [Kubernetes](backend/kubernetes.md): running on Docker Desktop's Kubernetes next to the other apps
- [Testing](backend/testing.md): test layers and the real-PostgreSQL tests
- [Continuous integration](backend/ci.md): GitHub Actions, CodeQL and Dependabot

## UI

- [UI](ui/README.md): requirements for all UI
- [UI design](ui/design.md): mockups and design decisions
- [App shell](ui/app-shell.md): layout, routes, API module, shared components, styling
- [Logo and favicon](ui/branding.md): the film ring mark, favicon files, regenerating the icons
- [Roulette](ui/roulette.md): pick a random film, with filters
- [Watchlist](ui/watchlist.md): the list of films, search, sort, paging
- [Film details](ui/film-details.md): the page behind a film's title, with Letterboxd and TMDB links
- [Add and edit a film](ui/film-form.md): the film form and deleting
- [Screenshots](ui/screenshots.md): how the screenshots in these pages are made and credited
- [Choosing the TMDB match](ui/tmdb-match.md): fix a film's TMDB match by id
- [CSV import](ui/import.md): check, confirm, import
- [TMDB attribution](ui/tmdb-attribution.md): the required notice and logo
- [Posters](ui/posters.md): posters through the backend
- [Testing the UI](ui/testing.md)
