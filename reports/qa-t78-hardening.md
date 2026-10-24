# QA T78 — Hardening sync: identitas wajib, pemulihan index gagal, test plugin

**Verdict putaran 1: GAGAL** (1 bug High, AC #2 tidak terpenuhi untuk bentuk data yang paling umum).
**Verdict putaran 2 (commit `9cf6037`): GAGAL** — B1 tertutup untuk bentuk yang dipin putaran 1, tetapi
belum untuk bentuk lain (B3 High, B4 Medium di **§11**); B2 dan L1 tertutup, semua gate hijau.

Diff dinilai: `git diff ab6c47d..HEAD` (`3e2f578` bagian A+B, `ab34f38` bagian C).
Tier verifikasi: T2 (server + auth + storage + perbaikan data-loss) — suite penuh + typecheck + build
diminta eksplisit oleh task, jadi tetap dijalankan.

Rules dibaca: root `CLAUDE.md`, `.claude/rules/{shared-security,shared-code-quality,ergonio-status-flow}.md`,
`apps/web/AGENTS.md`, `apps/web/CLAUDE.md`, `apps/web/.claude/rules/{security,performance,code-quality}.md`.

---

## 1. Ringkasan AC

| # | AC | Hasil | Bukti |
|---|---|---|---|
| 1 | Tidak ada request sync lintas akun dari tab basi | **lulus** | `app/plugins/auth-session.client.test.ts` (8 test), `app/utils/auth/session-sync.test.ts` (13 test), `app/plugins/sync.client.test.ts` ("identitas auth berubah menghentikan controller"), `server/tests/http.test.ts` (403 + tidak ada tulisan) |
| 2 | Record gagal-dekripsi punya jalur pemulihan yang terlihat | **GAGAL** | Bug B1 di bawah + test pin `app/utils/sync/controller.quarantine-solo.qa.test.ts` |
| 3 | Plugin/timer/retry ter-cover test | **lulus** | `sync.client.test.ts` (attach sekali, stop per status/rute/sesi/identitas, `getTimerCount() === 0` lalu `advanceTimersByTime(10 mnt)`), `ShellSyncStatus.retry.qa.test.ts` |
| 4 | `x-expected-user-id` wajib untuk browser, opsional native, dicek sebelum rate limit/body/query | **lulus** | `server/utils/auth.ts:46-85`, `push.post.ts`/`pull.get.ts` memanggil `requireExpectedUserId` sebelum `consumeRateLimit` & `readValidatedBody`/`getValidatedQuery`; `http.test.ts` §"penanda pemilik request" (5 test) |
| 5 | Satu sumber `RECORD_INDEX_KEEP` | **lulus** | `packages/core/src/ports.ts:53`, barrel `index.ts:45`, web `app/utils/storage/index-decision.ts` re-export; impl web memakai konstanta (`indexeddb.ts:30,304,308`). Tidak ada definisi kedua. |
| 6 | Tiga pilar: tanpa log/PII, tanpa dependency baru, bundle dalam budget, gate hijau | **lulus dengan catatan** | tidak ada `console.*` di file yang diubah, tidak ada perubahan `package.json`/lockfile, quarantine hanya menyimpan UUID, sinyal antar-tab tanpa payload; bundle 169,93/170 KB (lihat §5) |

---

## 2. Perintah & hasil persis

| Perintah | Hasil |
|---|---|
| `pnpm --filter @improve-personal/web exec vitest run app server/tests` | **199 files passed**, **1511 passed + 2 expected fail (1513)**, 102.00 s. Run pertama (sebelum test QA ditambahkan): 198 files, 1511 passed, 90.31 s. `DecoLayer.qa.test.ts` & `memo.qa.test.ts` **tidak** flaky di dua run ini. |
| `pnpm --filter @improve-personal/core test` | **22 files passed, 379 tests passed**, 1.15 s |
| `pnpm --filter @improve-personal/web typecheck` (`nuxt typecheck`) | exit **0**, tanpa diagnostik |
| `npx eslint app server --max-warnings 0` (di `apps/web`) | exit **0**, tanpa output |
| `npx prettier --check apps/web/app apps/web/server packages/core/src` | **All matched files use Prettier code style!** |
| `pnpm --filter @improve-personal/web build` | exit **0**, `verify-precache OK: 13 entri`, total 8,26 MB (2,22 MB gzip) |
| `vitest run app/utils/bundle-budget.test.ts` | **6 passed** |
| Ukur ulang JS awal landing dari `.output/public/index.html` (`modulepreload` + `script`, gzip 9) | **169,93 KB / 27 berkas** → lolos, sisa **0,07 KB** |

---

## 3. Bug

### B1 — High: record rusak yang sendirian di halamannya tidak pernah dikarantina; pull berhenti permanen

**Lokasi:** `apps/web/app/utils/sync/controller.ts:476` (`if (keyFailures.decoded === 0)`), dengan
penghitung di `:427` (`keyFailures.decoded += 1`) dan `:481-490` (naik/karantina).

**Akar masalah.** `decoded` hanya menghitung record yang berhasil didekripsi **di siklus yang sedang
berjalan**, dan hanya untuk record yang masih **kandidat merge**. Begitu halaman berisi record rusak
pernah ditolak, halaman itu menjadi "halaman tempat cursor parkir", dan semua record sehat di
halaman sebelumnya sudah diterapkan sehingga tidak lagi menjadi kandidat. Di siklus ke-2 dst.
`decoded` selalu 0 → cabang "kunci salah" → `consecutiveKeyFailures` mentok di 1 → **tidak pernah**
sampai `QUARANTINE_AFTER_KEY_FAILURES`. Karena merge selalu ditolak, cursor tidak pernah maju. Jadi
persis bug yang ingin diperbaiki AC #2 masih ada untuk halaman yang seluruh record barunya rusak.

Bentuk data yang paling umum kena:
- akun dengan 1 record (record itu rusak) — pull pertama = satu halaman, satu record;
- **record rusak adalah record terbaru** (paling sering: perangkat A push satu record yang tidak bisa
  dibuka perangkat B; perangkat B pull hanya record itu);
- halaman terakhir yang tersisa hanya berisi record rusak.

**Langkah reproduksi** (test pin: `apps/web/app/utils/sync/controller.quarantine-solo.qa.test.ts`):

1. `startSync(session, baseUrl, { http: serverPalsu, autoStart: false })` — `session.provider.openRecord`
   melempar untuk `BAD_ID`, mengembalikan payload `todo` sah untuk id lain.
2. Server palsu: `cursor=0` → `{ records: [GOOD_ID], nextCursor: 1 }`, `cursor=1` →
   `{ records: [BAD_ID], nextCursor: 2 }`.
3. `await runSync({ pull: true })` 5×.

- **Expected (AC #2):** setelah 3 siklus `isQuarantined(BAD_ID) === true` dan
  `sync_state.cursor === 2`, `status === 'synced'`.
- **Actual:** `isQuarantined(BAD_ID) === false`, `cursor === 1`, `status === 'error'` — selamanya.
  (Varian akun satu record: `cursor === 0`, `status === 'error'` setelah 4 siklus.)
- **Dampak user:** indikator "Gagal sinkron", tombol "Coba lagi" ada tetapi tidak pernah menolong,
  dan **semua record baru di belakang record rusak tidak pernah masuk**. Tidak ada data yang hilang
  (tidak ada tulisan yang menimpa), tetapi data berhenti mengalir tanpa jalur pulih — persis kondisi
  yang dilarang AC #2.
- **Bukti test pin:** `it.fails` (konvensi repo, lihat `packages/core/src/domain/entities/goal.test.ts`):
  saat ini "2 expected fail"; begitu diperbaiki, test langsung merah dan harus diubah jadi `it`.
- **Saran arah perbaikan (bukan instruksi implementasi):** bukti "kunci salah" tidak boleh berasal dari
  halaman yang sedang diproses saja. Kalau perlu, simpan bukti kunci-pernah-benar untuk sesi ini
  (mis. keberhasilan dekripsi apa pun di sesi berjalan / record lokal yang bisa dibuka), dan hitung
  kegagalan per record per siklus tanpa bergantung pada keberadaan record sehat **di halaman yang sama**.
  Alternatif lain: coba dekripsi ulang satu record yang sudah ada di storage lokal sebagai kontrol
  kunci sebelum memutuskan "kunci salah".

### B2 — Low: daftar karantina dibagi antar-tab, akun lain bisa menghapus daftar akun yang sedang aktif

**Lokasi:** `apps/web/app/utils/sync/quarantine.ts:103-111` (`adoptQuarantineAccount` menghapus daftar
saat pemilik berbeda), `apps/web/app/utils/sync/quarantine.ts:146` (`quarantinedCount` tidak melihat
pemilik), `apps/web/app/composables/useSyncStatus.ts:52`.

`localStorage` dipakai bersama semua tab. Tab A (akun A, sedang sync) + tab B login akun B → `adopt`
di tab B mengosongkan daftar milik A. Tab A lalu mengulang 3 siklus gagal sebelum mengarantina lagi
(sementara itu pull-nya berhenti). Ini sembuh sendiri, tidak ada data hilang, tetapi menambah stall
yang tidak perlu di jendela dua akun. Efek samping kedua: `blockedCount` membaca daftar tanpa memeriksa
pemilik, jadi shell bisa menampilkan "N data tidak bisa dibuka" milik akun sebelumnya sesaat setelah
ganti akun (hanya angka, bukan id/PII). Test `useSyncStatus.test.ts` justru mengunci perilaku ini
("tetap melaporkan jumlahnya saat penyimpanan lokal belum terbuka").

**Reproduksi:** `adoptQuarantineAccount('user-a')` → `quarantineRecord('r1')` →
`adoptQuarantineAccount('user-b')` → `quarantinedCount() === 0` (sudah ada di `quarantine.test.ts`),
lalu `isQuarantined('r1') === false` untuk tab A yang masih hidup.
**Expected:** karantina per akun, atau minimal penulisan oleh tab lain tidak membatalkan karantina
tab yang masih aktif. **Actual:** daftar bersama, terakhir-menang.

---

## 4. Mutation check (dijalankan, lalu kode dikembalikan; `git status` bersih setelah tiap mutasi)

| # | Klaim yang diuji | Mutasi | Test yang menangkap | Hasil |
|---|---|---|---|---|
| a | Karantina benar-benar terjadi karena kode ini | hapus `quarantineRecord(recordId)` (`controller.ts:489`) | `controller.test.ts` "satu record rusak + record lain sukses" | **merah**: `cursor: 0, status: 'error'` (expected 9/synced) |
| b | Pull maju setelah karantina karena record terkarantina dilewati | hapus `if (isQuarantined(remote.id)) return RECORD_INDEX_KEEP` (`:409`) | test yang sama | **merah**: cursor tetap 0, status error |
| c | Tab basi berhenti karena kanal sesi antar-tab | cabut `subscribeSessionChange(...)` di `installSessionSync` | `auth-session.client.test.ts` | **5 failed** ("memuat ulang…", "logout…", "HMR…") |
| c2 | Pengumuman ke tab lain benar-benar dipakai | cabut `announceSessionChange()` di watcher identitas | `auth-session.client.test.ts` §"perubahan identitas di tab ini diumumkan" | **3 failed** |
| d | Guard merge benar-benar menahan transaksi (bukan hanya menandai) | `decidePullKeyFailures` tidak dipanggil di `sync.pull.merge` | `controller.test.ts` "satu record rusak…" | **merah**: `pulled: 4, status: 'synced'` — record tak terbaca ditulis dan **cursor maju**. Ini membuktikan guard adalah satu-satunya yang menahan cursor. |

---

## 5. Tiga pilar

**Keamanan.** `requireExpectedUserId` fail-closed untuk browser dan jalan sebelum rate limit/body/query
di kedua route sync (`server/utils/auth.ts:76-90`, `push.post.ts`, `pull.get.ts`). Test membuktikan
403 tanpa tulisan data dan tanpa memakai jatah. Kanal antar-tab tidak mengirim payload (hanya penanda),
quarantine hanya menyimpan UUID, tidak ada `console.*` di file yang berubah, tidak ada PII di pesan
`RecordKeyError`. Tidak ada route sync lain (`server/routes/v1/sync/` hanya `push.post.ts` &
`pull.get.ts`).

**Performa.** Tidak ada dependency baru (tidak ada perubahan `package.json`/lockfile). Modul
`utils/auth/session-sync` benar-benar jadi chunk **prefetch**, bukan awal: di `index.html` ia muncul
sebagai `<link rel="prefetch">` (`Bwt7RGZ5.js`, 1.717 B raw / 860 B gzip) dan **tidak** dihitung budget;
`sync-quarantine` ada di chunk `z1XZ6yk-.js` yang juga tidak di daftar awal. JS awal landing
**169,93 KB gzip / 27 berkas** — lolos, tetapi sisa **0,07 KB (≈70 B)**; satu impor statis kecil di
graf landing akan menembus budget.

**Kerapian.** `RECORD_INDEX_KEEP` satu sumber (core → re-export web), komentar menjelaskan "kenapa",
tidak ada `any`/`@ts-ignore` baru, test menguji perilaku (bukan detail implementasi), tidak ada
`.only`/`.skip`. Catatan kecil: `apps/web/app/utils/storage/indexeddb.ts:293` masih memakai literal
`'keep'` di komentar (bukan nilai), dan beberapa test membandingkan `'keep'` literal — nilai sama,
bukan sumber kedua, jadi tidak melanggar AC #5.

---

## 6. Simulasi integrasi AC 1 & 2 (sejauh yang bisa tanpa browser nyata)

- **AC 1 (dua tab, satu origin).** `auth-session.client.test.ts` memakai `BroadcastChannel` sungguhan
  antar instance, `useAuthSession` sungguhan, dan hanya `$fetch` yang dimock di batas. Terbukti:
  identitas berubah → satu request → `navigateTo('/app', { external: true, replace: true })`;
  identitas sama / offline tidak me-reload; pemasangan ulang (HMR) tetap satu listener. Penjaga
  lapis kedua (server) terbukti di HTTP: cookie akun A + header akun B → 403 dan tidak ada baris yang
  tertulis. Tidak ada E2E dua konteks browser (repo belum punya harness multi-context untuk rute ini);
  risiko yang tersisa saya sebut di §7.
- **AC 2 (pull dengan blob rusak).** Test controller di atas memakai server palsu berhalaman + sesi
  memori; test pengembang membuktikan blob record rusak **tetap ditulis** dan keputusan index `keep`
  (baris index lama tidak dihapus), sementara semantik `keep` sendiri dikunci contract test adapter
  (`packages/core/src/adapters/contract.ts`). Yang **tidak** tercakup: jalur IndexedDB nyata di
  browser dan perilaku `record_index` lama sebelum/sesudah karantina pada database sungguhan.

---

## 7. Sisa risiko (tidak menggagalkan AC, perlu dicatat)

1. **Penanda browser bisa diakali oleh klien non-browser.** `isBrowserRequest` hanya melihat
   `Origin`/`Sec-Fetch-*` (`server/utils/auth.ts:46-49`); klien apa pun yang mengontrol header bisa
   menghilangkannya dan memakai jalur "native". Untuk browser ini mustahil (header diset browser),
   tetapi browser **lawas tanpa Fetch Metadata** (mis. Safari < 16.4) yang melakukan `fetch` same-origin
   GET tidak mengirim `Origin` maupun `Sec-Fetch-*` → header tidak diwajibkan. Build web sekarang
   selalu mengirim header, jadi lubang ini hanya terbuka untuk build lama/mesin yang sangat lama.
2. **Jendela antara "identitas berubah" dan reload.** `reconcile()` memanggil `auth.refresh()` lalu
   `navigateTo`. `sync.client.ts` menghentikan controller lewat `watch` pada `auth.session.user.id`,
   dan itu teruji ("identitas auth berubah menghentikan controller sebelum request berikutnya"), tetapi
   ada satu request yang mungkin sudah terbang sebelum watcher sempat jalan. Server menolaknya (403);
   tidak ada kebocoran lintas akun.
3. **`blockedCount` lintas akun** (B2) — angka milik akun sebelumnya bisa tampil sesaat.
4. **Headroom budget 0,07 KB** di landing; tidak ada pengawasan otomatis selain
   `bundle-budget.test.ts`. Aman hari ini, rapuh untuk perubahan berikutnya.
5. **`consecutiveKeyFailures` hilang saat reload** (in-memory): record yang belum sempat dikarantina
   butuh 3 siklus lagi setelah muat ulang. Karena daftar karantina dipersist, ini hanya memperlambat,
   bukan menggagalkan — kecuali pada kasus B1 yang memang tidak pernah selesai.

---

## 8. Coverage & celah test yang tersisa

- **Tidak ada test** untuk bentuk halaman "hanya record rusak" → ini celah yang menutupi B1; test pin
  QA sudah ditambahkan (`controller.quarantine-solo.qa.test.ts`, `it.fails`).
- Tidak ada test untuk dua akun **bersamaan** di dua tab terhadap `localStorage` karantina (B2).
- Tidak ada test yang menjalankan `guardPullMerge` pada adapter IndexedDB nyata (hanya fake storage).
- `session-sync` tidak diuji saat `BroadcastChannel` **ada tapi melempar saat `postMessage`** (fallback
  ke `storage` hanya diuji lewat tidak-adanya `BroadcastChannel`). Jalur `catch` di
  `announceSessionChange` belum ter-cover.
- `reconcile()` saat sinyal datang beruntun (drop karena `isReconciling`) tidak diuji.

---

## 9. Rekomendasi

1. **Wajib (blocking):** perbaiki B1 lalu ubah dua `it.fails` di
   `apps/web/app/utils/sync/controller.quarantine-solo.qa.test.ts` menjadi `it`; jalankan
   `pnpm --filter @improve-personal/web exec vitest run app/utils/sync`.
2. Pertimbangkan B2: karantina per `userId` (key mengandung id akun) atau jangan menghapus daftar
   hanya karena tab lain membuka akun berbeda; `blockedCount` sebaiknya memfilter pemilik.
3. Tambah satu test `session-sync` untuk `postMessage` yang melempar (fallback `storage`).
4. Jaga headroom bundle: kalau ada impor statis baru di graf landing, budget akan langsung merah —
   pertimbangkan menurunkan baseline (mis. memindahkan `contracts`+zod keluar graf awal) sebelum
   tugas berikutnya menyentuh landing.

---

## 10. File yang ditambahkan QA

- `apps/web/app/utils/sync/controller.quarantine-solo.qa.test.ts` — pin bug B1 (2 `it.fails`,
  konvensi repo). Tidak ada kode produk yang diubah; `git status` hanya menampilkan file ini.

---

## 11. Addendum putaran 2 — commit `9cf6037`

**Verdict: GAGAL.** B2 dan L1 tertutup, test pin putaran 1 lulus, tetapi B1 **belum tertutup untuk
bentuk data lain**: bukti "kunci benar" (`keyProvenForSession`) hanya hidup di satu controller session,
sehingga kasus yang dilaporkan putaran 1 (record rusak = record terbaru di halaman terakhir) kembali
macet permanen setelah reload/keluar-masuk `/app` (B3, High). Bentuk "halaman pertama seluruhnya rusak
sementara halaman berikutnya sehat" juga belum punya jalur pulih (B4, Medium).

Rules dibaca ulang: root `CLAUDE.md`, `.claude/rules/{shared-security,shared-code-quality,ergonio-status-flow}.md`,
`apps/web/AGENTS.md`, `apps/web/CLAUDE.md`, `apps/web/.claude/rules/{security,performance,code-quality}.md`.
Tier: T2 + permintaan eksplisit task (suite penuh, typecheck, build, budget). Status Ergonio **tidak**
dipindahkan oleh QA ini.

### 11.1 Yang berubah dan bagaimana saya menilainya

| Perubahan | Penilaian |
|---|---|
| `keyProvenForSession` (`controller.ts:121`, reset `:155`, menyala `:448`, dipakai `:503`) | arah benar, lingkup terlalu sempit - lihat B3/B4 |
| Karantina per pemilik (`quarantine.ts:146,162,186`; `version: 1`, `owners`, 200 id/pemilik, 3 pemilik) | **tertutup** - lihat §11.4 |
| `useSyncStatus` menerima `getOwnerId` (`useSyncStatus.ts:33,58-59`, wiring `ShellSyncStatus.vue:33`) | **tertutup** |
| Kewajiban header lewat cookie (`server/utils/auth.ts:43-44,81-88`) | **tertutup**, tanpa regresi |
| Test pin QA diubah developer: `it.fails` → `it`, dan kasus "akun satu record rusak" **dibalik** menjadi "TIDAK dikarantina" | bukan pelebaran cakupan; kasus itu sekarang diuji sebagai sengaja-tidak-dipulihkan → saya catat sebagai B4 |

### 11.2 Hasil B1 per bentuk data yang diminta

| # | Bentuk data | Hasil | Bukti |
|---|---|---|---|
| 1 | Halaman sehat lalu halaman berisi record rusak sendirian (pin putaran 1) | **lulus**: dikarantina, `cursor: 2`, `synced` | `app/utils/sync/controller.quarantine-solo.qa.test.ts` — 2 passed |
| 2 | Cursor parkir di halaman berisi **3** record rusak (kunci terbukti di halaman sebelumnya) | **lulus**: ketiganya dikarantina, `cursor: 2`, `synced`, index `keep` | `controller.quarantine-edges.qa.test.ts` "TIGA record rusak" |
| 3 | Record rusak kebetulan **record tertua** di halaman yang juga berisi record sehat | **lulus**: dikarantina, `cursor: 1`, `synced` | idem, "record TERTUA" |
| 4 | Record rusak di **halaman pertama**, halaman berikutnya sehat (sesi baru) | **GAGAL**: tidak pernah dikarantina, `cursor: 0`, `error` selamanya | idem, `it.fails` (B4) |
| 5 | **Reload** saat cursor parkir di halaman berisi record rusak terakhir | **GAGAL**: bukti kunci hilang, `cursor: 1`, `error` selamanya | idem, `it.fails` (B3) |
| 6 | Karantina **penuh (200)**: halaman 201 record rusak + 1 sehat | batas 200 dihormati, tetapi daftar berputar dan `cursor: 0` tidak pernah maju (sisa risiko L2; butuh server mengirim >`limit`) | idem, "batas 200 dihormati" |

### 11.3 B3 — High: bukti kunci tidak bertahan setelah controller restart; B1 kembali macet permanen

**Lokasi:** `apps/web/app/utils/sync/controller.ts:121` (`keyProvenForSession`), `:155`
(`keyProvenForSession = false` di setiap `startSync`), `:448` (satu-satunya titik yang menyalakannya),
`:503` (gerbang karantina). Pemicu restart di produksi: `app/plugins/sync.client.ts:55-75` memanggil
`stopSync()` saat rute keluar dari `/app` dan `startSync()` saat kembali; reload halaman juga membuat
plugin baru.

**Mekanisme.** Siklus 1: halaman 1..n-1 diterapkan (kunci terbukti), halaman terakhir hanya berisi record
rusak → `decidePullKeyFailures` menaikkan penghitung ke-1 lalu membatalkan merge; `cursor` tetap di
sebelum halaman itu dan status `error`. Reload (atau keluar-masuk `/app`) mengosongkan bukti kunci.
Siklus berikutnya hanya meminta halaman yang tersisa - yang **seluruhnya** record rusak - jadi tidak ada
satu pun record yang bisa membuktikan kunci. `keyProvenForSession` tetap `false` → setiap siklus
dikembalikan sebagai "kunci salah", penghitung tidak pernah naik, karantina **tidak pernah** ditulis.
Tidak ada jalur lain yang menyalakan flag itu (`buildIndex` hanya dipanggil untuk kandidat pull).

**Reproduksi** (`controller.quarantine-edges.qa.test.ts`, `it.fails` "bukti kunci harus bertahan setelah
reload"): server palsu `cursor=0 → [GOOD]`, `cursor=1 → [BAD]`; `runSync` sekali (`cursor: 1`),
`stopSync()` + `startSync()` (sesi & storage sama, meniru reload), lalu 6 siklus.

- **Expected (AC #2):** `isQuarantined(USER_A, BAD) === true`, `cursor: 2`, `status: 'synced'`.
- **Actual:** `isQuarantined === false`, `quarantinedCount === 0`, `cursor: 1`, `status: 'error'` -
  selamanya. Siklus tanpa reload menyembuhkan (pin putaran 1 lulus), jadi yang hilang khusus bukti antar
  restart.

**Dampak user.** Ini bentuk yang paling sering di lapangan (record terbaru rusak; semua record lama sudah
masuk). User melihat "Gagal sinkron", memuat ulang app - reaksi normal - lalu **semua record setelah
record rusak tidak pernah masuk lagi** dan tombol "Coba lagi" tidak pernah menolong. Tidak ada data yang
hilang atau tertimpa, tetapi AC #2 ("punya jalur pemulihan yang terlihat") tidak terpenuhi untuk bentuk
ini.

**Arah perbaikan (bukan instruksi implementasi).** Bukti kunci jangan hanya berasal dari record hasil pull
di session berjalan:
- tandai bukti saat sesi data lokal dibuka - `openLocalDataSession` hanya berhasil setelah device slot
  dibuka dengan AES-KW (`app/utils/crypto/device-slot.ts:98-116`), yang **terautentikasi**, jadi kunci
  data yang dipakai sync sudah terbukti benar; atau
- saat `startSync`, dekripsi ulang satu record lokal sebagai kontrol (regresi putaran 1 menyarankan ini);
  atau
- simpan penanda bukti per akun + fingerprint kunci, bukan variabel modul.

Ketiganya menutup B3 **dan** B4 tanpa melonggarkan aturan "cursor tidak pernah maju di atas record yang
belum ditulis".

### 11.4 B4 — Medium: halaman pertama yang seluruhnya tidak terbuka tidak pernah mendapat bukti kunci

**Lokasi:** sama (`controller.ts:503`, `:448`). **Reproduksi:** `cursor=0 → [BAD]`,
`cursor=1 → [GOOD]`, sesi baru, 6 siklus → `isQuarantined === false`, `cursor: 0`, `status: 'error'`.
Bentuk nyata: akun yang hanya punya **satu** record dan record itu rusak (kasus dari pin putaran 1 yang
sekarang dibalik menjadi "TIDAK dikarantina"), atau halaman penuh blob rusak.

**Mengapa premis "tidak bisa dibedakan dari kunci salah" lemah hari ini:** kunci data diturunkan dari
master key yang di-unwrap lewat device slot AES-KW (gagal = exception sebelum sync jalan), dan
`useLocalData` menolak membuat kunci baru bila akun sudah punya envelope. Jadi "kunci salah" di level
record virtually tidak bisa muncul tanpa kerusakan lain - sementara AC #2 menuntut jalur pulih untuk
record yang memang rusak. Klasifikasi Medium (bukan High) karena bentuknya jarang (butuh record rusak
sejak halaman pertama dan tidak ada record lokal sebagai kontrol); bersama B3 ia ditutup oleh perbaikan
yang sama.

### 11.5 B2 — karantina per pemilik: **tertutup**

| Yang diminta | Hasil | Bukti |
|---|---|---|
| Dua tab/akun berbeda tidak saling mengosongkan | **lulus** - tab B menulis daftarnya sendiri; id akun A tetap ada | `quarantine.test.ts` "dua akun punya daftar sendiri" (10 test lulus) |
| `blockedCount` tidak menampilkan angka akun lain | **lulus** - `getOwnerId` di `useSyncStatus.ts:58-59`, angka 0 saat belum login | `useSyncStatus.test.ts` "hanya menghitung milik akun aktif" |
| Upgrade dari bentuk lama tidak crash | **lulus** - array polos + key owner lama dibaca sebagai kosong, tulisan berikutnya jalan | `quarantine.test.ts` "bentuk lama (array tanpa pemilik) diabaikan" |
| Batas 200/pemilik & 3 pemilik terbaru | **lulus** | `quarantine.test.ts` "membatasi 200 id PER PEMILIK", "membatasi jumlah pemilik" |
| Logout tetap menyapu daftar | **lulus** - key masih berprefix `ip-` (`quarantine.ts:35`), `clearAppStorage` menyapu `ip-*` (`useLogout.ts:12-17`) | baca kode; tidak ada test baru |

Sisa (bukan AC, tidak menggagalkan): (a) `localStorage` tetap satu blob JSON, jadi dua tab yang menulis
**bersamaan** bisa saling menimpa satu id (read-modify-write) - gejalanya hanya karantina ulang 3 siklus,
bukan daftar terhapus; (b) key lama `ip-sync-quarantine-owner` (berisi userId) tidak dibaca lagi dan baru
hilang saat logout/muat ulang berikutnya - bukan rahasia, hanya catatan kebersihan.

### 11.6 Regresi perilaku aman

- **Kunci salah tidak pernah dikarantina:** `controller.test.ts:521` (4 siklus, semua gagal → `writes: []`,
  `quarantinedCount === 0`, cursor 0, status `error`) dan `controller.quarantine-solo.qa.test.ts`
  "perangkat baru dengan satu record rusak" - lulus.
- **Cursor tidak maju tanpa record ditulis:** `controller.test.ts:259` ("pull BERHENTI sebelum menulis
  apa pun"); B3/B4 juga menunjukkan cursor bertahan di halaman rusak.
- **`RECORD_INDEX_KEEP` tetap satu sumber dan tetap dipakai:** `packages/core/src/ports.ts:53` →
  `packages/core/src/index.ts:45` → re-export `apps/web/app/utils/storage/index-decision.ts:23` →
  `indexeddb.ts:30`; test edge memeriksa record rusak ditulis dengan index `'keep'` dan blob tetap `'AAAA'`.
- **L1 security (cookie, bukan `Origin`):** `server/tests/http.test.ts -t "penanda pemilik"` → **7 passed**
  (termasuk cookie tanpa header → 403 dan bearer tanpa header → lolos). Urutan `requireSession` →
  `requireExpectedUserId` → rate limit → body/query tidak berubah.
- Tidak ada `console.*`, `any`, `@ts-ignore` di lima berkas produk yang berubah (grep), tidak ada
  dependency baru (`9cf6037` tidak menyentuh `package.json`/lockfile).

### 11.7 Mutation check (dijalankan, lalu kode dikembalikan; `git status` bersih dari perubahan produk)

| # | Mutasi | Test yang menangkap | Hasil |
|---|---|---|---|
| a | cabut `keyProvenForSession = true` (`controller.ts:448`) | pin putaran 1 + edge test + `controller.test.ts` | **7 failed** / 14 passed / 2 expected fail; merah di `controller.quarantine-solo.qa.test.ts:153`, `controller.quarantine-edges.qa.test.ts:163,181`, `controller.test.ts:502,585,612` |
| b | karantina kembali satu key global (`isQuarantined`/`quarantinedCount` mengabaikan pemilik) | test per-pemilik & `useSyncStatus` | **4 failed**: `quarantine.test.ts:93,106,125` (isolasi antar akun, batas per pemilik, batas 3 pemilik) + `useSyncStatus.test.ts:195` (menghitung 2, seharusnya 1) |

Kode dikembalikan dengan `git checkout --`; verifikasi ulang setelah restore: 24 passed + 2 expected fail.

### 11.8 Perintah & hasil persis (putaran 2)

| Perintah | Hasil |
|---|---|
| `pnpm --filter @improve-personal/web exec vitest run app server/tests` | **200 files passed**, **1522 passed + 2 expected fail (1524)**, 99,19 s (run pertama 88,97 s - sama) |
| `pnpm --filter @improve-personal/core test` | **22 files passed, 379 tests passed**, 1,19 s |
| `pnpm --filter @improve-personal/web typecheck` | exit **0**, tanpa diagnostik |
| `npx eslint app server --max-warnings 0` (`apps/web`) | exit **0**, tanpa output |
| `npx prettier --check apps/web/app apps/web/server packages/core/src` | **All matched files use Prettier code style!** |
| `pnpm --filter @improve-personal/web build` | exit **0**, `verify-precache OK: 12 entri`, total 8,26 MB (2,22 MB gzip) |
| `vitest run app/utils/bundle-budget.test.ts` | **6 passed** |
| Ukur ulang JS awal landing dari `.output/public/index.html` (modulepreload + script, gzip 9) | **169,92 KB / 27 berkas** → lolos, sisa **0,08 KB** |
| `vitest run app/utils/sync/{controller.quarantine-solo,controller.quarantine-edges}.qa.test.ts` | **5 passed + 2 expected fail (7)** |
| `vitest run app/utils/sync/quarantine.test.ts app/composables/useSyncStatus.test.ts app/.../ShellSyncStatus.qa.test.ts app/utils/sync/controller.test.ts` | **41 passed** |
| `vitest run server/tests/http.test.ts -t "penanda pemilik"` | **7 passed**, 40 skipped |

Catatan: `verify-precache` melaporkan 12 entri (putaran 1: 13) - rute precache berkurang satu, build tetap
lolos; tidak ada hubungan dengan diff ini dan tidak memengaruhi AC.

### 11.9 Tiga pilar (delta `9cf6037`)

**Keamanan.** L1 tertutup: kewajiban header sekarang ditentukan cookie sesi (`auth.ts:43-44,81-88`), tidak
lagi heuristik `Origin`/`Sec-Fetch-*`, jadi browser tanpa Fetch Metadata tidak lagi lolos. Karantina tetap
hanya UUID, per pemilik, prefix `ip-` (ikut tersapu logout), dan `blockedCount` tidak lagi membaca angka
akun lain. Tidak ada dependency baru.

**Performa.** JS awal landing 169,92 KB / 170 KB (sisa ≈80 B) - tidak ada regresi dari diff ini. Catatan
non-blocking (sudah ada sejak putaran 1): `isQuarantined` mem-`JSON.parse` blob karantina **per record
kandidat** (≤200/halaman, ≤3 pemilik × 200 id); cache `Set` per siklus akan menghilangkan biaya itu.

**Kerapian.** Format penyimpanan berversi + guard tipe + trim, komentar menjelaskan "kenapa", test
perilaku (bukan implementasi), tidak ada `.only`/`.skip`, tidak ada `any`/`console`. Satu cacat proses:
test pin QA diubah ekspektasinya oleh developer (kasus akun satu record dibalik) - bukan cara menutup
temuan; saya pertahankan sebagai B4 dan menandainya di laporan, bukan menghapus test.

### 11.10 Sisa risiko & rekomendasi

1. **Blocking:** tutup B3/B4 dengan satu perubahan pada sumber bukti kunci (bukti saat sesi terbuka,
   kontrol record lokal, atau bukti persisten per akun+fingerprint kunci). Setelah itu ubah dua `it.fails`
   di `controller.quarantine-edges.qa.test.ts` menjadi `it`.
2. **L2 (sisa, Low):** halaman >200 record gagal + ≥1 sukses membuat daftar berputar dan siklus susulan
   tanpa jeda; pull tidak pernah lewat halaman itu. Butuh server mengirim >`limit`, tetapi pagar
   "maksimum karantina baru per siklus" akan menutupnya.
3. **M1 security review tetap terbuka:** karantina tidak pernah dicoba ulang, jadi record yang bisa dibuka
   lagi setelah pemulihan kunci tetap tersembunyi.
4. **Balapan tulis antar-tab** pada blob karantina (self-heal 3 siklus). Bukan regresi B2.
5. **Headroom budget ≈80 B** di landing; rapuh untuk perubahan berikutnya.

### 11.11 File yang ditambahkan QA (putaran 2)

- `apps/web/app/utils/sync/controller.quarantine-edges.qa.test.ts` — 3 test penutup (3 record rusak,
  record tertua, batas 200) + 2 pin `it.fails` untuk B3 dan B4.
- Tidak ada kode produk yang diubah. `git status` hanya menampilkan file ini (plus addendum keamanan yang
  ditulis reviewer keamanan, bukan QA ini).
