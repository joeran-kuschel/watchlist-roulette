# Security policy

## Reporting a vulnerability

Please do not open a public issue for a security problem. Report it privately through GitHub: open the repository's **Security** tab and choose **Report a vulnerability**.

Include what you found, the steps to reproduce it, and the version or commit you tested. You will get a reply as soon as possible; this is a hobby project, so there is no fixed response time.

## Scope

Watchlist Roulette is made to run on your own computer (Docker Compose or Docker Desktop's Kubernetes). It has no user accounts or login: the app and the API are only reachable from your own machine by default, and writes from other web sites are refused (`CORS_ORIGIN`). Do not expose it to the internet without putting authentication in front of it.

In scope: the code in this repository, such as injection, path traversal, unsafe handling of uploaded CSV files, or leaking the TMDB token or database credentials.

Out of scope: problems that need the app to be exposed publicly without authentication, and vulnerabilities in TMDB, Letterboxd, PostgreSQL or Docker themselves.

## Secrets

The credentials in this repository (`.env.example`, `docker-compose.yml`) are placeholders for local use. If you find a real secret in the code or the git history, report it the same way.
