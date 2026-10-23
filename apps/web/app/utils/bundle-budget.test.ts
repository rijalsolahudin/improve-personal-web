import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { gzipSync } from 'node:zlib'

import { describe, expect, it } from 'vitest'

/**
 * Gerbang budget bundel terhadap ARTEFAK build (QA T16 MAYOR-1).
 *
 * Dua hal yang dijaga di sini, dan kenapa harus dari artefak:
 *
 * 1. **Kompresi aset statis.** `nuxt.config.ts` wajib punya `nitro.compressPublicAssets`. Kalau flag
 *    itu hilang, semuanya tetap "jalan" - bundel cuma dikirim mentah (JS awal `/app` 483 KB, bukan
 *    151 KB) dan tidak ada test lain yang bisa melihatnya. Nitro mem-prekompres `.gz` + `.br` saat
 *    build, jadi buktinya ada di `.output/public`.
 * 2. **Batas chunk tunggal 100 KB gzip** (`performance.md` §Budget). Satu pengecualian didokumentasikan
 *    di `app/utils/crypto/sodium.ts`: chunk `libsodium-wrappers-sumo` (WASM Argon2id/box) tidak bisa
 *    dipecah maupun dikecilkan tanpa mengganti pustaka kriptonya. Test ini menolak chunk besar BARU
 *    selain itu - justru itu regresi yang ingin ditangkap.
 *
 * Sama seperti `app/assets/css/tokens.test.ts`: artefak tidak selalu ada (butuh `nuxt build`), jadi
 * test di-skip tanpa `.output` - bukan gagal, karena bukan tes unit biasa.
 */
const outputRoot = resolve('.output', 'public')
const nuxtDir = join(outputRoot, '_nuxt')
const BUDGET_GZIP_BYTES = 100 * 1024
/** Penanda isi libsodium; nama berkasnya ber-hash dan berubah tiap build. */
const SODIUM_MARKER = 'crypto_pwhash_ALG_ARGON2ID13'

type Chunk = { readonly file: string; readonly path: string; readonly raw: number }

function jsChunks(): Chunk[] {
  return readdirSync(nuxtDir)
    .filter((name) => name.endsWith('.js'))
    .map((name) => {
      const path = join(nuxtDir, name)
      return { file: name, path, raw: statSync(path).size }
    })
}

describe('budget bundel (artefak build)', () => {
  it.skipIf(!existsSync(nuxtDir))('aset statis JS dikirim terkompresi (brotli + gzip)', () => {
    const missing: string[] = []
    for (const { file, path, raw } of jsChunks()) {
      // Berkas < 1 KB sengaja dilewati Nitro: hasil kompresinya lebih besar dari aslinya.
      if (raw < 1024) continue
      if (!existsSync(`${path}.br`)) missing.push(`${file} (brotli)`)
      if (!existsSync(`${path}.gz`)) missing.push(`${file} (gzip)`)
    }

    expect(
      missing,
      'aset `/_nuxt/*.js` terkirim tanpa kompresi - cek `nitro.compressPublicAssets` di nuxt.config.ts',
    ).toEqual([])
  })

  it.skipIf(!existsSync(nuxtDir))(
    'chunk tunggal <= 100 KB gzip, kecuali libsodium yang terdokumentasi',
    () => {
      const overBudget: string[] = []
      for (const { file, path, raw } of jsChunks()) {
        const gzip = gzipSync(readFileSync(path), { level: 9 }).length
        if (gzip <= BUDGET_GZIP_BYTES) continue

        // Satu-satunya pengecualian: chunk pustaka kripto (lihat `app/utils/crypto/sodium.ts`).
        if (readFileSync(path, 'utf8').includes(SODIUM_MARKER)) continue

        overBudget.push(`${file}: ${(gzip / 1024).toFixed(1)} KB gzip (${raw} B mentah)`)
      }

      expect(overBudget).toEqual([])
    },
  )

  it.skipIf(!existsSync(nuxtDir))(
    'chunk libsodium tidak diimpor statis oleh chunk lain (tidak ikut bundel awal)',
    () => {
      // Regresi yang dijaga: Rolldown dulu menumpuk helper kecil (namespace `import()`) ke chunk
      // libsodium. Akibatnya chunk 185 KB itu jadi dependensi STATIS layout dashboard & form
      // pemulihan, lalu di-`<link rel="prefetch">` di semua rute - persis MAYOR-1. Pemisahan chunk
      // ada di `nuxt.config.ts` (`advancedChunks`); test ini memastikan tidak ada yang menyeretnya
      // kembali lewat impor statis.
      const sodiumFile = jsChunks().find(
        ({ path }) => readFileSync(path, 'utf8').includes(SODIUM_MARKER) === true,
      )
      expect(sodiumFile, 'chunk libsodium tidak ditemukan di artefak').toBeDefined()

      const staticImporters = jsChunks()
        .filter(({ file }) => file !== sodiumFile?.file)
        // Impor statis di bundel minified selalu berbentuk `from"./<berkas>.js"`. Referensi di dalam
        // `import()`/`__vite__mapDeps` sengaja TIDAK dihitung: itu justru jalur malas yang diinginkan.
        .filter(({ path }) => readFileSync(path, 'utf8').includes(`from"./${sodiumFile?.file}"`))
        .map(({ file }) => file)

      expect(
        staticImporters,
        'chunk libsodium diimpor statis - ia akan diunduh di setiap rute; cek `advancedChunks` di nuxt.config.ts',
      ).toEqual([])
    },
  )

  it.skipIf(!existsSync(nuxtDir))('precache PWA tidak memuat berkas turunan kompresi', () => {
    const sw = readFileSync(join(outputRoot, 'sw.js'), 'utf8')
    const start = sw.indexOf('precacheAndRoute([')
    expect(start, 'manifest precache tidak ditemukan di sw.js').toBeGreaterThan(-1)

    const urls = [...sw.slice(start, sw.indexOf(']', start)).matchAll(/url:"([^"]*)"/g)].map(
      (match) => match[1] ?? '',
    )
    // `.br`/`.gz` adalah berkas turunan untuk transport; Workbox tidak boleh meng-cache-nya (dobel
    // ukuran, dan yang dipakai browser adalah hasil dekompresinya).
    expect(urls.filter((url) => /\.(br|gz)$/.test(url))).toEqual([])
  })

  /**
   * Budget JS awal per RUTE (T66). Halaman landing adalah satu-satunya rute yang HTML-nya ada di
   * artefak, jadi di situlah batas 170 KB gzip (`performance.md` §Budget) bisa ditegakkan tanpa
   * menjalankan server. Yang dihitung sama dengan cara QA mengukurnya: `modulepreload` + `<script>`
   * awal, bukan prefetch (itu hint idle).
   */
  it.skipIf(!existsSync(join(outputRoot, 'index.html')))(
    'JS awal landing (modulepreload + script) <= 170 KB gzip',
    () => {
      const html = readFileSync(join(outputRoot, 'index.html'), 'utf8')
      const hrefs = [
        ...html.matchAll(/<link[^>]*rel="modulepreload"[^>]*href="([^"]+)"/g),
        ...html.matchAll(/<script[^>]*type="module"[^>]*src="([^"]+)"/g),
      ].map((match) => match[1] ?? '')

      const unique = [...new Set(hrefs)]
      let total = 0
      for (const href of unique) {
        const path = join(outputRoot, href)
        if (!existsSync(path)) throw new Error(`berkas JS awal hilang: ${href}`)
        total += gzipSync(readFileSync(path), { level: 9 }).length
      }

      expect(
        total,
        `JS awal landing ${(total / 1024).toFixed(1)} KB gzip (${unique.length} berkas) melewati budget 170 KB - cek impor statis di pages/index.vue / LandingHero.vue`,
      ).toBeLessThanOrEqual(170 * 1024)
    },
  )

  /**
   * `nuxt-security` menandatangani preload font dengan hash SHA-384 dari isi KOSONG (berkas
   * `/_fonts/*.woff2` ditulis `@nuxt/fonts` setelah peta SRI dibangun). Browser menolak preload
   * dengan digest salah, lalu mengunduh font yang sama lagi - dua kali ~59 KB di jalur render.
   * `server/plugins/50-font-preload-integrity.ts` membuang atribut itu; test ini menjaga hasilnya
   * di HTML yang di-prerender.
   */
  it.skipIf(!existsSync(join(outputRoot, 'index.html')))(
    'preload font tidak memakai integrity hash kosong (SRI font tidak valid)',
    () => {
      const html = readFileSync(join(outputRoot, 'index.html'), 'utf8')
      const fontPreloads = [...html.matchAll(/<link[^>]*as="font"[^>]*>/g)].map((match) => match[0])
      expect(fontPreloads.length, 'preload font hilang dari landing').toBeGreaterThan(0)

      const EMPTY_SHA384 = 'sha384-OLBgp1GsljhM2TJ+sbHjaiH9txEUvgdDTAzHv2P24donTt6/529l+9Ua0vFImLlb'
      expect(fontPreloads.filter((tag) => tag.includes(EMPTY_SHA384))).toEqual([])
    },
  )
})
