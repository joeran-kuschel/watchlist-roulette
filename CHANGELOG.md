# Changelog

All notable changes to Watchlist Roulette. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## Unreleased

### Added

- Roulette screen: pick a random unwatched film, narrow the pool by release year, genre, country and runtime, spin again, and mark the film as watched.
- Watchlist screen: browse all films, search by title, show all/unwatched/watched films, sort, and page through the list. Mark films watched or unwatched from the list.
- Add, edit and delete a film from the watchlist.
- Choose the right TMDB match for a film that TMDB could not match on its own, by pasting the movie's address.
- Import a Letterboxd CSV in two steps: check the file first, then confirm. You see which films will be added, updated and removed, and every rejected row with its reason.
- Posters are shown from your own server, so your browser never contacts TMDB.
- The TMDB notice (and a logo placeholder) at the bottom of every page.
- The whole app works with a keyboard and screen readers: skip link, labelled icon buttons with tooltips, announced results and errors.

### Known gaps

- The official TMDB logo still has to be added (see `documentation/ui/tmdb-attribution.md`).
- Posters need a backend route that does not exist yet (see `documentation/ui/posters.md`); until then films show a "No poster" box.
