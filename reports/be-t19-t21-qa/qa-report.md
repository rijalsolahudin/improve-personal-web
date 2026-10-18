# Laporan QA - Backend `apps/web` (PRD T19 + T21)

Tanggal: 2026-10-18 · Reviewer: Fajar (QA Engineer) · Lingkup: `apps/web/server/**` (Nitro API `/v1`)

## Verdict

**LULUS DENGAN CATATAN.**

- Seluruh AC T19/T21 yang masuk daftar wajib sudah tertutup test otomatis dan **hijau**: 130 test case baru di 6 berkas (4 di antaranya `it.fails` - lihat bug-1), ditambah 34 berkas test frontend yang tetap hijau.
- **1 bug High yang belum diperbaiki** (di luar wilayah saya): setiap kegagalan validasi schema di jalur HTTP membalas **500 `INTERNAL`**, bukan 400 `VALIDATION_FAILED`. Test-nya ditulis terhadap AC (400) dan ditandai `it.fails` supaya suite tetap hijau tanpa melemahkan assertion - begitu bug-nya diperbaiki, `it.fails` itu akan MERAH dan harus diubah jadi `it`. Detail di [Bug-1](#bug-1--kegagalan-validasi-schema-membalas-500-internal-high).
- Tidak ada test yang dilemahkan, di-`skip`, atau memakai `it.only`. Tidak ada kode runtime yang saya ubah.

## Cara pengujian yang dipilih (dan konsekuensinya)

Dua level, sesuai sifat AC-nya:

1. **Level SERVICE terhadap Postgres nyata** (`server/tests/{env,otp,session-device,sync,keys-account}.test.ts`, environment Vitest `node`).
   Alasan: AC yang menguji **sifat atomik & integritas data** hanya bisa dibuktikan kalau `UPDATE ... WHERE consumed_at IS NULL RETURNING`, unique index, `server_seq`, dan cascade benar-benar dieksekusi DB. Tidak ada mock DB sama sekali; waktu (`ctx.now`) disuntik, jadi TTL/cooldown/expiry diuji tanpa `setTimeout` dan tanpa flaky.
   Konsekuensi: yang diuji adalah service + DB, **bukan** status HTTP/cookie/middleware.

2. **Level HTTP penuh** (`server/tests/http.test.ts`, environment `node`) lewat `setup({ server: true })` dari `@nuxt/test-utils` - server Nitro dibangun sekali per berkas dan dijalankan seperti produksi (middleware CSRF, router, plugin error, routeRules ikut aktif).
   Alasan: AC tentang cookie/CSRF/status/DTO/error-shape butuh jalur HTTP asli; "pemanggilan handler dengan event H3 rakitan" akan menguji salinan perilaku, bukan middleware yang sesungguhnya.
   Konsekuensi: (a) berkas ini tidak bisa memakai waktu tetap - sesi untuk request HTTP diterbitkan dengan `now` nyata (`liveCtx()`), jadi AC berwaktu tetap (TTL OTP, 120 s transfer kunci) tetap di level service; (b) harness e2e `@nuxt/test-utils/e2e` tidak kompatibel dengan environment `nuxt` (`bun:test` ikut ter-bundle di konteks client), jadi berkas HTTP memakai docblock `// @vitest-environment node` - dicatat, bukan workaround tersembunyi; (c) build server + test ±15 s, total suite tetap di bawah 1 menit.

**Mock hanya di batas keluar**: mailer OTP (`capturingMailer()`) dan `fetch` Resend (`createOtpMailer(env, fetchImpl)`). Database, middleware, dan kode produk semuanya nyata.

**Isolasi data**: setiap test memakai email + IP unik (`newEmail()`/`newClientIp()`), `fixture.cleanup()` membuang barisnya sendiri (users + turunannya via cascade, `otp_challenges` per `email_hash`, `rate_limits` per bucket), dan berkas HTTP membersihkan bucket per-IP (`otp:ip`) di `beforeAll`. Suite sudah dijalankan **berulang berturut-turut** terhadap DB test yang sudah berisi data dan tetap hijau (lihat Verifikasi).

## Berkas test

| Berkas | Test case | Isi |
| --- | --- | --- |
| `server/tests/env.test.ts` | 30 | Env fail-closed, gating kode OTP fix, penolakan start, mailer per environment |
| `server/tests/otp.test.ts` | 16 | OTP sekali pakai atomik, TTL, batas percobaan, cooldown, tanpa log, rate limit di Postgres |
| `server/tests/sync.test.ts` | 16 | LWW/`stale`, tombstone, cursor & pagination, 409, ciphertext, skema tanpa plaintext |
| `server/tests/session-device.test.ts` | 13 | Hash token, revoke instan, rotate, batas 10 perangkat, IDOR perangkat, DTO sesi |
| `server/tests/keys-account.test.ts` | 19 | Envelope slot/ukuran, relay transfer kunci (sekali pakai, TTL, oracle 404), hapus akun |
| `server/tests/http.test.ts` | 36 | 401 semua endpoint, cookie/DTO web-mobile, CSRF, IDOR lewat HTTP, sync HTTP, bentuk error, `/health` |
| `server/tests/helpers/harness.ts`, `helpers/scope.ts` | (helper) | Fixture, seeding user/perangkat/sesi, capturing mailer, hitung `rate_limits`, bersih-bersih |

Total **130 test case** backend (126 lulus sebagai perilaku sah + 4 `it.fails` untuk bug-1).

## Pemetaan AC -> test

### A. Env fail-closed (T19 + ARCHITECTURE §13.4) - `env.test.ts`

| AC | Test |
| --- | --- |
| `APP_ENV` kosong/tidak dikenal = production | `resolveAppEnv ... env kosong, hilang, bukan string, atau typo diperlakukan production`, `... "production" eksplisit tetap production` |
| `development\|staging\|test\|preview` -> kode fix aktif | `isFixedOtpEnabled ... aktif HANYA untuk empat env non-production eksplisit`, `resolveServerEnv ... env test tidak butuh kredensial email dan menyalakan kode fix` |
| Non-production: email TIDAK dikirim | `pemilihan mailer ... non-production: email TIDAK dikirim - mailer-nya no-op, tanpa jalur jaringan sama sekali` (identitas `noopOtpMailer`) + `production: kode benar-benar dikirim lewat Resend (fetch disuntik)` |
| Production + mode OTP fix -> server MENOLAK start | `assertServerEnvForStartup ... production + upaya menyalakan mode OTP fix -> server MENOLAK start`; `production + upaya menyalakan mode OTP fix -> ditolak, bukan "hampir aman"` |
| `777777` ditolak di production | `challenge dengan kode asli 123456 menolak 777777 (tanpa bergantung mailer)`, `production memakai kode acak 6 digit dan fixedOtpEnabled tetap false` |
| Tidak ada flag/header/query client yang menyalakan kode fix | `http.test.ts`: `tidak ada header/query/field client yang bisa menyalakan mode OTP fix`; `env.test.ts`: `production + upaya ...` (key `otpFixed`/`fixedOtpEnabled` di config tidak berpengaruh); struktur: keputusan murni turunan `APP_ENV` privat |
| (bonus) pesan error env tidak membocorkan nilai | `pesan error menyebut NAMA variabel saja, tidak pernah nilainya` |

### B. OTP - `otp.test.ts` (+ `http.test.ts`)

| AC | Test |
| --- | --- |
| Sekali pakai **atomik** (dua verify paralel -> tepat satu sukses) | `verifyOtp ... sekali pakai secara ATOMIK: dua verify paralel dengan kode sama -> tepat satu sukses` (2 request paralel + bukti `consumed_at` terisi 1x + 1 akun) |
| Kedaluwarsa > TTL ditolak | `kedaluwarsa melewati TTL ditolak OTP_EXPIRED; satu detik sebelum TTL masih diterima` |
| Batas percobaan ditegakkan | `batas 5 percobaan salah ditegakkan: kode benar setelahnya pun ditolak` |
| Cooldown kirim ulang 30 detik | `cooldown kirim ulang: kode baru tidak dibuat & email tidak dikirim dalam 30 detik` |
| Respons selalu generik (email terdaftar vs tidak) | `http.test.ts`: `respons minta kode selalu sama untuk email terdaftar maupun tidak (tanpa oracle)`; `otp.test.ts`: `permintaan kode tidak membuat akun ...` |
| Kode OTP tidak pernah di log | `kode OTP tidak pernah bocor ke log ... tidak ada satu baris log pun selama alur minta + verifikasi OTP` (spy semua `console.*`, assert output kosong & tidak memuat kode/email) |
| Rate limit di Postgres (`rate_limits`), bukan memori | `rate limit OTP di Postgres ... penghitung tersimpan sebagai baris rate_limits`, `jatah habis -> RATE_LIMITED (429) dengan Retry-After`, `window terpisah dihitung terpisah`; `http.test.ts`: `permintaan OTP berulang menulis penghitung di tabel rate_limits (per email & per IP)` |
| (bonus) email/kode tidak disimpan polos | `email tidak pernah disimpan polos di otp_challenges`, `code hash OTP selalu HMAC, bukan kode polos`, `kode untuk purpose lain tidak bisa dipakai` |

### C. Sesi & perangkat - `session-device.test.ts` (+ `http.test.ts`)

| AC | Test |
| --- | --- |
| Hanya hash token yang disimpan | `DB hanya menyimpan hash token; token mentah tidak ada di kolom mana pun` (sha256 + JSON baris tidak memuat token) |
| Client web: tanpa token di body + cookie HttpOnly/Secure/SameSite=Lax | `http.test.ts`: `client web: cookie HttpOnly/Secure/SameSite=Lax, TANPA token di body`; `session-device.test.ts`: `DTO sesi ... client web: TIDAK ada token di body` (+ kontrak menolak token di DTO web) |
| Client mobile: token di body sesuai `sessionDtoSchema` | `http.test.ts`: `client mobile: token di body (sesuai sessionDtoSchema), tanpa cookie sesi`; `DTO sesi ... client mobile: token di body, dan token wajib` |
| Revoke per perangkat instan | `sesi yang di-revoke langsung tidak bisa dipakai`, `logout jarak jauh mematikan sesi perangkat itu, sesi perangkat lain tetap hidup`, `http.test.ts`: CSRF/same-origin logout |
| Batas 10 perangkat aktif | `batas perangkat aktif per user ditegakkan, dan login dari perangkat yang sama tidak makan jatah` (kode `DEVICE_LIMIT_REACHED` 409) |
| `DELETE /v1/devices/:id` milik user lain -> 404, tidak mengubah apa pun | `IDOR perangkat: user A tidak bisa membaca atau mencabut perangkat user B`, `perangkat yang tidak ada dan perangkat user lain memberi respons yang sama (bukan oracle)`, `http.test.ts` versinya |
| (bonus) idle 30 hari / absolut 180 hari, rotate sesi saat login ulang | `sesi yang tidak dipakai lebih dari 30 hari ...`, `idle diperpanjang selama sesi dipakai ...`, `batas absolut 180 hari tidak pernah diperpanjang ...`, `login ulang dari perangkat + client yang sama me-rotate sesi lama` |

### D. Authz / IDOR (security.md §3) - `http.test.ts` + service

| AC | Test |
| --- | --- |
| Tanpa sesi -> 401 untuk semua endpoint non-publik | `authz: tanpa sesi => 401 untuk semua endpoint non-publik` (11 endpoint, `it.each`) + `token yang tidak dikenal sama-sama 401` |
| User A tidak bisa baca/ubah data user B | `IDOR: envelopes`, `pull user A tidak pernah memuat record user B`, `user lain tidak bisa menimpa record user ini walau id-nya sama`, `http.test.ts`: `user A hanya melihat data user A...` |
| `user_id` selalu dari sesi; `userId`/field palsu diabaikan/ditolak | `http.test.ts` IDOR (`?userId=...` diabaikan; `userId` di body -> request ditolak & tidak menulis apa pun) + `sync.test.ts`: `field terlarang di body push (userId) ditolak dan recordnya tidak tertulis` |

### E. Sync (T21) - `sync.test.ts` (+ `http.test.ts`)

| AC | Test |
| --- | --- |
| hlc lebih baru menang, lebih lama `stale` & data tidak berubah | `hlc lebih lama -> stale, dan data yang tersimpan TIDAK berubah (server_seq tetap)`, `hlc sama -> stale`, `record yang menang lagi dapat server_seq BARU` |
| Jebakan HLC `"999-0-a"` vs `"1000-0-b"` lewat endpoint | `jebakan HLC: "999-0-a" vs "1000-0-b" dibandingkan sebagai tuple, bukan string` (assert string `>` tapi `compareHlc` = -1, lalu push urut terbalik) |
| Batch > 500 ditolak schema | `http.test.ts`: `batch di atas 500 record TIDAK ditulis ke DB` (+ `it.fails` untuk status yang seharusnya) ; `sync.test.ts`: `batch di atas SYNC_MAX_BATCH ditolak schema`, `batch yang tidak terurut naik berdasarkan hlc ditolak schema` |
| Tombstone tersimpan & ikut pull | `tombstone ikut tersimpan dan ikut terkirim (delete tidak hilang diam-diam)`; `http.test.ts`: `push -> pull: ciphertext & tombstone kembali apa adanya` |
| Pull: hanya sejak cursor, urut `server_seq`, pagination & `nextCursor` benar | `hanya record setelah cursor, urut server_seq, dan nextCursor = posisi record terakhir` |
| Halaman kosong tidak mereset cursor ke 0 | idem (assert `nextCursor` = cursor kiriman) + versi HTTP |
| `409 SYNC_RESET_REQUIRED` setelah `purged_seq` > cursor | `cursor di bawah purged_seq -> 409 SYNC_RESET_REQUIRED; cursor di atasnya aman`; `http.test.ts`: `cursor di bawah purged_seq -> 409 SYNC_RESET_REQUIRED` |
| Bukti ciphertext + tidak ada kolom plaintext | `ciphertext tersimpan apa adanya: server tidak mengubah dan tidak mendekripsi apa pun`, `records tidak punya kolom plaintext data user (tidak ada type/title/content)` (bandingkan daftar kolom nyata dari `information_schema`) |
| Query pull tidak sah ditolak, bukan diabaikan | `http.test.ts`: `query pull yang tidak sah tidak pernah diabaikan (bukan 200, tetap ApiErrorDto)` (+ `it.fails` untuk 400) |

### F. Kunci & hapus akun - `keys-account.test.ts` (+ `http.test.ts`)

| AC | Test |
| --- | --- |
| Slot `otp`/`recovery` ditolak schema | `slot otp ditolak schema`, `slot recovery ditolak schema` (`it.each`), `slot passkey diterima, slot asing/field asing ditolak` |
| `wrappedKey` kelewat besar ditolak | `wrappedKey kelewat besar ditolak; tepat di batas diterima`, `kdfParams kelewat besar atau terlalu banyak field ditolak` |
| Transfer kunci sekali pakai (dua klaim paralel -> satu sukses) | `claim: blob kembali apa adanya, dan hanya SEKALI walau dua request paralel` |
| Transfer kedaluwarsa (> 120 s) ditolak | `claim kadaluwarsa (> 120 s) ditolak dengan kode yang sama seperti id tak dikenal` (+ 119 s masih boleh) |
| Perangkat bukan target / user lain -> 404 yang sama | `claim dari perangkat lain (bukan target) / user lain -> 404 yang sama`, `transfer ke perangkat sendiri / user lain / perangkat yang sudah di-revoke -> NOT_FOUND` |
| Hapus akun: semua baris turunan hilang, user lain aman | `hapus akun ... menghapus SEMUA baris turunan user, dan user lain tidak tersentuh` (hitung 8 tabel), `email body tidak cocok -> OTP_INVALID`, `kode salah -> OTP_INVALID`, `kode OTP login tidak bisa dipakai menghapus akun`; `http.test.ts`: `kode salah -> 400 ...; kode benar -> 204 dan cookie dibersihkan` |

### G. Middleware & error shape - `http.test.ts`

| AC | Test |
| --- | --- |
| CSRF mutasi ber-cookie tanpa bukti same-origin -> 403 `ApiErrorDto` | `mutasi /v1 dengan cookie sesi tanpa bukti same-origin -> 403, sesi tidak dicabut` (`Origin` asing, `Sec-Fetch-Site: cross-site`, dan tanpa header sama sekali), `request same-origin (Sec-Fetch-Site atau Origin cocok) lolos` |
| Mobile bearer tanpa cookie tidak terpengaruh CSRF | `mobile bearer tanpa cookie tidak terkena pemeriksaan CSRF` |
| Error selalu `ApiErrorDto`, tanpa bocoran stack/SQL/nama tabel | `setiap error berbentuk ApiErrorDto dengan pesan generik dan tanpa bocoran internal`, `body bukan JSON valid -> 4xx ApiErrorDto, bukan 500 dengan stack` |
| Method tidak sesuai -> bukan 500 | `method yang tidak dilayani -> 4xx/405, bukan 500` |
| `/health` publik, tanpa DB, tanpa data internal | `/health publik, tanpa sesi, dan tidak membocorkan data internal` (body persis `{status, apiVersion}`, `cache-control: no-store`) |
| (bonus) `/v1` tidak di-cache | assert `cache-control: no-store` di respons `/v1/devices` |

## AC yang BELUM tertutup (dan alasannya)

| Belum | Alasan |
| --- | --- |
| Google SSO (`/v1/auth/google/start` + `/callback`, PKCE, validasi `state`/ID token) | T19 menyebutnya, tapi tidak masuk daftar AC wajib di tugas ini. Batas keluarnya `services/google.ts` (HTTP ke Google) tidak punya seam `fetchImpl` seperti mailer, dan callback perlu ID token berformat Google nyata. Perlu keputusan pemilik kode (menambah seam) sebelum bisa diuji tanpa jaringan. |
| Perilaku berbasis jam nyata lewat HTTP (TTL OTP, TTL transfer 120 s, idle/absolut sesi) | Diuji di level service dengan `ctx.now` yang disuntik (deterministik, tanpa `sleep`). Lewat HTTP, server memakai jam nyata, jadi pengujiannya hanya bisa dengan menunggu - lambat dan flaky; sengaja tidak dilakukan. |
| "Server MENOLAK start" end-to-end (proses Nitro benar-benar gagal boot) | Diuji di fungsi yang dipanggil plugin startup (`assertServerEnvForStartup`) + isi plugin `server/plugins/env.ts` sudah dibaca: jalur `FixedOtpOverrideError` selalu dilempar, production non-test juga. Yang tidak diuji: boot proses nyata dengan env rusak (butuh menjalankan proses terpisah; satu test lagi bisa ditambah kalau dianggap perlu). |
| `POST /v1/account/deletion-otp` tidak ada di daftar endpoint kontrak (`protocol.ts`) | Endpoint-nya dipakai test (204 + 401), tapi DTO/kontraknya belum ada - dicatat sebagai kebutuhan penyelarasan kontrak, bukan AC. |
| CORS lintas origin (`NUXT_CORS_ALLOWED_ORIGINS`) | Belum ada portal lintas origin; test memakai request same-origin/cross-site lewat header, bukan preflight CORS nyata. |

## Bug-1 - kegagalan validasi schema membalas 500 `INTERNAL` (High)

**Lokasi**: `apps/web/server/utils/api-error.ts` - `isZodError()` dan `defineApiHandler()` (catch-chain). Bukti pendukung: `apps/web/server/plugins/error-log.ts` `mapErrorCode()` sudah memetakan `400 -> VALIDATION_FAILED`, tapi jalur itu **tidak pernah tercapai** karena `defineApiHandler` menelan error-nya lebih dulu.

**Akar masalah**: `readValidatedBody`/`getValidatedQuery`/`getValidatedRouterParams` (h3 1.15.11) tidak melempar `ZodError` mentah, tapi `createValidationError()` -> `createError({ status: 400, statusMessage: 'Validation Error', data: <ZodError> })`. Objeknya `H3Error` (`name === 'H3Error'`), ZodError-nya ada di `error.data`, bukan `error.cause`. Karena `isZodError()` memeriksa `error.name`, pengecekan gagal, lalu handler masuk ke cabang INTERNAL: `logServerError(...)` + `500 {code:'INTERNAL'}`.

**Reproduksi** (server nyata, bukan mock):

```bash
curl -s -o - -w '\n%{http_code}\n' -X POST http://localhost:3000/v1/auth/otp/request \
  -H 'content-type: application/json' \
  -d '{"email":"bukan-email","client":"web","device":{"name":"QA","platform":"web"}}'
# actual:   500 {"code":"INTERNAL","message":"Terjadi kesalahan di server."}
# expected: 400 {"code":"VALIDATION_FAILED", ...}
```

Kasus lain yang sama (semua lewat HTTP): `GET /v1/sync/pull?cursor=abc`, `GET /v1/sync/pull?limit=0`, `PUT /v1/keys/envelopes` dengan field `userId`, `POST /v1/sync/push` dengan 501 record. Bandingkan: body JSON rusak (`'{bukan json}'`) **benar** 400 `VALIDATION_FAILED` - error itu terjadi sebelum handler, jadi lewat plugin.

**Dampak**: (1) klien menerima 500 = "coba lagi" untuk kesalahan yang tidak akan pernah berhasil diulang (mis. batch > 500 record -> retry tanpa akhir); (2) 4xx alur normal masuk log & monitoring sebagai "unhandled error"; (3) kontrak `ERROR_HTTP_STATUS` (400) tidak ditegakkan di jalur nyata.

**Bukti test**: 4 test `it.fails` di `server/tests/http.test.ts` (batch > 500, field `userId`, query pull tidak sah, body gagal schema). Test pendampingnya (tanpa `it.fails`) memastikan **penolakan tetap terjadi**: data tidak tertulis, respons tetap `ApiErrorDto` dengan pesan generik.

**Usulan perbaikan (belum saya terapkan - bukan wilayah saya)**: di `defineApiHandler` tambahkan pengenalan error validasi h3 (mis. `error.statusCode === 400` / `isZodError((error as {data?: unknown}).data)`), atau lempar ulang error yang bukan `ApiProblem` supaya plugin `error-log.ts` (`mapErrorCode`) yang memetakannya. Saran: setelah diperbaiki, ubah 4 test `it.fails` menjadi `it` biasa.

## Observasi lain (bukan bug, butuh keputusan)

1. `DELETE /v1/account` **tidak** mengonsumsi scope `account:delete` (hanya jalur kirim kode yang mengonsumsi). Konsekuensi: percobaan hapus akun berulang hanya dibatasi `otp:verify` (10/15 menit per email+IP) + batas 5 percobaan per challenge. Sudah dicatat di komentar handler; butuh keputusan pemilik kode.
2. Dokumen kontrak (`packages/contracts/src/protocol.ts`) masih menulis `GET /v1/keys/transfer/:id`, sedangkan rutenya `POST` (route-nya sudah menjelaskan alasannya). Test memakai `POST`; dokumen perlu diselaraskan.
3. `POST /v1/account/deletion-otp` dipakai alur hapus akun tapi tidak ada di daftar endpoint kontrak. Idealnya masuk kontrak bersama (biar web & mobile tidak menebak).
4. `records_seq` adalah sequence **global** (bukan per user) - bukan bug, tapi test yang memakai angka `server_seq` absolut harus dihitung relatif (hal ini sempat membuat satu test saya flaky di run kedua; sekarang diperbaiki dan dibuktikan idempoten).

## Cek tiga pilar (yang relevan untuk test ini)

- **Keamanan** (security.md §1, §3, §4, §7, §8, §9, §11): env privat fail-closed + penolakan start (A), authz per-resource/IDOR untuk devices, envelopes, records, transfer kunci (C/D/F), cookie HttpOnly/Secure/Lax + token hanya di body mobile (C), CSRF same-origin (G), rate limit di Postgres untuk semua scope OTP (B), tidak ada OTP/email/token polos di log atau DB (B/C).
- **Performa**: tidak ada AC performa di tugas ini. Yang tersentuh hanya batas ukuran (batch 500, blob 1 MB, `wrappedKey` 4 KB, `kdfParams` 1 KB) yang diuji sebagai penolakan input; `limit` pull maksimum 500 diuji via schema. Load test TIDAK dilakukan (dilarang pada sistem live, dan tidak diminta).
- **Kerapian** (code-quality.md bagian Testing): Vitest, tanpa `it.only`/`describe.skip`, test menguji perilaku (DTO/kontrak & efek di DB), mock hanya di batas jaringan, helper dipisah dari berkas test, lint `--max-warnings 0` + typecheck + prettier hijau.

## Verifikasi nyata

| Perintah | Hasil |
| --- | --- |
| `pnpm --filter @improve-personal/web test` (dijalankan 2x berturut-turut + 2x sebelumnya; DB test tidak dikosongkan) | `Test Files 40 passed (40)` · `Tests 358 passed \| 4 expected fail (362)` - identik di dua run terakhir |
| `pnpm --filter @improve-personal/web typecheck` (`nuxt typecheck`) | exit `0`, tanpa error |
| `pnpm --filter @improve-personal/web lint` (`eslint . --max-warnings 0`) | exit `0`, tanpa warning, tanpa `eslint-disable` |
| `npx prettier --check` untuk berkas test | `All matched files use Prettier code style!` |
| Postgres test | database `improve_personal_test` di container layanan lokal `local-postgres` (127.0.0.1:5432); dibuat lewat `db:test:create`, tidak pernah dimatikan |

Catatan: `vitest` dijalankan lewat `apps/web/node_modules/.bin/vitest` (bukan `npx vitest` dari root, yang tidak menemukan binary-nya); `prettier` dijalankan dari `node_modules/.pnpm/prettier@3.9.9` karena `prettier` tidak ada di `apps/web/node_modules/.bin` (dipakai lewat `packages/config`). `package.json` tidak saya ubah.

## Rekomendasi & hal yang menggantung

1. **Perbaiki Bug-1** (pemilik: backend/`bayu`), lalu ubah 4 `it.fails` menjadi `it`.
2. Selaraskan dokumen kontrak: method `POST` untuk `/v1/keys/transfer/:id`, dan tambahkan `POST /v1/account/deletion-otp` ke daftar endpoint.
3. Putuskan rate limit untuk `DELETE /v1/account`.
4. Tambah seam `fetchImpl` di `services/google.ts` supaya Google SSO bisa diuji tanpa jaringan (setelah itu saya bisa menambahkan test start/callback: `state` sekali pakai, PKCE, `nonce`/ID token, redirect URI per env).
5. Opsional: test end-to-end "proses Nitro gagal boot" dengan env rusak (spawn `node .output/server/index.mjs`) untuk membuktikan penolakan start di level proses.
6. Test HTTP saya memakai `setup({ server: true })` (build per berkas ±15 s). Kalau nanti bertambah banyak berkas HTTP, pertimbangkan `build: false` + server yang sudah dibangun CI, atau project Vitest terpisah untuk e2e (catatan: `defineVitestConfig` masih memunculkan peringatan "jangan dipakai untuk e2e" - perlu keputusan siapa yang memindahkan config e2e ke `vitest.config.e2e.ts`).
