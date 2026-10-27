import process from 'node:process'
import { defineConfig, devices } from '@playwright/test'

/**
 * Takes the screenshots in documentation/ui/images/ (`npm run screenshots`, see documentation/ui/screenshots.md).
 * It runs the built app (the dev server adds the Vue DevTools button to the page) with a stubbed API: no database
 * and no TMDB token. PW_CHROMIUM_PATH points at an installed Chromium if Playwright's own is not available.
 */
export default defineConfig({
  testDir: './screenshots',
  testMatch: '*.shots.ts',
  reporter: 'line',
  workers: 1,
  use: {
    ...devices['Desktop Chrome'],
    viewport: { width: 1280, height: 800 },
    baseURL: 'http://localhost:4173',
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  webServer: {
    command: 'npm run build-only && npm run preview -- --port 4173 --strictPort',
    port: 4173,
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
