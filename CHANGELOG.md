# Changelog

## Unreleased

- Added the backend and database for the watchlist: add, edit, delete, search, sort and page through films, and mark them watched or unwatched.
- Added a random film pick that only draws unwatched films and can be limited by release year, genre, country and runtime.
- Added the CSV import for Letterboxd watchlist exports, with a preview that shows what would be added, changed and removed before anything is written. Watched films are never removed, and rows that can't be read are reported.
- Added enrichment from TMDB: poster, overview, tagline, runtime, rating, country, genres, director and cast, with a way to fix films that couldn't be matched.
- Added Docker Compose to run the app on Docker Desktop. The app and the API are only reachable from this computer, and the containers restart on their own.
- Writes to the API from web pages on other sites are refused.
