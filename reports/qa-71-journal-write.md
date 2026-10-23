# QA #71 — Jurnal: draf tidak dihapus sebelum tulis sukses + error/retry + re-read dua tab

Task: Ergonio #71 `dccefb7c-e2a3-4955-9a47-8169727e0095`, project `stackinnov/personal-productivity`,
status `review` · Tanggal: 2026-10-24 · QA: fajar · Dev: dimas
Sumber: `reports/qa-65-journal-persist.md` (BUG-65-01, RISK-65-02).
Putaran 2 (rework): 2026-10-24 · QA: fajar · Dev: dimas · status `review`.

## Verdict final (putaran 2 — rework)

**LULUS (dengan catatan, tidak ada bug blocking).**

**BUG-71-01, BUG-71-02, BUG-71-03 terbukti tertutup** — bukan hanya "test hijau", tetapi
direproduksi ulang dari nol di atas sesi data lokal sungguhan (fake-indexeddb + sodium asli), dan
dibuktikan dengan uji mutasi: mengembalikan perilaku lama membuat test gagal.

| Bug putaran 1 | Status | Bukti penentu |
| --- | --- | --- |
| BUG-71-01 (Medium, blocking) sesi lokal `null` dianggap sukses | **TERTUTUP** | probe A: `waitForSave=false`, `unsaved=[true,true,true]`, `error` terisi, storage 0 byte, draf utuh; retry sesi pulih → `true` + teks tertulis. Mutasi M1 → 2 test QA gagal. |
| BUG-71-02 (Low) banner nyangkut + "Coba lagi" mati setelah halaman dihapus | **TERTUTUP** | probe B: `alert=false`, tombol "Coba lagi" hilang, `held=[]`, draf `null`, teks editor `''`, storage 0, hydrate berikut tidak menghidupkan (`revived=null`). Mutasi M2/M4 → test gagal. |
| BUG-71-03 (Low) ketikan selama menyimpan ditimpa `load()` | **TERTUTUP** | probe C (tulisan benar-benar ditahan di tengah): textarea `"Versi pertama. Tambahan."`, draf memuat tambahan, tanpa banner; simpan kedua menulis versi lengkap lalu draf dibuang. Mutasi M3 → test gagal. |

Satu catatan audit yang saya **perbaiki sendiri** (test-only): assertion di
`useMemos.writefix.qa71.test.ts` (c) yang di-flip developer memakai
`expect(text.includes('Dari B') \|\| text.includes('Dari A lagi.')).toBe(true)` — tautologi, karena
`'Dari A lagi.'` selalu ada (ditulis langsung tab A), jadi assertion itu tetap lulus walau catatan tab
B benar-benar hilang. Saya kembalikan ke dua assertion tegas (`toContain('Dari B')` dan
`toContain('Dari A lagi.')`); keduanya lulus dengan hasil merge nyata
(`"Halaman bersama.\n\nDari A.\n\nDari B.\n\nDari A lagi."`). Selain itu **tidak ada** assertion yang
dilonggarkan/dihapus, tidak ada `.only`/`.skip`, dan jumlah test naik (bukan turun).

Catatan yang tidak memblokir (semua sudah ada di handoff dev atau pre-existing, bukan regresi #71):
RISK-71-04 (dua tab membuat tanggal baru → 2 record), RISK-71-05 (hapus di A dihidupkan simpan basi di
B), RISK-71-09 (gagal **hapus** masih senyap: `hasUnsaved=false`, `error` tak dirender, halaman kembali
setelah reload), RISK-71-12 (gagal tulis mood di hari tanpa halaman tidak punya UI), NIT-71-07
(`memos.error` tanpa konsumen, `writePromises` tak dipangkas), NIT-71-10 (hapus record yang tak pernah
tertulis melempar error → `error` basi), NIT-71-11 (komentar/test reload di `memo.draft.qa.test.ts`
stale), FLAKE-71-08 (ticker `Date.now()`; kini juga mengenai `kalender.test.ts` di bawah beban paralel).

## Audit flip test (per assertion)

Prinsip yang saya pakai: assertion baru harus **gagal pada perilaku bug** dan **lulus pada perilaku
benar**. Dibuktikan dengan mutasi (bukan dengan membaca kode saja).

### `app/composables/useMemos.writefix.qa71.test.ts` (13 → 16 test)

| Assertion | Sebelum (karakterisasi bug) | Sesudah (perilaku benar) | Gagal saat bug? |
| --- | --- | --- | --- |
| "simpan saat sesi lokal hilang" | `waitForSave=true`, `hasUnsaved=false`, `error=null`, draf `null`, storage 0 | `false`, `true`, `error≠null`, draf memuat teks, `memoOn` memuat teks, storage 0; lalu retry `true` + teks tertulis + draf dibuang | Ya — M1 |
| (baru) "append & setMood saat sesi hilang" | — | `append` → `waitForSave=false`; `hasUnsaved` true untuk kedua tanggal; mood tidak ada di storage | Ya — M1 |
| (baru) "halaman gagal ditulis lalu dihapus" | — | `hasUnsaved=false`, `error=null`*, `memoOn=null`, storage 0, `waitForSave(id lama)=true` | Ya — M2 |
| (baru) "halaman dikosongkan (mood tetap) gagal ditulis" | — | `save({text:''})` mengembalikan memo, `waitForSave=true`, record `text=''`, mood tetap 2 | Ya — M5 (mutasi retry) |
| (a)–(f) lama | tidak berubah | tidak berubah (masih ketat: draf, status, merge, hold, pindah tanggal, tombstone) | Ya — M1/M2/M4 (dan M1–M5 putaran 1) |

\* lihat NIT-71-10: delete untuk record yang tak pernah tertulis melempar `record … tidak ada`, jadi
`memos.error` menjadi terisi **setelah** assertion ini (dijalankan sebelum antrean hapus selesai).
Tidak user-visible karena banner memakai `hasUnsaved`, bukan `error`.

### `app/pages/app/memo.alertflow.qa71.test.ts` (4 test, jumlah tetap)

| Test | Sebelum | Sesudah | Bukti |
| --- | --- | --- | --- |
| (a) storage penuh | banner generik, draf & teks bertahan, retry | **sama** (tidak dilonggarkan); retry tetap dibuktikan menulis ke IndexedDB | lulus; M-hold putaran 1 |
| (b) banner hanya tanggal gagal | sama | **sama** | lulus |
| BUG-71-02 | banner tetap ada, `hasUnsaved=true`, draf `{"text":""}`, retry no-op | banner hilang, tombol "Coba lagi" tidak ada, draf `null`, textarea `''`, storage 0 | M2 → gagal; M4 (`release` dihapus) → gagal |
| BUG-71-03 | textarea kembali ke versi lama, draf `null` | textarea mempertahankan ketikan, draf memuat tambahan, tanpa banner, simpan kedua menulis versi lengkap lalu draf dibuang | M3 → gagal |

Catatan harness (bukan pelemahan assertion): di test BUG-71-03 `gated()` mulai dengan
`blocked=true` dan test memanggil `gate.hold()` **sebelum** `gate.allow()`. Hasil instrumentasi saya:
`BEFORE_WRITE` baru terpanggil **setelah** `GATE_ALLOW` dengan `blocked=false`, `pending=false` —
artinya tulisan pertama sebenarnya sukses dan kebetulan mendarat setelah user mengetik (karena
`getById` IndexedDB selesai di macrotask), bukan "ditahan di tengah". Assertion-nya tetap sah dan saya
verifikasi ulang dengan penahanan sungguhan (`blocked=false` + `hold()` sebelum klik simpan): hasilnya
identik (ketikan & draf bertahan, simpan kedua menulis). Saran: `allow()` sebelum `hold()` agar test
benar-benar menguji jendela "tulisan sedang berjalan".

### `app/pages/app/memo.writeerror.qa.test.ts` (3 test)

Dulu "coba lagi berhasil" lulus **karena bug** (sesi `null` = sukses; mutasi M5 putaran 1
membuktikannya). Sekarang harness memakai `createMemoryLocalSession` dan assertion menuntut
`loadMemoRecords(session,'krem').entries[0].text === DRAFT_TEXT`, jadi retry wajib benar-benar menulis.
Assertion lama (banner, tombol, draf) tidak dihapus. Pengujian banner pertama masih menyemai state
`memosUnsaved`, tetapi jalur "gagal tulis nyata → banner" ditutup `memo.alertflow.qa71` (a).

### `app/pages/app/memo.draft.qa.test.ts` (8) & `memo.conflict.qa.test.ts` (6)

Tidak ada assertion yang dihapus/dilonggarkan; hanya harness yang berubah ke sesi in-memory nyata
(`createMemoryLocalSession`), sehingga "Simpan ke jurnal" kini benar-benar menulis. Efeknya lebih
ketat, bukan lebih longgar. Dua NIT: komentar `memo.draft.qa.test.ts:96-100` dan `:254-255` masih
menyatakan "di harness ini tidak ada sesi data lokal" (sudah tidak benar), dan test "setelah simpan,
reload …" menuntut editor kosong setelah halaman tersimpan — itu hanya terjadi karena `memosStatus`
tidak di-reset sehingga hydrate dilewati; reload nyata akan menampilkan halaman tersimpan.

### `tests/nuxt/memo-session.ts` (helper baru)

Storage/repository/writer/id/clock asli dari core; hanya `CryptoProvider` diganti base64 (didokumentasikan
di file). Tepat untuk test wiring; format ciphertext tetap wilayah `utils/storage/*.test.ts`. Tidak ada
secret/PII, tidak menyentuh kode produk.

### Pemeriksaan silang

- `grep` `.only(` / `.skip(` / `it.todo` di `app/**` + `tests/**`: **tidak ada** modifier test.
- Tidak ada `console.log` di file produk/test yang disentuh.
- `git diff` `useMemos.test.ts` (tracked): hanya penambahan + penguatan (`remove('m1')` yang dulu
  menghapus id fiktif kini menyimpan halaman nyata lalu menghapusnya); tidak ada assertion hilang.
- `git diff` `useMemoDraft.test.ts`: hanya penambahan (hold/unchangedSince/pindah tanggal) + perubahan
  bentuk penyimpanan draf (`{values, base}`); tidak ada assertion hilang.
- Jumlah test naik: 13 file = 120 test (putaran 1: 100 test tanpa 2 file QA; 13 file = 117 test).

## Bukti reproduksi independen (a)–(e)

Semua di `apps/web`, sesi nyata: `openLocalDataSession` + fake-indexeddb + sodium asli; yang dipalsukan
hanya `session.writer.write/remove` (menolak / menahan) atau `useLocalData().ensure` (null/lambat).
Probe sementara dihapus setelah dijalankan.

### (a) Sesi lokal `null`: semua jalur tulis gagal jujur, retry sukses

```
PROBE_A {"saveOk":false,"appendOk":false,"unsaved":[true,true,true],"error":"penyimpanan lokal belum bisa dibuka","storedEntries":0,"storedMoods":{}}
PROBE_A_UI {"alert":"Belum tersimpan di perangkat. Tulisanmu masih ada di draf — coba lagi.Coba lagi","draft":"{\"values\":{\"title\":\"\",\"text\":\"Tulisan saat sesi hilang.\",...}}","stored":0,"textarea":"Tulisan saat sesi hilang."}
```

`save`, `append`, dan `setMood` semuanya `waitForSave=false` / masuk `unsaved`, pesan internal hanya di
state (banner memakai copy i18n generik), tidak ada satu byte pun di IndexedDB, dan draf dipertahankan.
Setelah sesi pulih: retry `true`, record tertulis, `unsaved`/`error` bersih, draf dibuang.

### (b) Hapus halaman yang gagal ditulis

```
PROBE_B_UI {"alert":false,"retryButton":false,"draft":null,"textarea":"","held":[],"error":"record 01a169f7-… tidak ada: tidak bisa diubah/dihapus"}
PROBE_B2_HYDRATE {"revived":null,"stored":0,"draftAfterReload":…}
```

Banner hilang, tombol "Coba lagi" tidak tertinggal, tahanan draf dilepas, draf bersih, dan hydrate
berikutnya **tidak** menghidupkan halaman. (Catatan: `memos.error` menjadi terisi karena tombstone
untuk record yang tak pernah ada ditolak writer — lihat NIT-71-10; state ini tidak dirender.)

### (c) Ketik selama menyimpan (tulisan benar-benar ditahan)

```
PROBE_C_AFTER_CLICK {"saving":true,"alert":false,"attempts":1}
PROBE_C {"textarea":"Versi pertama. Tambahan.","draft":"{…\"text\":\"Versi pertama. Tambahan.\"…}","alert":false}
```

Setelah tulisan pertama selesai, yang tersimpan `"Versi pertama."`, tetapi textarea & draf tetap
`"Versi pertama. Tambahan."`; simpan kedua menulis versi lengkap dan baru setelah itu draf `null`.

### (d) Simpan biasa tetap membersihkan draf setelah konfirmasi

```
PROBE_D {"stored":["Simpan biasa."],"draft":null,"alert":false,"textarea":"Simpan biasa."}
```

### (e) Dua tab merge tetap benar (assert tegas)

```
PROBE_E {"count":1,"text":"Halaman bersama.\n\nDari A.\n\nDari B.\n\nDari A lagi."}
```

Satu record per tanggal, catatan tab A **dan** tab B sama-sama bertahan, tanpa duplikasi. Inilah yang
membuat assertion `A || B` di test developer terbukti tautologis.

## Uji mutasi putaran 2

Mutasi diterapkan pada file produk, dijalankan, lalu dikembalikan **byte-identik**
(`sha256sum -c` OK: `useMemos.ts`, `useMemoDraft.ts`, `MemoEditor.vue`).

| Mutasi | Hasil |
| --- | --- |
| M1 `session === null` dibuat **sukses** lagi (BUG-71-01) | **2 test QA gagal**: writefix "simpan saat sesi lokal hilang", "append & setMood saat sesi hilang" (+2 probe independen) |
| M2 `clearPending(existing.date)` dihapus dari `remove()` (BUG-71-02) | **2 test gagal**: writefix "halaman gagal ditulis lalu dihapus", alertflow "entri gagal ditulis lalu dihapus" |
| M3 guard `unchangedSince` dihapus dari `MemoEditor.save()` (BUG-71-03) | **1 test gagal**: alertflow "ketikan baru saat tulisan berjalan dipertahankan" |
| M4 `release(day)` pada watcher "halaman hilang" dihapus | **1 test gagal**: alertflow "entri gagal ditulis lalu dihapus" (draf kosong tertinggal) |
| M5 `retryEmptiedWrite` dimatikan | **1 test gagal**: writefix "halaman dikosongkan (mood tetap) … Coba lagi" |

## Bug / risiko / nit yang tersisa

Tidak ada bug blocking. Urut severity:

1. **RISK-71-04 (Medium, sudah dideklarasikan dev)** — dua tab membuat tanggal **baru** bersamaan →
   2 record untuk satu tanggal; `loadMemoRecords` memilih `updatedAt` terbaru sehingga halaman tab
   lain tidak tampil sampai sync/dedupe. Butuh keunikan `entry_date` di core
   (`app/utils/memo/persistence.ts:229-261`). Bukan lingkup #71.
2. **RISK-71-09 (Low, baru teramati; sudah disebut dev sebagai "gagal hapus belum ada UI")** — hapus
   yang gagal masih **senyap**. Probe: simpan sukses → storage penuh → hapus →
   `hasUnsaved=false`, `error="QuotaExceededError: storage penuh"` (tidak dirender), `memoOn=null`,
   record **masih ada**, dan muncul lagi setelah hydrate berikutnya. Bukti kode:
   `useMemos.ts:496-522` (hapus diantrekan dengan `pending=null`, hanya mengisi `error`) +
   `MemoEditor.vue:125` (banner hanya dari `hasUnsaved`). Tidak ada data hilang, tetapi aksi destruktif
   gagal tanpa umpan balik.
3. **RISK-71-12 (Low, baru teramati)** — gagal tulis **mood** di hari tanpa halaman ditandai `unsaved`,
   tetapi tidak ada UI yang membacanya (banner hanya di `MemoEditor`; `JournalFeeling.vue:14` memanggil
   `setMood` tanpa status). Mood yang tampil hilang setelah reload. Akar sama dengan NIT-71-07.
4. **RISK-71-05 (Low, sudah dideklarasikan)** — hapus di tab A dihidupkan lagi oleh simpan salinan basi
   di tab B (bukan data loss).
5. **RISK-71-06 (Low, sudah dideklarasikan, belum berubah)** — `memosUnsaved` hanya di memori tab;
   setelah reload penuh penanda "belum tersimpan" hilang, tetapi **draf tetap ada** dan memulihkan teks
   (diuji di writefix (a)), jadi user tinggal menekan simpan sekali lagi.
6. **NIT-71-10 (Low, kerapian/observability)** — menghapus halaman yang tulisannya tidak pernah sukses
   melempar `record … tidak ada: tidak bisa diubah/dihapus`
   (`app/utils/storage/record-writer.ts:189-201`) sehingga `memos.error` basi sampai hydrate sukses
   berikutnya. Test writefix memeriksa `error=null` sebelum antrean hapus selesai
   (`useMemos.writefix.qa71.test.ts:515-520`), jadi assertion itu bergantung urutan; dampak user nol.
7. **NIT-71-07 (Low, kerapian, belum berubah)** — `memos.error` tidak pernah dirender
   (`grep 'memos.error' app/**` = hanya test) dan `writePromises` (`useMemos.ts:99,372,401`) tidak
   dipangkas setelah settle (kini hanya dihapus saat `remove`).
8. **NIT-71-11 (Low, kerapian test)** — komentar stale di `memo.draft.qa.test.ts:96-100,254-255`
   ("tidak ada sesi data lokal") dan test reload yang menuntut editor kosong padahal halaman tersimpan.
9. **FLAKE-71-08 (Low, pre-existing)** — `app/plugins/ticker.client.ts` menulis `useNow = Date.now()`
   tiap detik. Di bawah beban suite penuh: run 1 `2 failed / 392 passed` (1 detail tidak tersimpan),
   run 2 `1 failed / 393 passed` (`kalender.test.ts`: mengharap "8 Sep – 14 Sep 2025", dapat
   "19 Okt – 25 Okt 2026"), run 3–4 `60 files / 394 passed`. `kalender.test.ts` + `memo.qa.test.ts`
   lulus 3× saat dijalankan sendiri. Bukan regresi #71 (kedua file tidak berubah).

## Tiga pilar (delta putaran 2)

**Keamanan**

- Tidak ada perubahan pada aturan penyimpanan: isi jurnal tetap ciphertext di IndexedDB; yang plaintext
  hanya draf (`ip-memo-draft-*`, GAP-65-03/B-54.1 — pre-existing).
- Copy error ke user tetap generik (`memo.saveFailed`); pesan internal hanya di state. Diuji ulang di
  alertflow (a): `alert.text()` tidak memuat `QuotaExceededError`; probe (a) memastikan copy sesi
  internal ("penyimpanan lokal belum bisa dibuka") juga tidak dirender.
- Sesi `null` (kunci terkunci / IndexedDB gagal dibuka / auth hilang — `useLocalData.ts:101-168`) tidak
  lagi dianggap sukses, jadi tidak ada klaim palsu "sudah tersimpan" yang bisa menghapus satu-satunya
  salinan tulisan user.
- Tidak ada `v-html`/`innerHTML`/`console.*`/token baru di jalur ini.

**Performa** (probe, sesi nyata, 300 halaman × 1,5 KB)

```
PROBE_PERF {"hydrateColdMs":19.9,"hydrateWarmMs":24.5,"saveMs":1.04,"pages":300}
```

Bandingkan putaran 1: 25,0 / 29,2 / 1,2 ms. Tidak ada regresi; tambahan kerja rework hanya di jalur
gagal (`failWrite` O(n) scan), `clearPending` O(panjang `unsaved`), dan `unchangedSince` (bandingkan
draf) — semua jauh di bawah budget INP 200 ms.

**Kerapian**

- Perbaikan terstruktur: `failWrite` (gagal jujur + guard "halaman masih ada"), `clearPending`,
  `settleWrite` (abaikan tulisan yang digantikan/dihapus), `retryEmptiedWrite`, `unchangedSince`;
  komentar menjelaskan "kenapa" (BUG-71-01/02/03).
- `nuxi typecheck` exit 0; `eslint --max-warnings 0` exit 0; `prettier --check` OK; tidak ada
  `.only`/`.skip`/`console.log`.
- Sisa: NIT-71-07, NIT-71-10, NIT-71-11.

## Perintah & hasil putaran 2 (verbatim)

Dijalankan dari root repo, 2026-10-24. Log: `/tmp/opencode/qa71r2/`.

1. Suite yang diminta (13 file, termasuk 2 file QA #71):

```
$ pnpm --filter @improve-personal/web exec vitest run app/composables/useMemos.test.ts \
    app/composables/useMemos.persist.qa.test.ts app/composables/useMemos.write.qa.test.ts \
    app/composables/useMemos.writefix.qa71.test.ts app/composables/useMemoDraft.test.ts \
    app/composables/useMemoDraft.qa.test.ts app/pages/app/memo.qa.test.ts \
    app/pages/app/memo.draft.qa.test.ts app/pages/app/memo.conflict.qa.test.ts \
    app/pages/app/memo.writeerror.qa.test.ts app/pages/app/memo.alertflow.qa71.test.ts \
    app/utils/memo/persistence.test.ts app/utils/memo.test.ts

 RUN  v5.0.3 /media/DATA/Development/stackinnov/products/improve-personal/apps/web

 Test Files  13 passed (13)
      Tests  120 passed (120)
   Start at  01:19:31
   Duration  6.78s (tests 34%, transform 31%, environment 24%, import 6%, setup 5%)
```

2. Typecheck:

```
$ pnpm --filter @improve-personal/web typecheck
$ nuxt typecheck
TYPECHECK_EXIT=0
```

3. ESLint (`--max-warnings 0`, produk + test + helper):

```
$ cd apps/web && pnpm exec eslint app/composables/useMemos.ts app/composables/useMemoDraft.ts \
    app/utils/memo/persistence.ts app/components/features/memo/MemoEditor.vue \
    app/composables/useMemos.writefix.qa71.test.ts app/pages/app/memo.alertflow.qa71.test.ts \
    app/pages/app/memo.writeerror.qa.test.ts app/pages/app/memo.draft.qa.test.ts \
    app/pages/app/memo.conflict.qa.test.ts tests/nuxt/memo-session.ts \
    app/composables/useMemos.test.ts app/composables/useMemoDraft.test.ts --max-warnings 0
ESLINT_EXIT=0
```

4. Prettier:

```
$ cd apps/web && pnpm exec prettier --check app/composables/useMemos.ts \
    app/composables/useMemoDraft.ts app/utils/memo/persistence.ts \
    app/components/features/memo/MemoEditor.vue app/composables/useMemos.writefix.qa71.test.ts \
    app/pages/app/memo.alertflow.qa71.test.ts app/pages/app/memo.writeerror.qa.test.ts \
    app/pages/app/memo.draft.qa.test.ts app/pages/app/memo.conflict.qa.test.ts \
    tests/nuxt/memo-session.ts
Checking formatting...
All matched files use Prettier code style!
PRETTIER_EXIT=0
```

5. Regresi `app/pages/app` + `app/composables`, 2× (plus 2 run eksplorasi yang menangkap flake):

```
$ pnpm --filter @improve-personal/web exec vitest run app/pages/app app/composables   # run 1
 Test Files  1 failed | 59 passed (60)
      Tests  1 failed | 393 passed (394)        # kalender.test.ts (FLAKE-71-08), 16.84s

$ pnpm --filter @improve-personal/web exec vitest run app/pages/app app/composables   # run 2
 Test Files  60 passed (60)
      Tests  394 passed (394)                    # 17.xx s

$ pnpm --filter @improve-personal/web exec vitest run app/pages/app/kalender.test.ts \
    app/pages/app/memo.qa.test.ts          # 3× sendiri
 Test Files  2 passed (2) / Tests 23 passed (23)  (x3)
```

Run eksplorasi sebelum itu: `2 failed | 392 passed (394)` dan `1 failed | 393 passed (394)` — keduanya
`kalender.test.ts`/`memo.qa.test.ts` (ticker), bukan file #71.

6. Mutasi M1–M5: lihat §Uji mutasi putaran 2. Semua produk dipulihkan byte-identik:

```
$ sha256sum -c /tmp/opencode/qa71r2/before.sha
app/composables/useMemos.ts: OK
app/composables/useMemoDraft.ts: OK
app/components/features/memo/MemoEditor.vue: OK
```

## Perubahan yang saya buat di putaran 2 (test saja)

- `apps/web/app/composables/useMemos.writefix.qa71.test.ts` — **menguatkan** assertion (c) ketiga:
  `A || B` → `toContain('Dari B')` + `toContain('Dari A lagi.')`, plus komentar alasan. Tidak ada test
  lain yang saya ubah, tidak ada yang saya hapus.
- Probe sementara `__probe71r2*.test.ts` (a–e, perf, delete-failure) dibuat lalu **dihapus**; outputnya
  dikutip di laporan ini.
- Tidak ada file produk yang diubah (sha256 di atas), tidak ada commit.

## Coverage & celah yang tersisa

- Tertutup dan baru terbukti: sesi lokal `null` untuk `save`/`append`/`setMood` (+retry), hapus halaman
  yang gagal (banner/held/draf/no-revive), ketikan selama menyimpan (termasuk tulisan yang benar-benar
  ditahan), simpan biasa, dua tab pada tanggal yang sudah ada, pindah tanggal, tombstone.
- Masih celah: (i) dua tab membuat tanggal **baru** (RISK-71-04, butuh core); (ii) hapus-vs-simpan basi
  (RISK-71-05); (iii) kegagalan hapus & kegagalan mood tanpa UI (RISK-71-09/12); (iv) test typing di
  alertflow sebaiknya menahan tulisan setelah `allow()` supaya benar-benar menguji jendela in-flight;
  (v) test reload di `memo.draft.qa.test.ts` belum benar-benar menghidrasi ulang; (vi) flake ticker
  (FLAKE-71-08) perlu dimatikan di test (`vi.useFakeTimers` / jangan menulis `now` di plugin saat test).

Urutan tindak lanjut (non-blocking): 1) RISK-71-04 (task core: keunikan `entry_date`), 2) RISK-71-09/12
(UI untuk kegagalan hapus/mood, sekalian pakai `memos.error`), 3) NIT-71-07/10/11, 4) FLAKE-71-08.

Rules dibaca (putaran 2): `CLAUDE.md` (root), `.claude/rules/shared-security.md`,
`.claude/rules/shared-code-quality.md`, `.claude/rules/ergonio-status-flow.md`, `apps/web/AGENTS.md`,
`apps/web/CLAUDE.md`, `apps/web/.claude/rules/security.md`, `apps/web/.claude/rules/performance.md`,
`apps/web/.claude/rules/code-quality.md`, `reports/qa-65-journal-persist.md`, komentar handoff rework.

---

# Lampiran — laporan putaran 1 (sebelum rework, historis)

> Verdict di bawah adalah hasil putaran 1. BUG-71-01/02/03 yang dilaporkan di sini sudah **tertutup**
> dan diverifikasi ulang di putaran 2 (lihat bagian atas). Angka test (117) dan status mutasi di bawah
> adalah kondisi saat itu, bukan kondisi sekarang.

## Verdict putaran 1 (historis)

**GAGAL (blocking) — 1 bug Medium, 2 bug Low.**

Dua bug yang diminta task ini **terbukti tertutup** dan tidak regresi: draf tidak lagi dihapus saat tulis
gagal, kegagalan tulis tidak mengubah status hydrate, banner `role="alert"` + tombol "Coba lagi" memakai
jalur simpan yang sama, dan simpan dari tab basi **menggabungkan** catatan tab lain (bukan LWW).
Mutasi (hold/waitForSave dihapus, merge dimatikan, keep-set dihapus) semuanya membuat test gagal.

Yang membuat **tidak lulus**: acceptance "tidak ada data hilang diam-diam" masih bocor di satu jalur —
`enqueue()` memperlakukan **sesi data lokal `null`** (kunci terkunci / storage gagal dibuka / sesi auth
hilang) sebagai **tulis sukses**. Editor lalu menghapus draf, tidak ada banner, tidak ada error, dan
tidak ada apa pun di penyimpanan: teks user lenyap tanpa jejak (BUG-71-01). Ini persis mode kegagalan
yang disebut di BUG-65-01 ("kunci hilang di tengah sesi"), dan buktinya dev test sendiri lolos justru
karena jalur ini (lihat §Mutasi M5).

Dua bug Low (tidak memblokir sendiri, tapi masuk acceptance "tidak ada banner nyangkut"): banner
"belum tersimpan" **nyangkut selamanya** + tombol "Coba lagi" mati setelah halaman yang gagal ditulis
dihapus (BUG-71-02), dan teks yang diketik **selama** penyimpanan berjalan ditimpa `load()` lalu drafnya
dihapus (BUG-71-03).

## Lingkup & test plan

Diuji di `apps/web`, semua di atas **sesi data lokal sungguhan** (fake-indexeddb + sodium asli).
Yang dipalsukan hanya batas penyimpanan: `session.writer.write/remove` dibuat menolak
(`QuotaExceededError`) atau menunda (storage lambat), dan di test halaman `useLocalData().ensure`
diganti supaya penyimpanan bisa gagal/lambat. Composable jurnal, repository, dan enkripsi **tidak**
di-mock.

| #   | Yang dibuktikan                                                                                                         | Bukti (test)                                                                |
| --- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| a   | storage penuh -> draf & halaman bertahan, error terlihat (`role="alert"`), retry setelah pulih tersimpan + draf dihapus | `useMemos.writefix.qa71.test.ts` (a)(a2), `memo.alertflow.qa71.test.ts` (a) |
| b   | status hydrate tidak berubah jadi `error`; hydrate berikutnya tidak mengganti store & tidak menghapus banner            | `useMemos.writefix.qa71.test.ts` (b) x2                                     |
| c   | dua tab: simpan dari salinan basi tidak menghapus catatan tab lain, satu record per tanggal                             | `useMemos.writefix.qa71.test.ts` (c) x3                                     |
| d   | draf dibuang hanya setelah tulis terkonfirmasi (storage lambat)                                                         | `useMemos.writefix.qa71.test.ts` (d)                                        |
| e   | pindah tanggal saat menyimpan: draf tanggal lain utuh, draf tanggal tersimpan dibuang                                   | `useMemos.writefix.qa71.test.ts` (e)                                        |
| f   | hapus entri tidak dihidupkan lagi oleh hydrate/merge (termasuk hydrate berjalan bersamaan, dan pengosongan dengan mood) | `useMemos.writefix.qa71.test.ts` (f) x3                                     |
| —   | UX error: copy generik (bukan pesan internal), retry jalur yang sama, banner tidak nyangkut                             | `memo.alertflow.qa71.test.ts` x4                                            |
| —   | uji mutasi: hold/waitForSave/merge/keep-set dilepas -> test harus gagal                                                 | lihat §Mutasi                                                               |
| —   | residual: dua tab membuat tanggal BARU bersamaan; hapus di tab A vs simpan basi di tab B                                | probe P7/P8 (lihat §Risiko)                                                 |

Tidak diuji / di luar lingkup: sinkronisasi ke server (belum ada), mobile, Lighthouse/CWV perangkat
nyata, uji ke production/data user nyata (**tidak dilakukan**).

## Bukti per fokus

### (a) Storage penuh: draf tetap, error terlihat, retry menyimpan

`useMemos.writefix.qa71.test.ts` — "storage penuh: draf utuh + tanda belum tersimpan, retry setelah
pulih tersimpan lalu draf dibuang":

```
expect(await memos.waitForSave(page.id)).toBe(false)          -> false
memos.error.value                                            -> "QuotaExceededError: storage penuh"
memos.hasUnsaved(DAY)                                        -> true
localStorage[ip-memo-draft-2025-09-09]                       -> {"values":{"text":"Tulisan yang tidak boleh hilang."...}}
memos.memoOn(DAY).text                                       -> "Tulisan yang tidak boleh hilang."
loadMemoRecords(base)                                        -> 0 halaman (penyimpanan memang kosong)
-- retry setelah storage pulih --
waitForSave(retry.id)                                        -> true
hasUnsaved(DAY) / error                                      -> false / null
draft key                                                    -> null
loadMemoRecords(base)                                        -> 1 halaman, id sama dengan percobaan pertama
```

UI (`memo.alertflow.qa71.test.ts` — "(a) storage penuh: banner generik muncul, draf & teks bertahan,
"Coba lagi" menyimpan"; penyimpanan **benar-benar** menolak, bukan state yang di-seed):

```
section.sheet [role="alert"]          -> ada, teks: "Belum tersimpan di perangkat. Tulisanmu masih ada di draf — coba lagi."
alert.text() berisi QuotaExceeded     -> TIDAK (copy generik, bukan pesan internal)
textarea.paper                        -> "Tulisan yang gagal disimpan." (teks tidak hilang)
localStorage draft                    -> masih ada
klik "Coba lagi" (storage pulih)     -> IndexedDB berisi halaman itu, alert hilang, draft key null
```

### (b) Status hydrate tidak berubah jadi error (regresi penyebab lama)

```
status setelah tulis gagal            -> "ready"      (bukan "error")
memos.value.length                    -> 1
-- hydrate berikutnya (state status/error direset, store dipertahankan) --
after.status                          -> "ready"
after.memoOn(DAY)                     -> id/title/text/feelings utuh (tidak diganti snapshot storage)
storage                               -> 0 halaman
```

Test kedua memastikan hydrate yang sukses **tidak** membersihkan `error`/banner tanggal yang masih
tertunda (`unsaved` masih berisi tanggal itu).

### (c) Dua tab tidak saling menimpa

Dua sesi nyata pada database yang sama (jam perangkat berbeda = tab lain). Tab B hydrate lebih dulu
(melihat "Tulisan awal."), tab A menulis catatan, lalu B menyimpan dari salinan basi:

```
stored (1 record) -> "Awal.\n\nCatatan dari tab A.\n\nTambahan dari tab B."
"Catatan penting dari tab A" muncul 1x (tidak diduplikasi)
memosB.memoOn(DAY).text === stored.text      (state tab B memakai versi gabungan yang ditulis)
memosB.hasUnsaved(DAY)                       -> false
```

Varian lain juga lulus: tab yang **tidak** basi menulis apa adanya (tanpa menduplikasi isinya), dan dua
tab menambah catatan berbeda berturut-turut (keduanya bertahan).

### (d) Simpan sukses: draf dihapus hanya setelah konfirmasi

Storage ditahan (tulisan belum selesai) -> halaman optimistis sudah ada di store, tetapi draf
**masih ada** (`ip-memo-draft-…` berisi teks). Setelah `waitForSave` resolve `true`, `load()`+`release()`
baru menghapus draf. Ini yang diuji mutasi M1: tanpa `hold`, test ini (dan test regresi dev
`useMemoDraft.test.ts:176`) gagal.

### (e) Pindah tanggal saat menyimpan

Tanggal dikunci di awal (`MemoEditor.vue:128`), jadi tulisan selesai ketika editor sudah di tanggal lain:

```
draft tanggal kedua setelah tulis pertama selesai  -> masih ada, isi tidak berubah
draft tanggal pertama                              -> null
editor.draft.text                                  -> "Tulisan hari kedua."
storage                                            -> hanya 1 halaman: 2025-09-09
```

### (f) Hapus entri tidak dihidupkan lagi

- hapus tanpa mood -> tombstone; hydrate ulang (dan hydrate yang berjalan **bersamaan** dengan hapus)
  tidak mengembalikan halaman: `memoOn(DAY) === null`, `memos.value.length === 0`, storage 0 record.
- hapus saat ada mood -> halaman dikosongkan (`text === ''`), mood tetap; merge tidak mengembalikan teks
  lama, `moodOn(DAY) === 2` setelah reload.

## Bug (urut severity)

### BUG-71-01 — (Medium, BLOCKING) Sesi data lokal `null` dianggap "sudah tersimpan": draf dihapus, tidak ada yang ditulis, tidak ada error

Bukti kode: `apps/web/app/composables/useMemos.ts:320-344` (khususnya `:329-333` —
`if (session === null) { if (pending !== null) settleWrite(pending, null); … return true }`),
dipakai `MemoEditor.vue:140-146` (`waitForSave` true -> `load()` + `release()`), yang menghapus draf di
`useMemoDraft.ts:195-207`.

Langkah reproduksi (test `useMemos.writefix.qa71.test.ts` > "QA #71 temuan QA: sesi data lokal tidak
tersedia"):

1. Buka `/app/memo`, tulis halaman, klik **Simpan ke jurnal**.
2. Di tengah sesi, `useLocalData().ensure()` mengembalikan `null` — ini terjadi kalau kunci terkunci
   (`LocalKeyMissingError`), IndexedDB gagal dibuka/diblokir, atau sesi auth sudah tidak ada
   (`useLocalData.ts:101-168`).
3. Hasil (probe P6, sesi nyata):
   ```
   waitForSave(id)   -> true
   hasUnsaved(DAY)   -> false
   error             -> null
   draft key         -> null            (editor menghapus draf)
   loadMemoRecords() -> 0 halaman       (tidak ada yang tersimpan)
   ```
4. User melihat teks masih di layar (dari store memori) tanpa banner; setelah pindah halaman/reload,
   teks hilang dan drafnya sudah tidak ada.

Expected: `false`, `hasUnsaved(DAY) === true`, draf dipertahankan, banner "belum tersimpan" tampil —
sama seperti kegagalan tulis lain (itu yang diminta acceptance "tidak ada data hilang diam-diam").
Actual: dilaporkan sukses; draf (satu-satunya salinan) dihapus.

Catatan penting: test UI dev (`memo.writeerror.qa.test.ts:104-119`) **lolos karena bug ini**. Test itu
menekan "Coba lagi" tanpa menyiapkan sesi data lokal, jadi `save()` "sukses" lewat cabang
`session === null` — bukan lewat tulisan nyata (dibuktikan mutasi M5).

Saran perbaikan (kecil, tidak mengubah kontrak): jadikan `session === null` sebagai kegagalan tulis
(`failWrite`) di jalur client; hanya `!import.meta.client` (SSR, tidak ada aksi user) yang boleh
dianggap "tidak ada yang perlu ditulis". Tambahkan test regresi dengan sesi `null` (sudah ada di
`useMemos.writefix.qa71.test.ts`, tinggal balik assertion-nya), dan beri test UI dev sesi nyata supaya
retry benar-benar terbukti menulis.

### BUG-71-02 — (Low) Banner "belum tersimpan" nyangkut + "Coba lagi" mati setelah halaman itu dihapus

Bukti kode: `useMemos.ts:453-474` (`remove()` tidak menyentuh `pendingWrites`, `unsaved`, atau `error`),
`useMemoDraft.ts:191-207` (`held` tidak pernah dilepas kalau tulis gagal), `MemoEditor.vue:117,253-258`.

Repro (test `memo.alertflow.qa71.test.ts` > "entri yang gagal ditulis lalu dihapus: banner tetap tampil
dan "Coba lagi" tidak melakukan apa pun"):

1. Storage penuh -> simpan halaman -> banner muncul (benar).
2. Storage pulih, lalu user menghapus halaman itu ("Hapus" -> "Yakin hapus?"). Tombstone berhasil
   (storage 0 record, `MemoEntry` hilang).
3. Hasil (probe P2): `hasUnsaved(DAY) -> true`, `error -> "QuotaExceededError: storage penuh"` (pesan
   lama), draf di disk jadi `{"values":{"text":""}}`, dan klik "Coba lagi" -> `save()` mengembalikan
   `null` (isi kosong) sehingga tidak ada yang disimpan **dan banner tetap ada**.

Expected: setelah halaman dihapus, tanda "belum tersimpan" untuk tanggal itu dibersihkan (banner hilang,
`error` direset) — atau minimal "Coba lagi" bisa menyelesaikan state.
Actual: banner + pesan error lama menetap sampai reload penuh; tombolnya tidak melakukan apa pun.

Saran: `remove()` (dan `setMood` yang menghapus record) membersihkan `pendingWrites`/`unsaved` untuk
tanggal itu, dan `useMemoDraft` melepas `held` saat halaman tanggal itu hilang.

### BUG-71-03 — (Low) Teks yang diketik selama penyimpanan berjalan ditimpa `load()` lalu drafnya dihapus

Bukti kode: `MemoEditor.vue:133-147` (`await waitForSave` lalu `load(memos.memoOn(target) ?? page, target)`)
dan `useMemoDraft.ts:255-261` (`load()` mengganti `draft` tanpa menggabung).

Repro (test `memo.alertflow.qa71.test.ts` > "ketikan baru saat tulisan berjalan hilang setelah tulisan
selesai", storage dibuat lambat):

1. Ketik "Versi pertama.", klik **Simpan ke jurnal** (tombol jadi "Menyimpan…"; textarea tetap bisa
   diketik).
2. Selama menunggu, ketik lagi -> "Versi pertama. Tambahan penting." (draf di localStorage sudah memuat
   tambahan itu).
3. Tulisan selesai -> textarea kembali ke "Versi pertama.", `ip-memo-draft-…` **null**, dan yang
   tersimpan hanya "Versi pertama.".

Expected: ketikan setelah tombol simpan ditekan tidak hilang (mis. `load()` hanya mengganti bagian yang
tidak berubah, atau `load()` dilewati kalau draf berubah selama menunggu).
Actual: ketikan hilang dan drafnya dihapus, jadi tidak ada salinan untuk dipulihkan.

Severity Low karena jendelanya pendek (satu tulisan IndexedDB, terukur 1,2 ms/tulis di probe), tetapi
akibatnya tidak bisa dipulihkan dan sebelumnya (jalur sinkron) jendela ini tidak ada — perbaikan #71
membukanya.

## Risiko yang tersisa (bukan bug baru, sudah dinyatakan dev)

### RISK-71-04 — (Medium) Dua tab membuat tanggal BARU bersamaan -> 2 record untuk satu tanggal

Probe P7 (dua sesi nyata): tab B membuka tanggal kosong, tab A membuat halaman tanggal itu, tab B
menyimpan halaman barunya (id baru, karena B tidak pernah melihat record A):

```
record untuk satu tanggal -> 2      (outbox -> 2)
halaman yang terbaca       -> "Dari B."   (A tertimpa di semua tampilan; record A tetap di storage)
```

`loadMemoRecords` memilih `updatedAt` terbaru per tanggal (`persistence.ts:229-261`), jadi halaman tab A
hilang dari UI/export sampai sinkronisasi/dedupe. Butuh keunikan `entry_date` di core (di luar lingkup
task ini) — sudah disebut dev di handoff. Tidak memblokir, tapi harus jadi task lanjutan sebelum sync.

### RISK-71-05 — (Low) Hapus di tab A dihidupkan lagi oleh simpan basi di tab B

Probe P8: tab A menghapus halaman (tombstone), tab B menyimpan salinan lamanya ->
record kembali `deleted: false` dan halaman tampil lagi. Bukan data loss (isi B memang niat user), tapi
penghapusan di tab lain dibatalkan tanpa peringatan.

### RISK-71-06 — (Low) Setelah reload penuh saat tulis gagal, penanda "belum tersimpan" hilang

`memosUnsaved` hanya di memori tab. Reload -> banner hilang, halaman di memori hilang (storage kosong),
tetapi **draf tetap ada** dan memulihkan teks (test "(a) setelah gagal, reload … tetap memulihkan tulisan
dari draf" lulus). User perlu menekan simpan sekali lagi. Sudah disebut dev.

### NIT-71-07 — (Low, kerapian) `memos.error` tidak pernah dirender + `writePromises` tidak pernah dipangkas

`grep 'memos.error'` di `app/**` = hanya test; copy generik memang diminta, tapi state ini jadi tidak
punya konsumen. `writePromises` (`useMemos.ts:93`) menyimpan satu promise per id halaman dan tidak
pernah dihapus setelah settle — tumbuh sepanjang sesi tab (kecil, tapi tanpa batas).

### FLAKE-71-08 — (Low, pre-existing) `memo.qa.test.ts` flaky di bawah beban paralel

Run pertama suite `app/pages/app app/composables`: 1 gagal — "riwayat tanggal unik, terbaru dulu, tanpa
tanggal masa depan" (`expected ['true','false','false']`, `received 5 tombol`). File itu **sendiri**:
3x lulus. Akar masalah sama dengan FLAKE-65-06: `app/plugins/ticker.client.ts` menulis
`useState('now') = Date.now()` tiap detik sehingga `today` di test berubah ke tanggal nyata. Bukan
regresi #71 (plugin & test itu tidak berubah).

## Uji mutasi (langkah 4)

Semua mutasi diterapkan pada file produk, dijalankan, lalu dikembalikan **byte-identik**
(`sha256sum -c` OK untuk `useMemoDraft.ts`, `useMemos.ts`, `MemoEditor.vue`; `persistence.ts` OK).

| Mutasi                                                                           | Hasil                                                                                                                                                                      |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1 `useMemoDraft.hold()` dijadikan no-op                                         | **4 test gagal**: `useMemos.writefix.qa71` (a) & (d), `memo.alertflow.qa71` (a), dan test regresi dev `useMemoDraft.test.ts:176`                                           |
| M2 `MemoEditor.save()` dikembalikan ke jalur lama (`load()` tanpa `waitForSave`) | **2 test gagal**: `memo.alertflow.qa71` (a) dan karakterisasi BUG-71-03. `memo.writeerror.qa.test.ts` dev **tetap lulus** -> test itu tidak menjaga wiring kegagalan tulis |
| M3 `persistMemo`/`mergeWithStored` dikembalikan ke LWW                           | **1 test gagal**: (c) "tab basi menyimpan …"; `persistence.test.ts` dev tetap lulus (merge wiring hanya dijaga test composable)                                            |
| M4 `keep`-set di `hydrate()` dikosongkan                                         | **1 test gagal**: (b) "kegagalan tulis tidak mengubah status …"                                                                                                            |
| M5 `session === null` dibuat **gagal** (perilaku yang seharusnya)                | `memo.writeerror.qa.test.ts` dev "coba lagi berhasil" **gagal** + karakterisasi BUG-71-01 gagal                                                                            |

## Tiga pilar

**Keamanan**

- Tidak ada teks jurnal di `localStorage` setelah simpan (draft saat masih diketik tetap plaintext —
  GAP-65-03 dari QA #65, tidak berubah di task ini).
- Error yang tampil ke user = copy i18n generik (`memo.saveFailed`), bukan pesan internal: diuji
  `expect(alert.text()).not.toContain('QuotaExceededError')`. Pesan internal hanya di state (`memos.error`)
  dan tidak dirender.
- Tidak ada `v-html`/`innerHTML`/`eval` baru di jalur ini; tidak ada `console.*` di file yang disentuh;
  tidak ada token/PII di log.
- `memos`/`memosUnsaved` tetap di `useState`; store mulai kosong saat SSR (tidak ada teks jurnal di
  `window.__NUXT__`), dan `unsaved` hanya berisi tanggal. Tidak ada perubahan pada aturan ini.
- Celah yang masih terbuka: draf plaintext (B-54.1/GAP-65-03) dan isi jurnal hidup di `useState`
  (pre-existing).

**Performa** (probe, sesi nyata + fake-indexeddb, 300 halaman × 1,5 KB)

```
hydrate pertama (store kosong)                   25,0 ms
hydrate kedua (store penuh -> mergeMemos 300x300) 29,2 ms   (+4,2 ms untuk merge)
simpan (re-read + merge + enkripsi + tulis)        1,2 ms/tulis
```

Biaya tambahan fitur ini (re-read + merge + hold/waitForSave) kecil dan jauh di bawah budget INP 200 ms.
`mergeMemos` O(n²) terhadap jumlah halaman hanya saat hydrate (500 halaman ~250 rb pembandingan
referensi); kalau riwayat tumbuh ke ribuan halaman, pertimbangkan peta per tanggal.

**Kerapian**

- Perubahan produk terstruktur: `hold`/`release`/`load(day)` di `useMemoDraft`, `failWrite`/`settleWrite`/
  `enqueue`/`waitForSave` di `useMemos`, `mergeMemoFields` dipakai bersama jalur draf #54 & jalur simpan.
  Komentar menjelaskan "kenapa" (BUG-65-01, RISK-65-02, satu halaman per tanggal).
- `nuxi typecheck` exit 0, `eslint --max-warnings 0` exit 0, `prettier --check` OK, tidak ada
  `.only`/`.skip`/`console.log` di file yang saya sentuh.
- Temuan kerapian: `memos.error` tanpa konsumen, `writePromises` tanpa pemangkasan (NIT-71-07).
- Test dari dev: `useMemos.write.qa.test.ts` bagus (sesi nyata), tetapi `memo.writeerror.qa.test.ts`
  hanya menyemai `useState('memosUnsaved')` sehingga tidak menjaga wiring kegagalan tulis (mutasi M2).

## Perintah & hasil (verbatim)

Semua dijalankan dari root repo, 2026-10-24. Log: `/tmp/opencode/qa71/`.

1. Suite yang diminta (11 file):

```
$ pnpm --filter @improve-personal/web exec vitest run app/composables/useMemos.test.ts \
    app/composables/useMemos.persist.qa.test.ts app/composables/useMemos.write.qa.test.ts \
    app/composables/useMemoDraft.test.ts app/composables/useMemoDraft.qa.test.ts \
    app/pages/app/memo.qa.test.ts app/pages/app/memo.draft.qa.test.ts \
    app/pages/app/memo.conflict.qa.test.ts app/pages/app/memo.writeerror.qa.test.ts \
    app/utils/memo/persistence.test.ts app/utils/memo.test.ts

 RUN  v5.0.3 /media/DATA/Development/stackinnov/products/improve-personal/apps/web

 Test Files  11 passed (11)
      Tests  100 passed (100)
   Start at  00:00:24
   Duration  7.27s (tests 35%, transform 29%, environment 25%, setup 5%, import 5%)
```

2. Suite yang sama + 2 file QA baru (13 file):

```
$ pnpm --filter @improve-personal/web exec vitest run <11 file di atas> \
    app/composables/useMemos.writefix.qa71.test.ts app/pages/app/memo.alertflow.qa71.test.ts

 Test Files  13 passed (13)
      Tests  117 passed (117)
   Duration  7.40s (tests 33%, transform 30%, environment 24%, setup 7%, import 5%)
```

3. Typecheck:

```
$ pnpm --filter @improve-personal/web typecheck
$ nuxt typecheck
TYPECHECK_EXIT=0
```

4. ESLint (`--max-warnings 0`, produk + test yang relevan):

```
$ cd apps/web && pnpm exec eslint app/composables/useMemos.ts app/composables/useMemoDraft.ts \
    app/utils/memo/persistence.ts app/components/features/memo/MemoEditor.vue \
    app/composables/useMemos.write.qa.test.ts app/pages/app/memo.writeerror.qa.test.ts \
    app/composables/useMemos.writefix.qa71.test.ts app/pages/app/memo.alertflow.qa71.test.ts \
    --max-warnings 0
ESLINT_EXIT=0
```

5. Prettier:

```
$ cd apps/web && pnpm exec prettier --check app/composables/useMemos.ts app/composables/useMemoDraft.ts \
    app/utils/memo/persistence.ts app/components/features/memo/MemoEditor.vue i18n/locales/id.json \
    app/composables/useMemos.write.qa.test.ts app/pages/app/memo.writeerror.qa.test.ts \
    app/composables/useMemos.writefix.qa71.test.ts app/pages/app/memo.alertflow.qa71.test.ts
Checking formatting...
All matched files use Prettier code style!
PRETTIER_EXIT=0
```

6. Regresi `app/pages/app` + `app/composables`:

```
$ pnpm --filter @improve-personal/web exec vitest run app/pages/app app/composables   # run 1
 Test Files  1 failed | 59 passed (60)
      Tests  1 failed | 390 passed (391)     <- memo.qa.test.ts (FLAKE-71-08), 18.06s

$ pnpm --filter @improve-personal/web exec vitest run app/pages/app app/composables   # run 2
 Test Files  60 passed (60)
      Tests  391 passed (391)                17.59s

$ pnpm --filter @improve-personal/web exec vitest run app/pages/app/memo.qa.test.ts   # 3x sendiri
 Test Files  1 passed (1) / Tests 14 passed (14)   (x3)
```

7. Mutasi (M1-M5): lihat §Uji mutasi. Semua file produk dipulihkan dan diverifikasi:

```
$ sha256sum -c /tmp/opencode/qa71/mut/before.sha
app/composables/useMemoDraft.ts: OK
app/composables/useMemos.ts: OK
app/components/features/memo/MemoEditor.vue: OK
$ sha256sum app/utils/memo/persistence.ts /tmp/opencode/qa71/mut/persistence.ts
79d5b3d8…  app/utils/memo/persistence.ts
79d5b3d8…  /tmp/opencode/qa71/mut/persistence.ts
```

## Perubahan yang saya buat (test saja)

- `apps/web/app/composables/useMemos.writefix.qa71.test.ts` (baru, 13 test) — (a)-(f) + karakterisasi
  BUG-71-01.
- `apps/web/app/pages/app/memo.alertflow.qa71.test.ts` (baru, 4 test) — wiring UI dengan penyimpanan
  yang benar-benar gagal/lambat + karakterisasi BUG-71-02/03.
- Tidak ada file produk yang diubah; tidak ada commit. Probe sementara (`__probe71*.test.ts`) sudah
  dihapus (outputnya dikutip di laporan ini).

## Coverage & celah

- Tertutup sekarang: jalur gagal-tulis (quota/IndexedDB), dua tab pada tanggal yang **sudah ada**,
  hold/release draf, pindah tanggal saat menyimpan, hapus entri, retry dari UI.
- Masih celah: (i) sesi lokal `null` (BUG-71-01) belum punya test yang menuntut perilaku benar — test
  karakterisasi ada, tinggal dibalik setelah diperbaiki; (ii) dua tab membuat tanggal **baru**
  (RISK-71-04) butuh keunikan di core; (iii) hapus-vs-simpan basi (RISK-71-05); (iv) test UI dev perlu
  sesi nyata supaya retry terbukti menulis; (v) ticker di test membuat `memo.qa.test.ts` flaky
  (FLAKE-71-08 — matikan ticker / `vi.useFakeTimers` di test, bukan mengubah produk).

Urutan tindak lanjut: 1) BUG-71-01 (blocking, satu cabang + balik assertion test), 2) BUG-71-02, 3) BUG-71-03, 4) RISK-71-04 (task core), 5) NIT-71-07/FLAKE-71-08.

Rules dibaca: `CLAUDE.md` (root), `.claude/rules/shared-security.md`,
`.claude/rules/shared-code-quality.md`, `.claude/rules/ergonio-status-flow.md`, `apps/web/AGENTS.md`,
`apps/web/CLAUDE.md`, `apps/web/.claude/rules/security.md`, `apps/web/.claude/rules/performance.md`,
`apps/web/.claude/rules/code-quality.md`, `reports/qa-65-journal-persist.md`, komentar handoff #71.
