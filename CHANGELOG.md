# Changelog

All notable changes to Watchlist Roulette. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## Unreleased

- The documentation now shows screenshots of the roulette, the watchlist, the import page and a film's details page.
- The arrow in the dropdowns now has more room, and long entries no longer run under it.
- You can now import an IMDb watchlist or list export as well as a Letterboxd one. The import page works out which one you chose and says so. TV series are imported, TV episodes are not, and a missing date added becomes the day of the import. Importing one kind of file never removes the films that came from the other. A film that is in both lists is added twice.
- On Kubernetes, the database now accepts connections only from the app's own backend. Other pods in the cluster can no longer connect to it. The backups and the restore work as before.
- The API can no longer be called on its own port (3000). In Docker Compose only the app on port 8080 is published, and on Kubernetes other pods in the cluster can no longer reach the API. The app works as before. For development, `docker-compose.dev.yml` publishes the API on `127.0.0.1:3000`.
- The roulette filters take less room on medium-width windows: country and maximum runtime share a row next to the result, and windows narrower than 990 pixels now get the collapsible Filters panel instead of a tall open form above the result.
- On wide screens you can now sort the watchlist by clicking the Title, Year and Added headers; click again to reverse the order. Titles can also be sorted Z to A. On phones the Sort by list stays. A long watchlist also has a page control above the table now.
- The roulette now says that its filters only apply when you press Spin again. The pick made when the page opens is marked as a first pick from your whole list, before any filter.
- You can now drop a CSV file onto the import page instead of choosing it with the button. The box highlights while you drag. Only one CSV file is accepted; anything else gets a clear message. Screen readers read out the chosen file's name and size.
- The API now protects itself against floods of requests: above 600 requests a minute it answers "Too many requests". Normal use stays far below that.
- Added a security policy, contributing guide, and templates for issues and pull requests, so the project is ready to be shared.
- Added the app's logo, a ring of film perforations around a dot, in the page header, and as the icon in the browser tab and on iOS home screens (the icon follows your light or dark color-scheme setting).
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
- On phones and other narrow screens the roulette filters are collapsed behind a "Filters" button, so the picked film and the spin button are visible right away. The panel opens by itself if a filter is invalid, and short filters share a row.
- Added the TMDB notice and a logo placeholder at the bottom of every page.
- Posters now show. They are loaded through your own server, so your browser never contacts TMDB. Films without a poster still show a "No poster" box.
- The whole app works with a keyboard and screen readers: skip link, labelled icon buttons with tooltips, announced results and errors.
- Added a TMDB status filter to the watchlist, so you can find films that still need a match (Needs review, Not found, Lookup failed) or are still pending. It works together with search and the watched filter, and the choice is kept in the address so you can bookmark it.
- Films that are still waiting for their TMDB lookup now show a "Waiting for TMDB data" badge in the watchlist, so you can tell missing data from finished films. The badge goes away after the lookup has run and you reload the list.
- Added a details page for each film. Click a film's title in the watchlist to see its poster, tagline, rating, genres, director, cast and overview, with links to its Letterboxd and TMDB pages. The title no longer opens Letterboxd directly. Use the Edit button on the page to change the film.
- TV shows from TMDB can now be matched. In "Choose match", paste the show's page address (themoviedb.org/tv/…); its data and poster are then used, the film page links to the show on TMDB and says "Created by" and "Episode runtime". The search link there now finds movies and shows, and a number alone still means a movie. An existing database needs the migration `003_tmdb_media_type.sql` first (see `documentation/backend/database.md`).
- The official TMDB logo now appears in the footer of every page, next to the TMDB notice.
- The small hint texts on the icon buttons are easier to use: you can move the mouse onto a hint without it vanishing, and Esc closes it even when you only point at the button. Disabled buttons, such as the previous page button on the first page, no longer show a hint.
- Screen readers now start with the action when they read the buttons in the watchlist, for example "Edit film: Perfect Days" instead of "Edit Perfect Days".
- The watchlist now works on a phone or other small screen: each film is a card with its title, year, date added, status and buttons, so nothing is cut off or hidden off-screen any more.
- The roulette filters no longer show example values (1970, 2026, 120) inside the empty fields, where they looked like something you had already typed. The examples now appear as a short note next to the field.
- The CSV import screen has a "Choose CSV file" button that shows the name of the chosen file in English, instead of the browser's own file field.
- Going back to the watchlist from a film's page, the edit page or the TMDB match page now keeps your search, filters, sort and page, instead of starting again at page 1. The app forgets this when you reload the page.
- On a film's details page you can now mark the film as watched or unwatched, and choose its TMDB match when TMDB could not match it on its own.
- Added automatic checks on GitHub: every pull request runs the tests, type-checks, lint and a Docker build, and dependency updates are proposed weekly.
- Added a "Look up on TMDB" button to a film's details page. Use it for films you added by hand, or that failed or were not found: the page shows the result right away. Without a TMDB token it tells you that TMDB is not set up.
- Added a "Check TMDB again" button to the watchlist. It looks up films again that are still waiting, failed, were not found or need review, shows its progress, tells you what changed and refreshes the list. Films you matched by hand keep their match.
- The watchlist and a film's details page now tell you when TMDB data is turned off (no TMDB token), and how to turn it on. The buttons that need TMDB are hidden then, and films that are waiting show "TMDB data is off" instead of "Waiting for TMDB data".
