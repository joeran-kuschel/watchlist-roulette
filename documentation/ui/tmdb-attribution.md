# TMDB attribution

TMDB's terms require its logo and a notice wherever TMDB data is shown. `components/TmdbAttribution.vue` is the footer of every screen (it sits in `AppLayout`).

It shows the notice "This product uses the TMDB API but is not endorsed or certified by TMDB." and a link to <https://www.themoviedb.org/> (new tab).

## The logo

The footer shows the official TMDB logo, "Primary short (blue)", from <https://www.themoviedb.org/about/logos-attribution>. It is the file `frontend/public/tmdb-logo.svg`, **unmodified**: TMDB's terms do not allow changing it, and `src/__tests__/branding.spec.ts` checks the file against TMDB's SHA-256 of it. Do not recolor, crop or filter it in CSS.

- It is an `<img src="/tmdb-logo.svg" alt="TMDB">` with `width="108"` and `height="14"`, so its space is reserved before it loads and the footer does not jump.
- It is smaller than the app's own logo (14 px high against 36 px in the header), as TMDB's guidelines ask.
- Its gradient colors are TMDB's own and never change. The app has one theme (dark), where the logo's light green and blue stand out against the dark ground. A logo is exempt from the text and non-text contrast rules of WCAG 2.2, and the text next to it carries the notice. If a light theme is ever added, check the logo there.
- The notice and the link to TMDB, which are the actual attribution text, stay next to it.

To use another TMDB logo, download it from the page above, replace the file, update the SHA-256 in the test and check the size rule again.
