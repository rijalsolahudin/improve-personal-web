# Laporan QA — T22 UI akun (web): login, onboarding passkey, pemulihan, perangkat

- **Task Ergonio**: #36 — `[T22] UI akun: login, onboarding passkey, pemulihan, perangkat` (project `personal-productivity`, status saat diuji: `review`)
- **Tanggal**: 2026-10-23
- **QA**: Fajar
- **Lingkup uji**: `apps/web/app/pages/{login.vue,app/akun.vue}`, `app/components/features/{auth,account,ui/Modal}`, `app/composables/{useLoginFlow,useAccount,useAuthSession,useKeyRecovery,useOtpInput,useLogout}`, `app/layouts/dashboard.vue`, `app/middleware/auth.global.ts`, `app/utils/{account,crypto}` yang dipakai UI, serta konfigurasi/tes yang menyertainya.
- **Tidak diuji**: WebAuthn nyata di authenticator (butuh browser + virtual authenticator; lihat §Celah), UI mobile (`apps/mobile`), server (`apps/web/server/**` — sudah LULUS di T19), mesin sync (`packages/core/src/sync/**` — T21).

## Putaran 3 (verifikasi ulang setelah perbaikan BUG-9) — 2026-10-23

**Verdict putaran 3: LULUS.**

BUG-9 sudah benar-benar diperbaiki, bukan sekadar ditambal di test. Perangkat baru yang berakhir di layar "Buka datamu di perangkat ini" sekarang punya tombol **"Tambah perangkat lewat QR"** yang membuka panel QR permintaan **di dalam gate yang sama** (`KeyRecoveryGate.vue:37-56`), dengan tombol kembali (`:44-46`) dan gate yang tetap non-dismissible (`:34`, `Modal` default `isDismissible=false`). Test yang dulu merah (`KeyRecoveryGate.qr.qa.test.ts`) sekarang hijau **tanpa diubah**, dan saya menambah satu test yang lebih kuat (`KeyRecoveryGate.qrflow.qa.test.ts`) yang menekan tombolnya, memeriksa QR SVG + hitung mundur `m:ss`, memastikan Esc/klik latar tidak menutup gate saat panel QR terbuka, lalu memastikan tombol kembali mengembalikan form kode/berkas.

Klaim rotasi slot `device` juga diverifikasi: klaim hanya menimpa pembuka perangkat kalau **belum ada satu record pun** (`useDevicePairing.ts:155-162` + `session.ts:244-250`), diperiksa **dua kali** (sebelum klaim `:198-202`, tepat sebelum menimpa `:211-219`), dan perangkat berisi data tetap ditolak `alreadyPaired` tanpa membakar kiriman (:196 di test). Hitung mundur sudah `m:ss` (`pairing.ts:122-137`, dipakai kedua sisi), prefix penanda skip sudah `ip-` sehingga ikut `clearAppStorage` (`passkey-setup.ts:44,58-62`; `useLogout.ts:12-17`), dan reload penuh setelah kunci diganti ada di `PairingNewDevice.vue:13-19,34-36`.

Tidak ada bug baru yang memblokir. Sisa catatan semuanya Low dan **bukan** bagian dari perbaikan yang diklaim: BUG-7/N-3 (waktu ISO mentah), N-4 (teks Panduan/PRD basi), N-5 (celah cakupan test untuk jalur default rotasi + reload), N-6 (catatan proses: satu baris test QA diubah pihak lain; typecheck sempat gagal karena file `packages/core` sedang diedit agent lain).

### Yang saya verifikasi (bukan diklaim)

| Klaim | Bukti |
|---|---|
| Gate punya tombol QR | `KeyRecoveryGate.vue:54-56` (`account.unlock.addDevice`), i18n `id.json:1356-1358`; test merah lama `KeyRecoveryGate.qr.qa.test.ts` **hijau**; regression test milik developer `KeyRecoveryGate.test.ts:78-113` |
| Panel QR benar-benar terbuka dari gate | `KeyRecoveryGate.vue:37-47` (`LazyAccountPairingNewDevice`, lazy); test baru `KeyRecoveryGate.qrflow.qa.test.ts` menekan tombol → `svg.qr` ada, `#recovery-code` hilang |
| Gate tetap non-dismissible | `KeyRecoveryGate.vue:34` tanpa `is-dismissible`; `ui/Modal/index.vue:22,57-68`; test baru: Esc + klik `.backdrop` saat panel QR → dialog tetap ada |
| Ada tombol kembali | `KeyRecoveryGate.vue:44-46`; test baru: kembali → `#recovery-code` ada, `svg.qr` hilang, dialog tetap terbuka |
| Rotasi hanya kalau belum ada record | `useDevicePairing.ts:155-162` (`!hasStoredRecords(session.storage)`), `session.ts:244-250`; cek ganda `:198-202` & `:211-219`; test `useDevicePairing.test.ts:139-172` (boleh rotasi) & `:174-197` (ditolak, klaim tidak terbakar) |
| Perangkat berisi data ditolak | `useDevicePairing.test.ts:174-197` (`canReplaceDeviceKey=false` → `alreadyPaired`, `claimed` tetap false); default `hasStoredRecords` tidak diuji langsung (N-5), tetapi jalur "kunci baru + sudah ada record" diuji `session.test.ts:171,184` |
| Hitung mundur `2:00`…`0:00` | `pairing.ts:131-137`; test `pairing.test.ts:99-107` (`120→2:00`, `119→1:59`, `61→1:01`, `9→0:09`, `0→0:00`, `-5→0:00`); render gate diuji dengan regex `m:ss` ketat (`KeyRecoveryGate.qrflow.qa.test.ts:78-83`) |
| Prefix `ip-` ikut `clearAppStorage` | `passkey-setup.ts:44` (`ip-passkey-setup-skipped`), `:58-62`; `shared/tech-identity.ts:31-32` (`storagePrefix: 'ip-'`); `useLogout.ts:12-17`; test `passkey-setup.test.ts:79-84` |
| Reload penuh setelah kunci diganti | `PairingNewDevice.vue:13-19` (`replacedKey` → `reloadPage()`), `:34-36`; **belum ada test otomatis** (N-5) |
| Label | `id.json:1356-1358` ("Tambah perangkat lewat QR", lead, "Kembali ke pembukaan kunci"), `:1248-1254` (judul QR + selesai) |

### Hasil per acceptance criteria (putaran 3)

| # | Acceptance criterion | Status | Bukti putaran 3 |
|---|---|---|---|
| 1 | Login email OTP + Google SSO; jeda **30 detik**; error tidak membocorkan status email | **PASS** | Tidak berubah; `useLoginFlow.test.ts` (22 test) + `login.qa.test.ts` lulus di run regresi |
| 2 | Onboarding passkey wajib satu tap, tidak bisa ditutup, skip hanya tanpa WebAuthn, PRF tidak keluar | **PASS** | `PasskeyOnboarding.test.ts` 6/6 lulus; `passkey-setup.test.ts` 6/6 |
| 3 | Kartu backup: bukan gerbang; `iprk1.*`; Salin/Bagikan/Unduh/“Sudah saya simpan”; slot `recovery` | **PASS** | `RecoveryBackupCard.qa.test.ts` 5/5 |
| 4 | Lupa OTP: email → "Pakai passkey atau kode pemulihan?" | **PASS** | `login.recovery.qa.test.ts` 5/5 |
| 5 | Tambah perangkat via QR: dua QR, X25519, ≤2 menit, sekali pakai, QR asing tidak mengirim, TTL 120 s, tanpa `v-html`, **dan bisa dimulai dari perangkat baru** | **PASS** | Mekanika tetap lulus (`akun.pairing.qa.test.ts` 3, `transfer.qa.test.ts` 4, `useDevicePairing.test.ts` 7, `pairing.test.ts`); pintu masuk: `KeyRecoveryGate.vue:37-56`, `KeyRecoveryGate.qr.qa.test.ts` **hijau**, `KeyRecoveryGate.test.ts:78-113`, `KeyRecoveryGate.qrflow.qa.test.ts` (QR + `m:ss` + non-dismissible + kembali) |
| 6 | Daftar perangkat: nama, waktu login terakhir, lokasi, logout jarak jauh | **PASS** (catatan BUG-7) | `akun.qa.test.ts` + `akun.pairing.qa.test.ts:166`; `akun.vue:98-124` |
| 7 | Hapus akun: konfirmasi email + OTP ulang | **PASS** | `akun.pairing.qa.test.ts:189-224`; `useAccountDeletion.test.ts` 5/5 |
| 8 | Indikator status sync tampil dan konsisten | **PASS** | `ShellSyncStatus.qa.test.ts` 2/2 + `useSyncStatus.test.ts` 6/6 |
| 9 | Tidak ada token/kunci/24 kata di `localStorage`/`useState`/SSR; tanpa `v-html` | **PASS** | Grep ulang: `localStorage` hanya preferensi/draf + penanda skip ber-prefix `ip-`; `useState` hanya status & DTO (`useAccount.ts:63-76`, `useLocalData.ts:76`); kode/passphrase tetap `ref` (`AccountUnlockForm.vue:22-26`); `v-html`/`innerHTML` hanya komentar (`ui/QrCode/index.vue:9-10`, `utils/icons.ts:3`) |

### Bug & catatan (urut severity)

Tidak ada bug Medium/High baru. Semua di bawah ini **Low/tidak memblokir** dan sudah dilaporkan sebelumnya atau di luar perbaikan yang diklaim.

**BUG-7 / N-3 (Low, masih terbuka) — waktu perangkat masih ISO mentah UTC.** `akun.vue:111-112` merender `device.lastSeenAt` apa adanya; `akun.qa.test.ts:87` justru mengunci `2026-10-22T09:15:00.000Z` sehingga perbaikan format akan membuat test QA merah. Rekomendasi tetap: ubah keduanya bersamaan (`useDateFormat` sudah ada).

**N-4 (Low, masih terbuka) — teks Panduan & PRD basi.** `app/utils/guide.ts:255` dan `:360` masih menyebut "tambah perangkat lewat QR, alur lupa OTP, hapus akun, indikator sync … menyusul/belum tersambung", padahal keempatnya sudah ada dan QR sekarang bisa dimulai. `docs/PRD.md:920-933` juga masih menulis "UI-nya belum ada". Area guide/docs di luar batas edit QA; dilaporkan untuk `dimas`.

**N-5 (Low, celah cakupan test) — dua detail hanya dibuktikan lewat kode.** (a) Jalur **default** `canReplaceDeviceKey` (`localData.ensure()` + `hasStoredRecords`) tidak dieksekusi lewat `useDevicePairing`; test memakai injeksi `true`/`false`. Logika `hasStoredRecords` sendiri tercakup `session.test.ts:171,184`. (b) Reload penuh saat `replacedKey` (`PairingNewDevice.vue:14-19`) tidak punya test. Keduanya bukan blocker; kandidat test regresi berikutnya.

**N-6 (catatan proses, bukan bug).** (a) `PasskeyOnboarding.test.ts` (file QA putaran 1) hash-nya berbeda dari putaran 2, tetapi rekonstruksi membuktikan **hanya satu baris** berubah: literal `'ip.passkeySetupSkipped'` → konstanta `PASSKEY_SKIP_STORAGE_KEY` (hash rekonstruksi = `d20e573e…f2c1`, persis hash putaran 2). Tidak ada assertion dilemahkan/dihapus. (b) `nuxi typecheck` pertama (10:31) gagal `TS2304: buildDayPlan` di `packages/core/src/recurrence/expand.ts`, file yang **sedang diedit agent lain** (mtime 10:31:38, di luar T22); jalankan ulang 10:32 → **exit 0**. Bukan regresi T22.

### Cek tiga pilar (putaran 3)

**Keamanan**

- ✅ Gate tetap non-dismissible untuk jalur non-pairing **dan** saat panel QR terbuka (Esc & klik latar diuji).
- ✅ QR hanya membawa publik (`{v, publicKey, nonce, deviceId}` / `{v, id, expiresAt}`); kunci utama hanya di sealed box X25519 (`transfer.ts`; `transfer.qa.test.ts:32,48`).
- ✅ Rotasi pembuka perangkat hanya saat **tidak ada record**, dicek dua kali sebelum menimpa; kegagalan `ensure()` → `false` (fail-closed).
- ✅ QR ditolak sebelum request untuk payload asing (`akun.pairing.qa.test.ts:144` — 0 request; `useDevicePairing.test.ts:222-232`).
- ✅ Tanpa `v-html`/`innerHTML` untuk data user/QR; QR digambar sebagai `<path>` (`ui/QrCode/index.vue:34-53`).
- ✅ Tidak ada kunci/24 kata di `localStorage`/`useState`/payload SSR; kode & passphrase tetap `ref`.
- ⚠️ N-3 hanya kosmetik; tidak ada kunci yang bocor.

**Performa**

- ✅ Komponen QR dimuat **lazy** dari gate (`KeyRecoveryGate.vue:40-42` — `LazyAccountPairingNewDevice`), jadi layout dashboard tidak menambah berat awal.
- ✅ Tidak ada dependency baru; QR tetap satu `<path>` per deret.
- ⚠️ Build/chunk tidak saya ukur ulang di putaran ini (working tree dipakai bersama agent lain); angka putaran 2 (chunk akun 10.396 B gzip, `uqr` 7.843 B) masih relevan karena tidak ada perubahan dependency.

**Kerapian**

- ✅ `nuxi typecheck` exit 0; `eslint --max-warnings 0` exit 0; `prettier --check` bersih (termasuk file test baru).
- ✅ `KeyRecoveryGate.vue` turun dari 148 → **76 baris** (form pindah ke `AccountUnlockForm`); `PairingNewDevice.vue` 141, `PairingExistingDevice.vue` 100 — semua di bawah pedoman ~200.
- ✅ Tidak ada `console.*`/`TODO`/`any`/`@ts-ignore` di file yang saya periksa; komentar menjelaskan "kenapa" (batas sesi vs kunci, kenapa cek ganda, kenapa reload).
- ✅ Test menguji perilaku, mock jaringan di batas; tidak ada `.only`/`.skip` (satu-satunya `skipIf` ada di `assets/css/tokens.test.ts`, di luar T22, dan `pomodoro.skip()` adalah nama method).

### Integritas test (tidak ada yang dilemahkan/dihapus)

- Enam file QA putaran 1 dijalankan **apa adanya**. SHA-256 saat putaran 3:
  - `login.qa.test.ts` `95f235a8…71eb` ✅ sama
  - `akun.qa.test.ts` `34147a10…3fb3` ✅ sama
  - `dashboard.qa.test.ts` `93f56c36…4f9c` ✅ sama
  - `RecoveryBackupCard.qa.test.ts` `a2ed14ea…97be` ✅ sama
  - `useLoginFlow.test.ts` `cf469bcf…8b26` ✅ sama
  - `PasskeyOnboarding.test.ts` `0d419e37…36af4` ⚠️ berbeda — **hanya** penggantian literal prefix ke konstanta (lihat N-6a); jumlah test tetap 6, assertion utuh.
- Lima file QA putaran 2 dijalankan apa adanya: **18 test** (sama dengan putaran 2), tidak ada assertion yang dilemahkan; `KeyRecoveryGate.qr.qa.test.ts` tidak saya ubah.
- Test baru putaran 3 hanya **menambah**: `KeyRecoveryGate.qrflow.qa.test.ts` (1 test). Tidak ada test dihapus, tidak ada assertion dilonggarkan.

### Perintah yang dijalankan + hasil (putaran 3)

Semua dari `apps/web`, Node 24, Vitest 5.0.3, 2026-10-23.

| # | Perintah | Hasil |
|---|---|---|
| 1 | `pnpm exec vitest run app/components/features/account/KeyRecoveryGate.qr.qa.test.ts` (test yang dulu merah) | **1 file, 1 test — lulus** |
| 2 | `pnpm exec vitest run` 6 file QA putaran 1 | **6 file, 41 test — semua lulus** |
| 3 | `pnpm exec vitest run` 5 file QA putaran 2 | **5 file, 18 test — semua lulus** |
| 4 | `pnpm exec vitest run app/components/features/account/KeyRecoveryGate.qrflow.qa.test.ts` (baru) | **1 test — lulus** |
| 5 | Regresi terarah (akun/auth/shell/dashboard/pairing, 34 file) | **34 file, 203 test — semua lulus** |
| 6 | `pnpm exec nuxi typecheck` | **exit 0** (run pertama gagal sementara karena `packages/core` sedang diedit agent lain; lihat N-6b) |
| 7 | `pnpm exec eslint <akun/auth/pairing + test> --max-warnings 0` | **exit 0** |
| 8 | `pnpm exec prettier --check <file yang sama + i18n/locales/id.json>` | **All matched files use Prettier code style!** |
| 9 | `grep -rn "v-html\|innerHTML" app --include=*.vue --include=*.ts` | hanya komentar (`ui/QrCode/index.vue:9-10`, `utils/icons.ts:3`) |
| 10 | `grep -rn "localStorage\|sessionStorage" app` (non-test) | hanya preferensi/draf + penanda skip `ip-`; tidak ada token/kunci/kode |
| 11 | `grep -rn "useState"` di akun/auth/pairing | hanya status + DTO non-rahasia; kode/passphrase = `ref` |
| 12 | Rekonstruksi hash `PasskeyOnboarding.test.ts` putaran 2 | `d20e573e…f2c1` — membuktikan perubahan hanya 1 baris prefix |
| 13 | `pnpm exec vitest run i18n` (kunci label baru) | **1 file, 5 test — lulus** |

### Coverage & celah yang tersisa

| Area | Cakupan putaran 3 | Celah |
|---|---|---|
| Pintu masuk QR dari perangkat baru | Tombol di gate, panel QR, `m:ss`, non-dismissible, tombol kembali | Scan dua perangkat sungguhan (butuh dua konteks browser + kamera) |
| Klaim & rotasi | Boleh rotasi saat kosong, ditolak saat ada record, cek ganda, sekali pakai, QR asing | Jalur **default** `hasStoredRecords` lewat `useDevicePairing` + reload penuh (N-5) |
| Hapus akun / lupa OTP / sync | Tetap hijau (lihat AC #4, #7, #8) | Sama seperti putaran 2 |
| Non-fungsional | Typecheck/lint/format, grep keamanan, line count SFC | Lighthouse/CWV & E2E Playwright belum dijalankan (sama seperti putaran 1-2); build/chunk tidak diukur ulang |

**Rekomendasi untuk sesi induk:** `done` + `progressPct: 100`, dengan komentar `LULUS` berisi perintah #1-#5. Sisa pekerjaan Low untuk `dimas` (bukan blocker): perbaiki BUG-7/N-3 bersamaan, segarkan teks Panduan/PRD (N-4), dan tambahkan test untuk N-5.

---

## Putaran 2 (verifikasi ulang) — 2026-10-23

**Verdict putaran 2: GAGAL (blocking AC #5).** Tiga dari empat AC yang hilang di putaran 1 sekarang lulus (lupa OTP, hapus akun, indikator sync), BUG-5/BUG-6 (Medium) dan N-1 sudah diperbaiki, dan mekanika QR (dua QR, sealed box X25519, TTL 120 s, sekali pakai, QR asing ditolak, tanpa `v-html`) terbukti benar. **Tetapi alur dua QR tidak bisa dimulai dari perangkat yang membutuhkan kunci**: pada kondisi normal (server terjangkau, akun sudah punya envelope passkey) perangkat baru berakhir `locked` di layar "Buka datamu di perangkat ini" yang tidak bisa ditutup dan tidak punya opsi QR, sedangkan satu-satunya tempat dialog pairing dipasang adalah `/app/akun` di belakang layar itu. Lihat **BUG-9**. Karena AC "tambah perangkat via QR" menuntut alur yang bisa dipakai user (bukan sekadar komponen yang ada), AC #5 dinilai **FAIL** dan task belum bisa `done`.

### Yang berubah sejak putaran 1 (diverifikasi, bukan diklaim)

| Putaran 1 | Putaran 2 |
|---|---|
| AC lupa OTP tidak ada | `login.recovery.qa.test.ts` 5/5 lulus: tautan di langkah email **dan** OTP, judul "Pakai passkey atau kode pemulihan?", jujur saat tidak ada sesi, form kode/berkas saat sesi ada |
| AC QR tidak ada | **SEBAGIAN (blocking)**: mekanika lengkap dan teruji (`akun.pairing.qa.test.ts` 6/6 + `transfer.qa.test.ts` 4/4), tetapi pintu masuk perangkat baru tidak ada — layar pulih (`KeyRecoveryGate`) tanpa opsi QR, sedangkan dialog pairing hanya ada di `/app/akun` di belakang layar itu (**BUG-9**) |
| AC hapus akun tidak ada | `akun.pairing.qa.test.ts` 2/2 + `useAccountDeletion.test.ts` 5/5 lulus: dialog email + OTP, `POST /v1/account/deletion-otp`, `DELETE /v1/account`, sesi & storage dibersihkan, redirect login, `RATE_LIMITED` dipetakan |
| AC indikator sync tidak ada | `ShellSyncStatus.qa.test.ts` 2/2 + `useSyncStatus.test.ts` 6/6 lulus: dari `readSyncStatus` + outbox, "Menunggu status sinkronisasi" saat storage belum terbuka (tidak mengarang "Tersinkron") |
| BUG-5 perangkat tercabut tampil aktif | Ditandai "sudah dicabut", diurutkan di bawah, tanpa tombol "Cabut akses" (`akun.vue:102-109,116`; `akun.pairing.qa.test.ts:166`) |
| BUG-6 error buat kode tidak terlihat | `RecoveryBackupCard.vue:105-107` merender `account.error` dengan `role="alert"`; `RecoveryBackupCard.qa.test.ts:157` hijau |
| N-1 skip passkey bisa diforce & global | `readPasskeySkip` menolak saat WebAuthn tersedia + key per akun (`passkey-setup.ts:54-79`), tombol skip hanya dirender di cabang tidak didukung (`PasskeyOnboarding.vue:162-168`) |

**Angka test:** 6 file QA putaran 1 dijalankan **apa adanya** → **6 file, 41 test, semua lulus** (putaran 1: 6 gagal). 5 file QA baru → **5 file, 18 test — 17 lulus, 1 gagal** (yang gagal = bukti BUG-9). Regresi terarah area akun/auth/shell/dashboard → **31 file, 181 test — 180 lulus, 1 gagal** (BUG-9).

### Hasil per acceptance criteria (putaran 2)

| # | Acceptance criterion | Status | Bukti putaran 2 |
|---|---|---|---|
| 1 | Daftar/login email OTP + Google SSO; OTP jeda **30 detik**; error tidak membocorkan status email | **PASS** | Tidak berubah sejak putaran 1: `useLoginFlow.ts:97`, `contracts/auth.ts` (`OTP_RESEND_COOLDOWN_SECONDS = 30`), `useLoginFlow.test.ts:217,253,267` (22 test lulus di file itu) |
| 2 | Onboarding passkey wajib satu tap: tanpa tombol tutup, Esc/klik latar diabaikan; skip hanya jika WebAuthn tidak didukung; PRF tidak keluar | **PASS** | `PasskeyOnboarding.test.ts` 6/6 lulus; `PasskeyOnboarding.vue:66-75,162-168`; `passkey-setup.ts:74-79`; `passkey-setup.test.ts` 6/6 |
| 3 | Kartu backup: bukan gerbang; kode 24 kata + envelope `iprk1.*`; Salin/Bagikan/Unduh/“Sudah saya simpan”; slot `recovery` | **PASS** | `RecoveryBackupCard.qa.test.ts` 5/5 lulus (termasuk kode tidak di payload SSR dan error `role=alert`) |
| 4 | Lupa OTP: email → "Pakai passkey atau kode pemulihan?" | **PASS** | Tautan di `AuthEmailStep.vue:77` dan `AuthOtpStep.vue:107`; langkah `useLoginFlow.ts:182-185`; `login.vue:15`; `AuthRecoveryStep.vue:50-54` menampilkan `AccountUnlockForm` bila ada sesi, dan pesan jujur bila tidak (`:54`). Test: `login.recovery.qa.test.ts:62,70,81,93,110` |
| 5 | Tambah perangkat via QR: dua QR, kunci dibungkus X25519, kedaluwarsa ≤ 2 menit, sekali pakai, QR asing tidak mengirim apa pun, TTL server 120 s, tanpa `v-html` | **FAIL (BUG-9)** — mekanika PASS, alur user tidak bisa dimulai | **Mekanika (lulus):** UI: `akun.vue:84-92`, `DevicePairingDialog.vue:34-50`, `PairingNewDevice.vue:106-125`, `PairingExistingDevice.vue:22-45`. Dua QR: `utils/account/pairing.ts:14-32`; alur `useDevicePairing.ts:127-206`. X25519/sealed box: `utils/crypto/transfer.ts:133-156`; test `transfer.qa.test.ts:32,48` (hanya keypair pembuat QR yang bisa membuka; nonce terikat). TTL: `contracts/keys.ts:113` (120 s), server `services/keys.ts:138`; hitung mundur request memakai konstanta itu (`useDevicePairing.ts:137`), response memakai `expiresAt` server (`:199`). Sekali pakai: server `services/keys.ts:165-180`, test `useDevicePairing.test.ts:139`. QR asing: parse sebelum request (`useDevicePairing.ts:190,195`), test `akun.pairing.qa.test.ts:144` (0 request) + `useDevicePairing.test.ts:162`. `v-html`: `ui/QrCode/index.vue:2,34-69` menggambar `<path>`; grep hanya menemukan komentar; chunk akun hasil build `innerHTML` = 0. **Pintu masuk (gagal):** perangkat baru pada kondisi normal berakhir `locked` (`useLocalData.ts:191-193`) → `KeyRecoveryGate` non-dismissible hanya passkey/kode/berkas + logout (`KeyRecoveryGate.vue:22-31`, `AccountUnlockForm.vue:95-148`); dialog pairing satu-satunya di `akun.vue:138` (layout `dashboard`, tertutup gate). Test merah: `KeyRecoveryGate.qr.qa.test.ts:44` |
| 6 | Daftar perangkat: nama, waktu login terakhir, lokasi dari IP; logout jarak jauh | **PASS** (catatan BUG-7) | `akun.vue:98-124`; label "login terakhir" (`id.json:1212`); `revokedAt` ditandai & tanpa tombol cabut (`:102-109,116`); `DELETE /v1/devices/:id` (`devices-gateway.ts:77-83`); `akun.qa.test.ts:79,93` + `akun.pairing.qa.test.ts:166` |
| 7 | Hapus akun: konfirmasi email + OTP ulang | **PASS** (catatan N-2) | `akun.vue:128-143`, `DeleteAccountDialog.vue:57-101`; validasi email/kode & tombol mati (`useAccountDeletion.ts:101-116`); endpoint `POST /v1/account/deletion-otp` + `DELETE /v1/account` (`account-gateway.ts:17-18,50-69`); cleanup `wipe()` + slot kunci + `clearAppStorage` + sesi (`useAccountDeletion.ts:140-166`); redirect `LOGIN_PATH` (`:122`); rate limit server `account.delete.ts:44-52` dan dipetakan `useAccountDeletion.ts:43-46,124-126`. Test: `akun.pairing.qa.test.ts:189,210`; `useAccountDeletion.test.ts:69,85,98` |
| 8 | Indikator status sync tampil dan konsisten | **PASS** | `dashboard.vue:26`; `ShellSyncStatus.vue:104-156`; `useSyncStatus.ts:40-70` memakai `readSyncStatus` + `countOutbox`; status `null` → i18n `sync.status.unknown` "Menunggu status sinkronisasi" (bukan "Tersinkron"). Test: `ShellSyncStatus.qa.test.ts:51,59`; `useSyncStatus.test.ts` 6/6; `dashboard.qa.test.ts` |
| 9 | Tidak ada token/kunci/24 kata di `useState`/payload SSR/`localStorage`; tanpa `v-html` data user | **PASS** | `useAccount.ts:63-76` (kode/envelope di `ref`), `AccountUnlockForm.vue` (kode/passphrase ref), `useDevicePairing.ts` (private key ephemeral di closure, `:84-88`), `useAccountDeletion.ts:60-63` (hanya flag/error), `auth/gateway.ts` (tanpa token di JS). `RecoveryBackupCard.qa.test.ts:169` hijau; grep `v-html`/`innerHTML` hanya komentar; `localStorage` hanya preferensi + penanda skip (N-2) |

### Integritas test putaran 1 (tidak ada yang dilemahkan/dihapus)

- Enam file dijalankan **apa adanya**, tanpa saya ubah. SHA-256 saat putaran 2:
  - `login.qa.test.ts` `95f235a8…71eb`
  - `akun.qa.test.ts` `34147a10…3fb3`
  - `dashboard.qa.test.ts` `93f56c36…4f9c`
  - `RecoveryBackupCard.qa.test.ts` `a2ed14ea…97be`
  - `useLoginFlow.test.ts` `cf469bcf…8b26`
  - `PasskeyOnboarding.test.ts` `d20e573e…f2c1`
- `useLoginFlow.test.ts` mtime-nya 09:00 (setelah laporan putaran 1 05:51), tetapi isinya tetap sama: 22 test (15 `it` + 7 dari `it.each`), dan judul test T22 berada di baris **217/253/267** — persis angka yang dikutip laporan putaran 1. Tidak ada assertion yang hilang/dilemahkan; tidak ada `.only`/`.skip`/test di-comment di keenam file.
- Catatan: file itu sempat tersentuh setelah putaran 1 (mtime berubah), jadi verifikasi ini bersandar pada kecocokan isi/baris, bukan snapshot byte. Putaran berikutnya sebaiknya menyimpan hash sejak awal.

### Bug putaran 1 — status perbaikan

| Bug | Severity | Status putaran 2 | Bukti |
|---|---|---|---|
| BUG-1 lupa OTP tidak ada | High | **FIXED** | AC #4 di atas; `login.recovery.qa.test.ts` 5/5 |
| BUG-2 QR tidak ada | High | **SEBAGIAN (BUG-9)** — komponen & mekanika QR ada, tetapi perangkat baru tidak bisa memulai alurnya | AC #5 di atas; `KeyRecoveryGate.qr.qa.test.ts:44` merah |
| BUG-3 hapus akun tidak ada | High | **FIXED** | AC #7 di atas |
| BUG-4 indikator sync tidak ada | High | **FIXED** | AC #8 di atas |
| BUG-5 perangkat tercabut tampil aktif | Medium | **FIXED** | `akun.vue:102-109,116`; `akun.qa.test.ts:108` + `akun.pairing.qa.test.ts:166` lulus |
| BUG-6 error buat kode tidak terlihat | Medium | **FIXED** | `RecoveryBackupCard.vue:105-107`; `RecoveryBackupCard.qa.test.ts:157` lulus |
| BUG-7 waktu ISO mentah / label | Low | **SEBAGIAN** — label "login terakhir" sudah benar (`id.json:1212`), nilainya **masih** `device.lastSeenAt` ISO UTC (`akun.vue:112`). Lihat N-3: test putaran 1 justru mengunci nilai ISO itu. | `akun.vue:112` |
| N-1 skip passkey bisa diforce & global | Low | **FIXED** | `passkey-setup.ts:54-79`; `PasskeyOnboarding.vue:66-75,162-168`; `passkey-setup.test.ts:55,62` lulus |

### Bug baru putaran 2

**BUG-9 (High, blocking AC #5) — Alur QR tidak bisa dimulai dari perangkat baru.**

- **Lokasi**: `apps/web/app/components/features/account/KeyRecoveryGate.vue:22-31` (isi layar pulih: hanya `AccountUnlockForm` + logout), `AccountUnlockForm.vue:95-148` (passkey/kode/berkas, tanpa QR), `apps/web/app/pages/app/akun.vue:14,138` (satu-satunya pemasangan `AccountDevicePairingDialog`, di halaman ber-layout `dashboard`), `apps/web/app/layouts/dashboard.vue:31` (gate dirender di semua halaman `/app`), `useLocalData.ts:191-193` (perangkat baru dengan envelope passkey di server → `locked`), `useDevicePairing.ts:160` (klaim menolak perangkat yang sudah punya slot `device`).
- **Reproduksi (dua perangkat, akun yang sudah punya passkey)**:
  1. Perangkat A (punya data + passkey) buka `/app/akun` → "Tambah perangkat" → pilih "Perangkat ini sudah punya kunci" (siap memindai QR).
  2. Perangkat B login dengan akun yang sama (OTP). Aplikasi langsung menampilkan dialog "Buka datamu di perangkat ini" yang **tidak bisa ditutup**; isinya hanya passkey, kode pemulihan, berkas, dan "Keluar dari akun".
  3. Perangkat B tidak punya cara menampilkan QR permintaan: `/app/akun` ada di belakang dialog itu dan tidak bisa disentuh (backdrop `position: fixed` + fokus terkunci). Perangkat A jadi tidak punya apa pun untuk dipindai.
  4. Varian lain: bila perangkat B tidak terkunci (akun tanpa envelope passkey), login membuat kunci perangkat baru (`utils/storage/session.ts:198`), lalu `claimResponse` menolak dengan `alreadyPaired` (`useDevicePairing.ts:160`) — QR tetap tidak bisa dipakai.
- **Expected**: layar pulih perangkat baru menyediakan jalan "Tambah perangkat lewat QR" yang membuka `PairingNewDevice` (QR permintaan), sesuai PRD F15: "passkey PRF, atau kode pemulihan / QR dari perangkat lama (layar pemulihannya ... dialog 'Buka datamu di perangkat ini')" (`docs/PRD.md:861`). Alternatif: buat dialog pairing dapat dijangkau dari gate (bukan hanya `/app/akun`).
- **Actual**: opsi QR tidak ada di gate; dialog pairing hanya di halaman akun yang tertutup gate. Mekanika QR (komponen + composable + server) benar, tetapi alur dua QR tidak pernah bisa dimulai oleh perangkat yang membutuhkan kunci. Satu-satunya keadaan yang membuka halaman akun adalah `localData.status === 'error'` (permintaan envelope passkey gagal) — itu bukan jalur yang dirancang dan tidak bisa diandalkan; pada kondisi normal statusnya `locked`.
- **Dampak**: AC "tambah perangkat via QR" tidak terpenuhi end-to-end; user harus memakai passkey/kode pemulihan (workaround ada, data tidak hilang). Bukan masalah keamanan — tidak ada kunci yang bocor; justru fitur yang diminta tidak bisa dipakai.
- **Bukti test**: `app/components/features/account/KeyRecoveryGate.qr.qa.test.ts:44` (merah — dialog gate tidak memuat /tambah perangkat|pindai qr|scan qr/). Test komponen `akun.pairing.qa.test.ts` sengaja memasang halaman langsung (tanpa layout/gate), jadi ia membuktikan mekanika dialog, bukan keterjangkauannya.

**BUG-8 (Low) — Hitung mundur QR ditampilkan `0:120`, bukan `2:00`.**

- **Lokasi**: `apps/web/app/components/features/account/PairingNewDevice.vue:23-27`, `PairingExistingDevice.vue:13-17` (`'0:' + String(secondsLeft).padStart(2,'0')`).
- **Reproduksi**: `/app/akun` → Tambah perangkat → pilih peran → lihat teks "Berlaku 0:120" (atau `0:119`) selama menit pertama; QR jawaban sama.
- **Expected**: format `m:ss` (`2:00`, `1:59`, …).
- **Actual**: `0:120`; nilai totalnya masih benar (120 s) sehingga AC "kedaluwarsa ≤ 2 menit" tetap terpenuhi.
- **Dampak**: user bisa membaca "0:120" sebagai tampilan rusak; bukan masalah keamanan.
- **Bukti test**: `akun.pairing.qa.test.ts:122` mengunci total ≤ 120 detik; format mm:ss belum diuji (dicatat agar tidak hilang).

**N-2 (Low) — Penanda skip passkey tidak ikut dibersihkan saat logout/hapus akun.**

- **Lokasi**: `useLogout.ts:8` (`APP_STORAGE_PREFIX = 'ip-'`) vs `passkey-setup.ts:44,54-58` (`ip.passkeySetupSkipped[:<userId>]`), dipanggil `useLogout.ts:43` dan `useAccountDeletion.ts:162`.
- **Reproduksi**: di perangkat tanpa WebAuthn klik "Lanjut tanpa passkey" → logout / hapus akun → di DevTools masih ada `ip.passkeySetupSkipped:<userId>`.
- **Expected**: AC hapus akun "storage lokal bersih" — penanda milik akun yang dihapus ikut terbuang. Cukup pakai prefix `ip-` (atau hapus eksplisit key per akun).
- **Actual**: key tersisa. Isinya bukan kunci/data user, hanya preferensi + id akun; karena sudah per akun, akun lain tidak terpengaruh.
- **Severity**: Low (higienis/privasi ringan, bukan kebocoran).

**N-3 (Low, kualitas test) — Test putaran 1 mengunci bug format waktu.**

- `akun.qa.test.ts:88` menegaskan `2026-10-22T09:15:00.000Z` (ISO mentah). Selama file itu dijalankan apa adanya, memperbaiki BUG-7 akan membuat test merah. Rekomendasi: saat format waktu diperbaiki, ubah assertion itu ke waktu lokal terformat (mis. `22 Okt 2026, 16.15` — `useDateFormat` sudah punya `dateTime()`), lalu hijaukan bersama.

**N-4 (Low, dokumentasi) — Panduan masih menyebut fitur T22 "belum ada".**

- **Lokasi**: `app/utils/guide.ts:255` ("Beberapa bagian masih menyusul: tambah perangkat lewat QR, alur lupa OTP, hapus akun, indikator sync...") dan `:360` ("Tambah perangkat lewat QR ... belum tersambung di versi ini").
- **Reproduksi**: buka `/app/panduan` → tiga dari empat fitur yang disebut "menyusul" sudah tampil di UI (lupa OTP, hapus akun, indikator sync).
- **Expected**: teks panduan mengikuti kondisi sebenarnya; setelah BUG-9 diperbaiki, QR juga ikut diperbarui.
- **Actual**: informasi produk ke user basi. **Severity**: Low (tidak memblokir, tapi menyesatkan). Catatan: area guide di luar batas edit QA — dilaporkan untuk `dimas`.

### Cek tiga pilar (putaran 2)

**Keamanan**

- ✅ Lupa OTP tidak berpura-pura: tanpa sesi, UI menjelaskan passkey/kode membuka **data**, bukan sesi login; server tetap pemutus (`AuthRecoveryStep.vue:50-54`; test `login.recovery.qa.test.ts:70`).
- ✅ QR hanya membawa publik: request = `{v, publicKey, nonce, deviceId}`; response = `{v, id, expiresAt}`; kunci utama hanya ada di dalam sealed box (`transfer.ts:133-156`; test `transfer.qa.test.ts:20-56`).
- ✅ Klaim transfer terikat sesi + perangkat target, TTL 120 s, sekali pakai, error 404 seragam (`server/services/keys.ts:165-180`).
- ✅ QR asing ditolak sebelum request; test UI membuktikan 0 request (`akun.pairing.qa.test.ts:144`).
- ✅ Tanpa `v-html` untuk data user/QR; QR digambar sebagai `<path>` (`ui/QrCode/index.vue:34-69`), chunk akun `innerHTML` 0.
- ✅ Hapus akun: bukti kepemilikan = sesi + OTP ke email sesi; rate limit di kedua endpoint (`account.delete.ts:44-52`), `RATE_LIMITED` dipetakan.
- ✅ Tidak ada token/kunci/24 kata di `localStorage`/`useState`/payload SSR (AC #9). ⚠️ N-2 hanya menyisakan id akun di key preferensi.

**Performa**

- ✅ `uqr` hanya di chunk halaman akun: build baru → `CIrDh1u0.js` (satu-satunya chunk dengan `crispEdges`), **10.396 B gzip** total; modul `uqr` sendiri **7.843 B gzip** (klaim "~7,8 KB" benar); entry tidak meng-import statis chunk itu; jauh di bawah budget chunk 100 KB.
- ✅ QR dihitung sekali (`computed`) dan digambar satu `<path>` per deret, bukan ribuan node (`QrCode/index.vue:28-53`).
- ✅ Indikator sync: satu `countOutbox` + `getSyncState` per refresh, interval 60 s + event online/offline/visibility (`ShellSyncStatus.vue:95,135-156`); tanpa polling agresif.
- ✅ Tidak ada request baru di jalur login; pairing/hapus akun hanya saat user membuka dialog.

**Kerapian**

- ✅ `nuxi typecheck` exit 0; `eslint --max-warnings 0` exit 0; `prettier --check` bersih (termasuk 5 file test baru).
- ✅ Test menguji perilaku (teks, tombol, request, isi IndexedDB, round-trip kripto), mock jaringan di batas `$fetch`/`JsonFetch`; tidak ada `.only`/`.skip`; tidak ada `console.log`/`TODO`/`any`/`@ts-ignore` di kode baru.
- ✅ Dokumentasi "kenapa" ada di komentar (batas sesi vs kunci, TTL server, sekali pakai).
- ❌ **BUG-9**: komponen pairing ada dan teruji, tetapi tidak dapat dijangkau dari perangkat yang membutuhkannya (gate non-dismissible tanpa opsi QR). "Fitur yang ada" ≠ "fitur yang bisa dipakai" — ini yang membuat putaran 2 gagal.
- ⚠️ Ukuran SFC melewati pedoman ~200 baris: `RecoveryBackupCard.vue` 331, `akun.vue` 251, `PasskeyOnboarding.vue` 249, `QrScanner.vue` 214. Sebagian besar baris adalah CSS; bukan blocker, tapi kandidat pemecahan saat disentuh lagi.
- ⚠️ N-3 (test lama mengunci format ISO) dan BUG-8 (format countdown) — keduanya Low.

### Coverage & celah yang tersisa

| Area | Cakupan putaran 2 | Celah |
|---|---|---|
| Lupa OTP | Tautan di email & OTP, langkah, jujur tanpa sesi, form kode/berkas, tombol kembali | WebAuthn nyata; pembukaan kode `iprk1.*` end-to-end di browser (kripto kode sudah diuji T20) |
| QR | Dua peran, QR SVG, ≤120 s, QR asing 0 request, sealed box X25519, nonce, sekali pakai (komponen + composable + server) | **Keterjangkauan dari perangkat baru (BUG-9)**; kamera/`BarcodeDetector` nyata; UI setelah timer 120 s berjalan (dipakai `isExpired` + test composable); scan dua perangkat sungguhan |
| Hapus akun | Dialog, endpoint, validasi, cleanup state/localStorage, redirect, rate limit | Wipe IndexedDB diverifikasi lewat kode + kontrak core, belum lewat komponen; N-2 |
| Sync | Status dari core, unknown saat storage belum siap, outbox/error/offline/lastSync | Perubahan status karena event jaringan nyata (butuh browser) |
| Non-fungsional | Typecheck/lint/format, ukuran chunk, grep keamanan | Lighthouse/CWV dan E2E Playwright belum dijalankan (sama seperti putaran 1) |

### Perintah yang dijalankan + hasil (putaran 2)

Semua dari `apps/web`, Node 24.18.0, Vitest 5.0.3, 2026-10-23.

| # | Perintah | Hasil |
|---|---|---|
| 1 | `pnpm exec vitest run app/pages/login.qa.test.ts app/pages/app/akun.qa.test.ts app/layouts/dashboard.qa.test.ts app/components/features/account/RecoveryBackupCard.qa.test.ts app/composables/useLoginFlow.test.ts app/components/features/account/PasskeyOnboarding.test.ts` | **6 file, 41 test — semua lulus** (putaran 1: 6 gagal) |
| 2 | `pnpm exec vitest run app/pages/login.recovery.qa.test.ts app/pages/app/akun.pairing.qa.test.ts app/components/features/shell/ShellSyncStatus.qa.test.ts app/utils/crypto/transfer.qa.test.ts app/components/features/account/KeyRecoveryGate.qr.qa.test.ts` | **5 file, 18 test — 17 lulus, 1 gagal** (gagal = BUG-9) |
| 3 | Regresi terarah: `pnpm exec vitest run` 31 file area akun/auth/shell/dashboard (`account`, `auth`, `useLoginFlow*`, `useAuthSession`, `useOtpInput`, `useLogout`, `useAccountDeletion`, `useDevicePairing`, `useSyncStatus`, `utils/account`, `transfer`, `passkey`, `device-slot`, `middleware/auth.global`, `layouts/dashboard*`, `shell/ShellNav`, `shell/ShellSyncStatus.qa`) | **31 file, 181 test — 180 lulus, 1 gagal** (BUG-9) |
| 4 | `pnpm exec nuxi typecheck` | **exit 0** |
| 5 | `pnpm exec eslint <5 file test baru> --max-warnings 0` | **exit 0** |
| 6 | `pnpm exec prettier --check <5 file test baru>` | **All matched files use Prettier code style!** |
| 7 | `pnpm exec nuxt build` | **Build complete** — 7,97 MB (2,15 MB gzip). (Build lama 08:52 sudah basi; angka chunk diambil dari build baru.) |
| 8 | Cek chunk: `grep -l crispEdges .output/public/_nuxt/*.js` + `gzip -c` | Hanya `CIrDh1u0.js` (chunk `/app/akun`) = **10.396 B gzip**; `uqr` = **7.843 B gzip**; entry `DylGbSws.js` = 66.587 B gzip dan **tidak** meng-import statis chunk akun |
| 9 | `grep -rn "v-html\|innerHTML" app --include='*.vue' --include='*.ts' \| grep -v test` | Hanya komentar penjelasan (`QrCode/index.vue:9-10`, `utils/icons.ts:3`); tidak ada pemakaian |
| 10 | `grep -rn "localStorage" app ... \| grep -v test` | Hanya preferensi tampilan/harian/pomodoro + penanda onboarding; tidak ada token/kunci/kode (lihat N-2) |
| 11 | `sha256sum <6 file test putaran 1>` | Tercatat di §Integritas test di atas |

### File test baru putaran 2 (hanya test)

| File | Isi |
|---|---|
| `apps/web/app/pages/login.recovery.qa.test.ts` | 5 test: tautan di email & OTP, langkah pemulihan, jujur tanpa sesi, form kode/berkas saat sesi ada, tombol kembali |
| `apps/web/app/pages/app/akun.pairing.qa.test.ts` | 6 test: dua peran, QR SVG + ≤120 s, QR asing 0 request, perangkat tercabut tanpa tombol, dialog hapus (validasi + tombol mati), endpoint `deletion-otp` |
| `apps/web/app/components/features/shell/ShellSyncStatus.qa.test.ts` | 2 test: storage belum terbuka/terkunci tidak menampilkan "Tersinkron" |
| `apps/web/app/utils/crypto/transfer.qa.test.ts` | 4 test: isi QR request, sealed box X25519, nonce terikat, QR asing ditolak sebelum membungkus |
| `apps/web/app/components/features/account/KeyRecoveryGate.qr.qa.test.ts` | 1 test (merah = BUG-9): layar pulih perangkat baru harus punya jalan ke QR tambah perangkat |

Tidak ada kode produk (`app/**` non-test, `server/**`, `packages/**`), tema/goals/guide, commit, atau status Ergonio yang disentuh. Rekomendasi untuk sesi induk: **`status-1792622168795` (Failed)** + `progressPct` jangan dinaikkan ke 100, dengan komentar bug BUG-9 (High) dan catatan BUG-8/N-2/N-3/N-4 (Low). Perbaikan minimum: tambahkan aksi "Tambah perangkat lewat QR" (peran perangkat baru) di `KeyRecoveryGate` — atau buat `AccountDevicePairingDialog` dapat dijangkau dari gate — lalu hijaukan `KeyRecoveryGate.qr.qa.test.ts`.

---

## Putaran 1 (arsip 2026-10-23 05:51) — Verdict

**GAGAL (blocking).**

Empat acceptance criteria T22 belum ada di UI sama sekali: **alur lupa OTP**, **tambah perangkat via QR**, **hapus akun**, dan **indikator status sync**. Keempatnya bukan "kurang rapi" — tidak ada elemen, route, atau composable-nya, dan halaman `akun.vue:10-12` serta Panduan (`app/utils/guide.ts:255`) sendiri menyatakan bagian itu "belum ada/menyusul". Dua bug tambahan (Medium) ditemukan pada bagian yang sudah ada: perangkat yang sudah dicabut ditampilkan seolah masih login, dan kegagalan membuat kode pemulihan tidak diberitahukan ke user.

Sisanya lulus dengan bukti test yang dijalankan: login OTP + Google, jeda kirim ulang 30 detik, pesan error generik, onboarding passkey yang tidak bisa ditutup, kartu backup kode pemulihan (`iprk1.*` = 24 kata + envelope, Salin/Bagikan/Unduh, slot `recovery`, status "sudah disimpan"), daftar perangkat + logout jarak jauh, dan tidak ada bahan rahasia di state SSR/`localStorage`/`v-html`.

Snapshot: **18 file test, 115 test — 109 lulus, 6 gagal**. Enam kegagalan = 4 test AC yang fiturnya belum ada + 2 test bukti bug. Baseline sebelum test QA baru: **13 file, 95 test lulus, 0 gagal**. `nuxi typecheck` exit 0, `eslint --max-warnings 0` exit 0, `prettier --check` bersih.

Status Ergonio **tidak saya ubah** (tetap `review`) sesuai batas tugas. Rekomendasi transisi untuk sesi induk: **`status-1792622168795` (Failed)** — bukan `done`, dan `progressPct` jangan dinaikkan ke 100. Tidak ada kode produk yang disentuh.

## Scope & test plan

| Area | Level | Alasan level |
|---|---|---|
| Login OTP/Google: validasi email, langkah OTP, jeda 30 detik, pemetaan error, redirect aman | composable + page mount (`useLoginFlow`, `login.vue`) | Perilaku yang dijanjikan AC adalah perilaku UI (tombol, pesan, langkah), bukan detail implementasi; jaringan di-mock di batas `$fetch`/gateway |
| Onboarding passkey: tidak bisa ditutup, Esc/klik latar, skip hanya saat WebAuthn tidak ada, kartu backup bukan gerbang | komponen (`PasskeyOnboarding`, `ui/Modal`) | Sifat "tidak bisa ditutup" hanya bisa dibuktikan di DOM (tombol apa yang ada, event apa yang diabaikan) |
| Kartu backup kode pemulihan: format kode, aksi simpan, slot `recovery`, status | komponen + kripto asli (fake-indexeddb) | Satu-satunya cara membuktikan "kode = 24 kata + envelope" dan "envelope masuk slot recovery" adalah menjalankan kriptonya, bukan mem-mock-nya |
| Daftar perangkat + logout jarak jauh | page mount (`akun.vue`) + gateway | Membuktikan apa yang benar-benar tampil (nama, waktu, kota) dan request yang dikirim saat tombol cabut ditekan |
| Lupa OTP / QR / hapus akun / indikator sync | page/layout mount | AC menuntut elemennya ada; test gagal = bukti tidak ada |
| Keamanan state: kode/24 kata tidak di `useState`/payload SSR, token tidak di JS, tanpa `v-html` | komponen + inspeksi kode/grep | Bisa diuji langsung pada payload state setelah kode dibuat |

**Tidak diuji (dan alasannya):**

- **WebAuthn nyata** (`navigator.credentials.create/get` + ekstensi `prf`): butuh Playwright/CDP virtual authenticator atau perangkat nyata. Batas ini dinyatakan jujur di `app/utils/crypto/webauthn.ts:6-15`; yang terbukti di sini adalah aturan UI + pembungkusan kunci (T20).
- **QR end-to-end**: UI-nya tidak ada, jadi tidak ada yang bisa diuji selain ketiadaannya. Relay server sudah siap (`server/services/keys.ts:138`, TTL 120 s) dan sudah diuji T19/T20.
- **Perilaku lintas-perangkat sungguhan** (sync indikator berubah karena event jaringan): tidak ada indikator/queue UI untuk dipicu.
- **Server** (`server/**`): sudah LULUS di `reports/qa-t19-server-akun.md`; laporan ini hanya memakai server sebagai rujukan kontrak.

## Hasil per acceptance criteria

| # | Acceptance criterion | Status | Bukti |
|---|---|---|---|
| 1 | Daftar/login email OTP + Google SSO; OTP dikirim dengan jeda **30 detik**; pesan error tidak membocorkan apakah email terdaftar | **PASS** | Kode: `app/components/features/auth/AuthEmailStep.vue:17-43,51-75` (Google + form email), `AuthOtpStep.vue:69-106` (6 kotak + kirim ulang), `app/composables/useLoginFlow.ts:97` (jeda dari kontrak, bukan angka lokal), `packages/contracts/src/auth.ts:31` (`OTP_RESEND_COOLDOWN_SECONDS = 30`), `useLoginFlow.ts:13-25,36-40` (semua pesan generik; tidak ada kunci "email tidak terdaftar"). Test: `app/composables/useLoginFlow.test.ts:217` (cooldown tepat 30 s, kirim ulang ditolak s/d habis), `:253` (email terdaftar vs belum → langkah sama), `:267` (tidak ada pesan menyebut status pendaftaran), `app/pages/login.qa.test.ts:25` (halaman merender OTP + Google). |
| 2 | Onboarding passkey wajib satu tap: dialog tanpa tombol tutup, Esc/klik latar tidak menutup; skip **hanya** kalau perangkat tidak mendukung WebAuthn; PRF tidak keluar dari authenticator | **PASS** (dengan 2 catatan) | Kode: `PasskeyOnboarding.vue:100` memakai `Modal` dengan default `isDismissible=false`; `ui/Modal/index.vue:22,57-68` (Esc `preventDefault`, klik latar diabaikan, tanpa tombol ×); tombol skip hanya dirender di cabang `v-else` saat `isSupported=false` (`PasskeyOnboarding.vue:143-161`); PRF hanya dipakai menurunkan kunci pembungkus dan tidak pernah dikirim/disimpan — server menerima `{slot,wrappedKey,kdfParams}` saja (`app/utils/crypto/passkey.ts:126-146,181-183`), material lokal hanya `credentialId` + `salt` (`:138-145`). Test: `PasskeyOnboarding.test.ts:69` (tanpa tombol tutup, Esc & klik latar tidak menutup), `:102` (perangkat tanpa WebAuthn tidak jadi jalan buntu), `:119` (langkah backup bisa dilewati setelah passkey aktif = bukan gerbang). Catatan: skip flag bisa dipaksa lewat `localStorage` (§Temuan N-1); WebAuthn nyata belum otomatis (§Celah). |
| 3 | Kartu "Backup kode pemulihan": disarankan bukan gerbang; kode = 24 kata + envelope dalam satu string `iprk1.`; aksi Simpan ke cloud (share sheet OS, tanpa OAuth) / Salin / Unduh .txt / "Sudah saya simpan"; envelope masuk slot `recovery`, status "sudah disimpan" | **PASS** | Kode: `RecoveryBackupCard.vue:105-165` (kode, Salin, Unduh .txt, Bagikan via `navigator.share`, konfirmasi + Selesai), `useAccount.ts:187-208` (`buildBackupCode`), `:231-255` (`keyStore.put('recovery', …)`), i18n `account.backup.status.set` = "sudah disimpan". Test baru: `RecoveryBackupCard.qa.test.ts:104` (kode `iprk1.*`, 24 kata, envelope `wrappedKey`), `:116` (Salin → clipboard berisi kode; Bagikan → `navigator.share` dengan teks kode dan **0 request** ke server), `:138` (Selesai → badge "sudah disimpan" + slot `recovery` di IndexedDB berisi `kind: recovery-envelope`). "Bukan gerbang": `PasskeyOnboarding.test.ts:119`. Catatan: tombol berlabel **"Bagikan"** (mekanisme share sheet yang diminta), tampil hanya bila browser punya `navigator.share`. |
| 4 | Lupa OTP: alur email → "Pakai passkey atau kode pemulihan?" | **FAIL** | Tidak ada langkah/route/teks apa pun: `app/composables/useLoginFlow.ts:10` hanya `'choose' \| 'otp'`; `app/pages/login.vue:13-14` hanya dua komponen itu; i18n `login.*` tidak punya kunci lupa/pemulihan; halaman akun menyatakan "alur lupa OTP" belum ada (`app/pages/app/akun.vue:11`); Panduan juga (`app/utils/guide.ts:255`). Test merah: `app/pages/login.qa.test.ts:33`. |
| 5 | Tambah perangkat via QR: kedaluwarsa ≤ 2 menit & sekali pakai | **FAIL (UI)** | Server sudah benar: `packages/contracts/src/keys.ts:113` (`KEY_TRANSFER_TTL_SECONDS = 120`), `server/services/keys.ts:138` (TTL ditentukan server) — diuji T19/T20. Tetapi tidak ada UI pemindai/penampil QR: `app/pages/app/akun.vue:76-100` hanya daftar perangkat + cabut; `akun.vue:11` menyatakan "layar tambah perangkat via QR" belum ada; tidak ada komponen/route QR (`grep -rn "qr\|QR" apps/web/app` → hanya komentar). Test merah: `app/pages/app/akun.qa.test.ts:123`. |
| 6 | Daftar perangkat: nama, waktu login terakhir, lokasi dari IP; logout jarak jauh | **PASS** (dengan 2 bug) | Kode: `akun.vue:79-99` (nama, platform, waktu, kota, tombol cabut hanya untuk perangkat lain), `app/utils/account/devices-gateway.ts:77-83` (`DELETE /v1/devices/:id`, id dari server). Test: `app/pages/app/akun.qa.test.ts:79` (nama + waktu + kota + badge "perangkat ini"), `:93` (tombol cabut hanya 1 dan memanggil `DELETE /v1/devices/<id>`). Bug: perangkat yang sudah dicabut tidak ditandai (BUG-5, test `:108` merah) dan waktu ditampilkan ISO mentah UTC (BUG-7). |
| 7 | Hapus akun: konfirmasi email + OTP ulang | **FAIL** | Endpoint server ada (`server/routes/v1/account.delete.ts`, `account/deletion-otp.post.ts`), tetapi tidak ada tombol/dialog di UI: `akun.vue:10-12` menyatakan "hapus akun" belum ada; `grep -rn "deleteAccount\|Hapus akun" apps/web/app` → hanya komentar. Test merah: `app/pages/app/akun.qa.test.ts:131`. |
| 8 | Indikator status sync tampil dan konsisten | **FAIL** | Tidak ada indikator di layout/shell: `app/layouts/dashboard.vue:24-52` tidak memuat komponen sync; i18n tidak punya pesan tersinkron/menunggu/offline/gagal. Status hanya ada di core (`packages/core/src/sync/status.ts`, dinilai T21) dan laporan T21 secara eksplisit mencatat "indikator UI belum ada dan memang milik T22". Test merah: `app/layouts/dashboard.qa.test.ts:42`. |
| 9 | Tidak ada data sensitif (token/kunci/24 kata) di `useState`/payload SSR/localStorage; tanpa `v-html` data user | **PASS** | Kode: `useAccount.ts:68-72` — kode pemulihan & envelope di `ref`, bukan `useState`; state hanya status + DTO perangkat (`:63-76`); `useAuthSession.ts:34` hanya `user/device/expiresAt`, token tidak pernah ada di JS (`app/composables/auth/gateway.ts:8-11`); `grep -rn "v-html\|innerHTML" apps/web/app` → tidak ada pemakaian (satu komentar di `utils/icons.ts:3`); `localStorage` hanya preferensi tampilan + penanda onboarding (`app/composables/useDeco.ts:12`, `passkey-setup.ts:51`), tidak ada kunci/kode. Test baru: `RecoveryBackupCard.qa.test.ts:169` — setelah kode dibuat, payload state Nuxt tidak memuat kodenya maupun prefiks `iprk1.`. |

**Ringkasan: 5 PASS (2 dengan catatan/bug), 4 FAIL.**

## Bug & temuan (urut severity)

### BUG-1 (High, blocking AC #4) — Alur "lupa OTP" tidak ada

- **Lokasi**: `apps/web/app/composables/useLoginFlow.ts:10`, `apps/web/app/pages/login.vue:13-14`, `apps/web/app/pages/app/akun.vue:11`, `apps/web/app/utils/guide.ts:255`.
- **Reproduksi**: buka `/login` → tidak ada tautan "tidak bisa menerima kode?" / "pakai passkey atau kode pemulihan" di langkah email maupun langkah OTP; `grep -rni "lupa OTP\|passkey atau kode pemulihan" apps/web/app apps/web/i18n` → hanya komentar (pengakuan "belum ada" di `akun.vue:11`/`guide.ts:255`, plus catatan layar pemulihan di `layouts/dashboard.vue:33`), tidak ada elemen UI. Test: `app/pages/login.qa.test.ts:33` (merah).
- **Expected**: dari langkah email/OTP ada jalan ke pilihan "Pakai passkey atau kode pemulihan?" lalu ke flow masing-masing (passkey → `KeyRecoveryGate`, kode → kolom kode/berkas).
- **Actual**: user yang tidak bisa menerima email terkunci — tidak ada pilihan apa pun; hanya bisa kirim ulang OTP atau ganti email.
- **Dampak**: kehilangan akses total bagi user yang emailnya tidak bisa diakses (padahal pemulihan kripto sudah ada di `KeyRecoveryGate`).

### BUG-2 (High, blocking AC #5) — Tambah perangkat via QR tidak ada di UI

- **Lokasi**: `apps/web/app/pages/app/akun.vue:76-100` (hanya daftar + cabut), komentar pengakuan di `akun.vue:11`, `guide.ts:255`.
- **Reproduksi**: buka `/app/akun` → tidak ada tombol "Tambah perangkat"/QR/kedaluwarsa; `grep -rni "qr\|scan" apps/web/app --include=*.vue` → kosong. Test: `app/pages/app/akun.qa.test.ts:123` (merah).
- **Expected**: tombol menampilkan QR dari perangkat lama, dengan batas waktu ≤ 2 menit dan sekali pakai (server sudah menyediakan: `KEY_TRANSFER_TTL_SECONDS = 120`, `services/keys.ts:138`).
- **Actual**: jalur satu-satunya untuk perangkat baru adalah passkey/kode pemulihan; QR (ala WhatsApp) yang diminta AC tidak ada.

### BUG-3 (High, blocking AC #7) — Hapus akun tidak ada di UI

- **Lokasi**: `apps/web/app/pages/app/akun.vue:10-12`; route server tersedia (`server/routes/v1/account.delete.ts`, `server/routes/v1/account/deletion-otp.post.ts`).
- **Reproduksi**: buka `/app/akun` → tidak ada tombol/menu "Hapus akun"; test `app/pages/app/akun.qa.test.ts:131` (merah).
- **Expected**: aksi hapus akun dengan konfirmasi email + OTP ulang (memakai endpoint `deletion-otp`), lalu logout.
- **Actual**: user tidak punya cara menghapus akun dari produk (harus lewat API manual).

### BUG-4 (High, blocking AC #8) — Indikator status sync tidak ada

- **Lokasi**: `apps/web/app/layouts/dashboard.vue:24-52`, `app/components/features/shell/*` (tidak ada komponen status), i18n tidak punya pesan status sync.
- **Reproduksi**: buka `/app` setelah login → tidak ada elemen tersinkron/menunggu/offline/gagal; test `app/layouts/dashboard.qa.test.ts:42` (merah).
- **Expected**: indikator status yang terlihat dan konsisten (PRD F15 "Status Sync Terlihat"; status core sudah ada: `packages/core/src/sync/status.ts`).
- **Actual**: user tidak punya cara tahu data sudah terkirim atau masih antre/gagal. T21 mencatat ini eksplisit sebagai pekerjaan T22.

### BUG-5 (Medium) — Perangkat yang sudah dicabut tampil seolah masih login

- **Lokasi**: `apps/web/app/pages/app/akun.vue:80-99` (tidak membaca `device.revokedAt`); server sengaja mengembalikan baris tercabut sebagai jejak audit (`apps/web/server/services/device.ts:108-116`, kontrak `packages/contracts/src/devices.ts:27-33`).
- **Reproduksi**: cabut satu perangkat lain → daftar dimuat ulang → baris yang sama tetap tampil dengan tombol "Cabut akses" yang sama, tanpa penanda. Test: `app/pages/app/akun.qa.test.ts:108` (merah; `AccountDevice` menyertakan `revokedAt`).
- **Expected**: baris yang `revokedAt != null` ditandai "sudah dicabut/tidak aktif" (atau tidak ditampilkan sebagai perangkat aktif) dan tidak menawarkan "Cabut akses" lagi — PRD F15: daftar ini "perangkat yang login sekarang".
- **Actual**: perangkat yang sudah logout tampak masih punya akses; user tidak bisa membedakan sesi hidup vs jejak audit.
- **Dampak**: keputusan keamanan user ("apakah masih ada perangkat lain yang bisa membuka akun saya?") jadi salah.

### BUG-6 (Medium) — Kegagalan membuat kode pemulihan tidak diberitahukan (tombol seolah tidak bekerja)

- **Lokasi**: `apps/web/app/components/features/account/RecoveryBackupCard.vue:92-166` (template tidak pernah merender `account.error`); error-nya justru diisi `app/composables/useAccount.ts:202-207` / `:249-254`.
- **Reproduksi**: buka `/app/akun` dalam kondisi data lokal tidak bisa dibuka (storage diblokir/konteks tidak aman) → klik "Buat kode pemulihan" → tidak ada kode, tidak ada pesan, tombol kembali normal. Test: `RecoveryBackupCard.qa.test.ts:157` (merah).
- **Expected**: pesan gagal yang bisa dibaca (seperti kartu lain: `akun.vue:45-47`) atau minimal `role="alert"`.
- **Actual**: klik tidak menghasilkan apa pun; user menyimpulkan tombolnya rusak, padahal backup kode adalah satu-satunya jalan pulih jika passkey hilang.
- **Catatan**: di dalam dialog onboarding error ini tampil (`PasskeyOnboarding.vue:176-178`), jadi masalahnya khusus kartu mandiri di halaman Akun.

### BUG-7 (Low) — Waktu perangkat ditampilkan sebagai ISO mentah UTC dan bukan "login terakhir"

- **Lokasi**: `apps/web/app/pages/app/akun.vue:85-88` (`device.lastSeenAt` dirender apa adanya; label i18n `account.devices.lastSeen` = "terakhir aktif").
- **Reproduksi**: buka `/app/akun` → baris perangkat menampilkan `2026-10-22T09:15:00.000Z`, bukan waktu lokal yang terbaca.
- **Expected**: waktu lokal terformat (mis. "22 Okt 2026, 16:15") dan/atau label "login terakhir" sesuai AC.
- **Actual**: string ISO UTC; AC "waktu login terakhir" dipenuhi lewat `lastSeenAt` (aktivitas terakhir), bukan waktu login — DTO memang tidak punya `lastLoginAt`.
- **Severity**: Low (informasi ada, tapi membingungkan dan tidak konsisten dengan format tanggal lain di app).

### Temuan N-1 (Low, keamanan) — Penanda "lanjut tanpa passkey" bisa dipaksa & tidak terikat akun

- **Lokasi**: `apps/web/app/utils/account/passkey-setup.ts:51-56` (`readPasskeySkip` hanya membaca `localStorage`), dipakai `PasskeyOnboarding.vue:55-60` tanpa memeriksa dukungan WebAuthn lagi.
- **Reproduksi**: di browser yang mendukung WebAuthn, set `localStorage['ip.passkeySetupSkipped']='1'` lalu muat ulang `/app` → dialog wajib tidak muncul.
- **Expected (AC)**: skip hanya sah kalau perangkat memang tidak mendukung WebAuthn; penanda sebaiknya hanya dihormati bila `isWebAuthnAvailable() === false` (dan idealnya per akun).
- **Actual**: penanda dihormati tanpa syarat; nilainya juga global (bukan per akun), meski dihapus saat logout (`useLogout.ts:43`).
- **Severity**: Low — ini kontrol UX di sisi client (user bisa mengubah apa pun di perangkatnya sendiri) dan risikonya adalah kehilangan data milik user itu sendiri, bukan kebocoran. Dicatat agar tidak hilang saat hardening.

## Cek tiga pilar

### Keamanan
- ✅ Pesan login generik; tidak ada cabang "email terdaftar" di UI maupun i18n (`useLoginFlow.ts:36-40`; test `useLoginFlow.test.ts:253,267`).
- ✅ Sesi hanya cookie `HttpOnly`; tidak ada token di JS/`localStorage`/Pinia (`auth/gateway.ts:8-11`, `useAuthSession.ts:24-36`).
- ✅ Kode pemulihan & envelope tidak masuk `useState`/payload SSR (ref + test `RecoveryBackupCard.qa.test.ts:169`); tidak ada `v-html`/`innerHTML` dengan data user.
- ✅ PRF tidak pernah dikirim/disimpan (`passkey.ts:126-146,181-183`); server hanya menerima envelope passkey.
- ✅ Redirect setelah login dibatasi path internal (`useLoginFlow.ts:130`, `safeRedirectPath`; test `:107`); guard hanya proteksi UX, server tetap memutuskan (`middleware/auth.global.ts:4-13`).
- ⚠️ BUG-5 (perangkat tercabut tampil aktif) dan N-1 (skip flag) — keduanya bukan kebocoran data, tapi menurunkan kejernihan keputusan keamanan user.

### Performa
- ✅ Tidak ada request baru di jalur login: satu `POST otp/request` + satu `POST otp/verify`; sesi hasil login langsung jadi state tanpa fetch tambahan (`useAuthSession.ts:76-86`).
- ✅ Kode pemulihan dibuat hanya saat diminta (`RecoveryBackupCard.vue:45-56`), bukan saat halaman akun dimuat; daftar perangkat satu request (`useAccount.ts:123`).
- ✅ Modal/layout memakai komponen ringan; tidak ada dependency baru di PR ini.
- ⚠️ Kartu backup di dalam dialog membuat kode otomatis saat langkah 2 dibuka (Argon2id berjalan di sana). Ini disengaja (satu tap → kode siap), tapi biayanya terasa di perangkat lambat; bukan regresi jalur panas.

### Kerapian
- ✅ Struktur & penamaan sesuai `code-quality.md` (`features/account`, `features/auth`, `composables/useXxx`, `utils/account`); komentar menjelaskan "kenapa".
- ✅ `nuxi typecheck` exit 0, eslint `--max-warnings 0` exit 0, prettier bersih untuk seluruh file yang saya sentuh.
- ✅ Test menguji perilaku (teks/tombol/state/isi IndexedDB/request), jaringan di-mock di batas `$fetch`; tidak ada `.only`/`.skip`/test dihapus.
- ❌ Empat fitur AC belum ada, dan dokumen internal (`akun.vue:10-12`, `guide.ts:255`) sudah menyebutnya "belum ada" — pekerjaan T22 belum selesai, bukan sekadar tidak terdokumentasi.
- ❌ BUG-6: kartu backup tidak menampilkan error yang sudah dihitung composable (dead feedback path).

## Coverage & celah test yang tersisa

| Area | Cakupan sekarang | Celah |
|---|---|---|
| Login OTP/Google | Email validasi, langkah, cooldown 30 s, semua kode error, redirect aman, `?error=oauth` | Belum ada E2E browser (klik nyata + cookie) |
| Onboarding passkey | Tidak bisa ditutup (Esc/latar), skip hanya saat tidak didukung, langkah backup bisa dilewati | WebAuthn nyata (registrasi + PRF) — butuh Playwright virtual authenticator |
| Kartu backup | Format `iprk1.*`, 24 kata, Salin, Bagikan (tanpa request), slot `recovery`, status, tidak ada kode di state | Unduh `.txt` belum diklik (butuh stub `URL.createObjectURL`); berkas terenkripsi kata sandi sudah diuji T20 |
| Perangkat | Render nama/waktu/kota, badge perangkat ini, DELETE yang benar | Perangkat tercabut (BUG-5), format waktu (BUG-7) |
| Lupa OTP / QR / hapus akun / indikator sync | **Tidak ada implementasi** — 4 test merah sebagai bukti | Seluruh alur, termasuk kedaluwarsa & sekali pakai QR di UI |
| Keamanan state | Kode tidak di payload SSR; token tidak di JS; tanpa `v-html` | Uji otomatis `localStorage` allowlist (saat ini inspeksi grep) |

**Rekomendasi (untuk `dimas`, bukan saya):**
1. Selesaikan 4 AC yang belum ada (lupa OTP, QR, hapus akun, indikator sync) — server & mesin sync sudah siap; test merahnya tinggal dihijaukan.
2. Tandai/ sembunyikan perangkat dengan `revokedAt` dan jangan tawarkan "Cabut akses" untuknya.
3. Tampilkan `account.error` di `RecoveryBackupCard` (role="alert").
4. Format `lastSeenAt` ke waktu lokal; pertimbangkan label "login terakhir" bila DTO ditambah `lastLoginAt`.
5. Hormati penanda skip hanya saat `isWebAuthnAvailable() === false` (dan pertimbangkan scope per akun).
6. Tambahkan E2E Playwright dengan virtual authenticator untuk AC passkey (celah terbesar, sama seperti T20).

## Perintah yang dijalankan + hasil

Semua dari `/media/DATA/Development/stackinnov/products/improve-personal/apps/web`, Node 24, Vitest 5.0.3, tanggal 2026-10-23.

| # | Perintah | Hasil |
|---|---|---|
| 1 | Baseline sebelum test baru: `pnpm exec vitest run app/components/features/account app/composables/useLoginFlow.test.ts app/composables/useAuthSession.test.ts app/composables/useOtpInput.test.ts app/composables/auth app/middleware/auth.global.test.ts app/layouts/dashboard.test.ts app/utils/account` | **13 file, 95 test lulus, 0 gagal** |
| 2 | `pnpm exec vitest run app/components/features/account/RecoveryBackupCard.qa.test.ts` | **5 test — 4 lulus, 1 gagal** (BUG-6) |
| 3 | `pnpm exec vitest run app/components/features/account/PasskeyOnboarding.test.ts` | **6 test lulus** (termasuk 1 test baru "bukan gerbang") |
| 4 | `pnpm exec vitest run app/composables/useLoginFlow.test.ts` | **22 test lulus** (termasuk 3 test baru cooldown/enumerasi) |
| 5 | `pnpm exec vitest run app/pages/login.qa.test.ts` | **2 test — 1 lulus, 1 gagal** (BUG-1) |
| 6 | `pnpm exec vitest run app/pages/app/akun.qa.test.ts` | **5 test — 2 lulus, 3 gagal** (BUG-2, BUG-3, BUG-5) |
| 7 | `pnpm exec vitest run app/layouts/dashboard.qa.test.ts` | **1 test gagal** (BUG-4) |
| 8 | **Run gabungan final T22**: `pnpm exec vitest run app/pages/app/akun.qa.test.ts app/pages/login.qa.test.ts app/layouts/dashboard.qa.test.ts app/layouts/dashboard.test.ts app/components/features/account app/composables/useLoginFlow.test.ts app/composables/useAuthSession.test.ts app/composables/useOtpInput.test.ts app/composables/auth app/composables/useLogout.test.ts app/middleware/auth.global.test.ts app/utils/account` | **18 file, 115 test — 109 lulus, 6 gagal** (4 AC belum ada + 2 bukti bug) |
| 9 | `pnpm exec nuxi typecheck` | **exit 0** |
| 10 | `pnpm exec eslint <6 file test yang diubah/dibuat> --max-warnings 0` | **exit 0** |
| 11 | `pnpm exec prettier --check <6 file test yang diubah/dibuat>` | **All matched files use Prettier code style!** |
| 12 | `grep -rn "v-html\|innerHTML" apps/web/app --include=*.vue --include=*.ts` | hanya 1 komentar di `utils/icons.ts:3` — tidak ada pemakaian |
| 13 | `grep -rn "localStorage\|sessionStorage" apps/web/app` (non-test) | hanya preferensi UI + penanda onboarding; tidak ada token/kunci/kode |
| 14 | `grep -rn "useState" <file akun/auth> \| grep -v test` | hanya status & DTO non-rahasia; kode pemulihan = `ref` |
| 15 | `grep -rn "qr\|QR\|lupa OTP\|Hapus akun" apps/web/app --include=*.vue` | tidak ada elemen UI — hanya komentar "belum ada" |

### File test yang saya ubah/buat (hanya test)

| File | Perubahan |
|---|---|
| `apps/web/app/composables/useLoginFlow.test.ts` | +3 test: cooldown kirim ulang tepat 30 detik & ditolak sampai habis; email terdaftar vs belum → langkah sama; tidak ada pesan error menyebut status pendaftaran |
| `apps/web/app/components/features/account/PasskeyOnboarding.test.ts` | +1 test: kartu backup bukan gerbang (bisa dilewati setelah passkey aktif) |
| `apps/web/app/components/features/account/RecoveryBackupCard.qa.test.ts` | **baru**: format kode `iprk1.*` (24 kata + envelope), Salin/Bagikan/Unduh, slot `recovery` + status, kode tidak di payload SSR, dan kegagalan yang tidak diberitahukan (merah = BUG-6) |
| `apps/web/app/pages/login.qa.test.ts` | **baru**: halaman login merender OTP + Google; alur lupa OTP (merah = BUG-1) |
| `apps/web/app/pages/app/akun.qa.test.ts` | **baru**: daftar perangkat + logout jarak jauh (hijau); perangkat tercabut (merah = BUG-5), tambah via QR & hapus akun (merah = BUG-2/3) |
| `apps/web/app/layouts/dashboard.qa.test.ts` | **baru**: indikator status sync (merah = BUG-4) |

Tidak ada `it.only`/`.skip`, tidak ada test dihapus, tidak ada assertion yang dilemahkan, dan tidak ada kode produk (`app/**` non-test, `server/**`, `packages/**`) yang diubah. Status Ergonio tidak diubah.

## Rules dibaca

`CLAUDE.md` (root), `.claude/rules/shared-security.md`, `.claude/rules/shared-code-quality.md`, `.claude/rules/ergonio-status-flow.md`, `apps/web/AGENTS.md`, `apps/web/CLAUDE.md`, `apps/web/.claude/rules/security.md`, `apps/web/.claude/rules/performance.md`, `apps/web/.claude/rules/code-quality.md`, `docs/PRD.md` (F15 + tabel T22), `reports/qa-t19-server-akun.md`, `reports/qa-t20-kripto-e2ee.md`, `reports/qa-t21-sync-engine.md`.
