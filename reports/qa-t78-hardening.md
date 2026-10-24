# QA T78 — Hardening sync: identitas wajib, pemulihan index gagal, test plugin

**Verdict: GAGAL** (1 bug High, AC #2 tidak terpenuhi untuk bentuk data yang paling umum).

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
