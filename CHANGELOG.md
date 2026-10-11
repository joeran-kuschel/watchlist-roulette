# Changelog

All notable changes to Watchlist Roulette. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## Unreleased

- Added the backend and database for the watchlist: add, edit, delete, search, sort and page through films, and mark them watched or unwatched.
- Added a random film pick that only draws unwatched films and can be limited by release year, genre, country and runtime.
- Added the CSV import for Letterboxd watchlist exports, with a preview that shows what would be added, changed and removed before anything is written. Watched films are never removed, and rows that can't be read are reported.
- Added enrichment from TMDB: poster, overview, tagline, runtime, rating, country, genres, director and cast, with a way to fix films that couldn't be matched.
- Added Docker Compose to run the app on Docker Desktop. The app and the API are only reachable from this computer, and the containers restart on their own.
- Writes to the API from web pages on other sites are refused.
- Added a Kubernetes setup for Docker Desktop: one command deploys the app at http://watchlist.local next to the other apps, with backup and restore scripts and an optional hourly backup job.
- Added the roulette screen: pick a random unwatched film, narrow the pool by release year, genre, country and runtime, spin again, and mark the film as watched.
- Added the watchlist screen: browse all films, search by title, show all, unwatched or watched films, sort, and page through the list. Films can be marked watched or unwatched from the list.
- Added adding, editing and deleting a film from the watchlist.
- Added choosing the right TMDB match for a film that TMDB could not match on its own, by pasting the movie's address.
- Added the CSV import screen in two steps: check the file first, then confirm. It shows which films will be added, updated and removed, and every rejected row with its reason.
- Added the TMDB notice and a logo placeholder at the bottom of every page. The official TMDB logo still has to be added (see `documentation/ui/tmdb-attribution.md`).
- Posters now show. They are loaded through your own server, so your browser never contacts TMDB. Films without a poster still show a "No poster" box.
- The whole app works with a keyboard and screen readers: skip link, labelled icon buttons with tooltips, announced results and errors.
- Added a TMDB status filter to the watchlist, so you can find films that still need a match (Needs review, Not found, Lookup failed) or are still pending. It works together with search and the watched filter, and the choice is kept in the address so you can bookmark it.
- Films that are still waiting for their TMDB lookup now show a "Waiting for TMDB data" badge in the watchlist, so you can tell missing data from finished films. The badge goes away after the lookup has run and you reload the list.
- Added a details page for each film. Click a film's title in the watchlist to see its poster, tagline, rating, genres, director, cast and overview, with links to its Letterboxd and TMDB pages. The title no longer opens Letterboxd directly. Use the Edit button on the page to change the film.
