# QA T11 — Journal: 5 bagian harian + `@jadwal` + Diary Book + pencarian

**Task:** Ergonio #25 `[T11] Journal: 5 bagian harian + @jadwal + Diary Book + pencarian`
**Tanggal:** 22 Okt 2026 · **QA:** Fajar
**Rules dibaca:** `CLAUDE.md` root, `.claude/rules/shared-security.md`, `.claude/rules/shared-code-quality.md`,
`apps/web/AGENTS.md` → `apps/web/CLAUDE.md` → `apps/web/.claude/rules/{security,performance,code-quality}.md`,
`docs/PRD.md` §F8 (baris 317–378).

> **Status terbaru (Putaran 2, 23 Okt 2026): LULUS** — BUG-T11-01 sudah diperbaiki dan seluruh AC T11
> lulus (14/14 test). Satu regresi non-blocking (`BUG-T11-02`, draf hilang saat pindah tanggal) dicatat
> di bagian **Putaran 2** untuk task lanjutan.

---

## Verdict

**GAGAL (blocking) — 1 dari 5 AC tidak lulus.**

Empat AC lulus dengan bukti test otomatis (5 bagian harian, chip `@jadwal` + jadwal terhapus, render aman,
pencarian lokal offline). AC **"satu jurnal per tanggal — simpan ulang = update, bukan duplikat"** gagal untuk
bagian **diary**: menyimpan dua kali pada tanggal yang sama menghasilkan **dua halaman** jurnal (tidak ada jalur
update/edit). Bug: `BUG-T11-01` (High).

Catatan penting: halaman memo memang dirancang multi-halaman per hari di `source-ui/Desktop.dc.html` (baris 3946,
"Halaman ke-N hari ini"; i18n `memo.titleNextPage` ada tapi tidak dipakai), sementara PRD F8 baris 321–322 dan 360
menyebut "satu jurnal per tanggal (bukan banyak entri)" / "Satu halaman = satu hari". Jadi ini **konflik AC vs
design source**: pilihannya (a) implementasi upsert/edit diary per tanggal, atau (b) ubah AC + PRD agar
multi-halaman per hari sah. Selama AC di task ini masih berbunyi "bukan duplikat", statusnya gagal.

---

## Scope & test plan

**Diuji (test baru, file test saja):** `apps/web/app/pages/app/memo.qa.test.ts` (14 test)

| Area | Level | Cara |
|---|---|---|
| 5 bagian harian tampil & terikat data per tanggal | integrasi halaman (mount `pages/app/memo.vue`) | seed `useState` yang sama dengan produksi, assert DOM |
| Mood 5 skala, satu mood per tanggal | integrasi | klik mood, assert store |
| Autocomplete `@`, token mention, chip tersimpan | integrasi | ketik `@kel` → pilih saran → simpan → assert chip |
| Chip → navigasi ke kalender di tanggal jurnal | integrasi | `mockNuxtImport('navigateTo')` + `useState('calendar-selected')` |
| Jadwal terhapus (mention yatim) | integrasi | chip jadi `<span>` "jadwal dihapus", klik tidak navigasi, halaman tetap render |
| Render aman isi jurnal (XSS) | integrasi + statis | payload `<script>`/`<img onerror>`/`<b>`, scan `v-html\|innerHTML\|eval` |
| Satu isian per tanggal (bagian terstruktur) | integrasi | tulis 2× di tanggal sama → 1 key; pindah tanggal → data terpisah |
| Simpan diary berulang di tanggal sama | integrasi | 1× simpan = 1 halaman; 2× simpan = **2 halaman (bug)** |
| Diary Book (daftar/riwayat) | integrasi | urut terbaru dulu, unik, tanpa tanggal masa depan |
| Pencarian lokal (judul, teks, judul jadwal mention, perasaan) | integrasi + statis | filter DOM; scan tidak ada `fetch`/`useFetch`/`useAsyncData` |
| Biaya filter lokal | integrasi | 2.000 memo, ukur waktu filter |

**Tidak diuji / di luar scope:** E2E browser sungguhan (Playwright), persistensi IndexedDB/E2EE
(`packages/core` belum dipakai jurnal — fase in-memory), halaman Kalender/Overview/Daily (area agent lain),
Lighthouse/CWV, mobile app. Test halaman lain tidak dijalankan supaya tidak bentrok dengan agent lain yang sedang
bekerja (repo ini sedang punya perubahan WIP di area account/crypto/sync).

**Data uji** disemai lewat `useState` yang sama dengan yang dibaca halaman/composable (`memos`, `journal-days`,
`schedules`, `now`) — bukan mem-mock composable internal — supaya jalur data yang diuji sama dengan produksi.

---

## Hasil per acceptance criteria

| # | Acceptance criteria | Hasil | Bukti |
|---|---|---|---|
| 1 | 5 bagian harian: niat, perasaan + mood, afirmasi, refleksi (syukur/sedih/lebih baik), diary | **PASS** | Test `niat, perasaan + mood, afirmasi, refleksi (3 daftar), dan diary tampil terisi`; halaman menyusun kelima bagian di `apps/web/app/pages/app/memo.vue:63-93`; niat `journal/JournalIntentions.vue:19-27,58-68`, mood + cerita `journal/JournalFeeling.vue:12-15,21-43`, afirmasi/refleksi `journal/JournalNote.vue:21-34`, 3 daftar `journal/JournalLists.vue:10-12,17-35`, diary `memo/MemoEditor.vue:99-115` |
| 2 | Mention `@jadwal` jadi chip yang navigasi ke jadwal | **PASS** | Test `autocomplete @ ... tampil sebagai chip` + `mention tampil sebagai chip dan klik membuka kalender...`; `memo/MemoMention.vue:17-23,27-35` navigasi ke `/app/kalender` (permukaan jadwal, sesuai design `Desktop.dc.html:2728`), state tanggal diisi sebelum pindah |
| 3 | Jadwal yang dihapus tidak error (mention yatim aman) | **PASS** | Test `jadwal yang sudah dihapus jadi teks "jadwal dihapus" tanpa error & tanpa navigasi`; fallback `memo/MemoMention.vue:36-41`, `utils/memo.ts:58-64`; tidak ada exception, entri lain tetap tampil |
| 4 | Isi jurnal dirender aman — sanitasi markdown, tanpa `v-html` data user mentah | **PASS (aman) / gap fitur** | Test `HTML/script ... dirender sebagai teks` (tidak ada `img`/`script`/`b`, `window.__pwned` undefined) + test statis `tidak memakai v-html/innerHTML/eval`. Render lewat interpolasi Vue + `white-space: pre-wrap` (`memo/MemoEntry.vue:42-50,122-125`). **Markdown belum dirender** (teks polos) — trade-off tercatat di Ergonio #10; tidak ada lubang XSS, tapi fitur bold/italic/list/link PRD F8 baris 353 belum ada |
| 5 | Satu jurnal per tanggal: simpan ulang = update, bukan duplikat | **FAIL (diary)** / PASS (bagian terstruktur) | Bagian terstruktur: test `isi bagian harian disimpan per tanggal dan ditulis ulang` → `journal-days` 1 key/tanggal, tulis ulang menimpa (`composables/useJournalDay.ts:22-30`). Diary: test `simpan ulang diary ... = update` ditandai `it.fails` (bug terdokumentasi) — dapat `2` halaman, bukan `1`; `composables/useMemos.ts:52-71` selalu `add` + push, `memo/MemoEditor.vue:66-69` hanya memanggil `add`, tidak ada update |
| 6 | Pencarian lokal jalan offline (tidak butuh jaringan) | **PASS** | Test `pencarian menyaring judul, teks ... tanpa jaringan` + `fitur jurnal tidak memanggil jaringan` (scan `fetch/useFetch/useAsyncData` = kosong). Filter murni di `utils/memo.ts:77-81`, dipakai `pages/app/memo.vue:20-31` |
| 7 | Diary Book (daftar/riwayat) jalan | **PASS dengan catatan** | Test `riwayat tanggal unik, terbaru dulu, tanpa tanggal masa depan`; daftar + pratinjau + stempel mood di `memo/MemoDateStrip.vue:21-63`, urutan `utils/memo.ts:84-89`. **Belum dikelompokkan per bulan** (PRD F8 baris 359) dan belum ada filter mood/rentang tanggal/refleksi (baris 362) |

---

## Bug

### BUG-T11-01 — Simpan ulang diary di tanggal yang sama membuat halaman duplikat (High, blocking AC #5)

**Reproduksi (UI):**
1. Buka `/app/memo` (Journal), tanggal hari ini.
2. Ketik isi diary "Draf pertama." → klik **Simpan ke jurnal** → muncul 1 halaman.
3. Ketik lagi "Draf kedua, setelah diedit." → klik **Simpan ke jurnal**.
4. **Actual:** ada 2 halaman jurnal untuk tanggal yang sama (dua kartu, dua jam, dua tombol hapus).
5. **Expected:** halaman tanggal itu diperbarui (1 halaman per tanggal), sesuai AC dan PRD F8 baris 321–322/360.

**Bukti otomatis** — `apps/web/app/pages/app/memo.qa.test.ts:337` (`it.fails`):

```
FAIL  app/pages/app/memo.qa.test.ts > T11 satu isian per tanggal
      > simpan ulang diary di tanggal yang sama = update, bukan halaman duplikat
AssertionError: expected [ DOMWrapper{ …(3) }, …(1) ] to have a length of 1 but got 2
- Expected  1
+ Received  2
```

**Akar masalah (bukti kode):**
- `apps/web/app/composables/useMemos.ts:53-71` — `add()` selalu membuat `id: crypto.randomUUID()` lalu
  `memos: [memo, ...store.value.memos]` (baris 69). Tidak ada `update`/`upsert` di API yang diekspor (baris 86-95).
- `apps/web/app/components/features/memo/MemoEditor.vue:66-69` — `save()` selalu `memos.add(...)`, lalu `clear()`.
- `apps/web/app/utils/memo.ts:91-93` — `memosOn()` hanya memfilter; tidak menggabungkan per tanggal.
- Tidak ada jalur edit entri tersimpan (`MemoEntry.vue` hanya punya hapus).

**Dampak:** data ganda di jurnal pribadi, tidak bisa mengoreksi tulisan tanpa menghapus, dan Diary Book /
Overview bisa menghitung hari menulis dua kali bila kelak agregasi memakai jumlah entri.

**Keputusan produk yang perlu diambil:** implementasi upsert (satu `Memo` per `date`, simpan = update) **atau**
ubah AC/PRD agar multi-halaman per hari sah (design `Desktop.dc.html:3946` + i18n `memo.titleNextPage` sudah
mengarah ke sana). Kalau opsi kedua dipilih, AC task harus diubah lebih dulu.

---

## Temuan non-blocking

| # | Severity | Temuan | Bukti |
|---|---|---|---|
| N1 | Medium (gap PRD) | Diary Book masih strip tanggal mendatar; belum dikelompokkan per bulan, belum ada filter mood/rentang tanggal/refleksi | `memo/MemoDateStrip.vue:21-63`; PRD F8 baris 358-362 |
| N2 | Medium (gap PRD) | Markdown diary belum dirender (bold/italic/list/link); aman karena teks polos, tapi fitur PRD belum ada | `memo/MemoEntry.vue:42-50`; PRD baris 353; trade-off Ergonio #10 |
| N3 | Medium (saat persistensi masuk) | Isi jurnal ada di `useState` (`memos`, `journal-days`) — begitu data user nyata diisi saat SSR, isinya ikut terserialisasi ke `window.__NUXT__`, melanggar security.md §2 dan prinsip E2EE PRD baris 371. Sekarang aman karena masih mock/in-memory | `composables/useMemos.ts:40`, `composables/useJournalDay.ts:23`, `apps/web/.claude/rules/security.md:17` |
| N4 | Low | Draf jurnal hanya bertahan selama sesi (bukan "draf lokal" seperti PRD baris 324) — trade-off tercatat di #10 | `composables/useMemoDraft.ts:1-8` |
| N5 | Low | Pencarian tidak di-debounce; aturan performa meminta 200–300 ms untuk input filter. Diukur 2.000 memo tetap < 500 ms (test), jadi belum berisiko INP hari ini | `pages/app/memo.vue:16-24`; `apps/web/.claude/rules/performance.md:70` |
| N6 | Low | Key i18n `memo.titleNextPage` tidak dipakai (dead key) | `apps/web/i18n/locales/id.json:900` |
| N7 | Low (a11y) | Saat pencarian menyaring habis tanggal terpilih, tidak ada item `aria-selected="true"` di strip | `memo/MemoDateStrip.vue:44-49` |

---

## Cek tiga pilar

- **Keamanan — lulus untuk lingkup jurnal.** Tidak ada `v-html`/`innerHTML`/`eval` di komponen jurnal & memo
  (dijaga test statis); payload XSS dirender sebagai teks; mention hanya cocok pada `[\w-]{1,64}` sehingga tidak bisa
  menyuntik markup; mention yatim tidak melempar error. Tidak ada jaringan/server di fitur ini (offline by design).
  Catatan N3 (SSR payload) belum menjadi bug karena data masih mock. Bentuk `useState` yang sama dipakai fitur
  lain, jadi ini risiko arsitektural saat persistensi nyata masuk.
- **Performa — belum ada regresi terukur.** Tidak ada dependency baru; filter lokal atas 2.000 memo < 500 ms
  (test). Belum ada virtualisasi/pagination untuk daftar entri satu hari, tapi jumlah entri per hari kecil.
  Debounce pencarian belum ada (N5) — belum berdampak pada ukuran data sekarang.
- **Kerapian — baik.** Fungsi murni jurnal/memo punya test; komponen <= ~200 baris; tidak ada `.only`/`.skip`;
  test baru lolos ESLint `--max-warnings 0` dan Prettier. Sisa: `memo.titleNextPage` tak terpakai (N6) dan
  perilaku simpan diary yang tidak konsisten dengan AC (#5).

---

## Perintah & hasil

```bash
cd apps/web

# Test baru QA T11 (halaman Journal)
npx vitest run app/pages/app/memo.qa.test.ts
# → Test Files 1 passed (1) · Tests 13 passed | 1 expected fail (14) · 4.76s

# Test journal/memo yang sudah ada + test baru (regresi terarah)
npx vitest run app/utils/journal.test.ts app/utils/memo.test.ts app/pages/app/memo.qa.test.ts
# → Test Files 3 passed (3) · Tests 23 passed | 1 expected fail (24)

# Bukti bug: test duplikat dijalankan sebagai test biasa (assertion normal)
# → AssertionError: expected [...] to have a length of 1 but got 2

# Lint & format file test
npx eslint app/pages/app/memo.qa.test.ts --max-warnings 0   # exit 0
npx prettier --check app/pages/app/memo.qa.test.ts          # All matched files use Prettier code style
```

`nuxi typecheck` **tidak dijalankan**: sifatnya whole-project dan repo sedang punya perubahan WIP dari agent lain
(account/crypto/sync), jadi hasilnya akan bercampur dan bukan sinyal untuk task ini. File test memakai tipe
auto-import Nuxt yang sama dengan test halaman lain.

**File yang diubah:** hanya `apps/web/app/pages/app/memo.qa.test.ts` (baru) dan laporan ini. Tidak ada kode
produk yang disentuh, tidak ada commit, status Ergonio tidak diubah.

---

## Coverage & sisa risiko

- **Tertutup test:** kelima bagian harian + isian per tanggal, mood per tanggal, autocomplete → token → chip,
  navigasi chip + state kalender, mention yatim, XSS teks judul & isi, larangan `v-html`, larangan jaringan,
  urutan/keunikan riwayat tanggal, pencarian judul/teks/judul-jadwal/perasaan, biaya filter 2.000 memo.
- **Belum tertutup:** render nyata di browser (hidrasi, layout dua kolom sticky, dark mode), persistensi setelah
  reload (memang belum ada), E2EE `packages/core`, perilaku mobile app, keyboard flow autocomplete (panah/Enter),
  perataan chip saat teks mengandung newline + mention berurutan.
- **Rekomendasi:** (1) putuskan BUG-T11-01 — upsert diary atau ubah AC/PRD; (2) tambahkan jalur edit entri
  tersimpan (PRD "Edit kapan aja"); (3) kelompokkan Diary Book per bulan + filter saat data sudah persisten;
  (4) sebelum persistensi nyata dipasang, pindahkan isi jurnal dari `useState` yang ter-hidrasi ke sesi lokal
  seperti `useLocalData` (hindari `window.__NUXT__`); (5) debounce pencarian + virtualisasi bila entri per hari
  bisa besar.

---

# Putaran 2 — re-QA setelah perbaikan developer

**Tanggal:** 23 Okt 2026 · **QA:** Fajar · **Status task saat diuji:** `review`
**Rules dibaca ulang:** `CLAUDE.md` root, `.claude/rules/shared-security.md`,
`.claude/rules/shared-code-quality.md`, `apps/web/AGENTS.md` → `apps/web/CLAUDE.md` →
`apps/web/.claude/rules/{security,performance,code-quality}.md`, `docs/PRD.md` §F8 (baris 317–378).

## Verdict Putaran 2

**LULUS untuk seluruh AC T11.** BUG-T11-01 tidak bisa direproduksi lagi: simpan diary dua kali pada
tanggal yang sama menghasilkan **satu** halaman, isi terbaru menang, `id` dan `createdAt` tetap.
`memo.qa.test.ts` sekarang **14/14 lulus** (sebelumnya 13 lulus + 1 expected fail).

Satu regresi non-blocking ditemukan di jalur draf (`BUG-T11-02`, Medium): tulisan yang **belum
disimpan** hilang saat pindah tanggal lewat strip tanggal, karena `showDay()` mengganti draf dengan
halaman tanggal tujuan. Ini tidak termasuk acceptance criteria T11, tetapi melanggar PRD F8 baris 324
("Edit kapan aja, otomatis tersimpan sebagai draf lokal"). Rekomendasi: buka task lanjutan; jangan
ubah status task ini menjadi gagal hanya karena temuan ini.

## Perbaikan yang diverifikasi

| Perbaikan | Bukti kode | Hasil |
|---|---|---|
| `useMemos.add()` → `save()` upsert per tanggal | `apps/web/app/composables/useMemos.ts:65-92` — `memoOn()` dulu; bila ada, `{...existing, ...fields}` lalu `map` in-place (`:75-83`); hanya tanggal baru yang membuat `crypto.randomUUID()` (`:89`) | PASS |
| `id` & `createdAt` stabil saat update | `useMemos.ts:77` mempertahankan `existing.id`/`existing.createdAt`; test `useMemos.test.ts:30-54` | PASS |
| `memoOn()` util | `apps/web/app/utils/memo.ts:95-98`; test `memo.test.ts:84-88` | PASS |
| Editor memuat halaman tersimpan tanggal itu | `MemoEditor.vue:70-74` (`watch(day)` → `showDay`), `useMemoDraft.ts:35-41` | PASS |
| Simpan = update, bukan halaman baru | `MemoEditor.vue:76-80` memanggil `memos.save()` lalu `load(saved)`; test QA `memo.qa.test.ts:337-354` | PASS |
| Simpan dengan draf kosong tidak menimpa halaman | `useMemos.ts:66-67` return `null` bila teks kosong; tombol simpan disabled saat 0 kata (`MemoEditor.vue:162`); test QA baru `useMemos.upsert.qa.test.ts:55-61` | PASS |
| Tanggal berbeda tetap halaman terpisah | `useMemos.ts:85-91`; test `useMemos.test.ts:56-63` + QA `useMemos.upsert.qa.test.ts:47-53` | PASS |

## Verifikasi perubahan file test QA

`memo.qa.test.ts` masih **untracked** di git, jadi `git diff` tidak bisa dipakai. File dibandingkan
dengan versi putaran 1 yang direkonstruksi dari riwayat sesi QA:

- Satu-satunya perubahan semantik: `it.fails('simpan ulang diary ...')` → `it('simpan ulang diary ...')`
  (`apps/web/app/pages/app/memo.qa.test.ts:337`).
- Perbedaan lain hanya pembungkusan baris Prettier (mis. `expect(...).toBe(DAY.reflect)` dan array
  `seed(...)`); tidak ada nilai, selector, seed, atau assertion yang diubah/dilemahkan.
- Jumlah test tetap 14 dan tidak ada `.only`/`.skip`.
- Komentar `:335-336` masih berbunyi "menambah halaman baru" (stale). Ini sengaja tidak diubah karena
  batasan "hanya `it.fails` → `it`"; catat sebagai N9.

## Hasil per acceptance criteria (ulang)

| # | Acceptance criteria | Hasil | Bukti |
|---|---|---|---|
| 1 | 5 bagian harian: niat, perasaan + mood, afirmasi, refleksi (syukur/sedih/lebih baik), diary | **PASS** | `memo.qa.test.ts` test 1; `pages/app/memo.vue:63-93`; komponen journal/memo tidak berubah |
| 2 | Mention `@jadwal` jadi chip yang navigasi ke jadwal | **PASS** | `memo.qa.test.ts:174-215`; state `calendar-selected`/`calendar-anchor` terisi |
| 3 | Jadwal yang dihapus tidak error (mention yatim aman) | **PASS** | `memo.qa.test.ts:217-240`; chip jadi `<span>` "jadwal dihapus", klik tidak navigasi |
| 4 | Isi jurnal dirender aman — sanitasi, tanpa `v-html` data user | **PASS** | `memo.qa.test.ts:243-283`; payload `<script>`/`<img onerror>`/`<b>` tetap teks; scan `v-html\|innerHTML\|eval` = kosong |
| 5 | Satu jurnal per tanggal — simpan ulang = update, bukan duplikat | **PASS** | `memo.qa.test.ts:337-354` sekarang test normal dan lulus (`entries` = 1); `useMemos.test.ts:30-54` (`id`/`createdAt` tetap, teks baru menang); QA `useMemos.upsert.qa.test.ts` (4 test) |
| 6 | Pencarian lokal jalan offline | **PASS** | `memo.qa.test.ts:382-443`; scan `fetch/useFetch/useAsyncData` = kosong; filter 2.000 memo < 500 ms |
| 7 | Diary Book (daftar/riwayat) | **PASS dengan catatan** | `memo.qa.test.ts:358-380`; gap grouping per bulan/filter masih seperti N1 (tidak berubah) |

## Bug & temuan Putaran 2

### BUG-T11-02 — Draf yang belum disimpan hilang saat pindah tanggal (Medium, non-blocking AC T11)

**Langkah reproduksi:**
1. Buka `/app/memo` pada tanggal hari ini.
2. Ketik di diary: "Tulisan yang belum disimpan" (jangan klik simpan).
3. Klik tanggal lain di strip tanggal (mis. kemarin).
4. Klik kembali ke hari ini.

**Actual:** editor menampilkan isi halaman tersimpan hari ini (atau kosong); tulisan langkah 2 hilang.
**Expected:** draf per tanggal dipertahankan (PRD F8 baris 324: "Edit kapan aja, otomatis tersimpan
sebagai draf lokal").

**Bukti kode:** `useMemoDraft.ts:35-41` — `showDay()` selalu mengganti `draft.value` dengan halaman
tanggal tujuan; `MemoEditor.vue:70-74` memanggilnya setiap `day` berubah. Diverifikasi dengan probe test
sementara (dihapus setelah dijalankan): setelah `showDay(A) → edit → showDay(B) → showDay(A)`, draf
kembali ke isi halaman tersimpan, bukan tulisan yang belum disimpan.

**Catatan:** perilaku lama (sebelum fix) mempertahankan teks tetapi menampilkannya di tanggal yang salah;
perilaku baru membuang teks. Keduanya belum memenuhi PRD baris 324. Perbaikan yang disarankan: simpan
draf per tanggal (map `day → draft`) atau flush draf ke halaman tanggal asal sebelum pindah.

### Temuan non-blocking lain

| # | Severity | Temuan | Bukti |
|---|---|---|---|
| N8 | Low (kerapian) | `clear()` di `useMemoDraft` sekarang tidak dipakai siapa pun (dead code) setelah `MemoEditor` pindah ke `load()`/`showDay()` | `apps/web/app/composables/useMemoDraft.ts:46-48`; grep `useMemoDraft` tidak menemukan pemanggil `clear` |
| N9 | Low (test) | Komentar test QA masih menyatakan simpan ulang "menambah halaman baru", padahal bug sudah diperbaiki | `apps/web/app/pages/app/memo.qa.test.ts:335-336` |
| N10 | Low (saat persistensi) | Upsert hanya memperbarui halaman pertama yang cocok. Bila data lama sudah berisi 2 memo tanggal sama, duplikat tidak digabung/dibersihkan otomatis | `apps/web/app/composables/useMemos.ts:75-83`; mock saat ini tidak punya duplikat (`composables/memos/mock.ts`), jadi belum reproducible |
| N11 | Low (produk) | Design source masih multi-halaman (`"Halaman ke-N hari ini"`) dan i18n `memo.titleNextPage` masih ada/tak dipakai, sementara AC/PRD memilih satu halaman per tanggal | `apps/web/source-ui/Desktop.dc.html:3946`; `apps/web/i18n/locales/id.json:900`; PRD `docs/PRD.md:321-322,360` |

## Cek konflik produk & scope

- **Konflik AC vs design source diselesaikan mengikuti AC/PRD:** implementasi sekarang upsert per
  tanggal. `docs/PRD.md` **tidak diubah** (`git diff -- docs` kosong), `i18n` tidak diubah, design source
  tidak diubah. Developer mengikuti AC, bukan design multi-halaman. Design source + key
  `memo.titleNextPage` kini stale dan perlu diputuskan di task produk terpisah (N11).
- **Tidak ada perubahan di luar scope memo/journal:** `git status --short | grep -Ei 'memo|journal'`
  hanya menampilkan `MemoEditor.vue`, `useMemoDraft.ts`, `useMemos.ts`, `useMemos.test.ts`,
  `utils/memo.ts`, `utils/memo.test.ts`, `useMemoDraft.test.ts` (baru), `memo.qa.test.ts` (QA), dan
  `useMemos.upsert.qa.test.ts` (QA putaran 2). `memo.vue`, `MemoEntry.vue`, `MemoDateStrip.vue`, dan
  komponen `journal/*` tidak berubah. Area calendar/account/crypto/io (WIP agent lain) tidak disentuh.
- **Tidak ada commit, tidak ada perubahan status Ergonio, tidak ada kode produk yang diperbaiki QA.**

## Perintah & hasil Putaran 2

```bash
# Wajib: test QA halaman Journal
pnpm --filter @improve-personal/web exec vitest run app/pages/app/memo.qa.test.ts
# → Test Files 1 passed (1) · Tests 14 passed (14) · 4.59s

# Regresi terarah + test upsert QA baru
pnpm --filter @improve-personal/web exec vitest run \
  app/composables/useMemos.upsert.qa.test.ts \
  app/composables/useMemos.test.ts \
  app/composables/useMemoDraft.test.ts \
  app/utils/memo.test.ts \
  app/utils/journal.test.ts \
  app/pages/app/memo.qa.test.ts
# → Test Files 6 passed (6) · Tests 38 passed (38) · 4.45s

# Typecheck & lint
pnpm --filter @improve-personal/web run typecheck        # exit 0
npx eslint <file produk + test yang berubah> --max-warnings 0   # exit 0
npx prettier --check <file produk + test yang berubah>          # All matched files use Prettier code style
```

## Cek tiga pilar (Putaran 2)

- **Keamanan — tidak ada regresi.** Tidak ada `v-html`/`innerHTML`/`eval` di komponen journal/memo
  (test statis tetap lulus); upsert hanya menyentuh store in-memory, tidak menambah jaringan/server;
  tidak ada secret/log. Catatan N3 (isi jurnal di `useState` yang ter-hidrasi) tetap terbuka dan belum
  menjadi bug karena data masih mock.
- **Performa — tidak ada regresi terukur.** Upsert memakai `find` + `map` O(n) dengan n = jumlah halaman
  jurnal (kecil untuk data pribadi); tidak ada dependency baru; filter 2.000 memo tetap < 500 ms di test.
- **Kerapian — baik, dengan sisa minor.** `nuxi typecheck`, ESLint, dan Prettier hijau; test regresi
  ditambahkan; tidak ada `.only`/`.skip`. Sisa: `clear()` dead code (N8), komentar test stale (N9),
  duplikat legacy belum dimigrasi (N10), design/i18n multi-halaman stale (N11).

## Coverage & sisa risiko (Putaran 2)

- **Tertutup:** seluruh AC T11 di atas, upsert (`id`/`createdAt` stabil, isi terbaru menang, tanggal
  berbeda terpisah, draf kosong tidak menimpa), tipe/lint/format.
- **Belum tertutup permanen:** draf lintas tanggal (BUG-T11-02 hanya diverifikasi probe sementara —
  tambahkan test setelah perilaku produk diputuskan), E2E browser/hidrasi nyata, persistensi/E2EE,
  keyboard flow autocomplete, mobile, aksesibilitas strip tanggal (N7 lama).
- **Rekomendasi:** (1) tutup BUG-T11-01 di task ini; (2) buka task lanjutan untuk BUG-T11-02 (draf per
  tanggal) + N8/N9; (3) putuskan design multi-halaman vs AC satu halaman, lalu rapikan
  `memo.titleNextPage`; (4) migrasi/dedupe bila data jurnal sudah persisten.
