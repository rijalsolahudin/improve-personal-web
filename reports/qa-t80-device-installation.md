# QA #80 — Login di perangkat lain mematikan sesi perangkat pertama

**Tanggal:** 2026-10-24 · **QA:** Fajar · **Commit:** `4ffd5c2` (diff `1d81b5f..HEAD`) · **Tier:** T2 (server/auth/skema)
**Rules dibaca:** `CLAUDE.md` (root), `.claude/rules/shared-security.md`, `.claude/rules/shared-code-quality.md`, `.claude/rules/ergonio-status-flow.md`, `apps/web/AGENTS.md`, `apps/web/CLAUDE.md`, `apps/web/.claude/rules/{security,performance,code-quality}.md`. `packages/**` → rules root. `apps/mobile` tidak berubah (hanya dokumen), rules mobile tidak dimuat.

## Verdict: **LULUS dengan catatan** (tidak ada AC yang gagal; 2 temuan `Low` non-blocking, di luar AC)

Semua 7 AC lulus dengan bukti perintah. Suite web 212 file / 1614 test: 1610 lulus, 2 gagal **hanya** karena flake lingkungan `DecoLayer.qa.test.ts` (lulus 14/14 saat dijalankan sendiri), 2 expected fail. Contracts 114, core 384, typecheck, eslint, prettier, build, dan budget bundel hijau. Mutation check 3/3 membuktikan test baru benar-benar menjaga perilaku.

Dua temuan `Low` di jalur yang diubah tapi **di luar AC** (tidak mematikan sesi, tidak menambah akses): id instalasi tidak stabil di browser yang memblokir `localStorage` pada level properti, dan celah TOCTOU kecil pada adopsi baris yang di-revoke bersamaan. Sesuai `.claude/rules/ergonio-status-flow.md` §6.8 → ditemukan task terpisah, verdict task ini tetap lulus.

> Saya **tidak** memindahkan status Ergonio dan tidak menulis komentar task. Kode produk tidak diubah (mutation check dikembalikan; `git diff` bersih).

---

## 1. Scope & test plan

**Diuji (delta task):** `server/services/device.ts` (pencocokan berurutan installationId → adopsi → baris baru, batas 10), `server/services/google.ts` + `routes/v1/auth/google/start.get.ts` (installationId lewat `oauth_states`), `server/db/schema.ts` + migrasi `0002`/`0003`, `packages/contracts/src/auth.ts` (`deviceInfoSchema`, `googleStartQuerySchema`), `app/utils/device-installation.ts` + `device.ts` + `composables/auth/http-gateway.ts` + `useLogout.ts` (klien), dan `apps/web/docs/server.dbml`.

**Test baru (QA, independen dari test penulis):** `apps/web/server/tests/qa-t80-installation.test.ts` — 12 test, Postgres nyata, memakai jalur produksi `loginDevice` → `issueSession` → `findSessionByToken`/`sessionResultFrom` (fungsi yang dipanggil `requireSession` untuk **setiap** request terautentikasi):

| # | Test | AC |
|---|---|---|
| 1 | nama+platform identik, `installationId` beda, login berurutan → **kedua token** lolos autentikasi + daftar perangkat berisi dua entri | 1 |
| 2 | nama berbeda + instalasi berbeda → dua sesi hidup | 1 |
| 3 | `installationId` sama di dua akun → baris perangkat berbeda, revoke Alice tidak mematikan sesi Bob | 1, keamanan |
| 4 | `installationId` sama → satu baris, token lama mati | 2 |
| 5 | adopsi baris lama → satu baris, kolom terisi, sesi lama ter-rotate | 3 |
| 6 | satu baris lama + dua instalasi (paralel) → tepat satu mengadopsi, dua baris, keduanya hidup | 3 + atomisitas |
| 7 | baris kembar lama → adopsi memilih yang terbaru, baris lain tidak dicuri, sesi baris kembar tetap hidup | 3 + fokus |
| 8 | klien lama dua kali → baris sama + rotasi | 4 |
| 9 | klien lama setelah klien baru → tidak menimpa `installation_id` | 4 |
| 10 | 10 perangkat aktif → `DEVICE_LIMIT_REACHED`; setelah 1 di-revoke → instalasi baru diterima | 3 + fokus |
| 11 | query callback Google menolak `installationId` (strict) | 5 |
| 12 | `/start` menerima `installationId` sah, menolak `redirectUri`/`state`/`device` | 5 |

**Tidak diuji ulang (sudah dibuktikan task/laporan lain, hemat alat ukur):** Lighthouse & CWV penuh (bukan AC angka; cukup budget JS dari artefak), e2e Playwright/Maestro, jalur mobile native (folder masih dokumen), dan audit keamanan (sudah ada `reports/security-t80-device-installation.md`).

---

## 2. Perintah & hasil (persis)

| Perintah | Hasil |
|---|---|
| `pnpm --filter @improve-personal/web exec vitest run app server/tests` (baseline, sebelum test QA ditambahkan) | `Test Files 1 failed \| 210 passed (211)`, `Tests 2 failed \| 1598 passed \| 2 expected fail (1602)`, 113,73 s |
| `… vitest run app/components/features/deco/DecoLayer.qa.test.ts` (re-run flake) | `Test Files 1 passed (1)`, `Tests 14 passed (14)` → **flake lingkungan** |
| `pnpm --filter @improve-personal/web exec vitest run app server/tests` (final, termasuk test QA) | `Test Files 1 failed \| 211 passed (212)`, `Tests 2 failed \| 1610 passed \| 2 expected fail (1614)`; dua kegagalan sama-sama `DecoLayer.qa.test.ts` |
| `… vitest run server/tests/qa-t80-installation.test.ts` | `Tests 12 passed (12)` |
| `pnpm --filter @improve-personal/contracts test` | `Test Files 8 passed (8)`, `Tests 114 passed (114)` |
| `pnpm --filter @improve-personal/core test` | `Test Files 22 passed (22)`, `Tests 384 passed (384)` |
| `pnpm --filter @improve-personal/web typecheck` | exit 0 (dijalankan dua kali: sebelum & sesudah test QA ditambahkan) |
| `pnpm exec eslint app server --max-warnings 0` (di `apps/web`) | exit 0 |
| `pnpm exec prettier --check apps/web/app apps/web/server apps/web/docs/server.dbml packages/contracts/src` | `All matched files use Prettier code style!` |
| `pnpm --filter @improve-personal/web build` | exit 0, `verify-precache OK: 12 entri precache semuanya bisa dilayani` |
| `… vitest run app/utils/bundle-budget.test.ts` | `Tests 6 passed (6)` |
| Ukur ulang JS awal landing (cara sama dengan test) | **174.076 B / 174.080 B** (headroom **4 B**; penulis melaporkan 174.070 → selisih zlib mesin, bukan regresi) |

Flake yang dilaporkan penulis: `DecoLayer.qa.test.ts` merah di suite besar (timeout 5 000 ms pada render `/app`), hijau saat file itu dijalankan sendiri. `kalender.test.ts` dan `http-hardening.test.ts` **tidak** flake di dua run penuh ini.

---

## 3. Hasil per acceptance criteria

| AC | Verdict | Bukti |
|---|---|---|
| **1.** Dua instalasi berbeda login bersamaan, keduanya tetap aktif | **PASS** | `qa-t80-installation.test.ts` #1–#3: dua `installationId`, nama+platform identik, login berurutan → device id berbeda, `sessionResultFrom(await findSessionByToken(tokenA))` dan `tokenB` sama-sama mengembalikan sesi sah dan `GET /v1/devices` berisi dua perangkat aktif. Bukti tambahan: `session-device.test.ts` "dua installationId berbeda -> dua perangkat, dan KEDUA sesi tetap hidup". |
| **2.** Login ulang di instalasi yang SAMA tetap rotasi | **PASS** | #4: device id sama, `countActiveDevices = 1`, token pertama gagal autentikasi; test penulis "installationId SAMA -> … sesi lama tetap ter-revoke". |
| **3.** Perangkat lama tanpa `installation_id` diadopsi, bukan digandakan | **PASS** | #5 (adopsi, 1 baris, kolom terisi, sesi lama ter-rotate), #6 (dua instalasi pada satu baris lama: `new Set([A,B]).size = 2` dan `[A,B]` memuat `legacyId`), #7 (baris kembar). Kode: `device.ts:113-143` — `UPDATE … .where(and(eq(id), isNull(installationId))).returning()`; filter `IS NULL` ada di SELECT **dan** UPDATE, jadi atomik dan tidak mencuri baris ber-pemilik. |
| **4.** Klien lama tanpa `installationId` identik dengan sebelumnya | **PASS** | #8, #9: dua login tanpa field → baris sama + rotasi; klien lama setelah klien baru tetap memakai baris yang ada dan tidak mengubah `installation_id`. `device.ts:176-179` memakai `findActiveDeviceIdByNamePlatform` (query lama, tanpa filter `installation_id`). |
| **5.** Google membedakan instalasi; `/start` tetap menolak field asing | **PASS** | #11–#12 (kontrak strict) + `google-oauth.test.ts` 11/11 (installationId di baris `oauth_states`, tidak bocor ke URL, dua instalasi → dua sesi hidup, klien lama → rotasi, adopsi baris Google) + `http-hardening.test.ts` "`/start` … 302" & "field tak dikenal tetap 400 … redirectUri/redirect_uri/state" (bukti HTTP). Cookie binding M2 **tidak berubah** di diff (`google.ts:249-253` tidak tersentuh) dan seluruh test binding hijau. Sumber nilai hanya `oauthStates.installationId` hasil `RETURNING` dari state yang dikonsumsi; `googleCallbackQuerySchema` tidak punya field itu. |
| **6.** Migrasi `0002` & `0003` additive, aman untuk data lama | **PASS** | Diuji langsung di DB scratch `qa_t80_mig`: baseline `0000`+`0001`, isi 1 user + 1 `devices` + 1 `oauth_states`, lalu jalankan `0002`+`0003` → jumlah baris tetap (1/1/1), nilai lama utuh, `installation_id = NULL`; `information_schema` → `is_nullable = YES`, `column_default = -`; index `idx_devices_user_installation` dibuat. SQL hanya `ALTER TABLE … ADD COLUMN uuid` + `CREATE INDEX` (tanpa `DROP`/`NOT NULL`/`UPDATE`). Journal + snapshot rapi; `server.dbml` diperbarui. |
| **7.** Tiga pilar (tanpa PII/log baru, budget landing, gate hijau) | **PASS dengan catatan** | Log: tidak ada `console.*`/logger baru di diff non-test; `installationId` tidak pernah di-log (hanya nama/klien di pesan error lama). Budget: 174.076 B dari 174.080 B (headroom 4 B — lihat risiko). Typecheck/eslint/prettier/build/test hijau. |

---

## 4. Mutation check (3/3 sesuai harapan, kode dikembalikan)

| Mutasi | Hasil | Test yang memerah |
|---|---|---|
| **(a)** Matikan pencocokan `installationId` — `resolveDeviceForLogin` hanya memakai heuristik `name+platform` (`device.ts:176-179`) | `Tests 9 failed \| 21 passed (30)` | **AC1:** "nama + platform identik, `installationId` beda, login berurutan → KEDUA token lolos autentikasi"; juga "adopsi…", "baris kembar lama…", "batas perangkat…", dan 4 test penulis |
| **(b)** Matikan jalur adopsi — `findActiveDeviceIdByInstallation ?? null` (tanpa `adoptLegacyDeviceForInstallation`) | `Tests 4 failed \| 26 passed (30)` | "build baru pertama kali login → baris lama diadopsi…", "dua instalasi … satu baris lama → tepat satu mengadopsi…", "baris kembar lama…", dan test penulis "adopsi: perangkat lama tanpa installation_id dipakai ulang" |
| **(c)** Hapus `installationId` dari objek `device` di `loginDevice` jalur Google (`google.ts:288-293`) | `Tests 2 failed \| 9 passed (11)` | "dua `installationId` berbeda -> dua perangkat, dan KEDUA sesi tetap hidup", "build baru setelah klien lama: baris Google lama diadopsi" |

Setelah ketiga mutasi: `git checkout --` pada `device.ts`/`google.ts`, `git status` bersih (hanya test QA baru yang untracked).

---

## 5. Temuan (urut severity) — keduanya di luar AC, non-blocking

### BUG-1 · `Low` · Id instalasi tidak stabil di browser yang memblokir `localStorage` (bukan logout, tapi baris perangkat bisa menumpuk)

- **Bukti kode:** `apps/web/app/utils/device-installation.ts:106-109` — `openStorage()` mengembalikan `null` **baik saat SSR maupun saat properti `window.localStorage` melempar**; cabang itu `return generateInstallationId()` **tanpa mengisi cache modul** (`sessionInstallationId`, baris 55 & 128). Akibatnya `currentInstallationId()` menghasilkan UUID baru di setiap panggilan pada browser seperti Safari private-mode lama / WebView yang mematikan DOM storage.
- **Reproduksi (probe sementara, sudah dihapus):** spy getter `window.localStorage` agar melempar, lalu:
  ```ts
  const first = currentInstallationId()
  const second = currentInstallationId()
  // first ≠ second  → terbukti: 01a16ea1-0ebb-… vs 01a16ea1-0ebc-…
  ```
  Dampak di alur nyata: `requestEmailOtp` mengirim id₁ (server membuat baris perangkat R₁, `installation_id=id₁`), `verifyEmailOtp` mengirim id₂ → tidak cocok, R₁ sudah punya pemilik sehingga **tidak** diadopsi → lahir R₂. Satu login memakai **dua** slot dari 10, dan daftar "Perangkat" berisi baris "Chrome di Linux" ganda. Setelah 5 login → `DEVICE_LIMIT_REACHED`.
- **Bukan AC1/2/3/4:** tidak mematikan sesi perangkat lain dan tidak menambah akses. Test `device-installation.test.ts:61-71` hanya memastikan "tidak melempar", tidak memeriksa idempotensi pada kondisi ini.
- **Rekomendasi perbaikan (untuk task terpisah, bukan QA):** bedakan SSR dari storage-terblokir (`typeof window === 'undefined'` → jangan cache; selain itu selalu isi `sessionInstallationId` sebelum `return`), lalu tambah test "dua panggilan dengan storage diblokir = id yang sama".

### BUG-2 · `Low` · TOCTOU kecil pada adopsi: baris yang di-revoke bersamaan bisa tetap diadopsi

- **Bukti kode:** `apps/web/server/services/device.ts:118-142`. `SELECT` menyaring `isNull(devices.revokedAt)` (baris 127), tetapi `UPDATE … WHERE id = ? AND installation_id IS NULL … RETURNING` (baris 136-140) **tidak** menyaring `revokedAt`. Bila perangkat lama di-revoke tepat di antara SELECT dan UPDATE (mis. user menekan "keluarkan perangkat" di tab lain), `resolveDeviceForLogin` mengembalikan id perangkat yang sudah revoked; `loginDevice` lalu menerbitkan sesi di atasnya. Login menjawab sukses, tetapi `findSessionByToken` langsung menolak (sesi `session.ts:133`: `deviceRevokedAt` → `null`) — user melihat "berhasil login" lalu terlempar lagi.
- **Reproduksi:** butuh interleaving persis (revoke di antara dua query). Tidak saya jadikan test karena non-deterministik tanpa mock DB, dan dampaknya bukan data-loss.
- **Rekomendasi:** tambahkan `isNull(devices.revokedAt)` di klausa `UPDATE`; kalau `RETURNING` kosong, lanjut ke pembuatan baris baru (perilaku yang sudah ada).

### Sisa risiko (sudah ditulis penulis/security, saya konfirmasi)

1. Dua login **paralel** dengan `installationId` **baru yang sama** bisa membuat dua baris (tidak ada partial unique index) — ter-scope satu akun, dampaknya baris kembar + 1 sesi "yatim" yang tidak ter-rotate pada login berikutnya.
2. Baris kembar lama tidak digabung otomatis; #7 membuktikan sesi baris kembar **tidak** ikut mati (sesuai perilaku per-baris, tapi halaman Perangkat tetap berisi duplikat).
3. Adopsi bisa mengambil baris lama milik **mesin/origin lain** dengan `name+platform` identik milik user yang sama (setara perilaku pra-#80, bukan regresi) — konsekuensinya login klien lama di mesin itu bisa me-rotate sesi mesin yang mengadopsi (perilaku lama).
4. Headroom budget landing tinggal **4 byte**; perubahan graf awal berikutnya hampir pasti memerah. `useLogout.ts` mengimpor `device-installation.ts` secara statis — hari ini aman (chunk `install-id` tidak ada di 27 berkas JS awal landing; hanya di chunk lazy), tapi setiap import statis baru ke `useLogout` berisiko.
5. `installationId` di query `/start` masuk request-URI (access log proxy) — temuan L1 security, bukan kredensial.

---

## 6. Cek tiga pilar

- **Keamanan — PASS.** Semua query perangkat ter-scope `user_id` (`device.ts:59-99`, `118-131`, `187-199`); #3 membuktikan dua akun dengan `installationId` sama tidak berbagi baris dan revoke tidak lintas akun. `installationId` tidak dipakai untuk authz, tidak masuk DTO (`toDeviceDto` tidak memuatnya — `device.ts:24-42`), tidak ada log/PII baru. Rotasi sesi per perangkat tidak dilonggarkan (#4). Google tidak bisa memilih baris perangkat dari query callback (#11, kode `google.ts:277-293`). Cookie binding M2 utuh.
- **Performa — PASS dengan catatan.** Query baru memakai index `(user_id, installation_id)` (migrasi `0002`), bukan full scan; tidak ada query di loop; landing 174.076 B ≤ 174.080 B; chunk tunggal & kompresi & libsodium semuanya hijau (6/6). Catatan: headroom 4 byte = risiko proses, bukan regresi hari ini.
- **Kerapian — PASS.** Tidak ada `any`/`@ts-ignore`/`eslint-disable`/`console.log` baru; komentar menjelaskan "kenapa"; migrasi + snapshot + `server.dbml` konsisten; test penulis tidak melemahkan assertion mana pun (diff `http-gateway.test.ts` hanya menyesuaikan bentuk `device` jadi fungsi, tanpa `.only`/`.skip`). `CHANGELOG`/PRD tidak perlu berubah.

---

## 7. Coverage & celah test yang tersisa

- Yang **belum** punya test otomatis dan sebaiknya ditambah kemudian:
  1. Idempotensi `currentInstallationId` saat **properti** `localStorage` melempar (BUG-1).
  2. Adopsi vs revoke bersamaan (BUG-2) — butuh seam/mock DB untuk deterministik.
  3. Login paralel dengan `installationId` **sama** (sisa risiko 1) sebagai test karakterisasi, bukan blocker.
  4. Klien lama (tanpa id) dan klien baru di browser yang sama saat deploy bergilir — perilaku rotasi silang; sekarang hanya analisis, bukan test.
- Tingkat keyakinan: **tinggi** untuk AC1–AC7 pada level service + HTTP (test penulis) dengan Postgres nyata; **sedang** untuk perilaku browser sungguhan (id instalasi hanya diuji di happy-dom, termasuk `localStorage` yang diblokir sebagian).

## 8. Rekomendasi

1. Terima task #80 (`done`): AC terbukti, mutation check bersih, gate hijau, tidak ada regresi #76–#79.
2. Buat task terpisah `Low` untuk BUG-1 (cache id instalasi saat storage terblokir + test idempotensi) dan BUG-2 (`isNull(revokedAt)` di `UPDATE` adopsi).
3. Jaga budget landing: setiap penambahan ke graf awal butuh pengukuran ulang; pertimbangkan menaikkan headroom dengan memecah chunk sebelum menyentuh landing lagi.
4. Sebelum deploy: jalankan `pnpm --filter @improve-personal/web db:migrate` (dua migrasi additive) **sebelum** kode baru; migrasi sudah terbukti aman untuk data lama.
