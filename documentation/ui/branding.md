# Logo and favicon

The app's mark is the **film ring**: a ring of film perforations around a dot. The dot is the pick the roulette lands on. It was chosen from six concepts (reel, ticket, film ring, spin-play, W strip, wheel) because it stays readable at 16 px.

## Where it is used

| Place | How |
|---|---|
| Page header | `components/BrandMark.vue` next to the name "Watchlist Roulette" (the mark is decorative, the name is the text). The ring takes the text color, the dot the accent color. |
| Browser tab | `public/favicon.svg`, a vector icon with a transparent ground. The ring is dark for a light color scheme and cream for a dark one (`prefers-color-scheme` inside the SVG). That is the operating system's preference, so a browser with its own custom theme can mismatch it (a dark ring on a dark tab); the dot stays visible either way. The link has `sizes="any"` so Chrome prefers the SVG over the `.ico`. |
| Older browsers | `public/favicon.ico` with 16, 32 and 48 px images (PNG inside). A dark tile with a cream ring, so it works on any tab color. |
| iOS home screen | `public/apple-touch-icon.png`, 180 px, the same dark tile (iOS rounds the corners itself). |

`index.html` links all of them and sets `theme-color` to the dark ground (`#12141a`).

## Colors

| | |
|---|---|
| Dot | accent `#FF6B47` |
| Ring on dark | cream `#F2EFE8` |
| Ring on light | dark `#12141A` |
| Icon tile | dark `#12141A` |

## Two drawings of the mark

Both are on a 64 x 64 grid, centered, ring radius 24:

- **Full** (header, 48 px and larger): ring stroke 8 with 12 perforations, dot radius 10.
- **Small** (16 and 32 px, and the SVG favicon): ring stroke 11 with 8 perforations, dot radius 11, so it still reads as a ring around a dot when tiny.

A one-color version (the dot in the ring's color) exists in the design canvas for print or embossing; the app does not use it.

## Changing or regenerating the icons

`frontend/scripts/make-icons.mjs` draws `favicon.svg`, `favicon.ico` and `apple-touch-icon.png` from the geometry above (it renders them in Chromium through Playwright):

```bash
cd frontend
npm run icons
```

It needs a Chromium for Playwright (`npx playwright install chromium`). To use one you already have, set `CHROME_PATH` to its executable. The generated files are committed, so nobody needs to run this unless the mark changes. If the geometry changes, change it in two places: the script and `BrandMark.vue`.

## Tests

`src/__tests__/branding.spec.ts` checks:

- `index.html`: the icon links match the files in `public/`, one title, viewport and `#app`, `theme-color`.
- `favicon.svg`: well-formed, no external references or scripts, no background, light and dark ring colors, dot in the accent color.
- `favicon.ico`: the entries (16, 32, 48 px) match the PNG images inside, which have an alpha channel, transparent corners and the accent dot in the center.
- `apple-touch-icon.png`: 180 px, opaque, dark corners, accent center.
- The `icons` script: it exists, and its geometry constants agree with `BrandMark.vue` and `favicon.svg`, so the drawings cannot drift apart silently.

`BrandMark` and its use in the header are tested in `components/__tests__/components.spec.ts`, and an end-to-end test checks that the icon files are served. How the mark looks at 16 px and in each browser's tab is not tested; check it by eye after changing the mark.

## Not done

- A web app manifest (installable app, 192 and 512 px icons) is not part of this.
- The official TMDB logo is a separate item, see [TMDB attribution](tmdb-attribution.md).
