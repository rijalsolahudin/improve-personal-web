/**
 * QA T25 (F16) - pemuatan font gaya & aset tampilan.
 *
 * AC: "font gaya di-lazy-load & offline" dan "gaya terpasang sebelum render pertama".
 * Yang bisa dibuktikan dari konfigurasi hasil `loadNuxtConfig` (bukan tebakan dari berkas teks):
 * - hanya font gaya default yang di-preload; font 7 gaya tidak,
 * - service worker menyimpan font yang sudah dipakai (CacheFirst) supaya tersedia offline,
 * - token CSS ikut dimuat global,
 * - halaman app dirender client (`ssr: false`) sehingga tidak ada HTML bertema salah yang sempat dilukis.
 */
import { STYLE_FONT_FAMILIES } from '@improve-personal/tokens'
import { describe, expect, it } from 'vitest'

type ConfigBerbentuk = {
  css?: string[]
  fonts?: { families?: Array<{ name: string; preload?: boolean }> }
  pwa?: {
    workbox?: {
      runtimeCaching?: Array<{
        urlPattern?: RegExp | string
        handler?: string
        options?: { cacheName?: string; expiration?: { maxAgeSeconds?: number } }
      }>
    }
  }
  routeRules?: Record<string, { ssr?: boolean; prerender?: boolean }>
}

async function muatKonfigurasi(): Promise<ConfigBerbentuk> {
  const { loadNuxtConfig } = await import('nuxt/kit')
  return (await loadNuxtConfig({ cwd: process.cwd() })) as ConfigBerbentuk
}

const HARI = 24 * 60 * 60

describe('pemuatan tema & font gaya (F16)', () => {
  it('font non-default `preload: false`, font default tidak ikut dimatikan preload-nya', async () => {
    const config = await muatKonfigurasi()
    const families = config.fonts?.families ?? []
    expect(families.length).toBeGreaterThan(0)

    for (const font of STYLE_FONT_FAMILIES) {
      const entri = families.find((family) => family.name === font.name)
      expect(entri, `font gaya "${font.name}" tidak terdaftar di @nuxt/fonts`).toBeDefined()
      expect(entri?.preload, `font gaya "${font.name}" tidak boleh di-preload`).toBe(false)
    }

    for (const nama of ['Baloo 2', 'Nunito', 'Patrick Hand']) {
      const entri = families.find((family) => family.name === nama)
      expect(entri, `font default "${nama}" hilang`).toBeDefined()
      expect(entri?.preload).not.toBe(false)
    }
  })

  it('service worker menyimpan font yang sudah dipakai agar tersedia offline', async () => {
    const config = await muatKonfigurasi()
    const rules = config.pwa?.workbox?.runtimeCaching ?? []
    const ruleFont = rules.find((rule) =>
      rule.urlPattern instanceof RegExp ? rule.urlPattern.test('/_fonts/abc123.woff2') : false,
    )
    expect(ruleFont, 'tidak ada rule cache untuk /_fonts/*.woff2').toBeDefined()
    expect(ruleFont?.handler).toBe('CacheFirst')
    expect(ruleFont?.options?.cacheName).toBe('fonts')
    expect(ruleFont?.options?.expiration?.maxAgeSeconds).toBeGreaterThanOrEqual(30 * HARI)
  })

  it('token CSS (variabel tema/gaya) dimuat global di semua halaman', async () => {
    const config = await muatKonfigurasi()
    expect(config.css ?? []).toContain('@improve-personal/tokens/css')
  })

  it('halaman app dirender client, landing publik di-prerender', async () => {
    const config = await muatKonfigurasi()
    expect(config.routeRules?.['/app/**']?.ssr).toBe(false)
    expect(config.routeRules?.['/login']?.ssr).toBe(false)
    expect(config.routeRules?.['/']?.prerender).toBe(true)
  })
})
