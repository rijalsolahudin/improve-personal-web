# Security review #80 — identitas instalasi perangkat (`installationId`)

**Tanggal:** 2026-10-24 · **Reviewer:** Arif (Security Engineer) · **Mode:** READ-ONLY (tidak ada kode produk yang diubah)
**Scope:** `git diff 1d81b5f..HEAD` (`4ffd5c2` "feat(auth): bedakan perangkat lewat identitas instalasi") — 25 berkas.
**Rules dibaca:** `CLAUDE.md` (root), `.claude/rules/shared-security.md`, `.claude/rules/shared-code-quality.md`, `.claude/rules/ergonio-status-flow.md`, `apps/web/AGENTS.md`, `apps/web/CLAUDE.md`, `apps/web/.claude/rules/security.md`. `packages/**` → rules root. `apps/mobile` tidak menyentuh kode (folder hanya berisi dokumen), jadi rules mobile tidak dimuat.

**Verdict keamanan: LOLOS** — 0 Critical, 0 High, 0 Medium. 2 Low (hardening, bukan jalur eksploit) + 6 informational.
Tidak ada jalur lintas-akun baru: `installationId` **tidak** pernah dipakai untuk authz, dan semua pencarian/penulisan baris `devices` ter-scope `user_id` dari sesi/OTP yang sudah terverifikasi. Tidak ada PII baru yang bocor ke DTO, log, atau pesan error. Tidak ada regresi #76–#79.

> Catatan tata kelola: saya **tidak** memindahkan status Ergonio (tetap `status-1792622088574` Ready to Review untuk QA). Verdict ini soal keamanan, bukan keputusan `done`.

---

## 0. Pertanyaan terbuka (menentukan severity, bukan verdict)

1. **Apakah `installationId` akan dipakai juga oleh klien native** (`apps/mobile` masih dokumen saja)?
   - A. Belum, web dulu → seluruh analisis ini berlaku apa adanya; perilaku mobile nanti mengikuti kontrak yang sama (kolom sudah nullable, jadi aman).
   - B. Ya, dan native akan memakai id yang **sama** untuk beberapa akun di satu perangkat → tidak berubah (scoping per user).
   - **Asumsi saya: A.**
2. **Apakah ada reverse proxy/CDN di depan `/v1` yang mencatat request-URI lengkap?**
   - A. Ya (nginx/Cloudflare/Traefik default) → L1 naik dari "informational" ke **Low** dengan pemilik tindakan di infra, bukan kode.
   - B. Tidak ada / query dibuang dari access log → L1 murni catatan.
   - **Asumsi saya: A** (hampir semua deployment punya access log), karena itu L1 saya tulis sebagai Low.
3. **Apakah perlu jaminan "satu instalasi = satu baris" di level DB (bukan hanya kode)?**
   - A. Cukup seperti sekarang (kode) → L2 tetap **Low**.
   - B. Perlu dijamin (mis. karena ada job/replika lain yang menulis `devices`) → L2 naik ke **Medium** dan partial unique index wajib.
   - **Asumsi saya: A hari ini.**

---

## 1. Ringkasan risiko & verdict

| # | Sev | Temuan | Sifat |
|---|---|---|---|
| L1 | Low | `installationId` dikirim sebagai **query string** di `GET /v1/auth/google/start` (`http-gateway.ts:171`). Nilainya masuk request-URI, jadi bisa terekam di access log reverse proxy/CDN — meski aplikasi sendiri tidak pernah mencatatnya (`server-log.ts:24` hanya `pathname`). Nilai ini bukan kredensial, jadi dampaknya bukan pengambilalihan sesi, melainkan *linkability* perangkat + `UUIDv7` yang membocorkan waktu pembuatan id. | Baru (konsekuensi desain alur Google) |
| L2 | Low | Tidak ada jaminan DB bahwa `(user_id, installation_id)` unik untuk baris aktif. Jalur `resolveDeviceForLogin` memakai pola SELECT→INSERT, jadi dua login paralel dengan `installationId` sama bisa membuat **dua baris** dengan nilai identik (`device.ts:169-200`). Konsekuensi: gejala #80 bisa muncul kembali untuk pasangan baris kembar (login berikut memilih yang terbaru, sesi baris lama tidak ter-revoke) dan jatah 10 perangkat terpakai dua. Tetap ter-scope satu akun — bukan lintas akun, bukan eskalasi. | Baru (celah invarian, bukan celah akses) |

**Informational (bukan temuan):** I1 korelasi perangkat lintas akun di DB (nilai sama untuk dua akun di browser yang sama) — mitigasi opsional HMAC; I2 adopsi baris lama bisa mengambil baris **mesin lain** milik user yang sama bila `name`+`platform` identik (setara perilaku pra-#80, bukan regresi); I3 `/start` yang bisa dipicu lintas situs memungkinkan penyerang "menempelkan" nilai pilihannya ke baris perangkat korban (tanpa eskalasi); I4 urutan deploy: migrasi **harus** lebih dulu dari kode; I5 `ip-install-id` sengaja bertahan setelah logout & hapus akun; I6 `listDevices` memakai `.select()` semua kolom.

Tidak ada temuan pada: DoS lintas akun lewat spoofing `installationId`, rebutan baris pada adopsi, kebocoran `installationId` ke DTO/API, jalur Google memilih baris perangkat dari query callback, pelonggaran `redirectUri`/field asing, keamanan migrasi `ADD COLUMN`, log/PII, dan regresi #76–#79.

---

## 2. Threat model singkat

- **Aset:** baris `devices` (+ `sessions` yang menempel padanya). Satu baris = satu "perangkat" yang bisa di-revoke user dan yang sesinya di-rotasi saat login.
- **Nilai baru yang dikendalikan klien:** `installationId` (UUID, opsional). Ia **bukan** kredensial: tidak pernah dipakai untuk otentikasi/otorisasi, hanya untuk **memilih baris** `devices` mana yang dipakai ulang.
- **Aktor:**
  (a) penyerang tanpa akun — bisa memanggil `/v1/devices`? tidak; bisa memanggil `/auth/google/start` (publik) dengan `installationId` apa pun;
  (b) **user lain** (akun berbeda) di perangkat/origin yang sama;
  (c) **script same-origin/XSS** — di luar batas desain (kalau XSS menang, cookie `HttpOnly` pun tak menolong), tapi dipakai sebagai pembanding "apakah fitur ini menambah kemampuan".
- **Trust boundary baru:** `localStorage.ip-install-id` (bisa ditulis siapa pun yang bisa jalan di origin) → body OTP / query Google `/start` → kolom `devices.installation_id` → keputusan "baris mana yang dipakai ulang" → `issueSession` (yang me-revoke sesi lain di baris itu).
- **Kenapa boundary itu aman:** nilai dari boundary ini hanya dipakai **bersamaan dengan** `user_id` yang berasal dari sesi/kode OTP terverifikasi, di semua query (`device.ts:60-66`, `:83-92`, `:120-128`, `:186-196`). Tidak ada satu pun jalur `(installationId) → userId`. Jadi kekuatan maksimum nilai ini adalah "memilih salah satu baris **milik sendiri**".

---

## 3. Jawaban atas tujuh fokus review

### 3.1 Spoofing `installationId` → DoS lintas akun? **Tidak bisa.**

Rantai yang harus dilalui penyerang untuk mematikan sesi korban: login sukses sebagai korban → `loginDevice` → `resolveDeviceForLogin(userId=victim, …)` → `issueSession(deviceId=baris korban)` → `UPDATE sessions SET revoked_at` untuk `(deviceId, client)` (`session.ts:66-100`).

- `userId` **tidak pernah** berasal dari klien: OTP memakai `verified.userId` dari challenge yang sudah dikonsumsi atomik (`otp/verify.post.ts:28-34`), Google memakai `user.id` dari email di ID token (`google.ts:277-281`).
- Karena itu, untuk menyentuh baris milik korban, penyerang harus **sudah** bisa menerbitkan sesi akun korban (kode OTP email korban atau akun Google korban). Di titik itu ia tidak butuh `installationId` sama sekali.
- Nilai korban juga tidak bisa ditebak: UUIDv7 = 48 bit timestamp + 74 bit acak (`app/utils/storage/uuid`).
- Ada dua cara nilai korban "diketahui" penyerang: (i) akses ke perangkat/origin korban (di titik itu `localStorage` sudah terbuka, tapi cookie sesi tetap `HttpOnly` — nilai ini tidak menambah apa pun), (ii) memaksa browser korban memulai flow Google dengan nilai pilihan penyerang (lihat I3). **Keduanya tidak memberi kemampuan baru**: tidak ada endpoint yang menerjemahkan `(userId, installationId)` menjadi token/sesi.
- Yang benar-benar bisa dilakukan penyerang: menghabiskan **jatah 10 perangkat akunnya sendiri** dengan mengirim `installationId` acak setiap login (`device.ts:186-187` → `DEVICE_LIMIT_REACHED`). Itu self-DoS murni, tidak menarik.

**Sisa permukaan yang nyata:** tidak ada. Severity: none.

### 3.2 Adopsi baris lama — rebutan baris? **Aman.**

- `SELECT … WHERE user_id = ? AND name = ? AND platform = ? AND installation_id IS NULL AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 1` lalu `UPDATE … WHERE id = ? AND installation_id IS NULL RETURNING` (`device.ts:113-142`). Klaim bersifat **atomik**: dari dua instalasi yang berlomba, hanya satu mendapat baris (`RETURNING` berisi), yang kalah mendapat `[]` → lanjut membuat baris sendiri.
- Tidak lintas akun: SELECT **dan** UPDATE sama-sama menyaring `user_id`. Baris milik akun lain tidak pernah jadi kandidat, jadi tidak ada "adopsi lintas akun".
- Tidak mencuri baris yang sudah punya pemilik: filter `installation_id IS NULL` ada di SELECT **dan** di WHERE UPDATE (bukan hanya di SELECT).
- **Satu-satunya efek samping** (I2): bila satu user punya beberapa baris legacy dengan `name`+`platform` identik dari **mesin berbeda**, instalasi pertama yang upgrade mengadopsi baris **terbaru** — yang bisa jadi baris mesin lain. Login itu lalu me-revoke sesi mesin tersebut **sekali**. Ini bukan regresi: kode pra-#80 memang memakai ulang baris itu (`findActiveDeviceIdByNamePlatform`, `device.ts:77-100`, tetap dipertahankan untuk klien lama). Kalau ingin lebih ketat: tambahkan `NOT EXISTS (SELECT 1 FROM sessions WHERE device_id = devices.id AND revoked_at IS NULL)` pada kandidat adopsi.

### 3.3 Enumerasi / kebocoran lewat API? **Tidak ada.**

- `deviceDtoSchema` strict dan **tidak** memuat `installation_id` (`packages/contracts/src/devices.ts:66-83`); `toDeviceDto` memetakan field satu per satu (`device.ts:24-46`); `sessionDeviceSchema` hanya `{ id, name }` (`auth.ts:190`).
- `GET /v1/devices` divalidasi di test terhadap `deviceListResultSchema` (strict) atas **respons nyata** (`server/tests/http.test.ts:419-421, 449-451, 643-652`) — menambah field baru ke DTO akan langsung memerahkan test, bukan diam-diam bocor.
- Penyimpanan plaintext (localStorage + DB) tidak menambah permukaan eksekusi; yang bertambah hanya *linkability*: `ip-install-id` tidak dihapus saat logout (`useLogout.ts:12-27`), jadi dua akun yang login di browser yang sama menyimpan nilai identik di baris `devices` masing-masing. Siapa pun yang bisa membaca **DB** bisa menyimpulkan "dua akun ini pernah memakai browser yang sama". Setara kelas data dengan `last_ip_city`/`ip_hash` yang sudah ada, tapi ini sinyal baru → I1.

### 3.4 Google — nilai hanya dari baris `oauth_states`? **Ya, terbukti.**

- `/start` menyimpan nilai ke baris state (`google.ts:96-105`), callback membacanya dari baris yang **dikonsumsi atomik** (`google.ts:228-243`) dan memakainya setelah state terbukti sah (`google.ts:288-293`).
- `googleCallbackQuerySchema` `.strict()` dan **tidak** punya field `installationId` (`auth.ts:171-180`) → `?installationId=` di callback dijawab `400 VALIDATION_FAILED`, tidak pernah menyentuh DB.
- `googleStartQuerySchema` tetap `.strict()` (`auth.ts:130-134`): `redirectUri`, `redirect_uri`, `state` ditolak, dan penolakan terjadi **sebelum** ada baris `oauth_states` yang lahir — dibuktikan `server/tests/http-hardening.test.ts:843-891`.
- Cookie binding M2 tetap dipasang pada respons `/start` web (`http-hardening.test.ts:855-860`), dan nilai `installationId` tidak ikut ke URL Google (`google-oauth.test.ts:284-301`).
- **Residual (I3):** nilai di `/start` dikendalikan pihak yang **memulai** flow. Karena pemakaiannya ter-scope user (3.1), ini tidak memberi eskalasi. Konsekuensi yang perlu disadari: siapa pun bisa memicu `GET /v1/auth/google/start?...&installationId=<pilihan>` di browser korban (gambar/link lintas situs) dan menimpa cookie binding flow yang sedang berjalan — korban lalu mencatat nilai yang diketahui penyerang pada barisnya, dan flow-nya sendiri gagal (`OAUTH_INVALID`). Ini gangguan, bukan kebocoran; `GET` start memang publik dan tidak dijaga CSRF (mutasi saja yang dijaga, `10-csrf.ts:57-60`).

### 3.5 Migrasi produksi? **Aman (aditif, tanpa rewrite).**

- `0002_loving_warhawk.sql:1` — `ALTER TABLE "devices" ADD COLUMN "installation_id" uuid;` **nullable tanpa default** → di PostgreSQL 11+ ini metadata-only (tidak menulis ulang tabel, tidak ada backfill); lock `ACCESS EXCLUSIVE` hanya sesaat.
- `0002_…:2` — `CREATE INDEX "idx_devices_user_installation" …` **non-concurrent** → mengambil `SHARE` lock yang memblokir **tulis** ke `devices` selama pembuatan. Tabel ini kecil (≤ 10 baris aktif per user, `MAX_ACTIVE_DEVICES_PER_USER`), jadi sub-detik. **Rekomendasi:** kalau nanti `devices` sudah besar, buat index di migrasi terpisah dengan `CREATE INDEX CONCURRENTLY` (tidak boleh di dalam transaksi).
- `0003_powerful_grey_gargoyle.sql:1` — `oauth_states.installation_id` idem, tanpa index. Tidak ada perubahan destruktif, tidak ada `DROP`/`NOT NULL`/default baru.
- **Urutan deploy (I4):** migrasi aditif ini kompatibel ke belakang (kode lama + schema baru = aman), tetapi **kode baru + schema lama = 500** untuk semua login (SELECT/INSERT menyebut kolom `installation_id`). Jadi: `db:migrate` dulu, baru rilis app. Sudah jadi AC di §4.
- Index baru tidak menduplikasi yang lama: `idx_devices_user_created` (user, created_at), `idx_devices_user_active` (partial, user, revoked_at), `idx_devices_user_installation` (user, installation_id) — masing-masing melayani query berbeda. Snapshot `meta/0002`, `meta/0003`, dan `_journal.json` konsisten (idx 2 dan 3 terdaftar), dan sudah terbukti terpasang di DB test (`pg_indexes` memuat ketiganya).

### 3.6 Log / PII? **Bersih.**

- Satu-satunya jalur log error mencatat `pathname` (bukan `href`), method, nama error, pesan, stack (`server/utils/server-log.ts:18-34`). Query string **tidak** ikut, jadi `installationId` tidak pernah masuk log aplikasi.
- Tidak ada `console.*` lain di `server/` maupun `app/` (selain `[env]` warning startup dan `server-log` di atas).
- Pesan error generik dari kontrak (`api-error.ts`); `ZodError` tidak pernah diteruskan ke klien, dan issue zod untuk `installationId` hanya menyebut tipe/format, bukan nilainya.
- `oauth_states` (yang kini menyimpan nilai itu) dibersihkan job `cleanup-ephemeral` (`maintenance.ts:128-142`, retensi ≤ 1 jam).
- Di luar kendali kode: access log proxy (L1).

### 3.7 Regresi #76–#79? **Tidak ada.**

- Diff hanya menyentuh kontrak auth/devices, util perangkat web, gateway auth, service `device`/`google`/route auth, schema + migrasi, dan `useLogout.clearAppStorage`.
- `clearAppStorage` (`useLogout.ts:20-28`) hanya **menambahkan** satu key ke daftar "jangan disapu"; perilaku penghapusan key lain tidak berubah (dibuktikan `useLogout.test.ts`).
- Suite web penuh hijau: 212 berkas / 1605 test + 2 `expected fail` (lihat §6). Termasuk `http.test.ts` (isolasi akun & IDOR perangkat), `sync.test.ts` (#76/#77), dan test karantina (#79). Kontrak: 114 test hijau.

---

## 4. Acceptance criteria keamanan (untuk implementasi & QA)

| AC | Isi | Status di `4ffd5c2` |
|---|---|---|
| S1 | `installationId` tidak pernah muncul di DTO/response mana pun (`GET /v1/devices`, `GET /v1/auth/session`, body login) | **Terpenuhi** — `deviceDtoSchema`/`sessionDeviceSchema` strict + test respons nyata |
| S2 | `installationId` tidak pernah dipakai untuk authz; setiap query `devices` membawa `user_id` dari sesi/OTP terverifikasi | **Terpenuhi** (`device.ts:60-66, 83-92, 120-128, 186-196`) |
| S3 | Login Google mengambil nilai **hanya** dari baris `oauth_states`; query callback tidak bisa menentukan perangkat (schema strict) | **Terpenuhi** (`google.ts:228-243, 288-293`; `auth.ts:171-180`) |
| S4 | `redirectUri`/`redirect_uri`/`state`/field asing di `/start` tetap `400`, dan tidak ada baris `oauth_states` yang lahir dari request itu | **Terpenuhi** (`http-hardening.test.ts:865-891`) |
| S5 | Rotasi sesi tetap hanya untuk `(deviceId, client)` yang sama — tidak melebar ke perangkat lain | **Terpenuhi** (`session.ts:76-92`; `session-device.test.ts:361-420`) |
| S6 | Tidak ada nilai `installationId` di log/analytics/pesan error/DTO | **Terpenuhi** (§3.6) |
| S7 | Migrasi aditif & diterapkan **sebelum** app versi baru (`db:migrate` → deploy) | **Perlu dipastikan di pipeline** (I4) |
| S8 | Nilai yang rusak/diblokir di `localStorage` tidak pernah menggagalkan login dan tidak pernah dipakai lintas-user di SSR | **Terpenuhi** (`device-installation.ts:103-127`: cache modul **tidak** diisi saat storage tidak tersedia) |

---

## 5. Temuan (detail)

### L1 — `installationId` di query string `/v1/auth/google/start` (Low)

**Lokasi:** `apps/web/app/composables/auth/http-gateway.ts:165-171`; `apps/web/server/routes/v1/auth/google/start.get.ts:41-46`.
**Dampak:** nilai penanda instalasi yang stabil masuk ke request-URI. Aplikasi tidak mencatatnya (`server-log.ts:24`), tetapi access log reverse proxy/CDN umumnya mencatat URI lengkap; `UUIDv7` juga membocorkan waktu id dibuat. Nilai ini **bukan kredensial**, jadi tidak ada pengambilalihan sesi atau revoke lintas akun — dampaknya terbatas pada *linkability* (mengaitkan beberapa login Google sebagai satu perangkat di log pihak lain) dan pada kebiasaan buruk "identitas perangkat di URL".
**Skenario:** operator/penyusup yang punya akses ke access log proxy melihat `…&installationId=019de2fb-…` berulang dari IP berbeda → bisa menyimpulkan satu perangkat berpindah jaringan. Tidak ada jalur ke akun.
**Perbaikan (pilih satu):**
1. (Disarankan, murah) pastikan edge/proxy **tidak menyimpan query string** untuk path ini, atau redaksi parameter `installationId` di pipeline log.
2. Alternatif arsitektur: bawa nilai lewat cookie sekali-pakai yang dipasang `/login` (sama seperti pola cookie binding OAuth), atau ubah `/start` menjadi `POST` dengan body `{ client, installationId }` — tapi ini menambah perubahan kontrak web+mobile, jadi bukan untuk sekarang.
3. Kecil tapi tetap lakukan: `encodeURIComponent(installationId)` pada `http-gateway.ts:171`. Hari ini nilai selalu UUID kanonik (dijamin `uuidSchema` di `device-installation.ts:92`), jadi tidak ada injeksi — ini pertahanan berlapis supaya pola "tempel nilai ke URL" tidak jadi contoh untuk field berikutnya.
**Verifikasi:** `curl -sI 'https://<host>/v1/auth/google/start?client=web&installationId=019de2fb-1900-71a0-a2ca-9a2a64859e74'` lalu periksa access log: nilai itu tidak boleh muncul.

### L2 — Tidak ada invarian DB "satu instalasi = satu baris aktif" (Low)

**Lokasi:** `apps/web/server/services/device.ts:169-200` (SELECT→INSERT), `apps/web/server/db/schema.ts:96-108` + `:118-122` (kolom & index sengaja non-unique).
**Dampak:** dua login **paralel** dengan `installationId` sama (dua tab, klik ganda pada alur Google dengan dua `state` berbeda, atau dua worker) bisa sama-sama lolos `findActiveDeviceIdByInstallation` (null), lolos adopsi (null), lalu sama-sama INSERT → dua baris `devices` dengan `installation_id` identik. `findActiveDeviceIdByInstallation` memilih yang **terbaru**, jadi baris lama tidak pernah di-reuse lagi: sesinya tidak ikut ter-rotate saat login berikutnya (gejala #80 muncul kembali untuk pasangan itu) dan jatah 10 perangkat terpakai dua. Tidak lintas akun, tidak memberi akses.
**Skenario replikasi (konseptual, tanpa mengubah kode):** panggil `loginDevice` dua kali dengan `Promise.all` dan `installationId` yang sama → `count(distinct device_id)` = 2. (Sama sekali tidak bergantung pada nilai rahasia; ini murni race.)
**Perbaikan:** partial unique index + penanganan konflik:
```sql
CREATE UNIQUE INDEX "uq_devices_user_installation_active"
  ON "devices" ("user_id","installation_id")
  WHERE "installation_id" IS NOT NULL AND "revoked_at" IS NULL;
```
lalu di service: `insert … onConflictDoNothing().returning({id})`, dan kalau kosong → ulangi `findActiveDeviceIdByInstallation`. Perlu diperhatikan: UPDATE adopsi juga bisa kena unique violation bila baris aktif lain sudah memegang nilai itu → bungkus dengan `try/catch` lalu fallback ke baris hasil re-select. Alternatif lebih ringan (tanpa index): setelah INSERT, jalankan re-select `ORDER BY created_at DESC LIMIT 1` supaya kedua jalur memakai baris yang sama — menghilangkan gejala, tidak menghilangkan baris kembar.
**Verifikasi:** test dua `loginDevice` paralel dengan `installationId` sama → `expect(countActiveDevices(ctx, userId)).toBe(1)` dan kedua hasil menunjuk `deviceId` yang sama.

---

## 6. Bukti verifikasi (read-only, tanpa mengubah kode produk)

```
apps/web  npx vitest run   (run 1, sebelum tree berubah)
                            → 212 file / 1605 test lulus + 2 expected fail
                            (termasuk session-device, google-oauth, http-hardening,
                             useLogout, device, device-installation,
                             http-gateway.installation, http.test.ts isolasi akun/IDOR
                             perangkat, sync.test.ts)
apps/web  npx vitest run   (run 2, setelah berkas test QA masuk)
                            → 213 file / 1613 test lulus + 2 expected fail, 2 gagal di
                              app/components/features/deco/DecoLayer.qa.test.ts (T24)
packages/contracts  npx vitest run  → 8 file / 114 test lulus
DB test: kolom devices.installation_id ada; tiga index devices terpasang
         (user_created, user_active partial, user_installation)
```
Dua kegagalan di run 2 berasal dari `app/components/features/deco/DecoLayer.qa.test.ts` (T24 — tidak terkait #80) dan **hilang saat berkas itu dijalankan sendiri** (14/14 lulus) → flaky/pencemaran antar-worker saat ada berkas baru muncul di tengah run, bukan regresi perubahan ini.

**Catatan proses (penting untuk orchestrator/QA):** selama review, working tree sedang diedit proses lain. Saya sempat mengamati `server/services/device.ts` dalam keadaan **tanpa** jalur adopsi + fallback `name`+`platform` tanpa filter `installation_id`; pada keadaan itu `server/tests/qa-t80-installation.test.ts` (untracked, milik QA) gagal 3 test (AC3). Beberapa detik kemudian `google.ts` setengah-edit (spread `installationId` hilang). Sekarang tree kembali sama dengan `4ffd5c2` (hanya menyisakan berkas test untracked). **Verdict di laporan ini berlaku untuk commit `4ffd5c2`.** Sebelum Ready to Review, pastikan `git status` bersih dan suite hijau — kalau varian "tanpa adopsi" itu ikut ter-commit, AC3 #80 hilang dan baris perangkat kembali bergabung.

---

## 7. Hardening yang direkomendasikan (non-blocking)

- **I1 — korelasi lintas akun di DB.** Simpan `HMAC(installationId, DEVICE_PEPPER)` (atau `HMAC(userId || installationId, …)`) alih-alih nilai mentah. Manfaat: nilai klien tidak pernah tersimpan apa adanya (kalau DB/log bocor, penyerang tidak bisa "menempelkan" nilai yang dikenal ke baris tertentu), dan varian per-user menghapus korelasi lintas akun di browser bersama. Biaya: satu util + pepper di `env.ts`. Kalau dipilih, migrasi harus mengosongkan `installation_id` lama (atau biarkan NULL → adopsi mengisinya lagi).
- **I2 — adopsi lebih ketat.** Tambahkan syarat "baris kandidat tidak punya sesi aktif" sebelum adopsi, supaya upgrade build tidak pernah mematikan sesi mesin lain milik user yang sama.
- **I3 — sadari & dokumentasikan** bahwa `GET /auth/google/start` bisa dipicu lintas situs (menimpa cookie binding flow yang sedang berjalan, dan menempelkan `installationId` pilihan penyerang ke baris korban). Bukan eskalasi; cukup catatan di dok keamanan supaya tidak "ditemukan" lagi di audit berikutnya.
- **I4 — urutan deploy.** `db:migrate` → rilis app. Tambahkan ke runbook; kalau pipeline saat ini menjalankan migrasi bersamaan dengan rilis, ada jendela 500 untuk semua login.
- **I5 — retensi `ip-install-id`.** Nilai bertahan setelah logout dan hapus akun (memang disengaja, dan bukan PII). Kalau nanti ada janji "lupakan perangkat ini sepenuhnya" di UI/UU PDP, sediakan tombol yang juga menghapus `ip-install-id` — jangan mengubah perilaku logout biasa (`useLogout.ts:12-28`).
- **I6 — defense in depth DTO.** `listDevices` memakai `.select()` seluruh kolom (`device.ts:205-213`) lalu memetakan manual. Aman hari ini (pemetaan eksplisit), tapi ganti ke `.select({ id, name, platform, createdAt, lastSeenAt, lastIpCity, revokedAt })` supaya kolom baru di masa depan tidak bisa "ikut" tanpa ada yang memutuskan.
