import { expect, test } from '@playwright/test'

/**
 * Smoke E2E - hal yang hanya bisa dibuktikan browser sungguhan.
 *
 * Fokusnya bukan mengulang test komponen, melainkan memastikan kerangka web hidup: halaman publik
 * ter-render tanpa error hidrasi, manifest PWA benar-benar dilayani, API health menjawab, dan guard
 * sesi mengalihkan `/app` ke `/login` saat belum ada sesi.
 */
test.describe('kerangka publik', () => {
  test('landing dirender, manifest PWA ditautkan, tanpa error hidrasi', async ({ page }) => {
    const hydrationErrors: string[] = []

    page.on('pageerror', (error) => hydrationErrors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error' && /hydrat/i.test(message.text())) {
        hydrationErrors.push(message.text())
      }
    })

    await page.goto('/')

    await expect(page).toHaveTitle(/Rencanakan hari/)
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
      'href',
      '/manifest.webmanifest',
    )
    await expect(page.locator('h1').first()).toBeVisible()

    await page.waitForLoadState('networkidle')
    expect(hydrationErrors).toEqual([])
  })

  test('manifest PWA ditautkan di landing', async ({ page }) => {
    await page.goto('/')

    const href = await page.locator('link[rel="manifest"]').getAttribute('href')
    expect(href).toBe('/manifest.webmanifest')
    // Isi manifest & service worker hanya dilayani pada build; lihat `e2e/pwa.spec.ts`.
  })

  test('health API menjawab', async ({ request }) => {
    const response = await request.get('/health')

    expect(response.status()).toBe(200)
    // `defineApiHandler` membungkus payload kontrak dalam `{ data }`.
    expect(await response.json()).toMatchObject({ data: { status: 'ok' } })
  })

  test('halaman login tampil dengan form email', async ({ page }) => {
    await page.goto('/login')

    await expect(page.getByRole('heading').first()).toBeVisible()
    await expect(page.locator('input[type="email"]')).toBeVisible()
    await expect(page.getByText(/Ketentuan dan Kebijakan Privasi/)).toBeVisible()
  })

  test('/app tanpa sesi dialihkan ke /login', async ({ page }) => {
    await page.goto('/app')

    await expect(page).toHaveURL(/\/login/)
  })
})
