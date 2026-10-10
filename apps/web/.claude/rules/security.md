# Pilar Keamanan - apps/web (Nuxt 4)

Berlaku untuk semua kode di `apps/web`. Acuan: OWASP Top 10 / ASVS L2. Tiap aturan harus bisa dicek saat review.
Prinsip dasar: **client tidak pernah dipercaya**. UI boleh menyembunyikan, tapi server yang memutuskan.

## 1. runtimeConfig & secret

- WAJIB: secret (API key, DB URL, JWT secret, OAuth client secret) hanya di key private `runtimeConfig.<key>`, diisi lewat env `NUXT_<KEY>`.
- DILARANG: secret di `runtimeConfig.public`, `app.config.ts`, `NUXT_PUBLIC_*`, atau hardcode di `nuxt.config.ts` / kode.
- DILARANG: `import.meta.env` / `process.env` untuk secret di kode yang bisa jalan di client (`app/`, composable, plugin tanpa `.server`).
- WAJIB: akses secret hanya di `server/` lewat `useRuntimeConfig(event)`.
- WAJIB: `.env*` (kecuali `.env.example` tanpa nilai) masuk `.gitignore`.
- Cek review: grep bundle `.output/public` untuk `secret|token|key|password` setelah `nuxt build` - harus kosong dari nilai asli.

## 2. SSR payload & state

- DILARANG: memasukkan data sensitif (token, hash password, PII user lain, field internal) ke `useState`, `useFetch`/`useAsyncData` result, atau Pinia store yang di-hydrate - semuanya ter-serialize ke `window.__NUXT__`.
- WAJIB: server route mengembalikan DTO eksplisit (pilih field), bukan objek DB mentah (`return user` dilarang).
- WAJIB: pakai `pick`/`transform` di `useFetch` hanya untuk ukuran, bukan pengganti filter di server.
- DILARANG: cache SSR/ISR (`routeRules` `swr`/`isr`/`cache`) untuk halaman yang berisi data per-user.

## 3. Server routes (Nitro / `server/api`)

- WAJIB: tiap handler di `server/api` dan `server/routes` cek auth di awal (helper mis. `requireUserSession(event)`), kecuali yang terdaftar eksplisit sebagai publik.
- WAJIB: authz per-resource (cek kepemilikan / role) sebelum read/update/delete - cegah IDOR. `id` dari URL/body tidak pernah cukup.
- DILARANG: mengandalkan middleware `app/middleware` (route middleware client) sebagai satu-satunya proteksi.
- WAJIB: batasi method (`server/api/x.post.ts`, bukan `x.ts` yang menerima semua method) untuk aksi yang mengubah data.
- WAJIB: error ke client pakai `createError({ statusCode, statusMessage })` generik; DILARANG bocorkan stack trace, query SQL, atau pesan internal.

## 4. Validasi input

- WAJIB: semua input divalidasi schema (zod / Standard Schema): `readValidatedBody`, `getValidatedQuery`, `getValidatedRouterParams`.
- DILARANG: `readBody`/`getQuery` mentah lalu langsung dipakai ke DB, filesystem, `$fetch`, atau shell.
- WAJIB: schema `strict()` / buang field tak dikenal - cegah mass assignment (`role`, `isAdmin`, `userId` dari body).
- WAJIB: batasi panjang string, ukuran array, dan ukuran upload (cek MIME + magic bytes, nama file di-generate server).
- WAJIB: query DB pakai parameter/ORM; DILARANG string concatenation ke SQL.

## 5. XSS

- DILARANG: `v-html` dengan data dari user/API. Kalau tidak bisa dihindari: sanitasi di server dengan DOMPurify (isomorphic) + allowlist tag, dan beri komentar alasan.
- DILARANG: `innerHTML`, `eval`, `new Function`, `useHead({ script: [{ innerHTML: userData }] })`.
- WAJIB: URL dari user di `href`/`src`/`navigateTo` divalidasi skema (`https:` saja; tolak `javascript:`, `data:`).
- WAJIB: redirect setelah login hanya ke path relatif internal (allowlist) - cegah open redirect.

## 6. Header & CSP

- WAJIB: pasang modul `nuxt-security` (atau setara) dengan CSP berbasis nonce: `script-src 'strict-dynamic' 'nonce-{{nonce}}'`, `object-src 'none'`, `base-uri 'none'`, `frame-ancestors 'none'` (kecuali butuh embed).
- WAJIB: HSTS, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` atau lebih ketat, `Permissions-Policy` minimal.
- DILARANG: `'unsafe-eval'` di `script-src`; menambah domain ke CSP tanpa alasan tertulis.
- WAJIB: CORS server route `origin` allowlist eksplisit; DILARANG `*` bersama `credentials: true`.
- WAJIB: `hidePoweredBy` aktif.

## 7. Cookie & sesi

- WAJIB: cookie sesi/token `httpOnly: true`, `secure: true`, `sameSite: 'lax'` (atau `strict`), `path: '/'`, masa berlaku terbatas.
- DILARANG: token auth di `localStorage`/`sessionStorage` atau `useCookie` tanpa `httpOnly` (yang bisa dibaca JS).
- WAJIB: rotasi session ID setelah login/ganti privilege; invalidasi di server saat logout.
- WAJIB: session/JWT diverifikasi di server (signature, `exp`, `alg` di-pin, bukan `none`). Pakai sealed session (mis. `nuxt-auth-utils`) atau OIDC + PKCE.
- WAJIB: password di-hash Argon2id/bcrypt; DILARANG simpan/log password plaintext.

## 8. CSRF

- WAJIB: endpoint yang mengubah state (POST/PUT/PATCH/DELETE) diproteksi CSRF kalau auth berbasis cookie: `security.csrf: true` (nuxt-csurf) atau cek `Origin`/`Sec-Fetch-Site` di server + `SameSite`.
- DILARANG: aksi mengubah data lewat GET.

## 9. Rate limit & abuse

- WAJIB: rate limit di server untuk login, register, reset password, OTP, dan endpoint mahal (mis. `nuxt-security` `rateLimiter` per-route) dengan storage bersama (Redis/unstorage) kalau multi-instance.
- WAJIB: `requestSizeLimiter` aktif; pesan error login generik (tidak membedakan "user tidak ada" vs "password salah").
- WAJIB: kalau di belakang proxy, IP diambil dari header proxy yang terpercaya saja.

## 10. SSRF & integrasi luar

- DILARANG: `$fetch(urlDariUser)` di server. Kalau perlu, allowlist host + tolak IP private/link-local/metadata (`169.254.169.254`).
- WAJIB: verifikasi signature webhook masuk (HMAC, timing-safe compare).

## 11. Logging & data pribadi

- DILARANG: log token, cookie, password, header `Authorization`, atau body lengkap berisi PII.
- WAJIB: `console.*` dibuang di build production (`removeLoggers`).
- WAJIB: minimisasi PII sesuai UU PDP - kumpulkan hanya yang dipakai, dokumentasikan field sensitif.

## 12. Dependency & supply chain

- WAJIB: lockfile di-commit; CI jalankan `npm audit --audit-level=high` (atau setara pnpm) - High/Critical = blocking.
- WAJIB: modul Nuxt pihak ketiga dicek maintainer & download sebelum ditambah; tidak ada script `postinstall` asing tanpa review.
- WAJIB: devtools (`devtools.enabled`) mati di production; sourcemap client tidak dipublikasi.

## Checklist review (PR yang menyentuh web)

- [ ] Tidak ada secret di `runtimeConfig.public` / kode client / bundle.
- [ ] Tiap server route baru: auth + authz per-resource + method terbatas.
- [ ] Semua input lewat `readValidated*` dengan schema strict.
- [ ] Response server berupa DTO; tidak ada data sensitif di payload SSR.
- [ ] Tidak ada `v-html`/`innerHTML` dengan data tak tersanitasi; URL & redirect divalidasi.
- [ ] Cookie auth `httpOnly`+`secure`+`sameSite`; CSRF aktif untuk aksi mutasi.
- [ ] Endpoint sensitif punya rate limit; error tidak membocorkan detail internal.
- [ ] Tidak ada log berisi token/PII; `npm audit` bersih dari High/Critical.
