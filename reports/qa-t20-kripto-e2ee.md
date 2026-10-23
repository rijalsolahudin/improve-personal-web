# QA Report — T20: Kripto E2EE (kunci utama, gembok, kode pemulihan, QR)

- **Task Ergonio**: #34 — `[T20] Kripto E2EE: kunci utama, gembok, kode pemulihan, QR`
- **Tanggal**: 2026-10-22
- **QA**: Fajar
- **Scope yang diuji**: `apps/web/app/utils/crypto/**`, `apps/web/app/utils/account/**`, `apps/web/server/{routes,services}/.../keys*`, `packages/contracts/src/keys.ts`, komponen akun yang memuat alur kunci (`features/account`).
- **Tidak diuji**: WebAuthn nyata di browser (butuh authenticator/virtual authenticator), remote push/pull sync, mobile (`apps/mobile` masih dokumen saja — belum ada implementasi).
- **Aturan yang dibaca**: `CLAUDE.md` root, `.claude/rules/shared-security.md`, `.claude/rules/shared-code-quality.md`, `.claude/rules/ergonio-status-flow.md`, `apps/web/AGENTS.md` → `apps/web/CLAUDE.md` → `apps/web/.claude/rules/{security,performance,code-quality}.md`, `ARCHITECTURE.md` §7/§14 (ADR 10–12), `docs/PRD.md` bagian E2EE & kode pemulihan.

---

## 1. Verdict

**Putaran 2 (verifikasi perbaikan): LULUS.** — lihat §7. Dua bug dari Putaran 1 (BUG-1, BUG-2) sudah diperbaiki dan diverifikasi; 94 test data-layer + 11 test komponen hijau, `nuxi typecheck` exit 0. Tidak ada test yang dilemahkan/dihapus.

**Putaran 1 (historis): GAGAL (blocking).**

Satu acceptance criteria tidak terpenuhi: **batas minimum kata sandi berkas terenkripsi adalah 8 karakter, padahal AC + PRD mewajibkan 12 karakter**. Sisanya lulus dengan bukti test yang dijalankan.

Ada satu temuan tambahan non-AC (Medium): parameter Argon2id di dalam kode `iprk1.*` / berkas envelope **tidak dibatasi**, sehingga kode buatan orang lain bisa meminta KDF 4 GiB dan membekukan tab pemulihan — persis risiko yang sudah dicegah untuk berkas terenkripsi (PRD 912), tapi belum untuk kode `iprk1.*`.

Dua test regresi baru ditambahkan dan **merah** sebagai bukti bug (lihat §3). Keduanya akan hijau setelah kode produk diperbaiki; **jangan** melemahkan/menghapus test-nya.

---

## 2. Hasil per acceptance criteria

| # | AC | Status | Bukti |
|---|---|---|---|
| 1 | Data **tidak** bisa dibuka lewat OTP (Salinan 1 dihapus) | **PASS** | `packages/core/src/ports.ts:244` `KEY_SLOTS_LOCAL = ['device','passkey','recovery']` (tanpa `otp`); `apps/web/app/utils/crypto/key-store.ts:18-19` (slot OTP dilarang); test baru `apps/web/app/utils/crypto/device-slot.test.ts:199` (`Salinan 1 ... dihapus`) — lulus. Tidak ada derivasi kunci dari OTP: `grep -rni "otp" app/utils/crypto app/utils/account` hanya menemukan komentar + 1 test gateway. |
| 2 | Bisa dibuka lewat sidik jari/passkey setelah login pertama | **PASS (data layer)** | `apps/web/app/utils/crypto/passkey.ts:155-178` (`unlockMasterKeyWithPasskey`), test `passkey.test.ts:67-94` (round-trip & PRF beda ditolak); test `unlock.test.ts:225-235` (`unlockWithPasskey` membuka MK yang sama + mengingat credentialId) — lulus. **Catatan**: glue WebAuthn nyata (`webauthn.ts`) tidak diuji di node (dinyatakan jujur di `webauthn.ts:6-15`), jadi bukti ini level logika pembungkusan + seam PRF, bukan authenticator sungguhan. |
| 3 | Kode pemulihan salah ditolak dengan rate limit **di perangkat** | **PASS** | `apps/web/app/utils/crypto/recovery-guard.ts:16,19,111-130` (5 percobaan → kunci 5 menit, hitungan di IndexedDB); test `recovery-guard.test.ts:49-120` (gagal ke-5 mengunci, bertahan lintas reload, tidak diperpanjang, kedaluwarsa, reset); test `unlock.test.ts:118-162` (salah → jatah kurang → terkunci; kode benar pun ditolak saat terkunci) — lulus. |
| 4 | Kunci perangkat non-extractable / di Keychain-Keystore | **PASS (web)** | `apps/web/app/utils/crypto/device-slot.ts:62-68` `generateKey(..., false, ['wrapKey','unwrapKey'])`; test `device-slot.test.ts:93-107` (`extractable === false`, `exportKey` ditolak, usages sempit) dan `:109-126` (dump seluruh IndexedDB tidak memuat MK polos) — lulus. Mobile (Keychain/Keystore) belum ada implementasinya di repo ini, jadi tidak diklaim. |
| 5 | Kunci utama & OTP tidak pernah dikirim/di-log polos | **PASS** | (a) Log: `grep -rn "console\." apps/web/app --include=*.ts --include=*.vue` (non-test) → **kosong**; satu-satunya log server `apps/web/server/utils/server-log.ts:20-30` hanya path/method/nama error/pesan/stack, tanpa body/header; `apps/web/server/services/otp.ts:26-28` menyatakan kode OTP tidak pernah dicatat, dan tabel menyimpan `codeHash`/`emailHash` saja (`apps/web/server/db/schema.ts:145,147`). (b) Kirim: gateway kunci hanya mengirim envelope/blob (`keys-gateway.ts:23-26`); test `passkey.test.ts:96-106,158` + `recovery.test.ts:90-102` membuktikan envelope/blob tidak memuat MK polos. |
| 6 | Kode pemulihan tunggal (24 kata + envelope, `iprk1.`) bisa membuka kunci utama; envelope tanpa 24 kata **tidak** bisa memulihkan sendiri | **PASS** | Prefix `iprk1.` di `apps/web/shared/tech-identity.ts:34`; `backup-code.ts:45-66` (susun) & `:75-113` (parse + validasi 24 kata/envelope); test `backup-code.test.ts:42-63` (kode → MK asli, bukan cuma bentuk mirip); test baru `account.test.ts:162` (`envelope saja TIDAK bisa memulihkan kunci utama tanpa 24 kata`, termasuk 24 kata acak ditolak auth tag) — lulus. |
| 7 | Berkas terenkripsi kata sandi (Argon2id + XChaCha20-Poly1305, **min 12 karakter**, huruf besar/kecil dihitung) teruji di level data | **FAIL** | Algoritma & case-sensitivity benar: `encrypted-backup.ts:103-111,139-146`, test `backup-code.test.ts:164-175` (huruf besar/kecil dihitung) — lulus. **Tetapi** `MIN_PASSPHRASE_LENGTH = 8` (`encrypted-backup.ts:42`), dipakai di `:94-96` dan UI `EncryptedBackupForm.vue:33,99` (label `id.json:1202` merender "Minimal 8 karakter"). PRD `docs/PRD.md:907` mewajibkan **12**. Test regresi baru `backup-code.test.ts:228` **MERAH** (kata sandi 11 karakter diterima). Lihat BUG-1. |
| 8 | Syarat "≥2 format" sudah tidak berlaku | **PASS** | Tidak ada penghitung/gerbang format di kode. Gerbang onboarding hanya passkey (`passkey-setup.ts:25-38`, test `passkey-setup.test.ts:27-33`); kartu backup boleh ditutup dan bukan gerbang (`RecoveryBackupCard.vue:15-16,84-87`); `PasskeyOnboarding.vue:20-22` menyatakan versi "24 kata di dua tempat" sengaja dihapus. `grep` untuk "minimal dua/2 format" tidak menemukan aturan. |
| 9 | Server **tidak** menyimpan kode pemulihan/24 kata (`KEY_SLOTS = ['passkey']`) | **PASS** | `packages/contracts/src/keys.ts:27`; test `packages/contracts/src/keys.test.ts:23-33` (hanya `passkey`; `otp`/`recovery`/`device` ditolak) — 14/14 lulus; server: `apps/web/server/services/keys.ts:29-41,67-100` hanya slot passkey, route `envelopes.{get,put}.ts`; test DB nyata `server/tests/keys-account.test.ts:65-72` (`slot otp`/`recovery` ditolak schema) + `:133-151` (ciphertext apa adanya, DTO tanpa `userId`) — 20/20 lulus. Tidak ada endpoint yang menerima recovery key: `grep -rn "recovery\|iprk\|words\|mnemonic" apps/web/server` (non-test) hanya komentar/schema, dan route kunci hanya `envelopes.*` + `transfer/*`. |
| 10 | Pakai library kripto teruji, bukan algoritma buatan sendiri | **PASS** | `libsodium-wrappers-sumo@0.8.4` (XChaCha20-Poly1305, Argon2id, KDF BLAKE2b, sealed box) + `@scure/bip39@2.4.0` (`apps/web/package.json:28,31`); pemakaian: `sodium.ts:19`, `envelope.ts:37,70`, `recovery.ts:128-135`, `transfer.ts:57,75,150`. Tidak ada implementasi cipher/KDF manual. |
| 11 | Kunci perangkat non-extractable / pembuka berlapis tidak saling menimpa | **PASS** | `device-slot.ts:125-144` menolak menimpa slot device; test `device-slot.test.ts:152-165` — lulus. |

**Ringkasan**: 10 PASS, 1 FAIL (AC #7).

---

## 3. Bug

### BUG-1 (High, blocking AC #7) — Batas minimum kata sandi berkas terenkripsi 8 karakter, seharusnya 12

- **Lokasi**: `apps/web/app/utils/account/encrypted-backup.ts:42`
  ```ts
  export const MIN_PASSPHRASE_LENGTH = 8
  ```
  Dipakai di `encrypted-backup.ts:94-96` dan `apps/web/app/components/features/account/EncryptedBackupForm.vue:33,99`.
- **Kontrak yang dilanggar**: `docs/PRD.md:907` — "kata sandi minimum **12 karakter** (diketik dua kali)"; AC T20 — "min 12 karakter, huruf besar/kecil dihitung".
- **Riwayat**: commit `8c0e030` ("feat(web): unduh berkas pemulihan terenkripsi kata sandi") mengubah `12 → 8` dan pesan commit-nya menyebut "kata sandi minimal 8 karakter", **tanpa** mengubah PRD. Jadi ini penurunan spesifikasi yang tidak disetujui, bukan misinterpretasi QA.
- **Cara reproduksi**:
  1. Jalankan `pnpm --filter @improve-personal/web exec vitest run app/utils/account/backup-code.test.ts`
  2. Test `batas minimum kata sandi 12 karakter (AC T20), bukan 8` (`backup-code.test.ts:228`).
- **Expected**: `encryptRecoveryBackup({ passphrase: 'Abcdefghi12' /* 11 karakter */ })` **ditolak** dengan pesan `minimal 12 karakter`.
- **Actual**: promise **resolve** — berkas terenkripsi berhasil dibuat dengan kata sandi 11 karakter (output test: `AssertionError: promise resolved "{ …(9) }" instead of rejecting`). Artinya user bisa membuat backup yang membungkus seluruh kunci utama dengan kata sandi 8–11 karakter.
- **Dampak**: memperlemah satu-satunya backup mandiri (berkas membawa `iprk1.*` = kunci utama). Kata sandi ini bisa ditebak offline oleh siapa pun yang memegang berkas; Argon2id `INTERACTIVE` tidak menutup selisih 8 vs 12 karakter. Melanggar AC dan PRD sekaligus.
- **Perbaikan yang disarankan** (bukan dilakukan QA): ubah `MIN_PASSPHRASE_LENGTH` menjadi `12`; UI & i18n otomatis ikut karena memakai konstanta. Test regresi sudah ada, jadi setelah fix tidak perlu mengubah test. Pertimbangkan juga menambah test UI yang mengunci 12 (saat ini `EncryptedBackupForm.test.ts:17` memakai konstanta, jadi tidak mendeteksi perubahan).

### BUG-2 (Medium, non-AC) — Parameter Argon2id pada kode `iprk1.*`/berkas envelope tidak dibatasi (DoS tab pemulihan)

- **Lokasi**:
  - `apps/web/app/utils/crypto/recovery.ts:43-44` — `ops: z.int().min(1)`, `mem: z.int().min(1)` **tanpa batas atas**.
  - `apps/web/app/utils/crypto/recovery.ts:202` — `deriveRecoveryKey(..., envelope.ops, envelope.mem)` memakai nilai dari kode yang ditempel user.
  - `apps/web/app/utils/account/recovery-file.ts:46-47` — schema berkas envelope juga tanpa batas atas.
- **Pembanding**: untuk berkas terenkripsi batas ini **sudah** ada (`encrypted-backup.ts:63-64` `MAX_KDF_OPS = 4`, `MAX_KDF_MEM_BYTES = 256 MiB`) dengan alasan eksplisit di PRD 912: "supaya berkas buatan orang lain tidak bisa membekukan tab".
- **Cara reproduksi**:
  1. Susun kode `iprk1.*` yang sah, lalu ganti `envelope.mem` menjadi `4294967296` (4 GiB) / `ops` menjadi `1000`.
  2. Tempel di layar pemulihan (atau jalankan test `backup-code.test.ts:105`).
- **Expected**: `parseBackupCode` menolak sebelum Argon2id dijalankan (seperti `parseEncryptedBackup` menolak `mem` 4 GiB, `backup-code.test.ts:194-207`).
- **Actual**: `parseBackupCode` **menerima** kode tersebut; `unwrapMasterKeyWithRecovery` lalu menjalankan Argon2id dengan `mem` 4 GiB / `ops` 1000 → tab membeku/kehabisan memori. Test `backup-code.test.ts:105` **MERAH** (`AssertionError: promise resolved ... instead of rejecting`).
- **Dampak**: DoS pada layar pemulihan lewat kode yang dikirim orang lain ("pakai kode ini untuk memulihkan akunmu"). Tidak membocorkan data, tapi menghalangi user yang sedang kehilangan akses — dan ini kelas risiko yang sudah diakui PRD 912.
- **Perbaikan yang disarankan**: beri batas atas yang sama pada `recoveryEnvelopeSchema` (dan `recoveryFileDocumentSchema`): `ops ≤ 4`, `mem ≤ 256 * 1024 * 1024`. Test regresi sudah disiapkan.

---

## 4. Perintah & hasil

Semua dijalankan dari root repo, Node 24, Vitest 5.0.3, Postgres lokal aktif di `127.0.0.1:5432` (test server memakai DB nyata `improve_personal_test`).

| # | Perintah | Hasil |
|---|---|---|
| 1 | `pnpm --filter @improve-personal/web exec vitest run app/utils/crypto app/utils/account --reporter=verbose` | **2 failed / 89 passed (91 test, 10 file)** — 2 kegagalan = BUG-1 & BUG-2 (test baru). Sebelum test baru: 87/87 lulus. |
| 2 | `pnpm --filter @improve-personal/contracts exec vitest run src/keys.test.ts` | **14 passed (1 file)** |
| 3 | `pnpm --filter @improve-personal/web exec vitest run app/components/features/account` | **10 passed (3 file)** — onboarding passkey tak bisa ditutup, gate pemulihan, form kata sandi |
| 4 | `pnpm --filter @improve-personal/web exec vitest run server/tests/keys-account.test.ts` | **20 passed (1 file)** — termasuk `slot otp/recovery ditolak`, ciphertext apa adanya, IDOR, transfer sekali pakai, hapus akun |
| 5 | `pnpm --filter @improve-personal/web exec eslint app/utils/account/backup-code.test.ts app/utils/account/account.test.ts app/utils/crypto/device-slot.test.ts --max-warnings 0` | **exit 0** |
| 6 | `npx prettier --check <3 file test di atas>` | **All matched files use Prettier code style!** |
| 7 | `grep -rn "console\." apps/web/app --include=*.ts --include=*.vue \| grep -v "\.test\.ts"` | **kosong** (tidak ada log di kode app) |
| 8 | `grep -rni "recovery\|iprk\|words\|mnemonic" apps/web/server --include=*.ts \| grep -v tests` | hanya komentar/schema — **tidak ada endpoint/route** yang menerima kode pemulihan/24 kata |
| 9 | `grep -rn "MIN_PASSPHRASE_LENGTH = \|ops: z.int()\|mem: z.int()" apps/web/app/utils` | `encrypted-backup.ts:42` = 8; `recovery.ts:43-44` & `recovery-file.ts:46-47` tanpa `.max(...)` |

### File test yang ditambah/diubah (hanya test)

- `apps/web/app/utils/account/backup-code.test.ts`
  - `:105` test baru: kode `iprk1.*` dengan Argon2id berlebihan ditolak sebelum KDF (**merah** = BUG-2).
  - `:228` test baru: batas minimum kata sandi 12 karakter (**merah** = BUG-1).
- `apps/web/app/utils/account/account.test.ts`
  - `:162` test baru: envelope saja tidak bisa memulihkan tanpa 24 kata (**hijau**).
- `apps/web/app/utils/crypto/device-slot.test.ts`
  - `:199` test baru: tidak ada slot OTP di perangkat / Salinan 1 dihapus (**hijau**).

Tidak ada kode produk yang diubah. Tidak ada `it.only`/`.skip`, tidak ada assertion yang dilemahkan, tidak ada test dihapus. Status Ergonio tidak diubah.

---

## 5. Cek tiga pilar

### Keamanan
- ✅ Zero-knowledge server terbukti: hanya envelope `passkey` yang bisa masuk (`contracts/keys.ts:27`; test kontrak & DB). Server tidak punya jalur impor kripto klien (`services/keys.ts:17-27`, eslint melarang `server/**` impor core/crypto).
- ✅ MK tidak pernah tersimpan polos (dump IndexedDB, `device-slot.test.ts:109-126`), tidak pernah terkirim polos (transfer = sealed box, `passkey.test.ts:158`), tidak pernah di-log (`server-log.ts`, grep `console`).
- ✅ OTP hanya hash (`schema.ts:147`), rate limit per email+IP (`otp.ts`), error generik.
- ✅ Envelope terikat AAD per tujuan (`envelope.ts:11-14,77-79`) → blob record tidak bisa dipindah jadi envelope kunci.
- ✅ Rate limit recovery di perangkat bertahan reload (`recovery-guard.ts:92-104`, test).
- ⚠️ **BUG-1** menurunkan kekuatan backup mandiri (8 vs 12 karakter) — blocking.
- ⚠️ **BUG-2** DoS via parameter KDF dari kode pihak ketiga — perlu batas atas.
- ℹ️ Catatan desain (bukan bug): hitungan percobaan recovery bisa direset dengan menghapus IndexedDB; ini konsekuensi "rate limit di perangkat" yang sudah dipilih (server tidak memegang envelope recovery). Tidak ada perlindungan lebih kuat tanpa mengubah ADR 11.

### Performa
- ✅ libsodium (`~400 kB` WASM) dimuat **dinamis** hanya saat dibutuhkan (`sodium.ts:17-25`), bukan di bundle login.
- ✅ Argon2id hanya dijalankan setelah validasi bentuk kode (`unlock.ts:84-91`), jadi salah tempel tidak membayar 64 MB.
- ⚠️ Tanpa BUG-2 diperbaiki, parameter KDF dari kode bisa meminta 4 GiB → tab freeze (regresi performa sekaligus DoS).

### Kerapian
- ✅ Pemisahan modul jelas: `crypto/` (primitif) vs `account/` (alur + berkas) vs `components/`; konstanta bernama, tanpa magic number.
- ✅ Komentar menjelaskan "kenapa" (ADR/PRD dirujuk), bukan "apa".
- ✅ Test menguji perilaku (round-trip, penolakan, isi DB), bukan detail implementasi.
- ✅ eslint & prettier pada file test yang diubah hijau.
- ⚠️ `MIN_PASSPHRASE_LENGTH` menyimpang dari PRD tanpa catatan trade-off — melanggar pilar kerapian + keamanan.

---

## 6. Coverage & celah test yang tersisa

| Area | Status | Catatan |
|---|---|---|
| Envelope device/passkey/recovery, kode `iprk1.*`, berkas terenkripsi | Teruji level data | 89 test hijau + 2 test merah (bug) |
| Rate limit recovery di perangkat | Teruji | Termasuk persistensi lintas reload & kedaluwarsa |
| Server: slot envelope, transfer, IDOR, hapus akun | Teruji terhadap Postgres nyata | 20 test |
| WebAuthn nyata (`navigator.credentials` + ekstensi `prf`, userVerification) | **Belum** | Butuh Playwright + CDP `WebAuthn.addVirtualAuthenticator` atau perangkat nyata; dinyatakan jujur di `webauthn.ts:6-15`. Ini gap terbesar untuk AC "sidik jari/passkey". |
| UI end-to-end (onboarding → backup → pulih di perangkat baru) | **Belum** | Komponen teruji terisolasi; belum ada E2E lintas halaman |
| Mobile Keychain/Keystore | **Belum ada implementasi** | `apps/mobile` masih dokumen; AC non-extractable baru dibuktikan untuk web |
| Build production: `console.*` benar-benar dibuang (`removeLoggers`) | **Belum diverifikasi** | Perlu cek `nuxt.config`/output build; grep kode sumber sudah bersih |
| Rate limit recovery terhadap penyalahgunaan (hapus storage) | Diterima sebagai trade-off | Dokumentasikan di Panduan |

### Rekomendasi
1. **Bayu**: perbaiki BUG-1 (konstanta 12) dan BUG-2 (batas `ops ≤ 4`, `mem ≤ 256 MiB` pada schema envelope recovery + berkas recovery). Dua test regresi sudah menunggu; setelah fix jalankan `pnpm --filter @improve-personal/web exec vitest run app/utils/crypto app/utils/account`.
2. Tambahkan test UI yang mengunci batas 12 secara eksplisit (jangan hanya memakai konstanta) supaya penurunan berikutnya tidak lolos.
3. Tambahkan E2E Playwright dengan virtual authenticator untuk membuktikan jalur WebAuthn nyata (registrasi → unlock setelah login), karena itu satu-satunya AC yang bukti otomatisnya masih di level seam.
4. Saat mobile mulai (T23), pindahkan modul kunci ke paket bersama seperti catatan di `provider.ts:14-18` — jangan disalin.
5. Verifikasi build production membuang logger dan tidak mempublikasikan sourcemap (checklist `security.md` §11).

---

## 7. Putaran 2 — verifikasi perbaikan (2026-10-22)

**Verdict: LULUS.** Kedua bug Putaran 1 tertutup, tidak ada AC lain yang melemah, dan tidak ada test yang dilemahkan/dihapus.

### 7.1 Perbaikan yang diverifikasi

| Temuan Putaran 1 | Perbaikan (path:line) | Verifikasi |
|---|---|---|
| BUG-1 — minimum kata sandi 8 | `apps/web/app/utils/account/encrypted-backup.ts:44` `MIN_PASSPHRASE_LENGTH = 12`; dipakai di `:92-94`; UI `EncryptedBackupForm.vue:33,99` mengimpor konstanta; i18n `id.json:1202` memakai `{min}` sehingga merender 12 | Test data `backup-code.test.ts:243` (dulu `:228`) hijau; test UI baru `EncryptedBackupForm.test.ts:34` mengunci teks "Minimal 12 karakter" + 11 karakter mematikan tombol |
| BUG-2 — `ops`/`mem` tanpa batas atas pada kode `iprk1.*` & berkas envelope | `apps/web/app/utils/crypto/kdf-limits.ts:18,21` (`MAX_KDF_OPS = 4`, `MAX_KDF_MEM_BYTES = 256 MiB`); `recovery.ts:48-49` schema + `recovery.ts:129-135` `assertKdfParams()` dipanggil di `deriveRecoveryKey` (`:145`); `recovery-file.ts:48-49`; `encrypted-backup.ts` memakai konstanta yang sama | Test `backup-code.test.ts:105` hijau; test baru `account.test.ts:162` (berkas recovery menolak `mem` 4 GiB/`ops` 1000) dan `recovery.test.ts:192` (objek envelope tersimpan ditolak sebelum Argon2id) hijau |

Catatan desain: `assertKdfParams()` menutup jalur objek tersimpan yang tidak melewati schema (slot `recovery` perangkat / impor), jadi batas tidak hanya bergantung pada tiga schema. Semua jalur UI (`unlockWithRecoveryCode`, `unlockWithEncryptedBackup`) memang lewat `parseBackupCode`/`parseEncryptedBackup` lebih dulu — diperiksa di `unlock.ts:88,125`.

### 7.2 Regresi perilaku artefak lama

Test baru `apps/web/app/utils/crypto/recovery.test.ts:166` memakai envelope **golden** dengan angka literal `ops: 2`, `mem: 67108864` (64 MiB), salt tetap, frasa BIP39 standar, dan `wrappedKey` yang disegel di luar test. Hasil: `recoveryEnvelopeSchema` menerima, dan `unwrapMasterKeyWithRecovery` mengembalikan kunci utama yang diharapkan. Jadi artifact yang dibuat aplikasi sebelum batas KDF ditambahkan tetap bisa dibuka.

Regresi serupa juga dikunci untuk kode `iprk1.*` (`backup-code.test.ts:158`) dan berkas terenkripsi (`backup-code.test.ts`: "Nilai preset INTERACTIVE ... tetap diterima").

### 7.3 Pesan error bukan oracle

Semua pesan penolakan generik dan **tidak menggemakan angka** dari artefak — diuji eksplisit:

- `parseBackupCode` → "kode cadangan tidak memuat envelope kunci yang sah" (`backup-code.ts:109`); test memastikan pesan tidak memuat `4294967296`/`1000` (`backup-code.test.ts:141-155`).
- `parseEncryptedBackup` → "berkas backup tidak dikenali: format atau isinya tidak sesuai" (`encrypted-backup.ts:195`); test `backup-code.test.ts` (blok "berkas yang meminta KDF berlebihan").
- `parseRecoveryFile` → "berkas recovery tidak dikenali..." (`recovery-file.ts:118`); test `account.test.ts:162`.
- `assertKdfParams` → "parameter KDF envelope di luar batas yang diizinkan" (`recovery.ts:133`); test `recovery.test.ts:192` memastikan angka tidak diulang.

### 7.4 Integritas test (tidak dilemahkan/dihapus)

- `git diff HEAD -- 'apps/web/app/utils/**/*.test.ts'`: tidak ada cakupan yang hilang. Semua baris `-` adalah (a) penggantian import satu baris menjadi multi-baris untuk menambah `unwrapMasterKeyWithRecovery`, dan (b) penggantian dua assertion lama dengan assertion yang **lebih kuat** (menangkap pesan error + memastikan angka artefak tidak diulang). Sisanya penambahan.
- Empat baris komentar QA lama yang menyatakan test "MERAH pada kode sekarang" dihapus karena sudah tidak benar (komentar, bukan assertion).
- Tidak ada `it.only`, `it.skip`, `describe.skip`, atau test yang di-comment di seluruh `app/utils/crypto`, `app/utils/account`, `app/components/features/account`.
- Jumlah test naik: data layer **91 → 94**, komponen akun **10 → 11**.

File test yang QA ubah di putaran ini (semua diizinkan — hanya test):

| File | Perubahan |
|---|---|
| `apps/web/app/utils/crypto/recovery.test.ts` | +2 test: envelope lama `ops=2`/64 MiB tetap terbuka; parameter KDF objek tersimpan ditolak sebelum KDF + pesan tanpa angka |
| `apps/web/app/utils/account/account.test.ts` | +1 test: berkas recovery menolak `mem` 4 GiB & `ops` 1000, preset lama tetap diterima |
| `apps/web/app/utils/account/backup-code.test.ts` | Assertion oracle angka pada kode & berkas terenkripsi; cek kode lama tetap valid; hapus komentar "MERAH" yang basi |
| `apps/web/app/components/features/account/EncryptedBackupForm.test.ts` | +1 test: batas 12 literal di UI (teks hint + tombol) |

### 7.5 Perintah & hasil (snapshot akhir)

Dijalankan dari root repo, Node 24, Vitest 5.0.3.

| # | Perintah | Hasil |
|---|---|---|
| 1 | `pnpm --filter @improve-personal/web exec vitest run app/utils/crypto app/utils/account` | **94 passed (10 file)** — termasuk `backup-code.test.ts:105` dan `:243` (dulu `:228`) yang sempat merah |
| 2 | `pnpm --filter @improve-personal/web exec vitest run app/components/features/account` | **11 passed (3 file)** |
| 3 | `pnpm --filter @improve-personal/web exec vitest run app/utils` | **453 passed (41 file)** — regresi utils lain tidak ada |
| 4 | `pnpm --filter @improve-personal/web exec nuxi typecheck` | **exit 0** |
| 5 | `pnpm exec eslint <4 file test yang diubah> --max-warnings 0` | **exit 0** |
| 6 | `npx prettier --check <4 file test yang diubah>` | **All matched files use Prettier code style!** |

Catatan transparansi: pada percobaan pertama `nuxi typecheck` sempat gagal karena dua file probe **tidak terlacak milik task lain** (`app/components/features/calendar/calperf.probe.test.ts`, `app/pages/app/kalender.probe.test.ts`). Setelah file itu dihapus pemiliknya, typecheck exit 0. Tidak ada error dari file T20 pada percobaan mana pun — dibuktikan juga dengan `vue-tsc -p` memakai config sementara yang mengecualikan file probe tersebut (exit 0), lalu config sementara dihapus.

### 7.6 Cek scope

Perubahan kode produk untuk T20 hanya 4 file, semuanya di jalur kripto/akun:

- `apps/web/app/utils/account/encrypted-backup.ts`
- `apps/web/app/utils/account/recovery-file.ts`
- `apps/web/app/utils/crypto/recovery.ts`
- `apps/web/app/utils/crypto/kdf-limits.ts` (baru)

Tidak ada perubahan di `apps/web/app/pages/app/**`, `apps/web/app/components/features/guide/**`, atau `EncryptedBackupForm.vue`. Tidak ada penurunan validasi di jalur lain: `MAX_KDF_OPS`/`MAX_KDF_MEM_BYTES` untuk berkas terenkripsi tetap 4/256 MiB (dipindah ke satu modul, bukan dilonggarkan), dan `recoveryEnvelopeSchema` tetap `.strict()`.

Di worktree yang sama ada perubahan tak terkait T20 (task T19 `server/tests/{env,otp}.test.ts`, task T21 `packages/core/src/sync/**`, serta `scripts/sync-agent-config.mjs`/`.husky/pre-commit`). Semua itu **bukan** bagian perbaikan T20 dan tidak diubah oleh QA; penilaian di atas diisolasi per path T20.

### 7.7 Sisa risiko (tidak memblokir)

1. **WebAuthn nyata** masih belum diuji otomatis (butuh Playwright + virtual authenticator); bukti AC passkey tetap di level seam PRF — sama seperti Putaran 1.
2. **Mobile Keychain/Keystore** belum ada implementasinya; AC non-extractable baru dibuktikan untuk web.
3. **Batas 256 MiB masih bisa dipaksa** oleh artefak pihak ketiga: tidak lagi membekukan tab seperti 4 GiB, tetapi satu percobaan tetap boleh memakai 256 MiB. Ini batas yang disepakati PRD 912; kalau mau lebih ketat, turunkan `MAX_KDF_MEM_BYTES` **dan** pastikan tidak ada artefak lama di atas nilai baru.
4. **E2E lintas halaman** (onboarding → backup → pulih di perangkat baru) belum ada; komponen masih diuji terisolasi.
5. Rate limit recovery di perangkat bisa direset dengan menghapus IndexedDB — trade-off ADR 11 yang sudah diterima.

