# Audit Keamanan Backend — Improve Personal (`apps/web/server/**`)

Auditor: Arif (Security Engineer) · Lingkup: backend Nitro/H3 + Postgres di dalam `apps/web`, kontrak `packages/contracts`, konfigurasi build/env/supply chain.
Metode: pembacaan kode + konfigurasi (static audit), `pnpm audit`, probe aturan eslint lewat `--stdin` (tanpa mengubah berkas proyek). Tidak ada pengujian terhadap sistem hidup, tidak ada scanning eksternal, tidak ada perubahan kode produk.

---

## 1. Pertanyaan terbuka (dengan opsi + rekomendasi + asumsi default)

Daftar ini harus dijawab sebelum implementasi perbaikan, karena beberapa keputusan mengubah bentuk perbaikan.

**Q1 — Topologi deployment: apakah server berada di belakang reverse proxy (Dokploy/Nginx/Cloudflare)?**
Opsi: (a) langsung terekspos ke internet, (b) 1 hop proxy, (c) ≥2 hop.
Rekomendasi: (b) — set `NUXT_TRUSTED_PROXY_HOPS=1` **dan** pasang `client_max_body_size` di proxy (pertahanan berlapis untuk temuan H1).
Asumsi default bila tidak dijawab: tetap `hops=0` (fail-closed terhadap spoof IP) dan perbaikan H1 dikerjakan di sisi aplikasi saja. **Catatan: tanpa perbaikan H1, aplikasi tidak punya batas ukuran body yang efektif.**

**Q2 — Apakah production host dijamin ber-`NUXT_APP_ENV=production`?**
Opsi: (a) dijamin oleh secret manager/template (tidak ada mekanisme teknis), (b) tambahkan cross-check teknis.
Rekomendasi: (b) — tolak start bila `NODE_ENV=production` sedangkan mode OTP fix aktif (temuan M3), karena AC T19 menuntut deploy production gagal, bukan hanya "nama env OTP-fix ditolak".
Asumsi default: (b) diterapkan.

**Q3 — Status endpoint `POST /v1/account/deletion-otp` (tidak ada di `packages/contracts/src/protocol.ts` dan ARCHITECTURE §9)?**
Opsi: (a) resmikan di kontrak + dokumen, (b) ganti alur hapus akun agar memakai endpoint yang sudah ada (tidak ada kandidat).
Rekomendasi: (a) — resmikan sekaligus beri rate limit per user.
Asumsi default: endpoint diperlakukan resmi.

**Q4 — Apakah ada jalur (mobile) yang pernah menerima/ memvalidasi `id_token` di klien?**
Opsi: (a) token hanya ditukar server-side (kondisi sekarang), (b) klien pernah mengirim `id_token` ke server/token disimpan di klien.
Rekomendasi: (a) dipertahankan; bila (b) nanti ada, verifikasi tanda tangan ID token wajib ditambah (`jose`/`google-auth-library`) — kalau tidak, decode tanpa verifikasi jadi High.
Asumsi default: (a) — risiko L3 ditahan dan didokumentasikan.

**Q5 — Apakah ada kuota penyimpanan per user?**
Opsi: (a) tidak ada kuota (kondisi sekarang), (b) ada kuota bytes/record.
Rekomendasi: (b) — kuota (mis. 2 GB atau 200k record) + metrik/alarm pertumbuhan `records`.
Asumsi default: (a) — maka perbaikan H2 wajib mencakup batas per respons **dan** pertimbangan kuota.

**Q6 — Rate limit untuk `GET /v1/sync/pull`?**
Opsi: (a) tanpa limiter (kondisi sekarang, dengan alasan "jangan menghukum perangkat yang baru bangun dari offline"), (b) limiter longgar per user (mis. 600/jam).
Rekomendasi: (b) **setelah** batas byte per halaman (H2) terpasang — batas byte yang menutup DoS, limiter hanya mengurangi penyalahgunaan egress.
Asumsi default: batas byte dulu, limiter menyusul.

**Q7 — Apakah `pnpm audit --audit-level=high` sudah jadi gate CI (ARCHITECTURE §13 poin 6)?**
Rekomendasi: ya + `pnpm.overrides` untuk paket yang bisa dinaikkan (`simple-git ≥ 3.36.1`, `braces`, `node-forge`, `esbuild`).
Asumsi default: gate belum ada → perlakukan temuan H3 sebagai blocking rilis production publik.

**Q8 — Sumber kebenaran bentuk endpoint transfer kunci klaim: `POST /v1/keys/transfer/:id` (kode) atau `GET` (dokumen/`protocol.ts`)?**
Rekomendasi: POST (kode), lalu perbaiki `protocol.ts` + ARCHITECTURE §9.
Asumsi default: POST.

**Q9 — Ganti nama cookie sesi jadi `__Host-ip_session` (hardening)?**
Opsi: (a) langsung, (b) dual-read satu rilis.
Rekomendasi: (b) — non-blocking, lakukan di rilis yang punya window deploy.
Asumsi default: ditunda; dicatat sebagai hardening.

---

## 2. Ringkasan risiko & verdict

**Verdict: AMAN DENGAN CATATAN — blocking untuk production publik sampai H1–H3 ditangani.**

Yang **tidak** ditemukan (dan diverifikasi positif):
- Tidak ada endpoint tanpa cek auth (semua 12 endpoint non-publik memanggil `requireSession` di baris pertama; `/health`, `/v1/auth/*` memang publik dan didokumentasikan sebagai publik).
- `user_id` **selalu** dari sesi; tidak ada satu pun service yang menerima `userId` dari body/query/param. Authz per-resource (devices, envelopes, transfer, sync, account delete) terbukti ter-scope kepemilikan.
- Invariant zero-knowledge terbukti dari kode, bukan asumsi: `apps/web/server/**` **tidak** mengimpor `@improve-personal/core`/`crypto` (aturan eslint-nya benar-benar berlaku — diuji), tidak ada satu pun pemanggilan dekripsi/nacl/sodium/argon2 di `server/**`, dan skema DB hanya punya tabel relay (`records` = `blob` ciphertext + metadata; tidak ada kolom `type`/`title`/`content`, tidak ada tabel per-entitas, `key_slot` enum = `['passkey']`).
- Tidak ada secret di repo (grep pola kredensial → nol), tidak ada secret di `runtimeConfig.public`, `.env*` ditutup `.gitignore` dengan pengecualian `.env.example`.
- OTP: pemakaian kode atomik, kode & email hanya sebagai HMAC, kode tidak pernah di-log, respons minta kode selalu `204` tanpa oracle email terdaftar, mode fix hanya turunan `APP_ENV` (tidak ada header/query/flag).
- Sesi: token opaque 256-bit, hanya hash yang disimpan, revoke instan per perangkat, idle 30 hari + absolut 180 hari, `last_used_at` di-throttle 5 menit, cookie `HttpOnly; Secure; SameSite=Lax`.
- Rate limit benar-benar di Postgres (`rate_limits`) dengan identifier HMAC + retensi 24 jam; limiter in-memory nuxt-security dimatikan (bukan "dinyalakan agar kelihatan ada").

Statistik temuan: **Critical 0 · High 3 · Medium 5 · Low 10**.

Ringkasan satu baris per temuan High:
- **H1** batas ukuran request hanya memeriksa header `Content-Length` → DoS tanpa autentikasi lewat `Transfer-Encoding: chunked`.
- **H2** `pull` bisa mengembalikan ~500 MB dalam satu respons tanpa batas byte/rate limit + tidak ada kuota penyimpanan per user → DoS memori/egress & abuse storage.
- **H3** `pnpm audit` gagal gate: 2 critical + 4 high (toolchain build/dev).

---

## 3. Threat model singkat

**Aset**
1. Ciphertext record user (`records.blob`) + metadata (`id`, `hlc`, `deleted`, `server_seq`) — kerahasiaan isi bergantung pada E2EE di klien, tapi metadata adalah data pribadi (pola aktivitas, ukuran, waktu).
2. Kunci: envelope `passkey` (`key_envelopes.wrapped_key`), relay transfer kunci (`key_transfers.blob`) — bila `key_transfers.id` + sesi perangkat target dikuasai penyerang, MK bisa dicuri.
3. Sesi & token (opaque), device id, dan daftar perangkat.
4. Email user (PII) — di DB hanya sebagai HMAC di `otp_challenges`, tapi disimpan polos di `users.email`.
5. Keberadaan & ketersediaan layanan (satu proses Node melayani UI + API; tidak ada app server terpisah — ADR 7 revisi).
6. Supply chain (dependensi build & runtime).

**Aktor**
- Penyerang tanpa akun (internet): menyerang `/health`, `/v1/auth/otp/request`, `/v1/auth/otp/verify`, `/v1/auth/google/*`; mencoba enumerasi email, brute force OTP, DoS memori.
- User terautentikasi jahat (gratis, emailnya sendiri): abuse storage/egress, pencarian IDOR lintas user, pencarian oracle keberadaan resource.
- Penyerang yang mencuri token/sesi (perangkat hilang, XSS di masa depan, malware): butuh revoke instan, batas idle/absolut, dan revoke per device.
- Situs pihak ketiga di browser korban: CSRF ke endpoint berbasis cookie, login CSRF pada OAuth callback.
- Operator salah konfigurasi (peran besar di sini): `NUXT_APP_ENV` salah label, `trustedProxyHops` salah, proxy tanpa batas body.
- Aktor supply chain (dependensi build/dev dengan advisory RCE).

**Trust boundary**
1. Internet → Nitro (semua header & body tidak dipercaya; `Host`, `Origin`, `X-Forwarded-For`, `Content-Length` semuanya bisa dipalsukan/dihilangkan).
2. Nitro → Postgres (parameterized via drizzle; tidak ada string concatenation SQL selain `nextval()` konstan).
3. Server ↔ Google (TLS keluar; response token endpoint diperlakukan terpercaya → dasar keputusan "tidak verifikasi tanda tangan ID token").
4. Server ↔ Resend (host endpoint dikunci di kode; tidak ada SSRF).
5. **Batas yang paling penting secara produk:** server ↔ kunci user. Server hanya menyimpan wrap; kemampuan dekripsi harus nol (diverifikasi).

---

## 4. Temuan (urut severity)

### H1 — Batas ukuran request hanya memeriksa header `Content-Length` → DoS tanpa autentikasi (body tak terbatas)

- **Severity:** High
- **Lokasi:** `apps/web/nuxt.config.ts:166-169` (config `requestSizeLimiter`, konstanta `:14`); implementasi efektif di `apps/web/node_modules/nuxt-security/dist/runtime/server/middleware/requestSizeLimiter.js:17-31` (hanya `getRequestHeader(event,'content-length')`, dan hanya untuk `POST/PUT/DELETE`); jalur parse body: `apps/web/server/routes/v1/auth/otp/request.post.ts:22`, `apps/web/server/routes/v1/sync/push.post.ts:32`, `apps/web/server/utils/api-error.ts:95-109`.
- **Bukti:** tidak ada batas body lain di proyek — grep untuk `maxRequestBodySize`/`bodyLimit`/`content-length` hanya menemukan komentar di `api-response.ts`; tidak ada test 413 sama sekali (`grep 413|PAYLOAD_TOO_LARGE apps/web/server/tests/*.ts` → kosong).
- **Dampak:** permintaan dengan `Transfer-Encoding: chunked` (tanpa `Content-Length`) melewati pemeriksaan `parseInt(contentLengthValue) >= requestLimit` (perhatikan: `parseInt(undefined)` = `NaN`, `NaN >= n` = `false`). Body lalu dibaca utuh oleh `readValidatedBody` → alokasi memori tanpa batas sebelum validasi/rate limit berjalan. Satu proses Node melayani UI **dan** API; OOM = seluruh layanan mati (bukan hanya endpoint itu). Endpoint OTP `request` dan `google/callback` **tidak butuh autentikasi**, jadi penyerang tidak perlu akun apa pun.
- **Skenario eksploit (konkret):**
  1. `curl -X POST https://<host>/v1/auth/otp/request -H 'Transfer-Encoding: chunked' -H 'Content-Type: application/json' --data-binary @/dev/zero` (atau generator chunk 50 MB+ yang membuang header `Content-Length`).
  2. Ulangi 10–20 kali paralel → proses Nitro kehabisan RAM/crash; container restart-loop; seluruh user (web + mobile) tidak bisa login/sync.
  3. Variasi tanpa autentikasi di `/v1/auth/google/callback` dan `/v1/auth/otp/verify` sama-sama tidak di-rate-limit sebelum body diparse.
- **Catatan tambahan:** `PATCH` bahkan tidak diperiksa oleh limiter; dan keputusan "plafon 8 MB" di `nuxt.config.ts:9-14` (vs kontrak 500 × 1 MB) sudah didokumentasikan sebagai trade-off, tapi akibatnya batch >8 MB yang **sah menurut kontrak** ditolak server — mismatch kontrak/limiter yang perlu diselaraskan (lihat juga L7).
- **Perbaikan spesifik & minimal:**
  1. Tambah middleware server `apps/web/server/middleware/15-body-limit.ts` sebelum handler mana pun: hitung byte dari `event.node.req` saat streaming (`req.on('data')` / `req.on('end')`), bila melewati `REQUEST_SIZE_LIMIT_BYTES` → `req.destroy()` + `sendApiProblem(event, apiProblem('PAYLOAD_TOO_LARGE'))`. Ini menutup jalur chunked dan tidak bergantung header.
  2. Tambahkan juga penolakan berbasis header (lebih murah) + tolak `Transfer-Encoding: chunked` pada endpoint JSON API sebagai kebijakan, atau set `nitro.routeRules`/plugin untuk memaksa `content-length` ada.
  3. Pertahanan berlapis di edge: `client_max_body_size 8m` (Nginx) / limit body Cloudflare.
  4. Selaraskan kontrak: turunkan `SYNC_MAX_BATCH` efektif atau naikkan plafon server, dan tulis eksplisit "batch dibatasi per byte".
- **Verifikasi perbaikan:** (a) test HTTP baru: POST chunked 20 MB ke `/v1/auth/otp/request` → `413 PAYLOAD_TOO_LARGE`, memori proses flat; (b) POST `Content-Length: 9 MB` → 413 (regresi limiter lama); (c) test negatif: batch 7,9 MB sah tetap `200`.

### H2 — `sync/pull` tanpa batas byte per respons & tanpa rate limit → DoS memori/egress, plus tidak ada kuota penyimpanan

- **Severity:** High
- **Lokasi:** `apps/web/server/services/sync.ts:198-223` (`pullRecords`, `limit(query.limit)` tanpa batas byte); `apps/web/server/routes/v1/sync/pull.get.ts:7-27` (komentar eksplisit "tidak ada rate limit khusus"); konstanta: `packages/contracts/src/sync.ts:36` (`SYNC_MAX_PULL_LIMIT = 500`), `:42` (default 200), `:53` (`SEALED_RECORD_MAX_BLOB_BYTES = 1 MB`); jalur tulis tanpa kuota: `apps/web/server/services/sync.ts:58-140` + `apps/web/server/routes/v1/sync/push.post.ts:30` (limiter hanya per menit).
- **Dampak:** satu request `GET /v1/sync/pull?cursor=0&limit=500` milik satu user bisa memuat 500 baris × 1 MB = ~500 MB ciphertext, lalu diserialisasi base64 + JSON (~670 MB string) **di dalam memori proses** sebelum dikirim. Bisa diulang setiap saat oleh user terautentikasi mana pun (registrasi gratis lewat OTP). Tidak ada kuota per user pada `records`, jadi biaya storage/egress tidak terbatas: push 8 MB/request × 120 request/menit = ~960 MB/menit per akun.
- **Skenario eksploit (konkret):**
  1. Attacker login (OTP miliknya sendiri, gratis).
  2. Push 500 record × 1 MB blob acak (63 request × 8 MB, di bawah jatah 120/menit `sync:push`).
  3. Loop: `GET /v1/sync/pull?cursor=0&limit=500` paralel (mis. 5 koneksi) → tiap request mengalokasikan ratusan MB → OOM/GC thrash → seluruh layanan turun; biaya egress membengkak.
  Variasi lebih ringan: tanpa data besar pun, `cursor=0&limit=500` pada akun dengan banyak record kecil dipanggil berulang → CPU + bandwidth gratis tanpa limiter.
- **Perbaikan spesifik & minimal:**
  1. Di `pullRecords`, ganti `limit(query.limit)` dengan pengambilan berurutan yang dipotong berdasarkan akumulasi byte (mis. `SYNC_MAX_PULL_BYTES = 4 MB`): ambil baris (`LIMIT query.limit` seperti sekarang), akumulasi `blob.byteLength`, hentikan halaman pada baris terakhir yang masih di bawah plafon; `nextCursor` = `serverSeq` baris terakhir yang disertakan. Semantik "halaman kosong mengembalikan cursor kiriman" tetap dipertahankan.
  2. Tambah scope rate limit `sync:pull` (per user, jatah longgar, mis. 600/jam) — setelah (1) terpasang.
  3. Pertimbangkan kuota bytes/record per user + alarm pertumbuhan tabel `records` (Q5).
- **Verifikasi perbaikan:** test service baru: seed 20 record × 1 MB, panggil `pullRecords` → total byte respons ≤ plafon, `nextCursor` = `serverSeq` baris terakhir yang dikirim, dan halaman berikutnya melanjutkan tanpa melewatkan record (assert union semua halaman = seluruh record, urut). Plus test HTTP: `pull` berulang melewati jatah → `429`.

### H3 — Supply chain: `pnpm audit` tidak bersih (2 critical + 4 high)

- **Severity:** High (sesuai gate `apps/web/.claude/rules/security.md` §12 dan `ARCHITECTURE.md` §13 poin 6: High/Critical = blocking). Dampak runtime production: **rendah**, seluruh jalur advisory ada di toolchain build/dev.
- **Lokasi:** root `pnpm-lock.yaml`; jalur dependensi dari `apps/web/package.json:28-29` (`nuxt@4.5.2`).
- **Bukti (output `pnpm audit --audit-level=low` dari root, apa adanya):** `8 vulnerabilities found — Severity: 1 low | 1 moderate | 4 high | 2 critical`:
  | Sev | Paket | Jalur | Advisory |
  |---|---|---|---|
  | critical | `simple-git` (via `@simple-git/argv-parser`) | `apps__web>nuxt>@nuxt/devtools>simple-git` | `VISUAL` env → eksekusi perintah (GHSA-v5rq-49vh-5v5c) |
  | critical | `simple-git` | `apps__web>nuxt>@nuxt/devtools>simple-git` | guard unsafe-operation tidak memblokir (GHSA-x6jw-m9v5-85vh) |
  | high | `node-forge` | `apps__web>nuxt>@nuxt/cli>listhen>node-forge` | verifikasi tanda tangan RSA PKCS#1 v1.5 (GHSA-86w9-cpqp-85rv) |
  | high | `braces` | `apps__web>@nuxtjs/i18n>@intlify/unplugin-vue-*` | stack exhaustion (GHSA-vfj7-8cjw-p6xm) |
  | high | `simple-git` | `apps__web>nuxt>@nuxt/devtools>simple-git` | RCE via git config (GHSA-g4wm-2vf7-vfgr) |
  | high | `simple-git` | `apps__web>nuxt>@nuxt/devtools>simple-git` | bypass unsafe-operations via long-option (GHSA-858h-whjf-mvg5) |
  | moderate | `esbuild` | `apps__web>drizzle-kit>@esbuild-kit/esm-*` | dev server menerima request lintas situs (GHSA-67mh-4wv8-2f99) |
  | low | `esbuild` | `apps__web>@nuxt/fonts>fontless>esbuild` | arbitrary file read (GHSA-g7r4-m6w7-qqqr) |
- **Dampak nyata:** `simple-git` hanya terpakai lewat `@nuxt/devtools` (dimatikan di production oleh `$production.devtools.enabled=false`, `nuxt.config.ts:178-180`), jadi eksploitasi butuh mesin dev/CI yang menjalankan devtools terhadap repo yang bisa dikendalikan penyerang (mis. PR dari fork + `git` config berbahaya). Yang tetap relevan: gate CI resmi proyek akan gagal, dan `@nuxt/devtools` tetap terpasang di `node_modules` produksi.
- **Perbaikan spesifik & minimal:**
  1. `pnpm.overrides` di root `package.json`: `simple-git` ≥ 3.36.1, `node-forge` ke versi patched, `braces` ≥ 3.0.3, `esbuild` ≥ 0.25.x (atau versi patched yang tercantum), lalu `pnpm install` + commit lockfile.
  2. Tambah job CI `pnpm audit --audit-level=high` (blocking) sesuai §12/§13.
  3. Review ulang: apakah `@nuxt/devtools` bisa dipindah ke `devDependencies` eksplisit dengan versi tetap (mengurangi permukaan produksi).
- **Verifikasi perbaikan:** `pnpm audit --audit-level=moderate` → "No known vulnerabilities found"; CI job ada dan bisa mem-blok PR (uji dengan PR dummy).

### M1 — Rate limit `account:delete` memakai identifier konstan → bucket **global** lintas semua user; `DELETE /v1/account` tanpa limiter

- **Severity:** Medium
- **Lokasi:** `apps/web/server/services/account.ts:44-54` (`consumeRateLimit(ctx, 'account:delete', 'delete-otp')`); definisi aturan `apps/web/server/services/rate-limit.ts:32` (`limit: 5, windowSeconds: 3600`) dan `:37-38` (scope ditandai sebagai user-scoped); `apps/web/server/routes/v1/account.delete.ts:23-25` (komentar mengakui limiter tidak dikonsumsi jalur delete).
- **Dampak:** karena identifier-nya literal `'delete-otp'`, bucket = `HMAC('delete-otp', pepper)` → **satu** penghitung untuk seluruh sistem. Setelah 5 permintaan OTP hapus akun per jam dari **siapa pun**, semua user lain menerima `429 RATE_LIMITED` saat mencoba menghapus akunnya sendiri — fitur yang berkaitan langsung dengan hak subjek data (UU PDP) bisa dilumpuhkan oleh satu akun. Sebaliknya, proteksi yang dimaksud (per user/akun) tidak ada. Jalur destruktifnya (`DELETE /v1/account`) tidak punya limiter sama sekali.
- **Skenario eksploit (konkret):** buat 1 akun → script 6× `POST /v1/account/deletion-otp` per jam (perlu sesi, jadi gratis) → semua user lain gagal meminta kode hapus akun (`429`), sambil terus mengulang tiap jam untuk mempertahankan blokir.
- **Perbaikan spesifik & minimal:** di `requestAccountDeletionOtp`, ganti identifier konstanta dengan `input.userId` (atau `input.email` yang sudah di-HMAC di dalam `consumeRateLimit`), mis. `consumeRateLimit(ctx, 'account:delete', input.userId)`. Tambahkan scope `account:delete:ip` untuk dimensi IP, dan konsumsi limiter juga di `deleteAccount` (atau di handler `account.delete.ts`) dengan identifier `userId`.
- **Verifikasi perbaikan:** test service: user A memakai 5 jatah → user B tetap bisa meminta kode (tidak 429); assert baris `rate_limits` bertambah dengan bucket berbeda per user (`rateLimitCount` di `tests/helpers/harness.ts`); test `DELETE /v1/account` melebihi jatah → 429.

### M2 — Login CSRF / session fixation pada callback Google: `state` tidak terikat ke user-agent

- **Severity:** Medium
- **Lokasi:** `apps/web/server/routes/v1/auth/google/start.get.ts:24-35` (tidak men-set cookie/binding apa pun, hanya mengembalikan URL/redirect); `apps/web/server/routes/v1/auth/google/callback.get.ts:26-43` (menerima `code`+`state` dari query, langsung menerbitkan cookie sesi); `apps/web/server/services/google.ts:167-192` (state dikonsumsi atomik, tapi tidak ada bukti keterikatan ke browser yang memulai flow).
- **Dampak:** penyerang bisa menyelesaikan flow atas nama **akun Google miliknya sendiri** dan membuat browser korban menyelesaikan callback dengan `code`+`state` itu; server menerbitkan sesi akun penyerang di browser korban. Korban tidak sadar sudah login ke akun orang lain → semua data yang korban tulis setelah itu (todo, jurnal, dst.) masuk ke akun penyerang, dan penyerang bisa membacanya, memodifikasi, bahkan menghapusnya. Ini juga memberi penyerang "korban yang mengisi data" tanpa perlu credential korban. `GET` tidak diperiksa middleware CSRF (`middleware/10-csrf.ts:33,59` hanya memeriksa POST/PUT/PATCH/DELETE), jadi jalur ini memang tidak tertutup.
- **Skenario eksploit (konkret):**
  1. Attacker buka `/v1/auth/google/start?client=web`, login Google sebagai dirinya, sampai Google mengirim `302` ke `/v1/auth/google/callback?code=…&state=…`; attacker **mem-blokir** request callback itu (devtools pause) dan menyalin URL-nya.
  2. Attacker mengirim URL itu ke korban sebagai tautan ("buka ini") atau sebagai `<img src>`/redirect dari halaman attacker.
  3. Korban membuka → state (milik penyerang) dikonsumsi, cookie `ip_session` akun penyerang ter-set di browser korban → semua aktivitas korban sesudahnya tersimpan di akun penyerang.
- **Perbaikan spesifik & minimal (pilih satu, rekomendasi: keduanya):**
  1. **Binding cookie:** di `/auth/google/start`, set cookie `ip_oauth_state` (`httpOnly`, `SameSite=Lax`, `Secure` mengikuti `setSessionCookie`, `maxAge` = TTL state, mis. 600 s) berisi hash state; di callback **wajib** cocok dengan `sha256(state)` (bandingkan timing-safe) dan hanya berlaku untuk `client=web`; bila tidak cocok/tidak ada → `OAUTH_INVALID` dan hapus cookie.
  2. **Fetch Metadata + rate limit:** di callback, tolak bila `Sec-Fetch-Site` ada dan bukan `same-origin`/`none`, dan tambahkan scope `google:callback:ip` (`RATE_LIMIT_RULES`).
  Tambahan minimal lain: jangan izinkan state dipakai lebih dari sekali (sudah ✓) dan jangan pernah menaruh token di redirect.
- **Verifikasi perbaikan:** test HTTP: (a) `/start` mengembalikan cookie binding; (b) callback dengan `state` valid **tanpa** cookie binding → `OAUTH_INVALID`; (c) dengan cookie cocok → sukses; (d) klien mobile (tanpa cookie) tetap mengikuti kontraknya sendiri (jalur terpisah) atau pakai binding non-cookie yang eksplisit.

### M3 — Mode OTP fix `777777` bisa hidup di deployment production yang salah label: tidak ada cross-check `NODE_ENV` (potensial)

- **Severity:** Medium (AC T19 terpenuhi **sebagian**)
- **Lokasi:** `apps/web/server/utils/env.ts:48-59` (`resolveAppEnv`, `isFixedOtpEnabled`), `:99-129` (`fixedOtpEnabled: appEnv !== 'production'`), `:170-184` (`assertNoFixedOtpOverride` hanya memeriksa **nama** env yang cocok `/(otp|pin)[._-]*(fix|fixed|bypass|mock|static|demo)/i`), `:234-243`; `apps/web/server/plugins/env.ts:38-63` (tidak memeriksa `NODE_ENV`, hanya `isTestRuntime()` untuk melewati kegagalan non-production); `apps/web/nuxt.config.ts:47-68`.
- **Dampak:** satu-satunya jalur yang bisa menyalakan `777777` adalah `NUXT_APP_ENV` bernilai salah satu dari `development|staging|test|preview`. Tidak ada mekanisme yang menolak start bila deployment *sebenarnya* production (mis. `NODE_ENV=production`, image container produksi) menjalankan `NUXT_APP_ENV=staging` — mis. typo di secret manager, template env yang di-copy dari `.env.example` (`NUXT_APP_ENV=development`, lihat `apps/web/.env.example:17`), atau CI yang salah memilih environment. Akibatnya: siapa pun bisa login sebagai email siapa pun dengan `777777` (sesi penuh; ciphertext tetap tidak terbaca server — jadi yang bocor adalah akses akun, metadata, dan kemampuan menghapus/mengisi akun, bukan plaintext).
- **Skenario eksploit (konkret, butuh misconfig):** operator men-deploy image production tetapi variabel `NUXT_APP_ENV` terisi `staging` (terwarisi dari template) → server start normal (plugin lolos karena env valid), `fixedOtpEnabled=true` → penyerang `POST /v1/auth/otp/request {email: korban}` lalu `POST /v1/auth/otp/verify {code:"777777"}` → sesi korban di tangan penyerang. Tidak ada satu log pun yang berbunyi "mode OTP fix aktif di production".
- **Yang mencegah terbuktinya di repo ini:** tidak ada berkas deployment/CI di repo yang menunjukkan nilai `NUXT_APP_ENV` produksi, jadi ini ketergantungan konfigurasi, bukan bug yang bisa dipicu dari internet.
- **Perbaikan spesifik & minimal:** di `assertServerEnvForStartup` (atau plugin startup), tambahkan pemeriksaan silang: bila `process.env.NODE_ENV === 'production'` (parameter `envNames` sudah tersedia sebagai jalur aman untuk membaca kehadiran env) **dan** env hasil resolve punya `fixedOtpEnabled === true` → `throw new FixedOtpOverrideError(['NODE_ENV=production + APP_ENV non-production (mode OTP fix dilarang di production)'])`. Tambahkan juga `console.warn` eksplisit di non-production saat mode fix aktif (agar terlihat di log deploy).
- **Verifikasi perbaikan:** unit test baru di `apps/web/server/tests/env.test.ts`: `assertServerEnvForStartup(configStaging, ['NODE_ENV'])` dengan `NODE_ENV=production` → throw; dengan `NODE_ENV=development` → lolos; dan test bahwa pesan error hanya memuat nama, bukan nilai.

### M4 — Endpoint mahal/tidak terlindungi tanpa rate limit (`keys/transfer` create & claim, `sync/pull`, `devices`, `google/callback`)

- **Severity:** Medium
- **Lokasi:** `apps/web/server/routes/v1/keys/transfer/index.post.ts:21-35` (tidak ada `consumeRateLimit`); `apps/web/server/routes/v1/keys/transfer/[id].post.ts:20-28`; `apps/web/server/routes/v1/sync/pull.get.ts:7-27`; `apps/web/server/routes/v1/devices/index.get.ts:13-19` & `devices/[id].delete.ts:18-28`; `apps/web/server/routes/v1/auth/google/callback.get.ts`; aturan yang tersedia hanya di `apps/web/server/services/rate-limit.ts:21-33`.
- **Dampak:** (a) `POST /v1/keys/transfer` bisa membuat baris `key_transfers` tanpa batas (tiap baris ≤ ~4 KB) — abuse storage + beban job cleanup; (b) `POST /v1/keys/transfer/:id` bisa dipanggil tanpa batas (brute force id 128-bit tidak praktis, tapi endpoint jadi gratis untuk hammering DB; juga jalur `claim` sukses hanya sekali, jadi biaya utamanya query); (c) `GET /v1/devices` dan `DELETE /v1/devices/:id` bebas spam (revoke berulang, tulis DB); (d) `sync/pull` dan `google/callback` bebas spam (lihat H2). Tidak ada indikasi bypass authz — murni penyalahgunaan volume.
- **Skenario eksploit (konkret):** dengan satu sesi sah, loop `POST /v1/keys/transfer` 10k× (100 MB baris + 10k baris yang harus dibersihkan job) sambil paralel `POST /v1/keys/transfer/<id-acak>` untuk membebani DB; tidak ada respons 429 sama sekali.
- **Perbaikan spesifik & minimal:** tambahkan scope di `RATE_LIMIT_RULES` (`keys:transfer-create` 30/jam, `keys:transfer-claim` 60/jam, `sync:pull` 600/jam, `devices:revoke` 60/jam, `google:callback:ip` 60/15 menit) + panggil `consumeRateLimit` di handler masing-masing (pola sudah ada di `keys/envelopes.put.ts:24` dan `sync/push.post.ts:30`).
- **Verifikasi perbaikan:** test HTTP per endpoint: request ke-`limit+1` → `429` + header `retry-after`; assert `rate_limits` bertambah untuk scope tersebut.

### M5 — `trustedProxyHops` default `0`: bila di belakang proxy tanpa konfigurasi, limit per-IP jadi **global** (potensial, deploy-dependent)

- **Severity:** Medium (potensial; butuh proxy di depan + env tidak diisi)
- **Lokasi:** `apps/web/server/utils/request-ip.ts:13-15,44-58`; `apps/web/server/utils/env.ts:90-97` (default `0`); konsumen: `apps/web/server/services/otp.ts:59` (`otp:ip` → `ip:${ctx.clientIp}`), `google.ts:67`, `rate-limit.ts:23-25` (20/15 menit per IP).
- **Dampak:** komentar kode menyatakan menyetel `hops` lebih rendah "hanya membuat IP tercatat kurang akurat". Konsekuensi yang tidak disebut: bila server di belakang proxy/CDN, IP klien = IP proxy → **semua** klien berbagi satu bucket `otp:ip` (20 permintaan / 15 menit untuk seluruh pengguna). Satu penyerang bisa menghabiskan jatah itu dan memblokir permintaan OTP semua orang (DoS yang mudah dan murah), sekaligus membuat limit per-IP tidak berguna sebagai pembatas penyalahgunaan.
- **Skenario eksploit (konkret):** 20 `POST /v1/auth/otp/request` paralel dari satu klien → selama 15 menit semua user lain menerima `429` saat minta OTP (login mustahil), sambil diulang tiap jendela.
- **Perbaikan spesifik & minimal:** (1) dokumentasikan + assert konfigurasi: bila `appEnv === 'production'` dan `trustedProxyHops === 0`, catat peringatan startup eksplisit ("server diasumsikan tidak di belakang proxy; limit per-IP akan global bila salah") — atau tambahkan healthcheck yang melaporkan nilai hop; (2) naikkan jatah `otp:ip` atau buat dimensi kedua (mis. kombinasi IP + fingerprint dari `User-Agent`/device) supaya satu sumber tidak bisa memblokir semua; (3) pastikan proxy menimpa `X-Forwarded-For` (hapus nilai dari klien) sebelum menaikkan `hops`.
- **Verifikasi perbaikan:** test: dengan `trustedProxyHops=1` dan dua nilai `X-Forwarded-For` berbeda → bucket `rate_limits` berbeda; tanpa hop → bucket sama (dokumentasi perilaku); manual: jalankan di staging dengan proxy + `hops=1`, cek IP tercatat = IP asli.

### L1 — CORS tidak diimplementasikan; `corsAllowedOrigins` adalah config mati (fail-closed)

- **Severity:** Low
- **Lokasi:** `apps/web/nuxt.config.ts:59` (`corsAllowedOrigins: ''`), `apps/web/server/utils/env.ts:66-83` (validasi + penolakan `*`), `apps/web/server/middleware/10-csrf.ts:27-30` (menyatakan CORS adalah layer terpisah "sudah disiapkan"); grep menunjukkan **tidak ada** kode yang membaca `corsAllowedOrigins` atau men-set header `Access-Control-Allow-*`.
- **Dampak:** aman hari ini (tanpa header CORS, browser memblokir pembacaan respons lintas origin). Tapi knob env menyesatkan: operator bisa mengisi allowlist dan mengira CORS aktif. Risiko masa depan: saat CORS ditambahkan, mudah keliru memasang `*` + `credentials: true`.
- **Perbaikan:** implementasikan handler CORS eksplisit (echo origin hanya bila ada di allowlist, `Vary: Origin`, tanpa `*` saat credentials) atau buang knob dari `runtimeConfig` + dokumentasikan "tidak ada CORS by design".
- **Verifikasi:** test HTTP dengan header `Origin` di luar allowlist → tidak ada `Access-Control-Allow-Origin`; origin di allowlist → header muncul dengan `Vary: Origin`.

### L2 — Cek same-origin CSRF memakai `Host` request, bukan origin kanonik

- **Severity:** Low
- **Lokasi:** `apps/web/server/middleware/10-csrf.ts:38-56` (`origin === getRequestURL(event).origin`).
- **Dampak:** `Host` berasal dari klien, jadi "origin kanonik" tidak dipatok. Dari browser, CSRF lintas situs tetap gagal (browser men-set `Origin` = origin penyerang, `Host` = host kita), dan cookie sesi tidak ikut dikirim pada request lintas situs (`SameSite=Lax`). Yang tersisa: skenario DNS rebinding + cookie ber-domain induk, atau klien non-browser yang memang bisa men-set kedua header — dampak praktis kecil karena auth tetap butuh cookie sah.
- **Perbaikan:** simpan origin kanonik di env (mis. `NUXT_PUBLIC_APP_ORIGIN`/`NUXT_CANONICAL_ORIGIN`) dan bandingkan `Origin` terhadap nilai itu (fallback ke `Host` hanya bila origin belum dikonfigurasi), atau periksa `Sec-Fetch-Site` saja untuk request berbasis cookie.
- **Verifikasi:** test: `Origin` sama dengan origin kanonik → lolos; `Origin = https://evil.test` dengan `Host` dipalsukan → 403.

### L3 — ID token Google tidak diverifikasi tanda tangannya (decode-only) — potensial

- **Severity:** Low (potensial, dimitigasi)
- **Lokasi:** `apps/web/server/services/google.ts:113-123` (`decodeIdTokenClaims` hanya `base64url`+`JSON.parse`), `:194-213` (token ditukar langsung ke `https://oauth2.googleapis.com/token` lewat TLS), `:23-27` (komentar menjelaskan keputusan ini).
- **Dampak:** klaim (`aud`/`iss`/`exp`/`nonce`/`email_verified`) divalidasi, tetapi tanda tangan tidak. Selama token hanya datang dari token endpoint Google lewat TLS, ini setara dengan praktik library resmi; menjadi **High** bila suatu saat `id_token` diterima dari klien (mobile) atau ada jalur lain yang tidak melalui exchange server-side.
- **Yang mencegah terbuktinya:** tidak ada kode penerimaan `id_token` dari klien di repo ini (grep: tidak ada endpoint/schema yang menerima `id_token`).
- **Perbaikan:** tambah `jose`/`google-auth-library` untuk verifikasi tanda tangan (JWKS Google) sekarang, atau (minimal) tambahkan guard kontrak + test yang **menolak** jalur `id_token` dari klien, plus komentar eksplisit di `protocol.ts`.
- **Verifikasi:** test unit: JWT dengan `alg: none` / tanda tangan palsu → ditolak (setelah verifikasi ditambahkan); test kontrak: tidak ada input schema yang punya field `id_token`.

### L4 — `scripts/task.ts` mencetak rantai error drizzle (memuat query + params) ke stderr cron

- **Severity:** Low
- **Lokasi:** `apps/web/scripts/task.ts:83-97` ("Cetak seluruh rantai `cause`… cuma query + params (bukan data user)").
- **Dampak:** untuk dua task saat ini parameternya hanya timestamp, jadi aman. Tapi ini **pola** yang akan membocorkan data user bila runner yang sama dipakai task baru yang menyentuh PII (drizzle membungkus pesan sebagai `Failed query: <sql> params: <params>`). Log cron biasanya dikirim ke agregator log pihak ketiga.
- **Perbaikan:** batasi output ke `error.name` + pesan yang di-redact (mis. buang bagian `params:` dengan regex), atau izinkan hanya daftar field yang di-whitelist; pertahankan `code`/`constraint` bila perlu.
- **Verifikasi:** test unit untuk fungsi redaksi (input berisi `params: ["budi@mail.com"]` → output tanpa nilai itu); jalankan task dengan error buatan → stderr bersih dari nilai.

### L5 — `logServerError` mencatat `path` (memuat id capability) dan `message` driver apa adanya

- **Severity:** Low
- **Lokasi:** `apps/web/server/utils/server-log.ts:20-35`; pemanggil: `apps/web/server/utils/api-error.ts:106`, `apps/web/server/plugins/error-log.ts:84`.
- **Dampak:** (a) path bisa memuat `keys/transfer/<id>` — id 128-bit itu adalah capability untuk menerima envelope MK (butuh sesi perangkat target juga, tapi tetap sensitif) dan `devices/<uuid>`; mencatatnya membuat log jadi daftar target bila log bocor/tim support membacanya. (b) `normalized.message` dari driver Postgres/Zod bisa memuat detail skema (nama constraint/tabel). Tidak ada token/OTP/cookie/email/blob yang tercatat — bagian ini sudah benar.
- **Perbaikan:** redact segmen path yang mirip id/acak (regex `[A-Za-z0-9_-]{16,}` → `<id>`), dan catat `name` + `code` + pesan yang dipotong/di-redact; korelasi tetap lewat `x-request-id` (`middleware/00-request-id.ts`).
- **Verifikasi:** test unit `summarize()` dengan path `/v1/keys/transfer/AbC…22char` → id tergantikan; pastikan pesan tidak memuat nilai secret.

### L6 — Cookie sesi tanpa prefix `__Host-`; `Secure` bergantung label `APP_ENV`, bukan fakta HTTPS

- **Severity:** Low
- **Lokasi:** `apps/web/server/utils/session-cookie.ts:19,44-51` (`secure: env.appEnv !== 'development'`).
- **Dampak:** bila `APP_ENV` salah label non-production pada host HTTPS nyata, cookie dikirim tanpa `Secure` (bisa menyentuh http). Prefix `__Host-` akan mengunci cookie ke host tanpa domain (mencegah subdomain cookie-tossing/pemalsuan dari subdomain yang diambil alih).
- **Perbaikan:** tentukan `secure` dari fakta request (`getRequestURL(event).protocol === 'https:'` atau `process.env.NODE_ENV === 'production'`) dan **selalu** `secure: true` di production; tambahkan prefix `__Host-` (lihat Q9 untuk migrasi).
- **Verifikasi:** test: `APP_ENV=staging` + request HTTPS → `Secure` ter-set; `APP_ENV=production` → `Secure` ter-set; nama cookie berubah + sesi lama invalid (uji migrasi).

### L7 — Detail kecil pada validasi/limitasi: `PATCH` tidak diperiksa limiter; increment percobaan OTP tidak atomik; mismatch kontrak vs plafon 8 MB

- **Severity:** Low
- **Lokasi:** `nuxt-security/.../requestSizeLimiter.js:17` (hanya `POST/PUT/DELETE`); `apps/web/server/services/otp.ts:130-139` (`attempts >= OTP_MAX_ATTEMPTS` dibaca lalu `sql\`attempts + 1\`` tanpa kunci/`consumed_at IS NULL`); `apps/web/nuxt.config.ts:9-14` vs `packages/contracts/src/sync.ts:33,53`.
- **Dampak:** (a) `PATCH` (belum dipakai proyek ini) tidak punya batas ukuran — kalau nanti ditambah, lubang H1 ikut terbuka lewat method itu; (b) dua verify paralel dengan kode salah bisa menaikkan `attempts` lebih dari `OTP_MAX_ATTEMPTS` (brute force tetap dibatasi `otp:verify` 10/15 menit, jadi tidak eksploitatif hari ini); (c) kontrak menyatakan 500 × 1 MB sah, server menolak >8 MB — klien harus membatasi per byte (didokumentasikan, tapi belum ada test yang menjaga konsistensi ini).
- **Perbaikan:** (a) perbaiki di perbaikan H1 (middleware byte-level menutup semua method), (b) `UPDATE ... SET attempts = attempts + 1 WHERE id = $1 AND consumed_at IS NULL AND attempts < OTP_MAX_ATTEMPTS` + invalidasi eksplisit saat melewati batas, (c) tambahkan test HTTP "batch sah ≤ 8 MB diterima / > 8 MB → 413" dan selaraskan angka kontrak.
- **Verifikasi:** test: dua verify paralel dengan kode salah → `attempts` tepat bertambah (bukan >5); test 413 (lihat H1).

### L8 — Ketidakselarasan dokumen/kontrak & berkas contoh env belum di-track (risiko auditabilitas)

- **Severity:** Low
- **Lokasi:** `packages/contracts/src/protocol.ts` dan `ARCHITECTURE.md` (§9, daftar endpoint) menulis `GET /v1/keys/transfer/:id`, sedangkan implementasi `apps/web/server/routes/v1/keys/transfer/[id].post.ts:8-13` memakai `POST`; endpoint `POST /v1/account/deletion-otp` (`apps/web/server/routes/v1/account/deletion-otp.post.ts:8-14`) tidak ada di daftar protokol; `apps/web/server/routes/v1/auth/google/start.get.ts:20-22` menyebut `googleStartResultSchema` "diusulkan" padahal sudah ada di `packages/contracts/src/auth.ts:127-139`; `.env.example` berstatus untracked (`git status`: `?? apps/web/.env.example`).
- **Dampak:** daftar endpoint adalah peta audit. Ketidakselarasan membuat endpoint "bayangan" yang tidak ikut direview saat aturan/limit ditambahkan, dan `git ls-files` tidak memuat contoh env (operator tidak punya rujukan nama variabel di checkout bersih → risiko salah label `APP_ENV`, lihat M3).
- **Perbaikan:** jadikan kode sebagai sumber kebenaran; perbarui `protocol.ts` + ARCHITECTURE §9 (termasuk `POST /v1/account/deletion-otp`), perbaiki komentar "diusulkan", dan `git add apps/web/.env.example`.
- **Verifikasi:** test kontrak/daftar endpoint yang membandingkan `PROTOCOL_ENDPOINTS` dengan nama berkas di `server/routes/v1/**` (gagal bila ada selisih); `git ls-files | grep .env.example` mengembalikan hasil.

### L9 — Tidak ada CHECK constraint DB untuk ukuran blob/envelope (pertahanan berlapis hilang)

- **Severity:** Low
- **Lokasi:** `apps/web/server/db/schema.ts:206-246` (`key_envelopes.wrapped_key`, `key_transfers.blob`), `:248-284` (`records.blob`); migrasi `migrations/0000_thick_lester.sql`.
- **Dampak:** batas 4 KB / 1 MB hari ini hanya ditegakkan di schema kontrak + service (`services/keys.ts:60-100,140-147`, `services/sync.ts:90-91`). Jalur kode baru (task, migrasi data, admin script) bisa menulis blob raksasa tanpa hambatan DB, langsung menambah risiko H2.
- **Perbaikan:** migrasi `003x_blob_checks.sql`: `ALTER TABLE records ADD CONSTRAINT ck_records_blob_max CHECK (octet_length(blob) <= 1048576);` (idem `key_envelopes.wrapped_key <= 4096`, `key_transfers.blob <= 4096`).
- **Verifikasi:** test service: insert blob > batas → error constraint (bukan diam-diam tersimpan).

### L10 — `console.*` di bundle production & header keamanan belum bisa diverifikasi (lihat §7)

- **Severity:** Low (belum terbukti; lihat bagian 7 untuk batas lingkungan)
- **Lokasi:** `apps/web/nuxt.config.ts:170-183` (`removeLoggers: false`, `$production.vite.build.rolldownOptions.output.minify.compress.dropConsole: true`), `:125-174` (konfigurasi `security`).
- **Dampak:** pembuangan `console.*` klien bersandar pada opsi minifier `rolldownOptions` yang **tidak dapat diverifikasi** di environment ini (Vite/rolldown tidak terpasang). Bila opsi itu diabaikan versi toolchain yang dipakai, `console.*` klien (dan nilai yang kebetulan tercetak di dalamnya) tetap ada di bundle production — melanggar `security.md` §11/§12. Sisi server tetap aman: hanya dua lokasi `console.*` (`plugins/env.ts:62` nama variabel, `utils/server-log.ts:34` tanpa PII) dan bundle Nitro tidak diproses opsi Vite klien.
- **Perbaikan:** verifikasi dengan `pnpm --filter @improve-personal/web build` lalu `grep -r "console\." .output/public/_nuxt/*.js` (harus kosong dari console milik kode kita) dan `grep -riE "pepper|client_secret|resend|database_url" .output/public` (harus kosong); bila opsi tidak berlaku, aktifkan minifier yang benar (mis. `vite.build.minify: 'oxc'`/`esbuild` + `dropConsole`) dan tambahkan langkah verifikasi ke CI; pertimbangkan kembali `removeLoggers` bawaan nuxt-security.
- **Verifikasi:** langkah CI di atas, plus test yang memastikan `runtimeConfig.public` hanya memuat `appEnv` (`nuxt.config.ts:63-64`).

---

## 5. Acceptance criteria keamanan yang harus dipenuhi implementasi

AC di bawah adalah syarat yang bisa diuji. AC yang **sudah** terpenuhi ditandai ✅ (verifikasi: baca kode + test yang ada), sisanya wajib dikerjakan.

**A. Batas sumber daya & DoS**
1. ⛔ Setiap request ke `/v1/**` dengan body > `REQUEST_SIZE_LIMIT_BYTES` ditolak `413 PAYLOAD_TOO_LARGE` **terlepas dari** `Content-Length`/`Transfer-Encoding`; memori proses tidak tumbuh mengikuti ukuran body. (H1)
2. ⛔ `GET /v1/sync/pull` tidak pernah mengembalikan lebih dari plafon byte yang ditetapkan; halaman tetap lengkap tanpa melewatkan record; halaman berikutnya melanjutkan dari `nextCursor`. (H2)
3. ⛔ Ada batas volume per akun untuk `POST /v1/sync/push` (byte/record per jendela waktu) dan/atau kuota penyimpanan, dengan respons `429`/`413` yang konsisten kontrak. (H2, M4)
4. ⛔ Semua endpoint mutasi & semua endpoint mahal punya limiter berbasis Postgres dengan identifier per user/per IP: `account:delete`, `account.delete`, `keys:transfer` (create+claim), `devices:revoke`, `sync:pull`, `google:callback`. (M1, M4)
5. ✅ `security.rateLimiter` (in-memory) tetap dimatikan; limiter otoritatif di `rate_limits`; identifier disimpan sebagai HMAC; retensi 24 jam lewat `cleanup-ephemeral`. (`rate-limit.ts`, `maintenance.ts`)

**B. OTP & mode fix (T19)**
6. ✅ Mode fix `777777` hanya bisa aktif dari `APP_ENV` eksplisit non-production; env kosong/tidak dikenal/typo = production; tidak ada header/query/field body yang bisa menyalakannya (test: `http.test.ts` "tidak ada header/query/field client yang bisa menyalakan mode OTP fix"; `env.test.ts`).
7. ⛔ Deployment production yang menjalankan mode fix **gagal start** (cross-check `NODE_ENV=production`), dan kegagalan mencatat nama env saja (bukan nilai). (M3)
8. ✅ Kode OTP: 6 digit dari CSPRNG, disimpan `HMAC(code, pepper)`, dibandingkan `timingSafeEqual`, sekali pakai **atomik** (`UPDATE … WHERE consumed_at IS NULL RETURNING`), TTL 10 menit, cooldown 30 detik, batas 5 percobaan, respons minta kode selalu `204` tanpa pembeda email terdaftar, kode tidak pernah di-log.
9. ⛔ Penghitung percobaan dinaikkan secara atomik berkunci `consumed_at IS NULL` + `attempts < OTP_MAX_ATTEMPTS`; challenge yang melewati batas percobaan tidak bisa dipakai lagi. (L7)

**C. Auth & sesi**
10. ✅ `user_id` selalu dari sesi di semua endpoint; authz per-resource (device, envelope, transfer, record, account) ter-scope kepemilikan; resource milik user lain & yang tidak ada → respons `404` identik (tanpa oracle). (test IDOR: `http.test.ts`, `keys-account.test.ts`, `sync.test.ts`)
11. ✅ Token sesi opaque 256-bit; DB hanya menyimpan hash; revoke instan (logout, revoke perangkat menutup sesi perangkat itu dalam satu transaksi); idle 30 hari + absolut 180 hari; `last_used_at` di-throttle 5 menit; cookie `HttpOnly; Secure; SameSite=Lax; Path=/`.
12. ⛔ `Secure` ditentukan dari fakta HTTPS/production (bukan label `APP_ENV`), dan cookie sesi memakai prefix `__Host-`. (L6)

**D. Google OAuth**
13. ✅ `redirect_uri` tidak pernah dari klien (dipetakan dari `client` → env); PKCE S256; `state` 128-bit disimpan sebagai hash, sekali pakai atomik, TTL 10 menit; klaim `aud`/`iss`/`exp`/`nonce`/`email_verified` divalidasi; client secret hanya di env privat.
14. ⛔ Callback menolak `state` yang tidak terikat ke user-agent (cookie binding) dan/atau request yang tidak same-origin; ada limiter di callback. (M2, M4)
15. ⛔ Tidak ada jalur yang menerima `id_token` dari klien; bila jalur itu ditambahkan kelak, verifikasi tanda tangan (JWKS) wajib. (L3)

**E. Sync & zero-knowledge**
16. ✅ `records` hanya memuat `blob` ciphertext + metadata (`id`, `hlc` + kolom turunan, `deleted`, `server_seq`); tidak ada kolom `type`/`title`/`content`; tidak ada tabel per-entitas; `key_slot` = `['passkey']`; `key_envelopes` hanya slot passkey.
17. ✅ Server tidak bisa mendekripsi: tidak ada impor `@improve-personal/core`/`crypto` di `server/**` (aturan eslint berlaku — diverifikasi) dan tidak ada pemanggilan API kripto dekripsi di `server/**`.
18. ✅ LWW memakai satu sumber `compareHlc`; `blob` tidak pernah diubah (round-trip base64/`bytea` apa adanya); cursor ter-scope `user_id`; `SYNC_RESET_REQUIRED` hanya dipicu `sync_watermarks.purged_seq` yang dinaikkan job purge (bukan oleh input klien).

**F. Kunci & transfer**
19. ✅ Transfer: target wajib perangkat aktif milik user yang sama; transfer ke diri sendiri ditolak; TTL 120 detik ditentukan server (nilai klien ditolak schema strict); klaim atomik sekali pakai; semua sebab gagal = `404` identik; `id` transfer 128-bit acak non-enumerable.
20. ⛔ Ada limiter pada pembuatan & klaim transfer; jumlah transfer per user per jendela waktu terbatas. (M4)

**G. Cookie/CSRF/CORS/header**
21. ✅ Cookie sesi `HttpOnly; Secure; SameSite=Lax`; mutasi `/v1` berbasis cookie wajib bukti same-origin (`Sec-Fetch-Site` atau `Origin` cocok) dengan `403` generik; tidak ada perubahan data lewat GET (klaim transfer memakai POST).
22. ⛔ Origin kanonik dikonfigurasi & dipakai untuk cek CSRF (bukan `Host` dari klien). (L2)
23. ⛔ CORS eksplisit (allowlist, tanpa `*` + credentials, `Vary: Origin`) atau knob `corsAllowedOrigins` dibuang + didokumentasikan. (L1)
24. ✅ CSP nonce + `'strict-dynamic'`, `object-src 'none'`, `base-uri 'none'`, `frame-ancestors 'none'`, `form-action 'self'`, tanpa `'unsafe-eval'`; HSTS/nosniff/referrer/permissions dari default nuxt-security; `hidePoweredBy`; devtools mati di production; sourcemap klien tidak dipublikasi.

**H. Secret, logging, supply chain**
25. ✅ Semua secret hanya di key privat `runtimeConfig`, diakses `useRuntimeConfig(event)` di `server/**`; `process.env` hanya di tooling (`scripts/task.ts`, plugin startup untuk nama env, test); `.env*` di `.gitignore` kecuali `.env.example`; tidak ada secret asli di repo (grep) — tidak ada berkas compose di repo; database test memakai container layanan lokal (`improve_personal_test` di `local-postgres`) dengan kredensial lokal sekali pakai yang memang lemah.
26. ✅ Tidak ada log berisi token/OTP/cookie/`Authorization`/email polos/isi blob; error ke klien selalu `ApiErrorDto` generik tanpa stack/query; `requestSizeLimiter`/error plugin tidak membocorkan detail internal.
27. ⛔ Log server tidak memuat id capability (`keys/transfer/<id>`) & jalur cron tidak mencetak `params` query drizzle. (L4, L5)
28. ⛔ `pnpm audit --audit-level=high` bersih (atau exception tertulis dengan mitigasi) dan menjadi gate CI; dependency baru tidak menjalankan script `postinstall` asing tanpa review.

**I. Operasional**
29. ⛔ Konfigurasi produksi diverifikasi: `NUXT_APP_ENV=production`, `NUXT_TRUSTED_PROXY_HOPS` sesuai topologi, `NUXT_CORS_ALLOWED_ORIGINS` sesuai keputusan, TLS terminasi + HSTS aktif, pepper OTP ≠ pepper rate limit (≥32 karakter, `env.test.ts`), kredensial email ada.
30. ⛔ Cron `purge-tombstones` & `cleanup-ephemeral` benar-benar berjalan (jalur `tsx scripts/task.ts`, bukan endpoint dev), dan hasilnya dimonitor.

---

## 6. Hardening non-blocking yang direkomendasikan

1. **Limit body di edge** (Nginx `client_max_body_size`, Cloudflare) sebagai lapisan di luar aplikasi — perlindungan termurah terhadap H1.
2. **Kuota & observabilitas storage:** metrik pertumbuhan `records`/`key_transfers`, alarm bila melebihi ambang per user/per hari; kebijakan retensi yang eksplisit.
3. **`statement_timeout`** per koneksi Postgres (mis. 5 s) untuk membatasi query mahal tak terduga; plus `idle_in_transaction_session_timeout`.
4. **Constraint DB berlapis** untuk ukuran blob/envelope (L9) dan konsistensi `sessions.user_id` ↔ `devices.user_id`.
5. **CSP lebih ketat (bertahap):** `style-src` tanpa `'unsafe-inline'` bila memungkinkan, tambah `default-src 'self'`, `frame-src 'none'`, `manifest-src 'self'`, dan `Cross-Origin-Opener-Policy: same-origin` untuk `/app/**`.
6. **Cookie:** prefix `__Host-`, pemisahan nama cookie per klien (web) agar token mobile tidak pernah beredar di jalur cookie, dan `SameSite=Strict` untuk cookie non-sesi bila ada.
7. **Log terstruktur + redaksi:** pino/http-logger dengan `redact` untuk `authorization`, `cookie`, `set-cookie`, `email`, `code`, `blob`, `params`; korelasi via `x-request-id` saja (sudah ada).
8. **Verifikasi tanda tangan ID token** (L3) sejak sekarang agar jalur mobile masa depan tidak membuka celah.
9. **Pertahanan brute force berlapis:** bucket tambahan untuk `otp:verify` berbasis kombinasi email-hash + device-hash, dan cap global `otp:ip` yang lebih tinggi agar M5 tidak jadi tombol kill-switch.
10. **Uji beban & abuse test di CI/staging:** skrip yang mengirim chunked body, pull besar, dan spam endpoint mahal — memastikan perbaikan H1/H2/M4 tidak regresi.
11. **Rotasi & revokasi kredensial operasional:** jalur rotasi pepper (menyebabkan OTP lama invalid, bisa diterima) dan rotasi `googleClientSecret`/`resendApiKey` didokumentasikan + prosedur ganti cepat.
12. **Dokumentasi threat model** di repo (berkas ini bisa jadi dasar) agar perubahan endpoint baru wajib mengisi daftar endpoint + limiter (cegah L8 berulang).

---

## 7. Apa yang TIDAK bisa diverifikasi di environment ini

1. **`pnpm audit` bisa dijalankan** (hasil apa adanya ada di H3), tapi **`node_modules` tidak lengkap** (tidak ada `vite`, `rolldown`, `nitropack`, `h3`). Akibatnya tidak bisa dibuktikan lewat eksekusi:
   - apakah `$production.vite.build.rolldownOptions.output.minify.compress.dropConsole` benar-benar efektif untuk versi toolchain yang dipakai (`console.*` dibuang dari bundle klien);
   - apakah `security.rateLimiter: false`/`csrf: false`/`nonce` dan header (HSTS, CSP, nosniff, referrer, permissions) benar-benar terkirim seperti yang diharapkan `nuxt-security@2.6.0`;
   - apakah `window.__NUXT__` (payload SSR) bersih dari data sensitif (hanya bisa diperiksa setelah build + render).
2. **Test integrasi server tidak dijalankan** (butuh Postgres hidup + `@nuxt/test-utils/e2e` — saat audit, DB test disediakan container `local-postgres` lokal lewat `db:test:create`). Semua klaim "atomik", "sekali pakai", "IDOR → 404 sama", "413", dan perilaku cookie diverifikasi **dari kode + test yang ada**, bukan dengan eksekusi. Test yang mengasumsikan perilaku h3/nuxt-security (terutama 413 & CSRF) belum ada dan perlu ditambahkan.
3. **Perilaku `h3`/Nitro terhadap request `chunked`** disimpulkan dari dua fakta yang bisa diperiksa (implementasi limiter `nuxt-security` hanya melihat `Content-Length`; tidak ada batas body lain di konfigurasi proyek). Tidak ada uji runtime di sini; tetap harus dipastikan lewat test H1 sebelum dianggap tertutup.
4. **Konfigurasi deployment nyata** tidak bisa dilihat dari repo: nilai `NUXT_APP_ENV`/`NODE_ENV` produksi, `NUXT_TRUSTED_PROXY_HOPS`, terminasi TLS, keberadaan proxy/edge body limit, apakah secret manager dipakai, dan apakah mode OTP fix pernah aktif di production (tidak ada log/jejak di repo). Inilah dasar M3 & M5 ditandai "potensial".
5. **Perilaku browser nyata** (CSRF/`SameSite`, login CSRF M2, CSP nonce) tidak diuji dengan browser sungguhan — jalur eksploit dijelaskan secara protokol, bukan direproduksi.
6. **`pnpm lint` penuh & `nuxt build`** tidak dijalankan (dependensi tidak lengkap). Yang bisa dan sudah diverifikasi: **aturan eslint batas server benar-benar berlaku** — probe `eslint --stdin --stdin-filename server/routes/v1/_probe.ts` dengan `import '@improve-personal/core'` menghasilkan error `no-restricted-imports` (tidak ada berkas proyek yang dibuat).
7. **Data di DB nyata** (mis. apakah ada baris `key_envelopes` dengan slot selain `passkey` dari masa sebelum ADR 10/11, atau `devices.last_ip_city` yang memuat IP mentah) tidak bisa diperiksa — enum & skema sudah menutup jalur baru, tapi migrasi data historis tidak diaudit di sini.
8. **`packages/core` (implementasi kripto di sisi klien) tidak diaudit** — di luar lingkup backend. Verifikasi di sini hanya membuktikan **server** tidak bisa mendekripsi; kebenaran E2EE (AAD, nonce, KDF) harus diaudit terpisah.
