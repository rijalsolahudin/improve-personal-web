import { expect, test } from '@playwright/test'

/**
 * Suite PWA - WAJIB dijalankan terhadap hasil build, bukan dev server.
 *
 * `@vite-pwa/nuxt` mematikan service worker di dev (`devOptions.enabled: false`), jadi manifest,
 * precache, dan fallback offline hanya ada setelah `nuxt build`. Jalankan lewat:
 *
 *   pnpm --filter @improve-personal/web test:e2e:pwa
 *
 * Script itu build dulu (termasuk `verify:precache`), lalu menyalakan `.output/server`.
 */
const ENABLED = process.env.E2E_PWA === '1'

test.describe('PWA hasil build', () => {
  test.skip(!ENABLED, 'butuh build: jalankan pnpm test:e2e:pwa')

  test('manifest valid dan memuat ikon installable', async ({ request }) => {
    const response = await request.get('/manifest.webmanifest')

    expect(response.ok()).toBe(true)
    const manifest = await response.json()

    expect(manifest.name).toBe('Improve Personal')
    expect(manifest.start_url).toBe('/app')
    expect(manifest.display).toBe('standalone')
    expect(manifest.icons.length).toBeGreaterThanOrEqual(3)
    expect(manifest.icons.some((icon: { purpose?: string }) => icon.purpose === 'maskable')).toBe(
      true,
    )
  })

  test('service worker aktif dan halaman offline ikut precache', async ({ page }) => {
    await page.goto('/')

    const result = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready
      const keys = await caches.keys()
      // Entri precache Workbox membawa `?__WB_REVISION__=...`, jadi `ignoreSearch` wajib.
      const offline = await caches.match('/offline', { ignoreSearch: true })

      return { active: registration.active !== null, keys, hasOffline: offline !== undefined }
    })

    expect(result.active).toBe(true)
    expect(result.keys.length).toBeGreaterThan(0)
    expect(result.hasOffline).toBe(true)
  })

  test('navigasi saat offline menyajikan halaman offline, bukan layar error', async ({
    context,
    page,
  }) => {
    await page.goto('/')
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready
    })
    // Reload sekali supaya SW yang baru aktif benar-benar mengontrol halaman ini (klaim klien
    // tidak selalu selesai sebelum navigasi berikutnya).
    await page.reload()

    await context.setOffline(true)
    // `/login` punya rule NetworkOnly + `precacheFallback` (nuxt.config.ts): offline ia menyajikan
    // halaman offline statis, bukan layar error browser.
    await page.goto('/login').catch(() => {})

    // Halaman offline statis (public/offline/index.html) punya tautan "Coba lagi" + "Buka aplikasi".
    await expect(page.getByRole('link', { name: /coba lagi/i })).toBeVisible({ timeout: 15_000 })
  })
})
