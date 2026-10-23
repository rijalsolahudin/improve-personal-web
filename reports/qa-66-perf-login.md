# QA T66 — `/login` SSR, SRI font, shell per rute (verifikasi klaim perf + keamanan)

- **Task Ergonio:** #66 `Pecah shell SPA per rute + perbaiki LCP /login (sisa MAYOR-1)` (`ec67e9f7-b526-4233-a588-e74015a574b4`), status `review`.
- **Tanggal:** 2026-10-23.
- **QA:** Fajar. Semua angka di bawah **diukur ulang sendiri** dari build working tree saat ini (bukan salinan `reports/perf-t66-web.md`).
- **Rules dibaca:** `CLAUDE.md` (root), `.claude/rules/{shared-security,shared-code-quality,ergonio-status-flow}.md`, `apps/web/AGENTS.md`, `apps/web/CLAUDE.md`, `apps/web/.claude/rules/{security,performance,code-quality}.md`, `reports/perf-t66-web.md`, komentar handoff #66.
- **Tidak ada kode produk yang diubah.** Artefak `.output` di-regenerate untuk pengukuran.

---

## VERDICT: **LULUS (dengan catatan)**

Acceptance T66 terpenuhi diukur sendiri:

| AC | Target | Hasil ukur QA | Status |
|---|---|---|---|
| JS initial `/` | ≤170 KB gzip | **166,82 KB** (26 berkas) | lulus |
| JS initial `/app` | ≤170 KB gzip | **164,36 KB** (22) | lulus |
| JS initial `/login` | ≤170 KB gzip | **169,72 KB** (29) | lulus (margin 0,28 KB — tipis) |
| Lighthouse mobile `/login` | ≥90 | **0,90 / 0,95 / 0,91 / 0,90 / 0,90 / 0,91** (6 run) | lulus |
| Regresi CLS | ≤0,1 | **CLS 0** di semua run Lighthouse + 0 layout-shift CDP (`/login`, `/`) | lulus |
| i18n kritis di render pertama | teks ada tanpa hydration mismatch | `Masuk ke akunmu` ada di HTML pertama, CLS 0, posisi DOM stabil DCL→4 s | lulus |
| PWA | `verify-precache` OK, `/login` NetworkOnly | **OK 12 entri**, `/login` tidak di cache mana pun, offline jatuh ke `/offline` | lulus |

Catatan yang ikut verdict (detail di §4):

1. **Klaim handoff "core 10,2 KB dihapus dari JS awal semua rute" tidak benar** — chunk `@improve-personal/core` 10,02 KB gzip masih di `modulepreload` ketiga rute (ditarik plugin global `pomodoro.client.ts`, bukan lagi `app.vue`). Budget tetap lulus, tapi alasan yang ditulis di laporan developer salah (Medium, dokumen).
2. **Budget LCP `performance.md` (≤2,5 s) masih terlampaui di lab**: `/login` LCP **2,6–3,0 s** (6/6 run >2,5), `/` LCP 3,5 s. Skor & CLS lulus; ini risiko sisa yang sudah disebut developer, tapi harus diukur di staging sebelum dianggap tuntas (Medium).
3. Klaim "tidak ada dua aturan `position` yang masih berebut" **belum sepenuhnya benar** — konflik kelas `.mascot` masih ada (tersisa di elemen dalam `AuthBrandPanel`, dan di `LandingSteps`), hanya tidak lagi memicu CLS karena wrapper yang memegang posisi. Terukur CLS 0 (Low, kerapian).
4. **Tidak ada test otomatis** untuk bagian paling sensitif: penerusan cookie request pada SSR (`useRequestFetch`). Saya buktikan manual end-to-end (Low, test gap).
5. Respons `/login` SSR tidak punya `Cache-Control`/`Vary` (Low, cache hygiene — lihat §4 F6).

---

## 1. Lingkup & metode

**Diuji:** `/login` SSR (guard sesi, payload, CSP/SRI, layout), SRI preload font (plugin baru), shell per rute (`/`, `/login`, `/app`), PWA precache + offline, CLS/hydration, klaim akar masalah CLS `.mascot`, suite + typecheck + lint + format.

**Tidak diuji (alasan):** CrUX/real-user (tidak ada trafik), mobile app (task web saja), `npm audit` (di luar AC, butuh jaringan registry), visual pixel-diff (tidak ada baseline desain), hydration warning versi dev (build produksi meng-compile-out warning Vue — lihat §5 batasan).

**Cara ukur:** `pnpm build` (NODE_ENV=development) → server Nitro hasil build dijalankan lokal (`127.0.0.1:3822` tanpa DB untuk kasus publik; `3824` dengan DB test untuk kasus sesi nyata) → HTML di-parse untuk `modulepreload`+`script` (dedup URL), tiap berkas di-gzip level 9; Lighthouse 13.5.0 mobile (default throttling) via Chrome 155 headless; probe CDP sendiri untuk layout-shift + `getComputedStyle` + console.

**Bukti paling kuat:** guard SSR diuji dengan **sesi nyata** (OTP fix di DB test: `qa66-guard@example.test`, cookie `ip_session`), bukan mock.

---

## 2. Angka hasil ukur QA

### 2.1 JS awal per rute (deklaratif: `modulepreload` + `<script>`, gzip level 9)

| Rute | JS awal | Berkas | Prefetch (idle, bukan initial) | Budget | Status |
|---|---|---|---|---|---|
| `/` | **166,82 KB** | 26 | 46,07 KB | ≤170 KB | lulus (−3,18) |
| `/login` | **169,72 KB** | 29 | 65,23 KB | ≤170 KB | lulus (−0,28) |
| `/app` | **164,36 KB** | 22 | 42,40 KB | ≤170 KB | lulus (−5,64) |

Chunk: 110 berkas JS. Terbesar `0QtTB3HH.js` **185,39 KB gzip** (libsodium, pengecualian #61, **tidak** di initial). Tidak ada chunk lain >100 KB gzip. Chunk ikon `CrwF6sk_.js` **16,58 KB gzip** sudah hanya `prefetch` di `/`, bukan `modulepreload`.

### 2.2 HTML & payload SSR

| Rute | HTML mentah | HTML gzip | `__NUXT__` | Isi payload |
|---|---|---|---|---|
| `/` | 50.386 B | 10.967 B | **721 B** | hanya config publik (`buildId`, baseURL, i18n) |
| `/login` | 26.249 B | 7.950 B | **720 B** | idem — **tanpa** email/token/userId |
| `/app` | 9.507 B | 3.029 B | **720 B** | idem |

`/login` dengan sesi hidup: **302 → `location: /app`**, body 90 B, 0 kecocokan `user|email|token|__NUXT__`.
`/login` tanpa sesi: 200 + teks form sudah ada di HTML pertama.

### 2.3 Lighthouse mobile (simulasi, server lokal, Chrome 155 headless)

| Halaman | Run | Skor | FCP | LCP | TBT | CLS | TTFB dok | Transfer |
|---|---|---|---|---|---|---|---|---|
| `/login` | 1 | **0,90** | 2,7 s | 3,0 s | 10 ms | **0** | 10 ms | 360 KiB |
| `/login` | 2 | **0,95** | 2,3 s | 2,6 s | 30 ms | **0** | 10 ms | 360 KiB |
| `/login` | 3 | **0,91** | 2,2 s | 2,7 s | 170 ms | **0** | 10 ms | 360 KiB |
| `/login` | 4 | **0,90** | 2,7 s | 3,0 s | 10 ms | **0** | 10 ms | 360 KiB |
| `/login` | 5 | **0,90** | 2,7 s | 3,0 s | 30 ms | **0** | 10 ms | 360 KiB |
| `/login` | 6 | **0,91** | 2,6 s | 3,0 s | 10 ms | **0** | 10 ms | 360 KiB |
| `/` | 1 | **0,90** | 1,7 s | 3,5 s | 20 ms | **0** | 0 ms | 321 KiB |
| `/` | 2 | **0,90** | 1,7 s | 3,5 s | 10 ms | **0** | 0 ms | 321 KiB |

Rentang `/login`: skor **0,90–0,95** (median 0,905), LCP **2,6–3,0 s**, CLS **0**, TBT 10–170 ms.
Angka developer (0,95–0,96; LCP 2,4–2,6) **tidak tereproduksi di mesin QA** — arah perbaikan benar, absolutnya lebih rendah. Ini variasi lab, bukan kontradiksi artefak.

### 2.4 Font (bukti bug SRI hilang)

- Preload font di HTML: **2** tag, `integrity` pada preload font: **0** (hash kosong `sha384-OLBgp1…` **tidak ada** di HTML mana pun).
- Request font saat Lighthouse `/login`: **2** (`19 KB` + `39 KB` = 58 KB) — tidak ada unduhan kedua lewat `@font-face`. Sebelum perbaikan seharusnya 4 request.
- `integrity` skrip/CSS: **32/32** tag cocok dengan SHA-384 isi berkas sebenarnya (dihitung ulang dari `.output/public`), 0 hash kosong, 0 hash salah.

### 2.5 PWA

- `verify-precache OK: 12 entri` (12 entri: `/`, `offline`, `_i18n/…/messages.json`, `manifest.webmanifest`, 5 ikon/manifest/builds, `_payload.json`).
- `/login` **tidak** ada di precache dan **tidak** ada di Cache Storage mana pun (`caches.match('/login')` → null) setelah SW aktif.
- Uji offline nyata (server dimatikan, bukan emulasi): `/login` → halaman **"Kamu sedang offline"** (NetworkOnly + `precacheFallback` bekerja). `/app` offline → shell `app-shell` dari runtime cache lalu guard klien mengarahkan ke form login (tidak butuh jaringan).
- Runtime cache `nuxt-assets` (CacheFirst untuk `/_nuxt/*.js|css`) terdaftar; `app-shell`, `fonts` ada.

### 2.6 CLS & stabilitas layout (CDP, 412×900)

Snapshot di `DOMContentLoaded`, rAF-1, 300 ms, 1,5 s, 4 s — **identik** di `/login`:
- `.panel` `position:relative` 444×**300 px** (tidak menyusut).
- `div.mascot` (wrapper) `position:absolute` di (321,175) 133×138.
- `span.mascot` (root Mascot) `position:relative` di (294,156) 142×142.
- `.form-side` statis di (23,323) 444×565.

`PerformanceObserver('layout-shift')`: **0 entri** di `/login` dan `/`; tidak ada `window.onerror`; console hanya `401 /v1/auth/session` (diharapkan, tanpa sesi). Posisi maskot di `/` juga identik DCL→4 s (tidak ada lompatan).

---

## 3. Hasil per acceptance criteria (detail)

| AC | Bukti |
|---|---|
| JS initial `/` & `/app` ≤170 KB | §2.1 (166,82 / 164,36) |
| Lighthouse mobile `/login` ≥90 tanpa regresi CLS ≤0,1 | §2.3 (0,90–0,95; CLS 0 di 6 run) |
| i18n kritis SSR tanpa hydration mismatch | `Masuk ke akunmu` ada di HTML 26,2 KB pertama; posisi DOM stabil; CLS 0; tidak ada error console selain 401 |
| `/login` SSR memakai cookie request (user login tidak nyangkut di form) | sesi nyata + cookie → **302 `/app`**; tanpa cookie → 200 form; cookie palsu → 200 form (fail-closed) |
| SRI tidak dibuang dari script/CSS | 32/32 integrity = hash isi asli; hanya preload font yang dibersihkan (2 tag, 0 integrity) |
| CSP nonce/strict-dynamic tetap | header `/login`: `script-src 'self' 'wasm-unsafe-eval' 'nonce-…' 'strict-dynamic'`, `object-src 'none'`, `frame-ancestors 'none'`, tanpa `'unsafe-eval'`; `/` (prerender) memakai sha256/sha384 + `strict-dynamic` |
| Tidak ada data user di payload SSR | `__NUXT__` 720 B = config publik saja; body 302 = 90 B tanpa data |
| `/login` tidak ter-cache SW / tidak ada cache Nitro | §2.5; `routeRules['/login']` hanya `{ ssr: true }`, tanpa `swr`/`isr`/`cache`; tidak ada `cache-control` dari Nitro (lihat F6) |
| Hydration warning 0 | tidak ada warning/exception di console CDP; build produksi tidak mengeluarkan warning Vue (batasan §5) |
| PWA offline jalan | §2.5 |

---

## 4. Temuan

### F1 — Medium (akurasi laporan): chunk core 10 KB **masih** di JS awal semua rute

Klaim handoff §1 butir 5 dan §3 ("`@improve-personal/core` 10,2 KB dihapus dari JS awal semua rute") tidak sesuai artefak:

- `/_nuxt/VRUJJLbR.js` **10,02 KB gzip** (28,0 KB mentah) ada di `modulepreload` `/`, `/login`, **dan** `/app`.
- `/_nuxt/zp3ImPyz.js` **1,61 KB gzip** (skema DB lokal) juga di ketiga rute.
- Entry `/_nuxt/3kZmj9oH.js` mengimpornya **statis**: `import{P as On}from"./VRUJJLbR.js";` dan `import{n as kn,r as An}from"./zp3ImPyz.js";`.
- Jalur tariknya: plugin global `apps/web/app/plugins/pomodoro.client.ts:29` (`usePomodoro()`) → `apps/web/app/utils/pomodoro/persistence.ts:43` (`repository(...).listByRange` + `On.parse`). Jadi pemindahan `useAppearancePrefs` (`apps/web/app/app.vue:8`, `apps/web/app/layouts/dashboard.vue:17`) **tidak** mengeluarkan core dari initial — yang benar-benar menghemat 21,4 KB di `/` adalah lazy landing (ikon 16,58 KB + chunk bagian bawah fold).

Dampak: budget tetap lulus (166,82 KB), tapi angka "sesudah" dipakai untuk membenarkan sebab yang salah, dan masih ada peluang ~11,6 KB gzip (core + skema DB) di semua rute publik. **Bukan bug produk**; perbaiki teks laporan + pertimbangkan lazy plugin pomodoro (keputusan developer, bukan QA).

### F2 — Medium (budget performa): LCP `/login` 2,6–3,0 s > budget 2,5 s

`apps/web/.claude/rules/performance.md:9` menetapkan LCP ≤2,5 s. Ukur QA: 2,6 / 2,7 / 3,0 / 3,0 / 3,0 / 3,0 s (6 run) — perbaikan nyata dari 3,8 s, tapi belum di dalam budget di mesin ini. `/` tetap 3,5 s (di luar scope T66, tidak berubah). Skor Lighthouse dan CLS lulus AC task. Tindak lanjut: ulang di staging/CrUX (rule menyebut p75 4G), jangan tutup topik "LCP /login" hanya dari angka lab developer.

### F3 — Low (kerapian/robustness): konflik `.mascot` belum benar-benar hilang

Klaim "tidak ada dua aturan yang berebut properti yang sama" (`reports/perf-t66-web.md` §1 butir 1) hanya benar untuk **wrapper**. Ukur `getComputedStyle`:

- `apps/web/app/components/features/auth/AuthBrandPanel.vue:59` `.mascot { position:absolute; right:20px; bottom:16px }` **masih mengenai** root `<Mascot>` di dalamnya, karena root komponen anak mewarisi scope id parent → elemen `span.mascot` itu juga cocok dengan `apps/web/app/components/ui/MascotCanvas/index.vue:39` `.mascot { position:relative }`. Spesifisitas sama (0,2,0); pemenang = urutan stylesheet. Hari ini `relative` menang (stabil DCL→4 s, CLS 0), tapi mekanismenya masih order-dependent — persis kelas bug yang dulu memicu CLS 0,233.
- Efek samping terukur: `span.mascot` mewarisi `right:20px;bottom:16px` dari aturan panel sehingga tergambar **27 px ke kiri dan 19 px ke atas** dari sudut wrapper yang dimaksud ((321,175) vs (294,156)).
- Pola sama masih ada di landing: `apps/web/app/components/features/landing/LandingSteps.vue:38` `.mascot { position:absolute; top:-44px }` vs `MascotCanvas` `relative` → terukur `position:relative`; maskot jadi flex item di dalam `section#cara` (y 3235, section y 3254), bukan melayang di kanan-atas seperti CSS-nya. Pre-existing, stabil, tanpa CLS, tapi kemungkinan bukan tampilan yang dimaksud desain.

CLS **tidak** teregresi (0 di semua run) → tidak blocking. Saran: beri kelas berbeda untuk slot (`mascot-slot`) atau naikkan spesifisitas (`.panel > .mascot`) supaya tidak ada dua aturan `position` pada elemen yang sama.

### F4 — Low (test gap): tidak ada test untuk cookie forwarding SSR

`apps/web/app/composables/auth/http-gateway.ts:193` adalah perubahan yang menahan risiko "user login nyangkut di form" — dan satu-satunya yang menguji perilakunya adalah test yang ada sekarang: `apps/web/app/theme-loading.qa.test.ts:77` hanya memeriksa flag `routeRules['/login'].ssr === true`. Tidak ada test yang memastikan `useRequestFetch` (bukan `$fetch`) dipakai, dan tidak ada test yang memastikan `/login` me-redirect user bersesi. Saya buktikan manual (§3). Saran: test regresi kecil (mock `useRequestFetch`, assert gateway memakainya) supaya perbaikan ini tidak bisa diam-diam dikembalikan.

### F5 — Low (kerapian): komentar test menunjuk config yang sudah tidak ada

`apps/web/app/utils/bundle-budget.test.ts:81` (dan `:97`) menulis "Pemisahan chunk ada di `nuxt.config.ts` (`advancedChunks`)" — config sekarang memakai `vite.build.rolldownOptions.output.codeSplitting.groups` (`apps/web/nuxt.config.ts:481-493`). Tidak ada `advancedChunks` di repo. Komentar menyesatkan reviewer berikutnya.

### F6 — Low (cache hygiene): `/login` SSR tanpa `Cache-Control`/`Vary`

Respons `/login` (200 maupun 302) tidak membawa `Cache-Control`, `Vary`, atau `ETag`. HTML-nya sekarang **mengandung keputusan guard per user** (302 ke `/app` vs form). Uji: setelah sekali dikunjungi, HTML `/login` bisa dilayani dari cache browser (pada uji offline dengan SW di-kill, konten form muncul dari cache HTTP, bukan `/offline`). SW sudah benar (`NetworkOnly` + fallback), cache Nitro juga tidak ada — tapi lapisan cache di depan (CDN/reverse proxy/perangkat) belum dicegah oleh kode. Saran (bukan blocker AC): set `Cache-Control: private, no-store` (atau minimal `Vary: Cookie`) untuk `/login`.

### Observasi di luar scope (bukan temuan T66)

`Host: [::1` (malformed) membuat **semua** respons hang >10 s — direproduksi di `/`, `/app`, `/offline`, `/v1/auth/session`, `/login`, jadi perilaku level Nitro/h3, bukan akibat perubahan T66. Tidak dijadikan temuan; perlu tiket sendiri kalau dianggap risiko DoS.

---

## 5. Tiga pilar & batasan verifikasi

- **Keamanan.** Tidak ada primitif auth/kripto yang berubah; SRI skrip/CSS utuh (32/32 hash benar), SRI font yang salah hilang dan tidak ada unduhan font ganda; CSP nonce+`strict-dynamic` tetap, tanpa `'unsafe-eval'`; guard SSR membaca cookie request (dibuktikan dengan sesi nyata), fail-closed pada cookie palsu; payload SSR tanpa PII; `/login` tidak masuk cache SW. Catatan F6 (header cache) dan F4 (test gap) terbuka.
- **Performa.** JS awal semua rute di bawah 170 KB, chunk tunggal >100 KB hanya libsodium (pengecualian terdokumentasi, tidak di initial), CLS 0, TTFB dokumen 10 ms. LCP lab masih 2,6–3,0 s (F2) dan ada 11,6 KB core/DB yang masih bisa dipindah (F1).
- **Kerapian.** `vitest run` 177/1370 hijau, `nuxt typecheck` EXIT=0, `eslint --max-warnings 0` EXIT=0 (13 berkas T66), `prettier --check` OK (13 berkas). F3/F5 sisa kebersihan. `ARCHITECTURE.md` gagal `prettier --check` **sudah sejak HEAD** (tabel markdown), bukan akibat perubahan ini; markdown tidak masuk scope format yang dijalankan CI.

**Batasan jujur:** (a) build produksi meng-compile-out warning hydration Vue, jadi "0 hydration warning" hanya bisa disimpulkan tidak langsung (posisi DOM identik DCL→4 s, CLS 0, tanpa exception) — bukan dari log warning; (b) Lighthouse = lab, 6 run, tidak mewakili CrUX; (c) mesin QA menjalankan build/test agent lain di tree yang sama; angka absolut bisa bergeser sedikit di mesin lain; (d) klaim "sebelum" (188,19 / 166,11 / 166,11 KB, LCP 3,8 s) tidak saya reproduksi — tidak ada build lama, jadi hanya angka "sesudah" yang diverifikasi.

---

## 6. Perintah & hasil (verbatim)

```bash
cd apps/web && NODE_ENV=development pnpm build
#  ...
#  Σ Total size: 8.22 MB (2.21 MB gzip)
#  [nitro] ✔ You can preview this build using node .output/server/index.mjs
#  ✨ Build complete!
#  verify-precache OK: 12 entri precache semuanya bisa dilayani
#  EXIT=0

node scripts/verify-precache.mjs
#  verify-precache OK: 12 entri precache semuanya bisa dilayani
#  EXIT=0

node /tmp/opencode/qa66-measure.mjs        # server hasil build di 127.0.0.1:3822
#  {"route":"/","htmlRawBytes":50386,"htmlGzipBytes":10967,"initial":{"files":26,"gzipKB":166.82},"prefetch":{"files":27,"gzipKB":46.07},"payloadBytes":721,"cssWithIntegrity":5,"modulePreloadsWithIntegrity":26,"fontPreloads":2,"fontPreloadsWithIntegrity":0,"emptyHashInHtml":false}
#  {"route":"/login","htmlRawBytes":26249,"htmlGzipBytes":7950,"initial":{"files":29,"gzipKB":169.72},"prefetch":{"files":32,"gzipKB":65.23},"payloadBytes":720,"cssWithIntegrity":5,"modulePreloadsWithIntegrity":29,"fontPreloads":2,"fontPreloadsWithIntegrity":0,"emptyHashInHtml":false}
#  {"route":"/app","htmlRawBytes":9507,"htmlGzipBytes":3029,"initial":{"files":22,"gzipKB":164.36},"prefetch":{"files":25,"gzipKB":42.4},"payloadBytes":720,"cssWithIntegrity":1,"modulePreloadsWithIntegrity":22,"fontPreloads":2,"fontPreloadsWithIntegrity":0,"emptyHashInHtml":false}

# integritas SRI dihitung ulang dari isi berkas
node -e '<sha384 tiap tag integrity vs readFileSync>'
#  integrity checked: 32 ok: 32 bad: 0

# guard sesi SSR dengan sesi NYATA (DB test, OTP fix)
curl -s -X POST http://127.0.0.1:3824/v1/auth/otp/request -H 'content-type: application/json' \
  -d '{"email":"qa66-guard@example.test","client":"web","device":{"name":"Chrome QA","platform":"web"}}'
#  status=204
curl -s -c cookies.txt -X POST http://127.0.0.1:3824/v1/auth/otp/verify -H 'content-type: application/json' \
  -d '{"email":"qa66-guard@example.test","code":"777777","client":"web","device":{"name":"Chrome QA","platform":"web"}}'
#  {"data":{"user":{"id":"01a16987-…","email":"qa66-guard@example.test"},"device":{…},"expiresAt":"2026-11-22T16:10:36.373Z","client":"web"}}
#  status=200   (cookie HttpOnly ip_session)

curl -s -b cookies.txt -o /dev/null -D - http://127.0.0.1:3824/login | head -3
#  HTTP/1.1 302 Found
#  location: /app
curl -s -o /dev/null -w "status=%{http_code}\n" http://127.0.0.1:3824/login                 # 200 (form)
curl -s -H 'Cookie: ip_session=forged-invalid' -o forged.html -w "status=%{http_code}\n" …   # 200 + form login (fail-closed)

# Lighthouse mobile (6 run /login, 2 run /) — npx lighthouse@13.5.0 --only-categories=performance
#  /login: 0.90 (FCP 2.7 LCP 3.0 TBT 10 CLS 0) | 0.95 (2.3/2.6/30/0) | 0.91 (2.2/2.7/170/0)
#          0.90 (2.7/3.0/10/0) | 0.90 (2.7/3.0/30/0) | 0.91 (2.6/3.0/10/0)   360 KiB
#  /     : 0.90 (FCP 1.7 LCP 3.5 TBT 20 CLS 0) | 0.90 (1.7/3.5/10/0)        321 KiB
#  font requests di /login: 2 (19 KB + 39 KB) — tanpa duplikat

# PWA offline nyata (server dimatikan setelah SW install)
#  precache: /, /_i18n/…/messages.json, /_nuxt/builds/*, /_payload.json, favicon.svg, 3 ikon, manifest, /offline
#  caches.match('/login') -> null ; caches.match('/app') -> "app-shell"
#  offline /login -> title "Kamu sedang offline · Improve Personal" / h1 "Kamu sedang offline"
#  offline /app   -> shell app-shell, lalu guard klien menampilkan form login

# CDP (412×900): posisi & layout-shift
#  /login snapshot DCL=68ms, raf1, t300, t1500, t4000 identik:
#    panel relative 444×300 | div.mascot absolute (321,175) | span.mascot relative (294,156) | .form-side (23,323) 444×565
#  /       snapshot identik (mascot steps relative y=3235, section y=3254)
#  layout-shift entries: [] ; window.onerror: [] ; console: hanya 401 /v1/auth/session

# Suite & statik
pnpm --filter @improve-personal/web exec vitest run
#  Test Files  177 passed (177)
#     Tests  1370 passed (1370)      Duration 79.91s   EXIT=0

pnpm --filter @improve-personal/web exec nuxt typecheck
#  EXIT=0

cd apps/web && pnpm exec eslint nuxt.config.ts app/pages/index.vue app/components/features/landing/LandingHero.vue \
  app/components/features/auth/AuthBrandPanel.vue app/pages/login.vue app/app.vue app/layouts/dashboard.vue \
  app/composables/auth/http-gateway.ts server/plugins/50-font-preload-integrity.ts app/utils/bundle-budget.test.ts \
  app/pages/login.recovery.qa.test.ts app/layouts/dashboard.test.ts app/theme-loading.qa.test.ts --max-warnings 0
#  EXIT=0

pnpm exec prettier --check <13 berkas yang sama>
#  Checking formatting...
#  All matched files use Prettier code style!   EXIT=0
```

Catatan: jumlah test (177/1370) berbeda dari handoff (174/1351) karena working tree juga memuat perubahan agent lain; rerun saya hijau seluruhnya.

---

## 7. Rekomendasi (urut prioritas)

1. **Perbaiki teks laporan** `reports/perf-t66-web.md` §1 butir 5 + §3: core **tidak** keluar dari JS awal; sebutkan penyebab sebenarnya (plugin pomodoro) atau pindahkan pemuatan core/DB ke jalur ber-sesi (F1). Ini juga peluang ~11,6 KB gzip di semua rute.
2. **Ukur LCP `/login` di staging/CrUX** (F2). Kalau tetap >2,5 s, lanjutkan optimasi (mis. kurangi prefetch 65 KB di `/login`, tunda chunk recovery/OTP lebih agresif) sebelum menutup topik MAYOR-1.
3. **Rapikan konflik `.mascot`** dengan kelas slot terpisah + cek tampilan maskot `LandingSteps` terhadap desain (F3).
4. **Tambah test regresi** untuk `useRequestFetch` di gateway dan redirect `/login` saat sesi hidup (F4).
5. **Set `Cache-Control: private, no-store`** untuk `/login` (F6) dan perbaiki komentar `advancedChunks` (F5).
6. Pertimbangkan tiket terpisah untuk hang pada `Host` malformed (observasi §4) — bukan bagian T66.
