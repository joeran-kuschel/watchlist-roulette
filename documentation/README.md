# Documentation

Every feature is documented here, split into UI and backend.

## Backend

- [Database](backend/database.md): tables, constraints, migrations
- [API](backend/api.md): endpoints, parameters, errors
- [CSV import](backend/csv-import.md): file format, dry-run preview, removal rules
- [TMDB enrichment](backend/tmdb-enrichment.md): matching, stored data, fixing matches
- [Docker Compose](backend/docker.md): running the app locally, configuration
- [Testing](backend/testing.md): test layers and the real-PostgreSQL tests

## UI

- [UI](ui/README.md): requirements for all UI
- [UI design](ui/design.md): mockups and design decisions
- [App shell](ui/app-shell.md): layout, routes, API module, shared components, styling
- [Roulette](ui/roulette.md): pick a random film, with filters
- [Watchlist](ui/watchlist.md): the list of films, search, sort, paging
- [Add and edit a film](ui/film-form.md): the film form and deleting
- [Choosing the TMDB match](ui/tmdb-match.md): fix a film's TMDB match by id
- [CSV import](ui/import.md): check, confirm, import
- [TMDB attribution](ui/tmdb-attribution.md): the required notice and logo
- [Posters](ui/posters.md): posters through the backend
- [Testing the UI](ui/testing.md)
