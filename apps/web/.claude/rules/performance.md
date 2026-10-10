# Pilar Performa - Web (Nuxt)

Target: Nuxt 4 (`app/` dir). Semua angka di bawah diukur di p75, mobile, koneksi 4G (Lighthouse "Mobile" / CrUX).
Kalau budget sengaja dilanggar, tulis trade-off-nya di PR.

## Budget (gagal = blocker merge)

| Metrik | Budget |
|---|---|
| LCP | <= 2.5 s |
| INP | <= 200 ms |
| CLS | <= 0.1 |
| TTFB (halaman SSR) | <= 600 ms |
| Lighthouse Performance (mobile) | >= 90 |
| JS initial per route (gzip) | <= 170 KB |
| Chunk tunggal (gzip) | <= 100 KB |
| Gambar di atas fold | <= 200 KB, format AVIF/WebP |
| Font total | <= 2 file, <= 100 KB woff2 |
| Payload SSR (`__NUXT__`) | <= 50 KB per halaman |

## Rendering mode

- WAJIB tentukan mode tiap route di `routeRules` (`nuxt.config.ts`), bukan default diam-diam:
  - Konten statis (landing, about, legal): `prerender: true`.
  - Konten publik yang jarang berubah: `isr: <detik>` atau `swr: <detik>`.
  - Halaman per-user/dashboard: SSR biasa, atau `ssr: false` kalau tidak butuh SEO.
- DILARANG `ssr: false` global di `nuxt.config.ts` tanpa trade-off tertulis.
- DILARANG `isr`/`swr`/cache Nitro untuk respons yang berisi data per-user.

## Data fetching

- WAJIB `useFetch`/`useAsyncData` untuk data saat render; `$fetch` hanya di event handler/aksi user.
- DILARANG `$fetch` langsung di `<script setup>` top-level (fetch dobel server + client).
- WAJIB `key` eksplisit dan unik di `useAsyncData` yang dipakai di >1 tempat (dedupe & share cache).
- WAJIB `pick`/`transform` untuk mengecilkan payload; jangan kirim objek API utuh ke client.
- Data di bawah fold / non-kritis: `lazy: true` (atau `useLazyFetch`) + state loading.
- Data yang tidak perlu SEO dan mahal: `server: false`.
- Request independen WAJIB paralel (`Promise.all` / beberapa `useFetch`), DILARANG waterfall berurutan.
- Watch param: pakai `watch`/reactive `query`, bukan `refresh()` manual di `watch`.
- DILARANG fetch di dalam loop `v-for` (N+1); buat endpoint agregat.

## Bundle & code splitting

- Komponen berat / di bawah fold / modal: prefix `Lazy` (`<LazyChartPanel v-if="open" />`).
- Komponen yang cukup di-render setelah interaksi/visibility: hydration lazy (`hydrate-on-visible`, `hydrate-on-idle`, `hydrate-on-interaction`).
- Library berat (chart, editor, date lib besar) WAJIB `import()` dinamis; DILARANG di import top-level layout/`app.vue`.
- DILARANG import seluruh library (`import _ from 'lodash'`); pakai import per-fungsi atau native.
- Plugin Nuxt: pakai suffix `.client.ts`/`.server.ts` sesuai kebutuhan; plugin yang tidak perlu blocking set `parallel: true`.
- Cek ukuran: `npx nuxi analyze` WAJIB dijalankan kalau PR menambah dependency.
- Dependency baru WAJIB sebut ukuran gzip-nya di PR (bundlephobia/`nuxi analyze`).

## Gambar & font

- WAJIB `<NuxtImg>`/`<NuxtPicture>` (`@nuxt/image`) dengan `width`, `height`, `sizes`, `format="webp"`/`avif`.
- Gambar LCP: `preload` + `fetchpriority="high"`, TIDAK `loading="lazy"`. Gambar lain: `loading="lazy"`.
- Font via `@nuxt/fonts`, self-hosted, `font-display: swap`, subset latin; maksimal 2 family.
- DILARANG `<img>` mentah tanpa dimensi; DILARANG gambar > 2x ukuran render.

## Layout stability & hydration

- Elemen async (gambar, iklan, embed, skeleton) WAJIB punya ruang tetap (`aspect-ratio`/ukuran).
- DILARANG render berbasis `Date.now()`, `Math.random()`, `window`, `localStorage` saat SSR; bungkus `<ClientOnly>` dengan fallback berukuran sama, atau `onMounted`.
- WAJIB `useState`/`useCookie` untuk state yang harus sama server-client, bukan `ref` global di module scope.
- Warning hydration mismatch di console = bug, harus diperbaiki sebelum merge.

## Interaksi (INP)

- Handler > 50 ms WAJIB dipecah (`requestIdleCallback`/`scheduler.yield`) atau dipindah ke worker.
- List > 100 item: virtualisasi atau pagination; DILARANG render ribuan node sekaligus.
- Input pencarian/filter: debounce 200-300 ms.
- Objek besar read-only: `shallowRef`/`markRaw`, bukan `ref` deep.

## Caching Nitro (server)

- Endpoint publik mahal: `defineCachedEventHandler` / `cachedFunction` dengan `maxAge` + `getKey` eksplisit.
- Aset ber-hash (`/_nuxt/**`): `Cache-Control: public, max-age=31536000, immutable`.
- Kompresi (brotli/gzip) aktif untuk aset statis (`nitro.compressPublicAssets: true`).
- Query DB di endpoint: wajib pagination + limit; DILARANG `select *` tanpa batas.

## Checklist review

- [ ] Route baru punya `routeRules` yang sesuai.
- [ ] Tidak ada `$fetch` di setup top-level; `useFetch` punya `key`/`pick` bila relevan.
- [ ] Tidak ada request waterfall.
- [ ] Komponen berat lazy (`Lazy*` / `import()`); dependency baru disebut ukurannya.
- [ ] Gambar pakai `<NuxtImg>` + dimensi; gambar LCP tidak lazy.
- [ ] Tidak ada warning hydration di console.
- [ ] Lighthouse mobile halaman yang disentuh >= 90 dan LCP/INP/CLS dalam budget (lampirkan angka).
