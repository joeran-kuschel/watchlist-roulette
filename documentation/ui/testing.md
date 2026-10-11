# Testing the UI

## Unit and component tests (Vitest)

```bash
cd frontend
npm run test:unit -- --run
npx vitest run src/views/__tests__/ImportView.spec.ts -t "name of the test"
```

- Tests sit next to the code in `__tests__/` folders. `src/__tests__/helpers.ts` has `makeFilm()`, `mountWithApp()` (fresh Pinia, router on memory history, attached to the document) and `expectNoA11yViolations()`.
- The API module is mocked per spec (`vi.mock('../../api', …)`), keeping the real `ApiError`. Nothing calls a real server or database.
- Every component and screen has an axe check (`axe-core`). axe runs in jsdom, where **color contrast cannot be checked**, so that rule is off there.

## End-to-end tests (Playwright)

`frontend/e2e/app.spec.ts` drives the real app in a browser with the API stubbed through `page.route`, so no database is involved. It also runs axe **with** the contrast rule on, which is the contrast check the unit tests cannot do.

```bash
cd frontend
npx playwright install        # once, downloads the browsers
npm run test:e2e
```

## Contrast

The text colors were also checked in a real browser (all text at least 4.5:1, large text 3:1). Re-check after changing `src/styles/base.css`.
