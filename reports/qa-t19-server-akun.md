# Laporan QA — T19 Server akun: OTP email, Google SSO, sesi per perangkat

Tanggal: 2026-10-22
Reviewer: Fajar (QA Engineer)
Task Ergonio: #33 `[T19] Server akun: OTP email, Google SSO, sesi per perangkat` (project `personal-productivity`, status saat diuji: `review`)
Lingkup uji: `apps/web/server/**` (routes `/v1`, services `otp`, `mailer`, `google`, `session`, `device`, `account`, `keys`, `sync`, `rate-limit`, utils `env`/cookie, plugin startup), `packages/contracts/src/auth.ts`, `packages/contracts/src/{devices,keys}.ts`, dan konfigurasi `apps/web/nuxt.config.ts` yang menyangkut transport & secret.

## Verdict

**LULUS** — semua acceptance criteria T19 terbukti dengan test yang dijalankan pada sesi ini, ditambah tiga probe manual terhadap build `.output` dan Mailpit lokal.

Tidak ada bug yang menghalangi. Ada **4 catatan minor/non-blocking** (1 temuan kerapian berupa config mati, 1 catatan retensi data, 2 trade-off yang memang didokumentasikan) — rincian di §Temuan. Status Ergonio **tidak saya ubah** sesuai batas tugas; tidak ada kode produk yang disentuh.

Ringkasan bukti: **11 file test, 176 test lulus, 0 gagal** (`vitest run`, Postgres test nyata + server Nitro hasil build untuk test HTTP), `nuxi typecheck` exit 0, `eslint --max-warnings 0` exit 0, `prettier --check` bersih.

## Scope & test plan

**Diuji (dan kenapa di level itu):**

| Area | Level | Alasan level |
|---|---|---|
| Keputusan env (fail-closed, mode OTP fix, `NUXT_SMTP_URL`, `NODE_ENV=production`) | unit/service murni | Semua keputusan adalah fungsi murni dari konfigurasi; tidak butuh HTTP, dan `resolveServerEnv`/`assertServerEnvForStartup` sengaja bisa dipanggil tanpa instance Nitro |
| OTP: pembuatan, cooldown, rate limit, expiry, sekali-pakai atomik, hash | service terhadap **Postgres nyata** | "Sekali pakai" hanya benar kalau `UPDATE … WHERE consumed_at IS NULL RETURNING` benar-benar dieksekusi; unique index & transaksi tidak bisa dibuktikan dengan mock |
| Pemilihan mailer (no-op / SMTP / Resend) | service dengan seam di batas jaringan | Batas keluar disuntik (`fetchImpl`, `smtpSend`), jadi tidak ada test yang bergantung cuaca jaringan |
| Google SSO: PKCE, `state` sekali pakai, binding cookie, klaim ID token | service dengan `fetchImpl` disuntik + HTTP | Token endpoint tidak boleh ditembak dari test; klaim `aud/iss/exp/nonce/email_verified` harus benar-benar menolak yang salah |
| Cookie sesi, CSRF, status code, bentuk DTO, IDOR | HTTP penuh (`setup({ server: true })`) | Cookie `HttpOnly/Secure/SameSite`, middleware CSRF, dan bentuk byte respons hanya ada di jalur HTTP |
| HSTS/CSP/CORS transport | HTTP penuh | Header dipasang `nuxt-security` di lapisan respons, bukan di handler |
| Hapus akun, envelope kunci, relay transfer | service terhadap Postgres nyata | Perlu hitung baris per tabel + sifat atomik klaim |

**Tidak diuji (dan alasannya):**

- Panggilan sungguhan ke `api.resend.com` — batas keluar disuntik di test (bentuk request & header `Authorization` diverifikasi); mengirim email nyata ke provider pihak ketiga bukan wewenang QA.
- Login Google sukses **lewat HTTP end-to-end** — server test berjalan sebagai proses terpisah sehingga seam `fetchImpl` tidak bisa disuntik; jalur sukses + validasi klaim diuji di level service (`google-oauth.test.ts`) dan bentuk respons HTTP-nya diuji untuk jalur gagal (`http-hardening.test.ts`).
- Terminasi TLS di infrastruktur (load balancer/CDN) — di luar repo; yang bisa dibuktikan dari kode adalah HSTS, `upgrade-insecure-requests`, dan cookie `Secure`.
- Tampilan/UX login (web & mobile) — bukan cakupan T19 (server); halaman login di `apps/web/app/**` milik task lain.
- Mobile runtime (`apps/mobile/**`) — task ini hanya server; kontrak yang dipakai mobile diverifikasi lewat schema bersama.

## Tabel AC

| # | Acceptance criterion | Status | Bukti |
|---|---|---|---|
| 1 | Production: OTP random 6 digit dikirim via service, dengan rate limit | **PASS** | Kode: `server/services/otp.ts:76` (pilih `randomOtpCode()` saat `fixedOtpEnabled` false), `server/utils/crypto.ts:47-49` (`randomInt` 10⁶, padded 6 digit), `server/services/mailer.ts:191` (production → Resend). Test: `env.test.ts:291` "production memakai kode acak 6 digit…" (`mail.code` cocok `/^[0-9]{6}$/`), `otp.test.ts:511` (request Resend: URL, body berisi kode, `Bearer <key>`). Probe manual: `mailer.ts` → Resend tidak dijalankan ke jaringan (by design). |
| 2 | OTP sekali pakai | **PASS** | Kode: `services/otp.ts:141-155` (konsumsi atomik `UPDATE … WHERE consumed_at IS NULL … RETURNING`). Test: `otp.test.ts:125` (dua verify paralel → tepat 1 sukses, 1 `OTP_INVALID`, `consumed` = 1, user = 1), `otp.test.ts:153` (kode sama setelah dikonsumsi ditolak), `http.test.ts:378` (lewat HTTP juga ditolak 400). |
| 3 | OTP kedaluwarsa ≤ 10 menit | **PASS** | Kode: `packages/contracts/src/auth.ts:28` `OTP_TTL_SECONDS = 600`; `services/otp.ts:86` & `:129`. Test: `otp.test.ts:186` — TTL+1 s → `OTP_EXPIRED`, TTL−1 s → diterima. |
| 4 | Non-production (dev/staging/test/preview): OTP fix `777777`, email tidak dikirim, rate limit & expiry tetap jalan | **PASS** | Kode: `server/utils/env.ts:26` (allowlist), `:51` (fail-closed), `:72` (`isFixedOtpEnabled`), `services/mailer.ts:54` (no-op mailer). Test: `env.test.ts:89-108` (fix aktif hanya untuk 4 env itu), `otp.test.ts:54` (mailer dipanggil dengan `777777` **dan** baris `rate_limits` terbentuk), `otp.test.ts:445` (non-production tanpa transport → `noopOtpMailer`, tidak ada jalur jaringan), expiry/rate limit: `otp.test.ts:186`, `:296-363`. |
| 5 | Kalau `NUXT_SMTP_URL` terisi: email benar-benar dikirim via SMTP (nodemailer) dan mode fix mati otomatis (kode random) | **PASS** | Kode: `env.ts:149-165` (`smtpUrl` → `fixedOtpEnabled=false`), `services/mailer.ts:117-165` (nodemailer `createTransport({url, …})`), `:186-190` (transport eksplisit menang atas default). Test: `env.test.ts:116`, `otp.test.ts:454` (mailer SMTP menyusun `from/to/subject/text`), **test baru QA** `otp.test.ts:366` (dengan transport aktif: kode yang disimpan = hash kode 6 digit acak yang dikirim, `777777` ditolak, kode asli tetap bisa ditukar, rate limit tetap dihitung). Grafik manual (lihat §Perintah #7): `createOtpMailer(env)` asli tanpa injeksi → Mailpit menerima `Kode masuk Improve Personal` berisi `654321`, `250 2.0.0 Ok`. |
| 6 | `NUXT_MAIL_FROM` wajib kalau ada transport email | **PASS** | Kode: `env.ts:267-269` (non-production + `smtpUrl` + `mailFrom` kosong → `ServerEnvError`; di production `mailFrom` sudah wajib di `:242-253`). Test: `env.test.ts:139`, **test baru QA** `env.test.ts:398` (level startup). |
| 7 | Production menolak start kalau `NUXT_SMTP_URL` ikut terisi | **PASS** | Kode: `env.ts:259-261`. Test: `env.test.ts:130`, **test baru QA** `env.test.ts:398` (lewat `assertServerEnvForStartup`, jalur yang dipakai plugin). Probe manual build: lihat §Perintah #5 — proses berhenti dengan `ServerEnvError: … (NUXT_SMTP_URL (tidak dipakai di production))`. |
| 8 | Env kosong/tidak dikenal = production (fail-closed) | **PASS** | Kode: `env.ts:51-57` (undefined/`''`/`prod`/typo → `production`). Test: `env.test.ts:52` (12 nilai tak dikenal), `:83`, `:167` (APP_ENV kosong → kredensial email production ikut wajib). |
| 9 | `777777` ditolak di production (ada test-nya) | **PASS** | Test: `env.test.ts:291` (production mengirim kode acak; verify `777777` → `OTP_INVALID`), `env.test.ts:324` (challenge ber-kode `123456` menolak `777777`, lalu `123456` diterima — membuktikan penolakan bukan karena jalur rusak), `env.test.ts:184` (`isProduction && fixedOtpEnabled` tidak mungkin). |
| 10 | Tidak ada flag client/header/query untuk menyalakan OTP fix | **PASS** | Kode: `env.ts:43` + `:210-224` (nama key/env bermotif `otp fix/bypass/mock/static/demo` → `FixedOtpOverrideError`), `server/plugins/env.ts:105` (tolak start di semua env), schema strict tanpa field semacam itu (`packages/contracts/src/auth.ts:77-100`). Test: `http.test.ts:429` (header `X-Fixed-Otp`/`X-Otp-Fix`, query `?otp=777777&fixedOtp=true`, field body `otpFixed` semuanya tidak berpengaruh; verify tanpa challenge tetap 400), `env.test.ts:236-278`. |
| 11 | Google SSO aktif di semua env | **PASS** | Route: `server/routes/v1/auth/google/start.get.ts`, `.../callback.get.ts`; client ID/secret/redirect URI wajib di schema env (`env.ts:125-130`) sehingga production tanpa konfigurasi Google menolak start. Test: `google-oauth.test.ts` (jalur start + callback), `http-hardening.test.ts:676-731` (HTTP 302 + cookie binding, mobile JSON). Tidak ada flag env yang mematikan SSO. |
| 12 | OAuth2 Authorization Code + PKCE, validasi `state` & ID token | **PASS** | Kode: `services/google.ts:104-115` (`response_type=code`, `code_challenge_method=S256`, `code_challenge=base64url(sha256(verifier))`, `state`, `nonce`), `:223-241` (konsumsi `state` atomik + TTL 600 s), `:148-173` (`aud`, `iss` allowlist, `exp`, `nonce`, `email_verified === true`, email string). Test: `google-oauth.test.ts:89-153` (tanpa/`binding` salah → ditolak, **0 panggilan** ke Google), `:155` (state sekali pakai), `:214` (enam variasi klaim salah ditolak; binding benar → code ditukar 1x). Catatan trade-off di §Temuan C-3. |
| 13 | Client ID / redirect URI per env; redirect URI tidak dari klien | **PASS** | Kode: `env.ts:127-128` (`NUXT_GOOGLE_REDIRECT_URI_WEB`/`_MOBILE`), `services/google.ts:72-74` (pemetaan `client` → URI), `:249-261` (nilai yang sama dipakai saat tukar code); `googleStartQuerySchema` strict hanya `client` (`contracts/auth.ts:111`) sehingga `redirect_uri` kiriman klien ditolak. Test: `google-oauth.test.ts:35-47` + `:98` (URL otorisasi memuat state), `http-hardening.test.ts:645` (query callback rusak/asing → 400 `VALIDATION_FAILED`, bukan diabaikan). |
| 14 | Login dibatasi rate limit per email | **PASS** | Kode: `services/otp.ts:58` → `rate-limit.ts:23` (`otp:email`: 5 / 900 s), identifier = `HMAC(email, OTP_PEPPER)` (tidak menyimpan email polos). Test: `otp.test.ts:296-317` (baris `rate_limits` benar-benar terbentuk, bucket = HMAC), `:319` (jatah habis → 429 + `Retry-After`, penghitung naik), `http.test.ts:918` (lewat HTTP, per email & per IP). |
| 15 | Token sesi bisa dicabut per perangkat | **PASS** | Kode: `services/device.ts:126-152` (soft-revoke perangkat + tutup semua sesi perangkat itu dalam satu transaksi, ter-scope `user_id`), `services/session.ts:184-193` (logout sesi ini), `:74-84` (rotasi sesi lama saat login ulang). Test: `session-device.test.ts:254` (perangkat lain tetap hidup), `:281` (rotasi), `auth-session.test.ts:199` (revoke langsung → 401) — token disimpan sebagai hash: `session-device.test.ts:48`. |
| 16 | Tiap endpoint cek kepemilikan data di server | **PASS** | Kode: `server/utils/auth.ts:22` (`requireSession`), dipakai di semua route non-publik (`account.delete.ts:35`, `devices/[id].delete.ts:24`, `keys/envelopes.*.ts`, `sync/*.ts`, `auth/session.get.ts:32`, `auth/logout.post.ts:21`); query selalu berpasangan `(id, user_id)` (`device.ts:135`, `keys.ts:129`, `:169`, `sync.ts:98/169/220`). Test: `http.test.ts:240` (11 endpoint → 401 tanpa sesi), `:550` (IDOR HTTP: perangkat/envelope/sync), `session-device.test.ts:299`, `keys-account.test.ts:153`, `:212`, `:320`. |
| 17 | Hapus akun menghapus semua record user | **PASS** | Kode: `services/account.ts:93-111` (satu transaksi: `key_transfers`, `key_envelopes`, `records`, `sync_watermarks`, `sessions`, `devices`, `otp_challenges` per hash email, lalu `users`). Test: `keys-account.test.ts:444` (hitung baris 8 tabel → semua 0, user lain utuh), `http.test.ts:818` (HTTP: kode salah → akun utuh; kode benar → 204 + cookie dibersihkan + sesi mati). |
| 18 | Recovery key TIDAK disimpan server (ADR 11) | **PASS** | Kode/kontrak: `packages/contracts/src/keys.ts` slot hanya `passkey` (diverifikasi test), enum DB `key_slot AS ENUM('passkey')` (`server/db/migrations/0000_thick_lester.sql:3`), komentar keputusan di `server/services/keys.ts:24` & `server/db/schema.ts:65`. Test: `keys-account.test.ts:65-72` (`otp` **dan** `recovery` ditolak schema), `:74` (slot asing ditolak). Tidak ada endpoint/kolom yang menyimpan recovery key (`grep -rn recovery server` → hanya komentar). |
| 19 | Secret hanya dari env | **PASS** | Kode: seluruh secret di key privat `runtimeConfig` (`nuxt.config.ts:125-148`, `public` hanya `appEnv`), dibaca `useRuntimeConfig` (`server/utils/env.ts:350-359`), tidak ada `process.env`/`import.meta.env` untuk secret di kode non-test (`grep` → hanya `NODE_ENV`/`VITEST` di plugin startup), tidak ada fallback hardcode. `.gitignore` menutup `.env*` kecuali `.env.example` (root `.gitignore:17-20`; `git ls-files | grep .env` → hanya `apps/web/.env.example` tanpa nilai asli). |
| 20 | Semua lalu lintas HTTPS | **PASS** | Kode: `nuxt.config.ts:344-378` (CSP `upgrade-insecure-requests`, `frame-ancestors 'none'`), cookie `Secure` kecuali `development` (`utils/session-cookie.ts:44-50`, `utils/oauth-state-cookie.ts:42-50`). Test: **baru QA** `https-headers.test.ts:50` (`Strict-Transport-Security` max-age ≥ 15 552 000 + `includeSubDomains`, `nosniff`, `referrer-policy`, `cache-control: no-store`), `:65` (HTML: HSTS + CSP `upgrade-insecure-requests`), `:77` (CORS lintas-origin ditolak); `http.test.ts:304` (cookie `HttpOnly; Secure; SameSite=Lax; Path=/`). Probe manual build: `Strict-Transport-Security: max-age=15552000; includeSubDomains` terkirim di `/health` dan `/v1/auth/session`. |

## Temuan (urut severity, semua non-blocking)

Tidak ada temuan blocker/mayor. Empat catatan berikut dicatat supaya tidak hilang, tapi tidak mengubah verdict.

### C-1 (minor, pilar kerapian) — `NUXT_CORS_ALLOWED_ORIGINS` divalidasi & didokumentasikan, tapi tidak dipakai kode mana pun

**Reproduksi:** `grep -rn "corsAllowedOrigins" apps/web/{server,shared,app} apps/web/nuxt.config.ts` → hanya `server/utils/env.ts:129` (schema + test `env.test.ts:214`), `nuxt.config.ts:137` (default `''`), dan satu komentar di `server/middleware/10-csrf.ts:27` yang justru menyatakan allowlist ini **tidak** dipakai. Tidak ada pembaca nilainya.

**Expected:** key env yang didokumentasikan sebagai "Allowlist origin untuk layer CORS" (`apps/web/.env.example`, bagian "Proxy & CORS") benar-benar dipakai, atau tidak ada sama sekali.
**Actual:** operator bisa mengisi `NUXT_CORS_ALLOWED_ORIGINS=https://app.example.com` dan perilaku CORS tidak berubah; header CORS sepenuhnya ditentukan default `nuxt-security`. Ini config mati + nilai salah-setel yang tidak pernah ketahuan.
**Severity:** minor (tidak ada dampak keamanan langsung: tanpa `Origin`, `access-control-allow-origin: *` muncul tapi tanpa `allow-credentials`, dan dengan `Origin` header CORS tidak dikirim sama sekali — lihat `https-headers.test.ts:77`).
**Saran:** hapus key + rule zod + dokumentasi `.env.example`, **atau** implementasikan allowlist di middleware CORS. Karena web same-origin dan mobile tidak tunduk CORS, opsi pertama lebih jujur.

### C-2 (catatan retensi data) — `deleteAccount` tidak membersihkan `rate_limits` milik user

**Reproduksi:** baca `server/services/account.ts:93-111` — transaksi menghapus 8 tabel, tidak menyentuh `rate_limits`. Baris untuk user itu (`scope` mis. `account:delete`, `sync:pull`, `keys:*` dengan `bucket = HMAC(userId, RATE_LIMIT_PEPPER)`) tetap ada sampai job `cleanup-ephemeral` membuang window > 24 jam (`rate-limit.ts:129-137`, `maintenance.ts:169`).

**Expected (ideal):** setelah hard delete akun, tidak ada baris tersisa yang dapat dikaitkan ke subjek.
**Actual:** sisa baris pseudonim (HMAC) ≤ 24 jam.
**Severity:** minor/informasional — tidak ada PII polos (`rateLimitCount`/test membuktikan tidak ada email/userId plaintext di tabel), retensi sudah dijamin job cleanup, dan tabelnya memang metadata operasional. Tidak melanggar AC "hapus akun menghapus semua record user" (record user = `records`/`devices`/`sessions`/`key_*`/`users`, semuanya 0 — `keys-account.test.ts:444`).
**Saran:** kalau ingin benar-benar bersih, hapus juga `rate_limits` untuk bucket turunan `userId` di transaksi yang sama, atau catat eksplisit di komentar bahwa penghitung dibiarkan sampai retensi 24 jam.

### C-3 (trade-off terverifikasi, bukan cacat) — tanda tangan ID token tidak diverifikasi ulang; hanya klaim

`server/services/google.ts:24-27` menyatakan alasannya: token diterima **langsung** dari token endpoint Google lewat TLS, jadi yang diverifikasi adalah klaim (`aud`, `iss`, `exp`, `nonce`, `email_verified`). Ini model kepercayaan yang sama dengan pustaka OIDC resmi (code flow server-side). Diuji menolak enam variasi klaim salah (`google-oauth.test.ts:214`).

**Risiko yang tersisa:** kalau kelak ada jalur yang menerima ID token dari klien (mis. login native langsung), verifikasi tanda tangan (`jose`) wajib ditambahkan. Sudah ditulis di komentar service; saya pertahankan sebagai catatan agar tidak hilang saat jalur baru ditambah.
**Severity:** catatan (bukan bug pada AC T19).

### C-4 (catatan operasional) — `NODE_ENV=production` + `NUXT_APP_ENV` non-production menolak start

`server/utils/env.ts:301-308` + `server/plugins/env.ts:93-105` (temuan M3). Konsekuensinya: image production yang dijalankan dengan `NUXT_APP_ENV=staging|preview` **tidak mau hidup**. Ini disengaja (satu-satunya sisa jalur `777777` di deployment produksi) dan sudah didokumentasikan di `.env.example`. Diverifikasi manual: §Perintah #6. Bukan bug, tapi perlu diketahui tim ops: staging yang memakai image production harus memakai `NUXT_APP_ENV=production` (dan konsekuensinya transport email production).

## Cek tiga pilar

**Keamanan (security.md §1-11) — lulus.**
- Secret hanya di `runtimeConfig` privat; `public` hanya `appEnv` untuk UI; tidak ada `process.env` untuk secret; `.env` tidak ter-commit.
- Semua route non-publik diawali `requireSession`; authz per-resource selalu `(id, user_id)`; IDOR perangkat/envelope/transfer/sync diuji di service **dan** HTTP.
- Input lewat `readValidatedBody`/`getValidatedQuery`/`getValidatedRouterParams` dengan schema `.strict()`; field asing (`userId`, `otpFixed`) ditolak 400 tanpa memantulkan nilai klien (`http.test.ts:879-916`).
- Cookie `HttpOnly`/`Secure`/`SameSite=Lax`/`Path=/`; token sesi & kode OTP hanya hash (SHA-256 / HMAC pepper); CSRF ketat fail-closed (`http.test.ts:475`).
- Rate limit di Postgres (bukan memori) untuk OTP kirim/verifikasi, Google start/callback, hapus akun, sync, kunci, revoke perangkat; identifier di-HMAC.
- Error generik (`ApiErrorBody`) tanpa stack/SQL/nilai input; tidak ada log berisi kode OTP/email/token (`otp.test.ts:253`).
- HSTS + `upgrade-insecure-requests` + HSTS-only cookie di non-development.
- Catatan: C-1 (config CORS mati) dan C-3 (tanda tangan ID token) — keduanya non-blocking dengan alasan di atas.

**Performa — lulus (tidak ada regresi jalur panas).**
- Jalur panas login: 1 insert challenge + 1 insert rate limit per email (+1 per IP), 1 panggilan keluar; verifikasi: 1 select + 1 update atomik + upsert user.
- `findSessionByToken` satu query join (tanpa N+1); `touchSession` di-throttle 5 menit (`session.ts:165-181`) sehingga tidak menulis tiap request.
- Transport SMTP di-cache per URL (`mailer.ts:145-165`) — `createTransport` tidak diparse ulang tiap OTP; timeout eksplisit 5 s (Resend & SMTP) supaya email menggantung tidak menahan request login.
- Rate limit/reaper: index `expires_at` (`idx_oauth_states_expires`), cleanup per tabel dengan predikat yang cocok index/partial index.
- `/v1/**` `cache-control: no-store` dan `cache: false` (tidak ada cache data per user); `DEVICE_LIST_MAX` membatasi daftar perangkat.
- Tidak ada dependency baru di PR ini (nodemailer sudah tercatat di `package.json`).

**Kerapian — lulus (dengan 1 catatan C-1).**
- `nuxi typecheck` exit 0, `eslint --max-warnings 0` exit 0 (seluruh `server/`), `prettier --check "server/**/*.ts"` bersih.
- Tidak ada `any`/`@ts-ignore` tanpa alasan di kode yang diuji; penamaan & struktur sesuai `code-quality.md` (`server/services`, `server/routes/v1/<resource>/<action>.<method>.ts`).
- Test menguji perilaku (status/kode/baris DB/byte respons), bukan detail implementasi; jaringan di-mock hanya di batas (`fetchImpl`, `smtpSend`); tidak ada `.only`/`.skip`/test di-comment di berkas yang saya sentuh.
- Temuan kerapian: `corsAllowedOrigins` (C-1). Komentar "kenapa" konsisten dan informatif di seluruh service.
- Catatan kecil: `otpRequestInputSchema` mewajibkan `client` + `device` tetapi route `POST /v1/auth/otp/request` tidak memakainya (perangkat baru dibuat saat verify). Tidak berbahaya (kontrak dipakai klien), tapi bidang itu efektif tidak terpakai di endpoint tersebut.

## Coverage & celah test yang tersisa

| Area | Cakupan sekarang | Celah yang tersisa |
|---|---|---|
| Env & fail-closed | Sangat lengkap (nilai tak dikenal, typo, `NODE_ENV` silang, nama env motif OTP-fix, pesan tanpa nilai secret) | — |
| OTP | Kirim, cooldown, rate limit, expiry, attempts, purpose, atomik, hash, tanpa log, mailer no-op/SMTP/Resend, **+ transport-aktif (kode acak)** | Tidak ada test yang benar-benar menembak Resend (disengaja) |
| Google SSO | PKCE di URL, `state` sekali pakai + TTL, binding cookie, 6 variasi klaim salah, bentuk respons web/mobile, anti open redirect | Jalur **sukses** belum pernah lewat HTTP penuh (butuh seam lintas proses) — tercakup di level service |
| Sesi & perangkat | Hash token, revoke instan, rotasi, idle 30 d/absolut 180 d, batas 10 perangkat, IDOR, DTO web/mobile | Belum ada test beban/UMKM untuk 10 perangkat paralel (tidak relevan AC) |
| Hapus akun | 8 tabel → 0, user lain utuh, email mismatch, kode salah, purpose terpisah, rate limit per akun | `rate_limits` sengaja tidak dihapus (C-2) |
| Transport HTTPS | HSTS, CSP `upgrade-insecure-requests`, cookie `Secure`, CORS lintas-origin | Terminasi TLS/redirect 80→443 ada di infra deploy, tidak bisa diuji dari repo |
| Envelope & recovery | Slot hanya `passkey`, `otp`/`recovery` ditolak, ciphertext apa adanya, IDOR | — |

Rekomendasi lanjutan (bukan syarat lulus):
1. Bereskan C-1 (hapus atau implementasikan `corsAllowedOrigins`).
2. Pertimbangkan `__Host-` prefix untuk cookie sesi & binding (butuh `Secure` + `Path=/` tanpa `Domain`), seperti disebut komentar `oauth-state-cookie.ts:37-40` — ini penguatan tambahan, bukan pelanggaran AC.
3. Kalau mobile nanti mengirim ID token langsung dari klien, tambahkan verifikasi tanda tangan (`jose`).
4. Tambahkan indikator/observabilitas untuk kasus "challenge dibuat tapi mailer gagal" (saat ini request 500, challenge tetap ada, dan permintaan ulang dalam 30 detik dijawab 204 tanpa email — perilaku ini tidak diuji dan bisa membingungkan user).

## Perintah yang dijalankan + ringkasan hasil

Semua dijalankan dari `/media/DATA/Development/stackinnov/products/improve-personal/apps/web` pada 2026-10-22. Test terarah per berkas T19 (bukan full suite monorepo), Postgres test lokal `improve_personal_test` (container `local-postgres`).

| # | Perintah | Hasil |
|---|---|---|
| 1 | `pnpm exec vitest run server/tests/env.test.ts server/tests/otp.test.ts server/tests/google-oauth.test.ts` | **3 file, 63 test lulus** |
| 2 | `pnpm exec vitest run server/tests/session-device.test.ts server/tests/keys-account.test.ts server/tests/contract-routes.test.ts server/tests/request-ip.test.ts` | **4 file, 41 test lulus** |
| 3 | `pnpm exec vitest run server/tests/auth-session.test.ts` | **6 test lulus** (server Nitro) |
| 4 | `pnpm exec vitest run server/tests/http.test.ts` | **40 test lulus** (server Nitro) |
| 5 | `pnpm exec vitest run server/tests/http-hardening.test.ts` | **20 test lulus** (server Nitro) |
| 6 | `pnpm exec vitest run server/tests/otp.test.ts server/tests/env.test.ts` (setelah test baru QA) | **2 file, 60 test lulus** |
| 7 | `pnpm exec vitest run server/tests/https-headers.test.ts` (berkas baru QA) | **3 test lulus** |
| 8 | **Run gabungan final T19**: `pnpm exec vitest run server/tests/{env,otp,google-oauth,session-device,keys-account,contract-routes,request-ip,https-headers,auth-session,http,http-hardening}.test.ts` | **11 file, 176 test lulus, 0 gagal** (35,2 s) |
| 9 | `pnpm exec nuxi typecheck` | exit 0, tanpa output (tidak ada error `app/**` saat run ini) |
| 10 | `pnpm exec eslint server --max-warnings 0` | exit 0 |
| 11 | `pnpm exec prettier --check "server/**/*.ts"` | "All matched files use Prettier code style!" |

**Probe manual (di luar suite, untuk AC yang tidak bisa diotomatiskan tanpa layanan eksternal):**

| # | Probe | Hasil |
|---|---|---|
| M1 | Jalankan `.output/server/index.mjs` dengan `NUXT_APP_ENV=production` + `NUXT_SMTP_URL=smtp://127.0.0.1:1025` + kredensial Resend lengkap | **Proses menolak start**: `ServerEnvError: Konfigurasi env server tidak valid (NUXT_SMTP_URL (tidak dipakai di production))` — AC #7 terbukti di build, bukan cuma unit test |
| M2 | Jalankan `.output` dengan `NUXT_APP_ENV=test` (image default `NODE_ENV=production`) | **Proses menolak start**: `FixedOtpOverrideError: … (NODE_ENV=production (mode OTP fix dilarang di production; periksa NUXT_APP_ENV))` — fail-closed M3 terbukti |
| M3 | Jalankan `.output` dengan `NUXT_APP_ENV=production` + kredensial Resend, lalu `curl -D -` ke `/health` dan `/v1/auth/session` | `Strict-Transport-Security: max-age=15552000; includeSubDomains`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `cache-control: no-store`; `/login` membawa `Content-Security-Policy: … upgrade-insecure-requests; … frame-ancestors 'none'` |
| M4 | `curl` `/v1/auth/session` dengan `Origin: https://evil.test` | Tidak ada `access-control-allow-origin`/`allow-credentials` → respons API tidak bisa dibaca origin lain |
| M5 | Panggil **kode asli** `createOtpMailer(resolveServerEnv({ appEnv:'development', smtpUrl:'smtp://127.0.0.1:1025', mailFrom:'Improve Personal <no-reply@local.test>', … }))` tanpa injeksi (`tsx`, Mailpit lokal `local-mailpit`) | `fixedOtpEnabled: false`; `sendOtp({code:'654321'})` selesai tanpa error; Mailpit menerima pesan `From no-reply@local.test`, `To qa-probe@qa.test`, `Subject "Kode masuk Improve Personal"`, body `Kode masuk kamu: 654321`; respons SMTP `250 2.0.0 Ok` — AC #5 (nodemailer benar-benar mengirim) terbukti pada kode produksi, bukan replika |

Catatan probe M5: skrip probe berada di `/tmp/opencode/smtp-probe/` (di luar repo) dan memakai `tsx` dengan `paths` untuk alias `#shared/*`; tidak ada artefak yang ditambahkan ke repo.

## Berkas yang saya ubah (hanya test)

| Berkas | Perubahan |
|---|---|
| `apps/web/server/tests/otp.test.ts` | +2 test baru (`describe('requestOtp saat transport email AKTIF …')`): kode acak 6 digit disimpan/dikirim saat `NUXT_SMTP_URL` aktif, `777777` ditolak, kode asli tetap bisa ditukar; rate limit per email tetap dihitung |
| `apps/web/server/tests/env.test.ts` | +1 test level startup: production + `NUXT_SMTP_URL` → menolak start; transport non-production tanpa `NUXT_MAIL_FROM` → menolak start |
| `apps/web/server/tests/https-headers.test.ts` | **baru**: HSTS + header keamanan transport, CSP `upgrade-insecure-requests`, CORS lintas-origin ditolak |

Tidak ada perubahan pada `apps/web/server/**` (kode produk), `apps/web/app/**`, `packages/**`, maupun status Ergonio.

## Rules dibaca

`CLAUDE.md` (root), `.claude/rules/shared-security.md`, `.claude/rules/shared-code-quality.md`, `.claude/rules/ergonio-status-flow.md`, `apps/web/AGENTS.md`, `apps/web/CLAUDE.md`, `apps/web/.claude/rules/security.md`, `apps/web/.claude/rules/performance.md`, `apps/web/.claude/rules/code-quality.md`, `apps/web/ARCHITECTURE.md`, `docs/PRD.md` (F15 Login/OTP/Google SSO/Hapus akun), `ARCHITECTURE.md` (ADR 10-12, §8 auth).
