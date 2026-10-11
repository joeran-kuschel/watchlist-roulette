# TMDB attribution

TMDB's terms require its logo and a notice wherever TMDB data is shown. `components/TmdbAttribution.vue` is the footer of every screen (it sits in `AppLayout`).

It shows the notice "This product uses the TMDB API but is not endorsed or certified by TMDB." and a link to <https://www.themoviedb.org/> (new tab).

## Open item: the official logo

The footer currently shows a **placeholder** (a dashed box labelled "TMDB LOGO", `role="img"`, `aria-label="TMDB logo"`). Before release it must be replaced with the official logo:

- Get it from <https://www.themoviedb.org/about/logos-attribution> and use it unmodified.
- It must be smaller than the app's own logo.
- Add it under `frontend/public/` and use `<img src="…" alt="TMDB">` instead of the placeholder.

Downloading the file needs the owner's OK, so it is not part of this change.
