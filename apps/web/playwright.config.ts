import { defineConfig, devices } from '@playwright/test'

/**
 * E2E browser untuk `apps/web` (gap yang tidak bisa ditutup Vitest: service worker, hidrasi,
 * guard sesi di browser, manifest PWA).
 *
 * Server yang dipakai adalah dev server Nuxt (port 3700, lihat `nuxt.config.ts`) dengan `.env` lokal -
 * test ini karena itu menyentuh Postgres lokal seperti `vitest`, bukan database produksi.
 *
 * `reuseExistingServer` sengaja aktif di lokal: kalau dev server sudah jalan, Playwright memakainya
 * apa adanya. Di CI (`CI=1`) server selalu start sendiri supaya hasil tidak bergantung proses lain.
 */
const E2E_PORT = process.env.E2E_PORT ?? '3710'
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${E2E_PORT}`
/**
 * PWA (manifest + service worker) hanya ada di hasil build, bukan dev server - `@vite-pwa/nuxt`
 * mematikan `devOptions`, jadi smoke default memakai dev server dan suite PWA memakai `.output`.
 */
const PWA_MODE = process.env.E2E_PWA === '1'

export default defineConfig({
  testDir: './e2e',
  // Satu worker: smoke ini berbagi dev server + DB lokal; paralel hanya menambah flake.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI === '1' ? 1 : 0,
  reporter: process.env.CI === '1' ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    // Port khusus E2E (bukan 3700 milik dev server harian) supaya test tidak bertabrakan dengan
    // proses yang sedang dipakai manual. `localhost`, bukan 127.0.0.1: Nuxt dev mengikat IPv6.
    command: PWA_MODE
      ? 'node --env-file=.env .output/server/index.mjs'
      : `pnpm dev --port ${E2E_PORT}`,
    env: PWA_MODE ? { PORT: E2E_PORT } : {},
    url: `${BASE_URL}/health`,
    reuseExistingServer: process.env.CI !== '1',
    timeout: 180_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
