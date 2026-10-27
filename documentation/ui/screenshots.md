# Screenshots

The screenshots in the UI pages ([roulette](roulette.md), [watchlist](watchlist.md), [import](import.md), [film details](film-details.md)) and in the README are in `documentation/ui/images/`. They are generated, not taken by hand, so they can be remade whenever the UI changes.

## Regenerate them

```sh
cd frontend
npm run screenshots
```

The script is `frontend/screenshots/screenshots.shots.ts`, with its own config (`playwright.screenshots.config.ts`). It is not part of `npm run test:e2e`. It builds the app and serves it with `vite preview` (the dev server would add the Vue DevTools button to the page), opens each page in a 1280 px wide Chromium and writes the full page as a PNG. It needs Playwright's Chromium (`npx playwright install chromium`); `PW_CHROMIUM_PATH` can point at another Chromium. Commit the changed images with the UI change that caused them.

## Sample data

The API is stubbed in the browser, like in the e2e tests, so no database, no real watchlist and no TMDB token are involved. The films are in `frontend/screenshots/sampleFilms.ts`: Big Buck Bunny (the roulette pick and the details page), Sintel, Tears of Steel and Elephants Dream, one of them marked as watched. Their facts and poster files come from their TMDB pages; fields TMDB does not list (cast, rating, tagline, country for most) are left empty, which is also what the app shows for them. The import page shows a made-up check result. The posters are loaded from TMDB's image server while the script runs, so it needs an internet connection.

## Credits

Film data and posters are provided by [TMDB](https://www.themoviedb.org), as the footer in every screenshot says. The films are open movies by the Blender Foundation, released under Creative Commons Attribution licenses. Only the poster of Big Buck Bunny is shown as an image (resized for the page); the other films appear as text.

- Big Buck Bunny: (c) copyright 2008, Blender Foundation / www.bigbuckbunny.org, [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/).
- Sintel: Blender Foundation / durian.blender.org, [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/).
- Tears of Steel: Blender Foundation / mango.blender.org, [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/).
- Elephants Dream (2006): Blender Foundation / orange.blender.org, Creative Commons Attribution (the version was not checked).
