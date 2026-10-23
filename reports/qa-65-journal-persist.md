# QA #65 — Persist jurnal terenkripsi (repository + outbox)

Task: Ergonio #65 `Persist jurnal terenkripsi (repository + outbox) — MAYOR-4 #30`
(`cfbbf35d-f5d6-4b89-a0c8-7295b33717ea`, status `review`)
Tanggal: 2026-10-23 · QA: fajar · Dev: dimas

## Verdict

**LULUS DENGAN CATATAN (non-blocking).**

Janji utama task ini terbukti dengan sesi data lokal sungguhan (IndexedDB + sodium), bukan hanya test
hijau: jurnal + mood + judul bertahan di sesi baru, isi tersimpan **hanya** sebagai blob ciphertext +
baris outbox, satu record per tanggal, mood tanpa tulisan bertahan tanpa jadi halaman kosong, hapus
tidak membuang mood, tombstone tetap ada untuk sync, R2 dan R1 tertutup, dan Panduan F8 `ready` tidak
overclaim.

3 catatan yang **tidak** memblokir, perlu keputusan lanjutan (detail di §Bug & risiko):

1. **Draf yang belum disimpan masih plaintext di `localStorage`** (B-54.1, sudah diterima di QA #54).
   Acceptance "tidak ada plaintext isi jurnal di localStorage/IndexedDB" terpenuhi untuk jurnal yang
   **sudah disimpan**, belum untuk draf yang sedang diketik.
2. **Tulis gagal = draf sudah dihapus + tidak ada pesan error di UI** -> halaman bisa hilang diam-diam
   (BUG-65-01, Medium, butuh storage yang gagal: quota/blocked).
3. **Dua tab: last-write-wins** tanpa re-read storage saat simpan -> catatan tab lain bisa tertimpa
   (RISK-65-02, Medium; sudah dinyatakan dev sebagai sisa risiko).

Tidak ada temuan **Critical/High** dan tidak ada data loss pada jalur normal.

## Lingkup & test plan

Diuji (semua di `apps/web`, env `nuxt` + `fake-indexeddb` + **kripto sodium asli**):

| # | Yang dibuktikan | Bukti |
|---|---|---|
| a | simpan -> sesi baru (reload/relogin) -> judul, isi, mood, tag perasaan, mention `@[..]`/`#[..]` utuh | `app/composables/useMemos.persist.qa.test.ts` (a) |
| b | isi penyimpanan: blob ciphertext + outbox + index; **tidak ada** judul/isi/tag/mood plaintext; `localStorage` bersih setelah simpan | idem (b) |
| c | satu record per tanggal; simpan ulang = update; `id` & `createdAt` tetap; outbox bertambah per tulisan | idem (c) |
| d | mood tanpa tulisan: 1 record mood-saja (`identityToday`/`diaryMd` null), bertahan, tidak dirender sebagai halaman kosong | idem (d) + (d-UI) |
| e | hapus tulisan mempertahankan mood (record jadi kosong, mood utuh setelah reload) | idem (e) |
| f | hapus tanpa mood = tombstone (`deleted: true`, `op: 'delete'`), tidak hidup lagi setelah reload | idem (f) |
| g | R2: reload di tengah draf + catatan luar -> dua-duanya selamat, tidak dobel; draf format lama tetap terbaca | idem (g) |
| h | R1: append di batas 5.000 memotong teks user dulu, catatan eksternal utuh | idem (h) |
| i | hidrasi race: simpan saat hydrate belum selesai -> tidak hilang, tidak menduplikasi tanggal | idem (i) |

Tidak diuji / di luar lingkup (alasan):

- Sinkronisasi ke server (belum ada; task ini hanya outbox lokal).
- Mobile membaca `journal_entry` (belum ada kode mobile untuk jurnal).
- Lighthouse/CWV di perangkat nyata (tidak ada perubahan render berarti; hydrate diukur §Performa).
- Uji ke production / data user nyata: **tidak dilakukan** (aturan QA).

## Bukti enkripsi (bukan sekadar "test hijau")

Sampel nyata dari IndexedDB (`ip-probe-bukti-*`, sesi sodium asli; probe dihapus setelah diambil):

```
RECORD ROW  {"id":"01a16990-9f0e-7d39-9dd9-fd02836d95cd","hlc":"1757426400000-1-01992ec6…",
             "deleted":false,"blob":"ej9Bd+TLGNOkb8o7XRLmHsRdMuw1Au46vbvIww3w6FLbvhzTgcDI9u…",
             "createdAtMs":1757426400000,"updatedAtMs":1757426400000}
BLOB (60)   ej9Bd+TLGNOkb8o7XRLmHsRdMuw1Au46vbvIww3w6FLbvhzTgcDI9uedtcNu
BLOB length 444  (base64 dari nonce24 + ciphertext+tag — bentuk `utils/crypto/provider.ts:20-30`)
INDEX ROW   {"recordId":"01a16990-…","entityType":"journal_entry","rangeStartMs":1757350800000,
             "rangeEndMs":null,"updatedAtMs":1757426400000}
OUTBOX      [{"recordId":"01a16990-…","op":"put","attempts":0}, {"recordId":"01a16990-…","op":"put"}]
PAYLOAD     {"entryDate":"2025-09-09","identityToday":"Judul rahasia","mood":"sangat_bahagia",
(terdekripsi) "moodStoryMd":"#perasaan tenang","diaryMd":"Isi jurnal rahasia",…}
localStorage keys: []
```

Yang dibaca dari disk: **id, hlc, deleted, blob, timestamp, tipe entitas** (metadata yang memang
dibutuhkan server untuk LWW/sync) — judul, isi, tag, dan enum mood hanya ada di dalam blob. Test (b)
memindai **seluruh** object store database (`JSON.stringify(getAll())` semua store) dan memastikan
string `Judul rahasia QA 65`, isi jurnal, `cemas`, `sedih`, `sangat_sedih` **tidak muncul**; `blob`
setelah di-base64-decode juga bukan JSON/teks.

Jalur tulis: `useMemos.ts:240-242` -> `utils/memo/persistence.ts:169-185` (`session.writer.write`) ->
`utils/storage/record-writer.ts:106-146` (`encodeRecord` -> `commitLocalWrite`: record + index + outbox
satu transaksi). Tidak ada cabang yang menulis judul/isi ke `localStorage` — satu-satunya key `ip-memo-*`
untuk jurnal adalah draf (`useMemoDraft.ts:15`).

## Hasil per acceptance criteria

| AC | Status | Bukti |
|---|---|---|
| memo/mood/judul tersimpan lewat repository lokal + outbox | **PASS** | (b): `OUTBOX … op:"put"`; (a) roundtrip sesi baru |
| bertahan setelah reload / sesi baru | **PASS** | (a): sesi kedua (`openLocalDataSession` ulang, kunci dibuka ulang) memuat judul+isi+mood+tag; `createdAt` = 20:00 tanggal itu |
| satu memo per tanggal (simpan ulang = update, bukan duplikat) | **PASS** | (c): `listAll` = 1 record, `id`/`createdAt` tetap, `updatedAt` maju, 2 baris outbox untuk record yang sama |
| draf `ip-memo-draft-*` dibersihkan setelah simpan | **PASS** | (b) `localStorage.length = 0` setelah simpan; (Ui) `useMemoDraft.test.ts:149-162`; (b) juga memastikan tidak ada key draf tersisa |
| tidak ada plaintext isi jurnal di localStorage/IndexedDB | **PASS untuk jurnal tersimpan**, **CATATAN untuk draf** | (b) seluruh store + localStorage bersih; draf plaintext: GAP-65-03 |
| test regresi persistensi + reload | **PASS** | `utils/memo/persistence.test.ts` (8), `useMemos.test.ts` (+8), `useMemoDraft.test.ts` (+2 R2/R1), `utils/memo.test.ts` (+3), `guide.test.ts` (+1) |
| Panduan F8 `partial` -> `ready` | **PASS** | `utils/guide.ts:183` `status: 'ready'`; copy `:184-185` menyebut "tersimpan terenkripsi di perangkat ini"; test `guide.test.ts:112-123` menolak kembalinya "selama sesi/belum tersimpan" |
| R2: base version draf ikut dipersistenkan + test reload-di-tengah-draf dengan catatan luar | **PASS** | `useMemoDraft.ts:59-63,86,236-242`; (g) keduanya selamat; label `memo.draftKept` (`i18n/locales/id.json:959`) sudah benar |
| R1: merge 5.000 char tidak memotong catatan penulis luar | **PASS** | `utils/memo.ts:129-140`; (h) `text.length = 5000`, `endsWith(catatan luar) = true` |

## Bug & risiko (urut severity)

### BUG-65-01 — (Medium) Tulis gagal: draf sudah dihapus, halaman hilang diam-diam, tidak ada error di UI

Langkah reproduksi (probe P1, sesi nyata + `writer.write` yang menolak seperti quota penuh):

1. Buka `/app/memo`, ketik isi, klik **Simpan ke jurnal** sementara storage gagal menulis
   (`QuotaExceededError` / IndexedDB diblokir / kunci hilang di tengah sesi).
2. `MemoEditor.save()` memanggil `memos.save()` (antrean latar, `useMemos.ts:240-242,256-284`) lalu
   `load(page)` (`MemoEditor.vue:115-122`). `load()` menyamakan `draft` dengan `saved`, dan watcher
   `useMemoDraft.ts:186-195` langsung menghapus key draf.
3. Hasil probe: `status: error`, `error: "QuotaExceededError: storage penuh"`, **`ip-memo-draft-<tgl>: null`**,
   `memos` di memori masih berisi halaman, penyimpanan kosong.
4. Pindah halaman lalu kembali (atau reload): `useMemos()` baru memanggil `hydrate()` lagi; karena
   `status` bukan `ready` (`useMemos.ts:190`) hydrate jalan dan **mengganti** store dengan snapshot
   storage (`useMemos.ts:206-209`) — halaman yang gagal ditulis **hilang dari memori** dan drafnya sudah
   tidak ada. Probe: `setelah hydrate ulang, memos: []`.

Expected: draf tidak dihapus sebelum tulisan benar-benar sukses, dan/atau kegagalan tulis terlihat user.
Actual: draf hilang lebih dulu; `error` hanya disimpan di `useState('memosError')` dan **tidak dibaca
komponen mana pun** (`grep 'memos.error'` = 0 hasil).

Bukti kode: `useMemos.ts:224-238` (kegagalan ditelan jadi state), `useMemos.ts:240-242`,
`MemoEditor.vue:115-122`, `useMemoDraft.ts:186-195`.
Saran: `save()` mengembalikan promise tulis (atau `load()` dipanggil setelah tulis sukses), plus tampilkan
`memos.error` sebagai banner "belum tersimpan" di editor.

### RISK-65-02 — (Medium) Dua tab: simpan di tab basi menimpa catatan tab lain (LWW tanpa re-read)

Probe P2 (dua sesi pada database yang sama = dua tab):

1. Tab A & B membuka hari yang sama (`"Tulisan awal."`), keduanya sudah hydrate.
2. Tab A menambah catatan (`append`) → tersimpan: `"Tulisan awal.\n\nCatatan penting dari tab A"`.
3. Tab B (masih memegang halaman versi lama) menyimpan drafnya sendiri.
4. Hasil: `"Tulisan awal.\n\nTambahan dari tab B"` — **catatan tab A hilang**, tanpa peringatan.

Penyebab: `hydrate()` hanya sekali per muat halaman (`useMemos.ts:190`), `save()` memakai `entryOn` dari
memori (`useMemos.ts:267-273`), dan `persistMemo` menulis payload penuh (`persistence.ts:169-185`) —
perbandingan LWW dilakukan di level record (HLC), bukan di level teks. Penggabungan `mergeValues`
(`useMemoDraft.ts:154-164`) hanya membandingkan dengan halaman yang dilihat tab itu.

Sudah dinyatakan dev sebagai sisa risiko ("dua tab last-write-wins"); saya konfirmasi bisa direproduksi
dan **tanpa peringatan ke user**. Saran murah: saat `save()`, baca record tanggal itu sekali lagi dari
storage lalu jalankan `mergeValues` sebelum menulis.

### GAP-65-03 — (Medium, keputusan produk) Draf yang belum disimpan masih plaintext di `localStorage`

Probe P3: `ip-memo-draft-2025-09-09` = `{"values":{"title":"","text":"Isi jurnal pribadi yang belum
disimpan","feelings":[]},"base":{…}}` — teks jurnal apa adanya.

Acceptance task menyebut "tidak ada plaintext isi jurnal di localStorage/IndexedDB". Untuk halaman yang
**sudah disimpan** ini terpenuhi (lihat §Bukti). Untuk draf, belum — `useMemoDraft.ts:99-108` menulis JSON
plaintext. Ini perilaku lama yang sudah dicatat sebagai B-54.1/B-54.2 pada QA #54 dan disebut ulang di
handoff dev, jadi bukan regresi task ini; tapi karena kalimat acceptance-nya eksplisit, saya angkat
sebagai catatan terbuka (bukan blocker).

Konteks risiko: draf bertahan setelah aplikasi ditutup, hanya tersapu saat logout (`ip-` prefix,
`useLogout.ts:12-17`) — di perangkat/browser profile bersama, draf bisa dibaca orang lain. Saran
lanjutan (task terpisah): enkripsi draf dengan `session.dataKey`, atau TTL + hapus saat tab ditutup.

### RISK-65-04 — (Low) Draf format lama (tanpa `base`) masih bisa menimpa catatan luar saat reload

Probe P4: draf lama `{"title":"","text":"Tulisan awal.\n\nDraf lama dari versi sebelumnya","feelings":[]}`
(tanpa pembungkus `base`), lalu catatan review masuk, lalu reload:

```
page sekarang          : "Tulisan awal.\n\nCatatan review goal"
nilai yang akan disimpan: "Tulisan awal.\n\nDraf lama dari versi sebelumnya"   -> catatan luar hilang
```

Sesuai desain (`useMemoDraft.ts:239` `saved = stored.base ?? current`, lalu `reconcile` early-return di
`:205`): tanpa `base`, halaman terkini dianggap titik banding. Jendela paparannya sempit (hanya draf yang
ditulis versi sebelumnya, bertahan sampai user menyimpan). Saran: sebutkan di catatan rilis, atau saat
membaca draf legacy tandai "tidak ada base" dan tampilkan konfirmasi kecil sebelum menimpa.

### CONTRACT-65-05 — (Low-Medium, kontrak) Tag perasaan menumpang di `moodStoryMd` dengan penanda `#perasaan `

Terbukti di payload terdekripsi: `"moodStoryMd":"#perasaan tenang"`. Penilaian risiko:

- **Tidak ada data loss di web**: `isFeelingsStory` hanya mengganti isi kalau field kosong atau memang
  milik kita; cerita penulis lain dipertahankan (`persistence.ts:73-75,102-104`, test
  `persistence.test.ts:111-142`).
- **Tidak muncul di UI web**: tidak ada komponen yang merender `moodStoryMd` (grep: hanya adapter + test).
- **Risiko nyata**: begitu mobile (atau editor "cerita perasaan" nanti) membaca `moodStoryMd`, user bisa
  melihat teks mentah `#perasaan tenang semangat`, dan export memuat penanda itu. Sebaliknya, record yang
  `moodStoryMd`-nya sudah berisi cerita asli akan **membuang tag perasaan** yang dipilih user (diam-diam,
  tanpa pesan).
- Klasifikasi: kompromi kontrak yang disengaja dan didokumentasikan (`persistence.ts:21-26`), **bukan
  blocker** karena belum ada konsumen lain. Tindak lanjut: field eksplisit `feelings: string[]` di
  `packages/core` + migrasi `moodStoryMd` yang berawalan penanda.

### FLAKE-65-06 — (Low, pre-existing) `app/pages/app/kalender.test.ts` flaky: plugin ticker menimpa `useState('now')`

Bukan akibat task ini (`kalender.vue`, `useNow.ts`, `ticker.client.ts` tidak berubah), tapi terlihat saat
regresi: `T9 navigasi view & tanggal > pekan … "Hari ini"` gagal 1 dari 3 kali saat file dijalankan
sendiri (`expected '8 Sep – 14 Sep 2025'`, `received '19 Okt – 25 Okt 2026'` = pekan hari ini).

Akar masalah (probe P7): `app/plugins/ticker.client.ts` menulis `now.value = Date.now()` tiap 1 detik,
menimpa nilai `now` yang di-seed test. Probe: `now` tetap nilai seed saat mount, dan **berubah ke waktu
nyata setelah 1,2 s** (`1792772410413` vs seed `1757473200000`). Jadi assertion bergantung pada apakah
satu tick kebetulan jatuh di tengah test. Saran: matikan ticker di test (`vi.useFakeTimers` atau stub
plugin) — bukan mengubah produk.

### NIT-65-07 — (Low, kerapian/copy) Panduan F8 menghapus info yang masih benar

`utils/guide.ts:186-191` tidak lagi menyebut "Mood dan streak menulis jurnal ikut tampil di Overview",
padahal Overview **masih** memakai jurnal & mood (`useOverview.ts:124-150,265-286`: tren mood, korelasi,
streak `memoDays`). Ini *underclaim*, bukan overclaim — jadi tidak melanggar acceptance "tidak
overclaim", hanya kehilangan info yang berguna.

## Tiga pilar

**Keamanan**

- Isi jurnal tersimpan: terenkripsi (`blob` XChaCha20-Poly1305, AAD = recordId), tidak ada plaintext di
  seluruh store maupun `localStorage` setelah simpan. Terbukti, lihat §Bukti.
- Tidak ada data jurnal di payload SSR: `store` mulai kosong, hydrate hanya di client
  (`useLocalData.ensure()` mengembalikan `null` saat SSR).
- Tidak ada `v-html`/`innerHTML`/`eval` di jalur jurnal (dijaga `memo.qa.test.ts:269-283`; isi jurnal
  dirender sebagai teks, XSS di draf pun diuji `memo.draft.qa.test.ts:281-298`).
- Tidak ada log berisi isi jurnal: adapter/persistence tidak mencatat payload; error yang disimpan hanya
  pesan generik dari storage.
- **Celah yang tersisa**: draf plaintext (GAP-65-03); `error` jurnal tidak ditampilkan (BUG-65-01).

**Performa**

- Hydrate seluruh jurnal diukur: **500 halaman (~1,6 KB teks/halaman, ~800 KB total) = 30 ms** untuk
  `listAll` + 500 dekripsi + parse schema (probe P6, IndexedDB+WASM di runtime test; perangkat nyata lebih
  lambat, tapi ordenya jauh di bawah budget INP 200 ms).
- Tidak ada request jaringan di jalur jurnal (dijaga `memo.qa.test.ts:428-443`); tulis berjalan di antrean
  serial, UI tidak menunggu I/O.
- Catatan: jurnal dimuat **seluruhnya** (semua tanggal) saat hydrate dan ikut dipakai Overview/Kalender.
  Untuk riwayat bertahun-tahun, pertimbangkan query per rentang (`index.rangeStartMs` sudah disiapkan di
  `persistence.ts:183`) — belum jadi masalah terukur sekarang.

**Kerapian**

- Mock fase 1 dihapus total (`app/composables/memos/mock.ts` D, tidak ada referensi tersisa).
- Komentar "kenapa" ada di titik keputusan (satu record per tanggal, mood-saja, penanda perasaan,
  batas R1/R2); tidak ada `console.log`, `any`, `@ts-ignore`, `.only`/`.skip` di file yang disentuh.
- `resetMemosHydrationForTest` (`useMemos.ts:74-78`) adalah hook test di kode produk — konsisten dengan
  pola `resetSchedulesHydrationForTest`/`resetTasksHydrationForTest` yang sudah ada, jadi bukan temuan baru.
- Komentar basi di test QA #54 (`memo.draft.qa.test.ts`, "jurnal fase 1 hilang bersama state in-memory")
  sudah saya perbarui karena sekarang menyesatkan (perubahan hanya di file test).

## Perintah & hasil (verbatim)

Semua dijalankan dari root repo, 2026-10-23. Log lengkap: `/tmp/opencode/qa65/`.

1) Suite wajib + test QA baru (11 file, termasuk `useMemos.persist.qa.test.ts`):

```
$ pnpm --filter @improve-personal/web exec vitest run app/composables/useMemos.test.ts \
    app/composables/useMemoDraft.test.ts app/composables/useMemoDraft.qa.test.ts \
    app/pages/app/memo.qa.test.ts app/pages/app/memo.draft.qa.test.ts \
    app/pages/app/memo.conflict.qa.test.ts app/utils/memo.test.ts app/utils/guide.test.ts \
    app/utils/guide.qa.test.ts app/utils/memo/persistence.test.ts \
    app/composables/useMemos.persist.qa.test.ts

 RUN  v5.0.3 /media/DATA/Development/stackinnov/products/improve-personal/apps/web
 Test Files  11 passed (11)
      Tests  118 passed (118)
   Duration  5.81s (tests 42%, transform 26%, environment 24%, setup 4%, import 4%)
```

2) Typecheck:

```
$ pnpm --filter @improve-personal/web typecheck
$ nuxt typecheck
TYPECHECK_EXIT=0
```

3) ESLint (`--max-warnings 0`, file produk + test yang disentuh task):

```
$ cd apps/web && pnpm exec eslint app/composables/useMemos.ts app/utils/memo/persistence.ts \
    app/composables/useMemoDraft.ts app/utils/memo.ts \
    app/components/features/memo/MemoEditor.vue app/utils/guide.ts \
    app/composables/useMemos.test.ts app/composables/useMemoDraft.test.ts \
    app/composables/useMemoDraft.qa.test.ts app/composables/useMemos.persist.qa.test.ts \
    app/pages/app/memo.qa.test.ts app/pages/app/memo.draft.qa.test.ts \
    app/pages/app/memo.conflict.qa.test.ts app/utils/memo.test.ts app/utils/guide.test.ts \
    app/utils/guide.qa.test.ts app/utils/memo/persistence.test.ts --max-warnings 0
ESLINT_EXIT=0
```

4) Prettier:

```
$ cd apps/web && pnpm exec prettier --check <17 file yang sama + i18n/locales/id.json>
Checking formatting...
All matched files use Prettier code style!
PRETTIER_EXIT=0
```

5) Regresi `app/pages/app` + `app/composables`:

```
$ pnpm --filter @improve-personal/web exec vitest run app/pages/app app/composables
 Test Files  56 passed (56)
      Tests  363 passed (363)
   Duration  13.44s
```

Jalankan pertama kali (sebelum diulang) menghasilkan **1 gagal** di `kalender.test.ts` (FLAKE-65-06).
Isolasi file itu 3x: `2 passed`, `2 passed`, lalu `1 failed (8 passed)` — jadi flaky, bukan regresi
jurnal.

6) Probe bukti (file probe sementara, **sudah dihapus** dari repo setelah output diambil):
P1 tulis gagal, P2 dua tab, P3 draf plaintext, P4 draf legacy, P5 payload `moodStoryMd`, P6 perf
500 halaman, P7 ticker `now`, P8 sampel baris record/index/outbox.

## Coverage & celah test yang tersisa

- File yang diuji langsung: `useMemos.ts` (save/append/remove/setMood/hydrate/merge), `memo/persistence.ts`
  (pemetaan + I/O nyata), `useMemoDraft.ts` (draf, reconcile, R2), `utils/memo.ts` (`joinMemoText`, mention),
  `utils/guide.ts` (klaim F8), halaman `/app/memo` (wiring editor, strip tanggal, mood).
- Celah: (i) tidak ada test otomatis untuk jalur **tulis gagal** (BUG-65-01) — disarankan jadi test
  regresi setelah diperbaiki; (ii) tidak ada test dua tab/sesi paralel; (iii) `paper` per halaman tidak
  dipersistenkan (memang preferensi global — sudah didokumentasikan `persistence.ts:27-29`).
- Rekomendasi urutan tindak lanjut: 1) BUG-65-01 (draf vs tulis gagal + tampilkan error), 2) GAP-65-03
  (putuskan enkripsi/TTL draf), 3) RISK-65-02 (re-read saat simpan), 4) CONTRACT-65-05 (field `feelings`
  di core sebelum mobile membaca jurnal), 5) FLAKE-65-06 (matikan ticker di test).

Rules dibaca: `CLAUDE.md` (root), `.claude/rules/shared-security.md`,
`.claude/rules/shared-code-quality.md`, `.claude/rules/ergonio-status-flow.md`, `apps/web/AGENTS.md`,
`apps/web/CLAUDE.md`, `apps/web/.claude/rules/security.md`,
`apps/web/.claude/rules/performance.md`, `apps/web/.claude/rules/code-quality.md`.
