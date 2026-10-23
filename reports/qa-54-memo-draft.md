# QA Task #54 — Draf jurnal hilang saat pindah tanggal (BUG-T11-02)

**Task:** `981487e7-c7a6-4bad-87ac-a780469da5fe` · project `personal-productivity` · status saat dicek: `review`
**Tanggal:** 23 Okt 2026 (putaran 1 ~20:16, putaran 2 ~21:40) · **QA:** Fajar
**Putaran:** 2 — re-QA rework `BUG-54-01`. Verdict putaran 2 di bawah; verdict + bukti putaran 1 dipertahankan
apa adanya sebagai arsip bug asli.
**Rules dibaca:** `CLAUDE.md` root, `.claude/rules/{shared-security,shared-code-quality,ergonio-status-flow}.md`,
`apps/web/AGENTS.md` → `apps/web/CLAUDE.md` → `apps/web/.claude/rules/{security,performance,code-quality}.md`,
`apps/web/nuxt.config.ts` (`routeRules`), `ARCHITECTURE.md` (Q7, penulis per origin), `docs/PRD.md` F8.

---

## Verdict — putaran 2 (re-QA rework BUG-54-01)

**LULUS dengan catatan.** `BUG-54-01` (satu klik "Simpan ke jurnal" menghapus catatan Daily Goal Review)
**hilang**: enam skenario reproduksi, termasuk alur asli lewat komponen `DailyGoalReviewCard`, sekarang
lossless dan tidak menduplikasi. AC-A tidak ada yang turun, dan tidak ada kebocoran baru di batas panjang,
XSS, dua tab, atau draf yatim. Dua temuan **non-blocking** dicatat: pemotongan `MEMO_TEXT_MAX` pada kasus
ekstrem (R1, Low) dan risiko laten base version yang hanya di memori (R2).

| Item | Status | Bukti |
|---|---|---|
| BUG-54-01 jalur A (draf belum simpan -> append -> simpan) | **HILANG** | `app/pages/app/memo.conflict.qa.test.ts:134-158`; probe P11 (kartu asli) |
| BUG-54-01 jalur B (halaman tersimpan -> append -> simpan tanpa edit) | **HILANG** | `memo.conflict.qa.test.ts:160-177`; probe P3 (simpan 2x) |
| Append saat editor terbuka (tanpa remount) | **HILANG** | `memo.conflict.qa.test.ts:179-190`; probe P2 (2 append berurutan) |
| Penulis non-append (ganti seluruh isi) | lossless | `memo.conflict.qa.test.ts:192-210`; probe P6 (judul/perasaan) |
| Draf tanggal lain tidak tersentuh | aman | `memo.conflict.qa.test.ts:231-248`; probe P8 |
| Simpan menghapus draf tanggal itu / logout semua | aman (tetap) | suite wajib 58/58 + `useLogout.test.ts` |
| Reload di tengah draf (base hanya di memori) | aman untuk draf; **laten** bila halaman kelak dipersistenkan | probe P1/P1b/P12 -> **R2** |
| `MEMO_TEXT_MAX` / XSS / dua tab / draf yatim | tidak ada kebocoran baru, 1 temuan Low | probe P4/P4b/P5 -> **R1** |

### Bukti BUG-54-01 hilang (bukan cuma test hijau)

Akar yang dilaporkan putaran 1: `showDay()` early-return tanpa revalidasi + `save()` mengirim seluruh draf tanpa
base version. Yang diverifikasi di kode sekarang:

- `useMemoDraft.ts:182-191` (`reconcile`) - halaman terkini dibandingkan dengan snapshot `saved`; draf bersih
  mengadopsi halaman (dan key draf basi dibuang), draf kotor digabung lewat `mergeValues`.
- `useMemoDraft.ts:207-217` (`showDay` untuk tanggal yang sama) + `:222-225` (`prepareSave`) - dua titik panggil,
  jadi perubahan luar tertangkap baik saat editor dibuka ulang maupun tepat sebelum tombol simpan diproses.
- `MemoEditor.vue:105-112` - `save()` memakai nilai hasil `prepareSave`, bukan `draft.value` mentah.

Reproduksi yang dijalankan (probe sementara `app/pages/app/probe54.tmp.qa.test.ts`, 15 test, dihapus setelah
dijalankan; salinan di `/tmp/opencode/qa54/probe54.tmp.qa.test.ts.txt`):

| Skenario | Hasil aktual |
|---|---|
| (a) draf `Draf saya` -> `append('Catatan review goal')` -> remount -> simpan | `Catatan review goal\n\nDraf saya` - review utuh, muncul sekali |
| (a') alur asli: editor -> kartu `DailyGoalReviewCard` ("Simpan ke jurnal") -> kembali -> simpan | `Minggu ini lari 3x\n\n#[g1]\n\nDraf saya yang belum disimpan` - mention goal & draf selamat, tidak duplikat |
| (b) halaman `Tulisan awal.` -> append -> simpan tanpa edit | `Tulisan awal.\n\nCatatan review goal` - sekali, tidak hilang |
| (b') tombol simpan diklik 2x berturut-turut | idempoten, tetap satu catatan |
| (c) penulis lain `memos.save` mengganti seluruh isi | kedua versi ada (`Halaman dari penulis lain.` + draf) |
| (d) draf kemarin + append hari ini | key `ip-memo-draft-2025-09-09` byte-identik sebelum/sesudah reconcile |
| (e) simpan -> key tanggal itu `null`, key tanggal lain tetap | `useMemoDraft.test.ts:110-123` + probe P1 |
| (f) reload (state Nuxt dibuang, localStorage tetap) -> simpan | draf kembali utuh, simpan tidak menduplikasi; append sesudah reload ikut digabung |
| gabungan tanpa simpan ditulis ulang ke localStorage | ya - `ip-memo-draft-*` berisi hasil merge, reload berikutnya tidak mundur |

Catatan untuk (f): `saved` (base version) hanya hidup di `useState` (`useMemoDraft.ts:164`). Aman selama halaman
jurnal juga in-memory (`useMemos.ts:49`) karena reload membuang keduanya; lihat **R2** untuk kondisi masa depan.

### Temuan putaran 2

**R1 - Merge memotong catatan penulis luar saat draf mendekati `MEMO_TEXT_MAX` (Low, non-blocking).**
- Repro (probe P4b): halaman 4.000 karakter `A`; user menulis ulang jadi 5.000 karakter `C` (tidak berawalan isi
  lama); `memos.append(TODAY, 'Catatan review goal')`; klik simpan.
- Expected: catatan review ikut tersimpan (atau ada peringatan). Actual: hasil tepat 5.000 karakter dan
  `text.includes('Catatan review goal') === false` - catatan review dibuang diam-diam.
- Penyebab: `useMemoDraft.ts:110` menaruh teks user lebih dulu (`joinText(mine, externalTail)`), lalu
  `useMemoDraft.ts:141` memotong `MEMO_TEXT_MAX` dari depan, sehingga ekor eksternal (paling akhir) terpotong.
- Dampak terbatas: hanya saat draf ~5.000 karakter **dan** isi lama diubah di awal/tengah. Arah sebaliknya aman
  (probe P4: draf = isi lama + tambahan user -> review utuh, panjang <= 5.000).
- Saran: dahulukan `externalTail`, atau sisakan anggaran untuk ekor eksternal saat memotong.

**R2 - Base version hanya di memori: draf dari localStorage tidak dibandingkan dengan halaman saat mount (latent).**
- Repro (probe P12): store sudah berisi halaman `Tulisan awal.\n\nCatatan review goal` saat mount, localStorage
  berisi draf lama `Draf dari sesi lama` -> editor menampilkan draf lama; klik simpan -> halaman jadi
  `Draf dari sesi lama`; isi halaman + catatan review hilang tanpa peringatan.
- Penyebab: `useMemoDraft.ts:213-216` mengisi `saved` dari halaman (base = halaman) sementara `draft` dari
  storage; karena `base === current`, `reconcile` di `:222-225` no-op dan konflik tidak terlihat.
- Status hari ini: **belum terjangkau dengan data user nyata** - jurnal fase 1 in-memory (`useMemos.ts:49`), jadi
  satu-satunya halaman yang bisa muncul lagi setelah reload adalah data contoh `createMemosMock` (hari -4/-7/-8).
  Menjadi jalur kehilangan data nyata begitu halaman jurnal dipersistenkan (`useMemos.ts:42-46`).
- Saran: simpan base/snapshot bersama draf di localStorage, atau saat mount bandingkan draf storage dengan
  halaman lalu merge (pola `reconcile` yang sudah ada).

**Catatan kecil (tidak mengubah verdict):**
- Merge berjalan senyap: teks berubah saat tombol simpan ditekan tanpa notifikasi (risiko yang diakui developer).
  UX, bukan data loss.
- Dua tab tetap last-write-wins (tidak ada listener `storage`); karena jurnal in-memory, tab lain bahkan tidak
  melihat halaman tab pertama. Risiko lama, bukan regresi.
- `prepareSave(day, ...)` mengembalikan draf apa adanya bila `draftDay !== day` (`:222-225`). Tidak terjangkau dari
  UI (`MemoEditor.vue:99-103` menyinkronkan `day` -> `showDay`), tapi layak di-hardening bila ada pemakai kedua.
- Label `memo.draftKept` masih "✓ Draf disimpan selama sesi" (`i18n/locales/id.json:959`) - sekarang understate
  (draf bertahan lintas reload). Komentar basi `useMemos.ts` (N1 putaran 1) sudah diperbarui di rework.
- Draf plaintext tanpa TTL (B-54.1/B-54.2) tidak berubah: tetap risiko yang diterima, lihat putaran 1.

## Perintah & hasil verbatim — putaran 2

### 1. Suite wajib (7 file, termasuk test regresi baru)

```
$ cd apps/web && pnpm exec vitest run app/pages/app/memo.draft.qa.test.ts app/composables/useMemoDraft.qa.test.ts \
    app/composables/useMemoDraft.test.ts app/pages/app/memo.qa.test.ts app/pages/app/memo.conflict.qa.test.ts \
    app/composables/useMemos.test.ts app/utils/memo.test.ts
VITEST_EXIT=0

 RUN  v5.0.3 /media/DATA/Development/stackinnov/products/improve-personal/apps/web

 Test Files  7 passed (7)
      Tests  58 passed (58)
   Start at  21:45:05
   Duration  6.70s (tests 48%, transform 23%, environment 21%, setup 5%, import 3%)
```

Test regresi baru dijalankan 3x terpisah: `6 passed (6)` setiap kali (`memo.conflict.qa.test.ts`).

### 2. Typecheck

```
$ cd apps/web && pnpm exec nuxt typecheck
TYPECHECK_EXIT=0
(tidak ada output)
```

### 3. ESLint (file sumber + test baru)

```
$ cd apps/web && pnpm exec eslint app/composables/useMemoDraft.ts app/composables/useMemos.ts \
    app/components/features/memo/MemoEditor.vue app/pages/app/memo.conflict.qa.test.ts --max-warnings 0
ESLINT_EXIT=0
(tidak ada output)
```

### 4. Prettier

```
$ pnpm exec prettier --check apps/web/app/composables/useMemoDraft.ts apps/web/app/composables/useMemos.ts \
    apps/web/app/components/features/memo/MemoEditor.vue apps/web/app/pages/app/memo.conflict.qa.test.ts
PRETTIER_EXIT=0
Checking formatting...
All matched files use Prettier code style!
```

### 5. Regresi `app/pages/app` + `app/composables` (5 run)

```
$ cd apps/web && pnpm exec vitest run app/pages/app app/composables
  run 1: 3 failed | 334 passed (337)
  run 2: 1 failed | 336 passed (337)
  run 3: 1 failed | 336 passed (337)
  run 4: 2 failed | 335 passed (337)
  run 5: 1 failed | 336 passed (337)
```

Rincian kegagalan:

- **Selalu gagal (di luar lingkup #54):** `app/composables/useBackupImport.modeProbe.qa.test.ts` - file probe
  **untracked** milik task #55 (bukan file yang diubah rework ini). Bukan regresi memo.
- **Flaky 1x/5** (lolos saat diulang dan lolos 5/5 saat file-nya dijalankan sendiri):
  `memo.draft.qa.test.ts:196` ("simpan menghapus draf tanggal itu saja": key draf hari itu masih ada) dan
  `memo.qa.test.ts:371` (jumlah tombol tanggal 5 vs 3) serta `overview.range.qa.test.ts` (streak `0` vs `2`).
  Mesin saat itu menjalankan 54 worker paralel bersama task lain. `app/pages/app/memo.draft.qa.test.ts` diisolasi:
  `5x -> 8 passed (8)`.
- Laporan lengkap: `/tmp/opencode/qa54/regression-*.log`, `/tmp/opencode/qa54/draft-*.log`.

### 6. Regresi komponen memo/daily/journal

```
$ cd apps/web && pnpm exec vitest run app/components/features/daily app/components/features/memo app/components/features/journal
EXIT=0
      Tests  16 passed (16)
```

### 7. Probe rework (sementara, sudah dihapus)

```
$ cd apps/web && pnpm exec vitest run app/pages/app/probe54.tmp.qa.test.ts
 Test Files  1 failed (1)
      Tests  2 failed | 13 passed (15)
```

Dua kegagalan itu **disengaja**: P4b mendokumentasikan R1 dan P12 mendokumentasikan R2. 13 skenario lain
(termasuk seluruh reproduksi BUG-54-01 jalur A/B, alur kartu asli, double-click, XSS, isolasi tanggal, batas
panjang normal) lulus. File probe dihapus dari repo setelah dijalankan.

---

## Verdict putaran 1 (sebelum rework) — GAGAL

> Status: sudah diperbaiki developer dan **lulus di putaran 2** (lihat Verdict putaran 2 di atas). Bagian ini
> dipertahankan sebagai bukti bug asli.

**GAGAL — 1 bug mayor (kehilangan data user), 6/6 AC-A lulus.**

Enam acceptance criteria yang diminta **semua hijau** dan terbukti dengan test (37 test existing + 15 test
QA baru). Kegagalan berasal dari **regresi interaksi** yang dibuka oleh fix ini: editor mempertahankan draf
setelah simpan (`load()`), sementara fitur lain (`DailyGoalReviewCard`) menulis ke halaman jurnal yang sama.
Akibatnya **satu klik "Simpan ke jurnal" menghapus catatan review goal yang sudah tersimpan**, tanpa
peringatan. Detail: `BUG-54-01`.

Kalau tim memutuskan temuan itu di luar lingkup #54, AC-A tetap boleh dianggap hijau — tetapi QA tidak
menandai `done` untuk jalur yang bisa menghapus tulisan user secara diam-diam.

---

## Scope & test plan

| Diuji | Level | Alasan |
|---|---|---|
| Draf per tanggal, bolak-balik 3 tanggal | composable + halaman (mount nyata) | Bug aslinya dilaporkan lewat UI (klik strip tanggal), jadi wiring `watch(day) → showDay` wajib dibuktikan, bukan cuma logika composable |
| Draf bertahan setelah reload | halaman | AC-54.2; simulasi reload = unmount + `clearNuxtState` (state in-memory hilang, `localStorage` tetap) |
| Simpan menghapus draf tanggal itu saja | halaman | AC-54.3; memastikan `load()` tidak menyapu draf tanggal lain |
| Storage rusak / tipe salah / perasaan asing / tanggal tidak ISO | composable + halaman | AC-54.4; termasuk `localStorage` yang melempar (`SecurityError`) dan penuh (`QuotaExceededError`) |
| Logout membersihkan `ip-*` | composable + `useLogout` existing | AC-54.5; prefix `ip-` adalah kontrak `clearAppStorage` |
| `clear()` dead code, lint/prettier/typecheck | statis | AC-54.6 |
| Isi draf berisi HTML | halaman | XSS: draf dirender di `<textarea>`/`<input>`, bukan `v-html` |

**Tidak diuji (dan alasannya):** INP/Lighthouse nyata untuk penulisan per keystroke (butuh browser + build
production, tidak ada regresi terukur di lingkungan test); dua tab bersamaan (`storage` event memang tidak
ditangani — lihat sisa risiko); Maestro/Detox (task web saja); build production.

Data uji: 3 tanggal (`2025-09-10` hari ini, `09-09`, `09-03`) dengan/tanpa halaman tersimpan; isi draf
normal, HTML, judul/teks kelebihan panjang, `feelings` berisi nilai tak dikenal & duplikat.

---

## Hasil per acceptance criteria

| AC | Hasil | Bukti |
|---|---|---|
| **54.1** Draf per tanggal, bolak-balik 3 tanggal | **PASS** | `useMemoDraft.test.ts:66-79`; QA `memo.draft.qa.test.ts` "bolak-balik 3 tanggal…" — teks + judul tiap tanggal utuh, key terpisah |
| **54.2** Draf bertahan setelah reload | **PASS** | `useMemoDraft.test.ts:81-97`; QA `memo.draft.qa.test.ts` "…setelah reload halaman" (unmount + state dibuang, draf dimuat dari `localStorage`) |
| **54.3** Simpan menghapus draf tanggal itu, jurnal normal, draf lain aman | **PASS** | `useMemoDraft.test.ts:110-123`; QA `memo.draft.qa.test.ts` "simpan menghapus draf tanggal itu saja" + `useMemoDraft.qa.test.ts` "load() hanya menghapus draf tanggal yang disimpan" |
| **54.4** Data rusak/tanggal invalid diabaikan tanpa error | **PASS** | `useMemoDraft.ts:48-64` (guard `import.meta.client` + `isIsoDate`, cek tipe, whitelist `MEMO_FEELINGS`, potong `MEMO_TITLE_MAX`/`MEMO_TEXT_MAX`, `try/catch`); `useMemoDraft.test.ts:125-145`; QA `useMemoDraft.qa.test.ts` 5 test (JSON bukan objek, storage melempar, storage penuh, panjang berlebih, tanggal invalid) |
| **54.5** Logout membersihkan semua key `ip-` | **PASS** | `MEMO_DRAFT_PREFIX = 'ip-memo-draft-'` (`useMemoDraft.ts:14`) ⊂ `APP_STORAGE_PREFIX` (`useLogout.ts:9-17`, `shared/tech-identity.ts:32`); `useLogout.test.ts:58-79` membuktikan `logout()` menyapu `ip-*`; `useMemoDraft.test.ts:147-162` membuktikan draf ikut tersapu dan key situs lain selamat |
| **54.6** `clear()` dihapus, test regresi ada, suite hijau | **PASS** | `useMemoDraft.ts` tidak lagi mengekspor `clear` (grep bersih; `MemoEditor.vue:30,105-109` memakai `load`); 37/37 test existing + 15 test QA baru; eslint/prettier/typecheck hijau (perintah di bawah) |

**Klaim handoff yang diverifikasi satu per satu**

| Klaim developer | Hasil | Bukti |
|---|---|---|
| Draf per tanggal di `ip-memo-draft-<tanggal>` | Benar | `useMemoDraft.ts:11-14`, `67-76` |
| Ditulis tiap perubahan (`watch deep` + `flush:'sync'`) | Benar | `useMemoDraft.ts:93-102` |
| Dimuat saat `showDay`, dipertahankan saat pindah tanggal | Benar | `useMemoDraft.ts:118-126`; `MemoEditor.vue:99-103` |
| Dibersihkan setelah simpan (`load`) | Benar | `useMemoDraft.ts:99,128-132`; `MemoEditor.vue:105-109` |
| Dibersihkan saat logout (prefix `ip-`) | Benar | `useLogout.ts:12-17,43` |
| Validasi JSON/tipe/panjang/perasaan/tanggal + guard client + try/catch | Benar | `useMemoDraft.ts:48-76`; 5 test QA baru |
| `clear()` dead code dihapus | Benar | tidak ada export `clear`; grep `clear()` di `MemoEditor` = kosong |
| `MemoEditor.vue`/`utils/memo.ts` tidak diubah untuk draf | Benar (hanya wiring `showDay`/`load` di editor) | `git show 1c34d5c -- apps/web/app/components/features/memo/MemoEditor.vue` |
| Dua instance composable menulis key yang sama | Benar, tapi **idempoten** (state `useState` bersama, nilai sama) — bukan sumber bug | `MemoEditor.vue:30` + `JournalFeeling.vue:10`; tidak ada instance yang memanggil `showDay` untuk tanggal berbeda |

---

## Bug & temuan

### BUG-54-01 — Simpan draf menimpa (menghapus) catatan review goal yang lebih baru (Mayor, data loss)

**Langkah reproduksi (jalur A — draf belum disimpan):**
1. Buka `/app/memo` tanggal hari ini, ketik `Draf saya yang belum disimpan` (jangan simpan).
2. Pindah ke Home (`/app`), jawab kartu **Daily Goal Review** → `DailyGoalReviewCard.saveAnswer()` menambahkan
   catatan ke halaman jurnal **hari ini** (`memos.append(today, note)`).
3. Kembali ke `/app/memo` (SPA navigation; komponen editor remount).
4. Editor masih menampilkan draf langkah 1 (ini benar, AC-54.1). Klik **"Simpan ke jurnal"**.

- **Expected:** catatan review langkah 2 tetap ada (merge), atau minimal ada peringatan konflik sebelum menimpa.
- **Actual:** halaman jurnal hari ini menjadi `Draf saya yang belum disimpan` — catatan review **hilang tanpa peringatan**.

**Jalur B (halaman sudah pernah disimpan):** simpan `Tulisan awal.` → jawab review di Home → kembali ke
`/app/memo` → editor masih `Tulisan awal.` → klik **Simpan** tanpa mengubah apa pun: catatan review hilang.

**Bukti kode:**
- `apps/web/app/components/features/memo/MemoEditor.vue:105-109` — `save()` mengirim **seluruh** `draft` sebagai halaman.
- `apps/web/app/composables/useMemoDraft.ts:118-126` — `showDay()` **early return** bila `draftDay` sama
  (`:119`), jadi saat editor remount untuk tanggal yang sama, draf lama tidak disegarkan terhadap halaman
  yang berubah.
- `apps/web/app/composables/useMemoDraft.ts:128-132` — `load()` mempertahankan halaman tersimpan di editor
  dan hanya menyimpan snapshot `saved` saat itu; perubahan halaman setelahnya tidak pernah dibandingkan.
- `apps/web/app/composables/useMemos.ts:65-92` — `save()` = upsert yang **mengganti** `title/text/feelings`
  halaman (`:75-83`), bukan merge.
- `apps/web/app/components/features/daily/DailyGoalReviewCard.vue:59-66` — writer kedua ke halaman yang sama
  (`:64`), tanpa memberi tahu draf.
- Kontrak arsitektur memang mewanti-wanti konflik penulis: `ARCHITECTURE.md:158` ("dua tab bisa saling menimpa").

**Bukti reproduksi (probe sementara, dijalankan lalu dihapus sesuai konvensi report QA sebelumnya):**

```ts
// app/pages/app/probe2.tmp.qa.test.ts (dihapus setelah dijalankan)
seed()                                        // memos: [], memo-selected: TODAY
let wrapper = await mountSuspended(MemoPage)
await wrapper.find('section.sheet textarea.paper').setValue('Draf saya yang belum disimpan')
expect(localStorage.getItem('ip-memo-draft-2025-09-10')).toContain('Draf saya yang belum disimpan')

useMemos().append(TODAY, 'Catatan review goal')          // = DailyGoalReviewCard.saveAnswer()
expect(useMemos().memos.value[0]?.text).toBe('Catatan review goal')

wrapper.unmount(); wrapper = await mountSuspended(MemoPage)   // pergi ke Home lalu kembali
expect(editorValue(wrapper)).toBe('Draf saya yang belum disimpan')

await clickSave(wrapper)                                     // tombol "Simpan ke jurnal"
expect(useMemos().memos.value[0]?.text)                      // AKTUAL: 'Draf saya yang belum disimpan'
// EXPECTED: 'Catatan review goal' + draf (atau ada peringatan konflik)
```

Hasil aktual (output vitest):
`AssertionError: expected 'Tulisan awal.' to be 'Tulisan awal.\n\nCatatan review goal'` (jalur B) —
catatan review benar-benar hilang setelah klik simpan.

**Catatan cakupan:** jalur "klik simpan lagi tanpa mengedit" **baru** muncul karena fix ini mempertahankan isi
halaman di editor setelah simpan (`load()`); sebelum perubahan, `save()` memanggil `clear()` dan editor kosong
di remount sehingga tombol simpan nonaktif. Jalur "ketik lagi lalu simpan" sudah bisa menimpa sejak upsert
(`useMemos.save`) ada, tetapi fix draf ini tidak menambal/mendeteksinya. Karena itu temuan dihitung sebagai
regresi task ini.

**Rekomendasi perbaikan (untuk `dimas`):**
1. Saat `showDay(day, page)` dipanggil untuk tanggal yang sama, bandingkan `page` dengan `saved.value`; kalau
   berbeda (halaman berubah di luar editor) dan draf tidak "kotor", muat ulang dari halaman + buang key draf.
2. Kalau draf kotor dan halaman berubah, jangan diam-diam menimpa: gabungkan teks atau tampilkan konflik
   ("Halaman ini berubah di tempat lain") sebelum `save()`.
3. Alternatif minimal: `save()` memakai `memos.save` dengan base version/hash halaman; tolak simpan bila
   halaman di store sudah berubah sejak draf dimuat.

---

### Risiko keamanan yang diterima — draf jurnal plaintext di `localStorage` (B-54.1, Medium)

- Draf berisi **teks jurnal bebas** (data pribadi paling sensitif di app) ditulis plaintext ke
  `localStorage` `ip-memo-draft-<tanggal>` sampai disimpan/logout, tanpa TTL (`useMemoDraft.ts:67-76`).
- Ini bertentangan dengan `ARCHITECTURE.md:33` (Q7: "Data lokal di web terenkripsi? Ya: IndexedDB simpan
  ciphertext, plaintext cuma di memori setelah unlock") dan komentar `useMemos.ts:41-45` yang masih menyatakan
  "Isi jurnal tidak ditulis ke localStorage".
- Sesuai AC-B, ini **bukan blocker #54** (PRD F8:324 memang meminta draf lokal), tetapi wajib dicatat sebagai
  risiko yang diterima dan ditindaklanjuti: enkripsi draf dengan kunci perangkat (pola `ip-` + sealed record di
  `packages/core`), atau simpan draf di IndexedDB sebagai ciphertext, plus TTL/pruning.
- Permukaan serangan yang tersisa: skrip same-origin (XSS) dan siapa pun yang memegang perangkat. Tidak ada
  XSS di jalur ini — draf dirender lewat `v-model` `<textarea>`/`<input>`, bukan `v-html`
  (`memo.qa.test.ts:269-283` memindai seluruh `components/features/{journal,memo}` + `memo.vue`), dan QA
  menambah test halaman yang memuat draf berisi `<img onerror>`/`<script>` → tetap teks, `window.__pwned`
  tidak terpasang (`memo.draft.qa.test.ts` "isi draf berisi HTML…").

### Temuan minor / kerapian (non-blocking)

| # | Temuan | Bukti | Dampak |
|---|---|---|---|
| N1 | Komentar `useMemos.ts:41-45` masih bilang isi jurnal tidak ditulis ke `localStorage`, padahal draf menulisnya plaintext | `useMemos.ts:41-45` vs `useMemoDraft.ts:67-76` | Reviewer bisa salah menyimpulkan postur data-at-rest |
| N2 | Label "✓ Draf disimpan selama sesi" sekarang understate: draf bertahan lintas reload | `MemoEditor.vue:134`, `i18n/locales/id.json:959` | Copy tidak salah, tapi menyesatkan soal persistensi |
| N3 | Draf yatim: kalau halaman tanggal dihapus (`MemoEntry` remove) dan tanggal itu tak punya mood, tanggal keluar dari strip → draf tidak bisa dijangkau lagi, PII tertinggal sampai logout | `memo.vue:32-37` (`journalDates`), `useMemos.ts:120-122` | TTL/pruning belum ada (B-54.2) |
| N4 | Tulis `localStorage` sinkron tiap keystroke (`flush:'sync'`), JSON.stringify hingga 5.000 karakter | `useMemoDraft.ts:93-102` | Risiko INP di perangkat lambat; belum terukur, bukan regresi yang terbukti |
| N5 | `addPrompt()` bisa melewati `MEMO_TEXT_MAX` secara programatik → `save()` memotong diam-diam | `MemoEditor.vue:89-93`, `useMemos.ts:66` | Pre-existing, di luar #54 |

---

## Tiga pilar

**Keamanan**
- Validasi draf ketat dan fail-closed: JSON rusak/tipe salah/bukan objek → `null`, `feelings` di-whitelist,
  panjang dipotong, tanggal divalidasi `isIsoDate`, semua I/O dibungkus `try/catch`
  (`useMemoDraft.ts:48-76`) — diverifikasi 5 test baru (termasuk `Storage.prototype.getItem/setItem` melempar).
- Tidak ada XSS: draf hanya masuk `v-model`; pemindaian `v-html|innerHTML|eval|new Function` di komponen
  jurnal/memo bersih; test halaman dengan payload HTML lulus.
- Logout/hapus akun menyapu key `ip-*` (`useLogout.ts:12-17,43`; `useAccountDeletion.ts:162`).
- Tidak ada request jaringan baru (dijaga `memo.qa.test.ts:428-443`).
- **Catatan:** draf plaintext di `localStorage` (B-54.1) adalah risiko yang diterima, lihat atas.

**Performa**
- Tidak ada I/O jaringan; baca/tulis draf O(1) per tanggal, satu `JSON.parse`/`stringify` kecil.
- `watch` deep + `flush:'sync'` menulis setiap perubahan: aman secara fungsional (tidak ada keystroke hilang),
  tapi `localStorage.setItem` sinkron di main thread. Belum ada angka INP; rekomendasi debounce 200–300 ms +
  flush saat `pagehide`/`visibilitychange` bila profiling menunjukkan biaya.
- Test anggaran pencarian 2.000 memo tetap lulus (< 500 ms), tidak tersentuh perubahan ini.

**Kerapian**
- `clear()` dead code benar-benar hilang; tidak ada `it.only`/`.skip`/test di-comment di file yang disentuh.
- eslint `--max-warnings 0`, prettier, dan `nuxt typecheck` hijau.
- Dokumentasi: dua komentar/label basi (N1, N2) perlu diperbarui.

---

## Perintah verifikasi & hasil verbatim

### 1. Suite wajib (existing)

```
$ pnpm --filter @improve-personal/web exec vitest run app/composables/useMemoDraft.test.ts app/pages/app/memo.qa.test.ts app/composables/useMemos.test.ts app/utils/memo.test.ts
VITEST_EXIT=0

 RUN  v5.0.3 /media/DATA/Development/stackinnov/products/improve-personal/apps/web


 Test Files  4 passed (4)
      Tests  37 passed (37)
   Start at  20:16:18
   Duration  5.93s (tests 64%, transform 19%, environment 11%, setup 3%, import 2%)
```

### 2. Suite wajib + test QA baru

```
$ pnpm --filter @improve-personal/web exec vitest run app/composables/useMemoDraft.test.ts app/pages/app/memo.qa.test.ts app/composables/useMemos.test.ts app/utils/memo.test.ts app/composables/useMemoDraft.qa.test.ts app/pages/app/memo.draft.qa.test.ts
VITEST_EXIT=0

 Test Files  6 passed (6)
      Tests  52 passed (52)
   Duration  6.90s (tests 53%, transform 23%, environment 17%, setup 3%, import 3%)
```

### 3. ESLint (file sumber)

```
$ pnpm --filter @improve-personal/web exec eslint app/composables/useMemoDraft.ts --max-warnings 0
ESLINT_EXIT=0
(tidak ada output)
```

### 4. Prettier

```
$ pnpm exec prettier --check apps/web/app/composables/useMemoDraft.ts
PRETTIER_EXIT=0
Checking formatting...
All matched files use Prettier code style!
```

### 5. Typecheck

```
$ cd apps/web && pnpm exec nuxt typecheck
EXIT=0
(tidak ada output)
```
Efektivitas typecheck dibuktikan dengan menyisipkan error tipe sementara di file QA
(`TS2322: Type 'string' is not assignable to type 'number'`, exit 2), lalu dikembalikan; run berikutnya exit 0.

### 6. Lint/format file test baru

```
$ pnpm --filter @improve-personal/web exec eslint app/composables/useMemoDraft.qa.test.ts app/pages/app/memo.draft.qa.test.ts --max-warnings 0
ESLINT_EXIT=0

$ pnpm exec prettier --check apps/web/app/composables/useMemoDraft.ts apps/web/app/composables/useMemoDraft.test.ts apps/web/app/composables/useMemoDraft.qa.test.ts apps/web/app/pages/app/memo.draft.qa.test.ts
PRETTIER_EXIT=0
Checking formatting...
All matched files use Prettier code style!
```

---

## File yang ditambah/diubah QA

| File | Status | Isi |
|---|---|---|
| `apps/web/app/pages/app/memo.draft.qa.test.ts` | **baru** (8 test) | Wiring halaman: bolak-balik 3 tanggal lewat strip, reload, simpan hanya menghapus draf harinya, draf tidak bocor antar tanggal, storage rusak/whitelist perasaan, XSS |
| `apps/web/app/composables/useMemoDraft.qa.test.ts` | **baru** (7 test) | Validasi tanggal non-ISO, storage melempar/penuh, JSON bukan objek, panjang berlebih + duplikat perasaan, `load()` tidak menyapu draf tanggal lain, tidak ada key sebelum tanggal aktif |
| `reports/qa-54-memo-draft.md` | **baru** | Laporan ini |

**Putaran 2:** tidak ada file test baru dari QA - `app/pages/app/memo.conflict.qa.test.ts` (6 test) ditulis
developer sebagai bagian rework dan diverifikasi QA (lulus 3x terpisah, tercakup di suite wajib 58/58).
Probe QA `app/pages/app/probe54.tmp.qa.test.ts` (15 test) dijalankan lalu dihapus; salinan di
`/tmp/opencode/qa54/probe54.tmp.qa.test.ts.txt`. Tidak ada kode produk yang diubah QA.

---

## Coverage & celah test yang tersisa

**Status putaran 2:** test regresi konflik **sudah ada** (`memo.conflict.qa.test.ts`, 6 test, lintas jalur A/B,
append saat editor terbuka, penulis non-append, judul/perasaan, isolasi tanggal). Celah yang tersisa:

- **R1** (pemotongan `MEMO_TEXT_MAX` saat draf ~5.000 karakter) belum punya test permanen; probe P4b
  mendokumentasikannya. Kalau diperbaiki, tambahkan test: draf 5.000 karakter yang tidak berawalan isi lama +
  `append()` -> simpan -> catatan luar harus utuh.
- **R2** (draf storage vs halaman yang sudah berisi catatan luar saat mount) belum punya test permanen karena
  skenarionya butuh halaman persisten; probe P12 jadi bukti mekanismenya. Tambahkan test saat persistensi jurnal
  masuk.
- Cabang `mergeText` yang belum tersentuh test permanen: `mineTail` saja (`useMemoDraft.ts:111`, user menambah di
  ekor sementara penulis lain mengubah tengah) dan percabangan `mergeTitle` saat `mine === base`
  (`useMemoDraft.ts:118`). Bukan blocker, tapi menutup 100% cabang merge.
- Coverage angka tidak bisa diukur di lingkungan ini: `@vitest/coverage-v8` belum terpasang
  (`MISSING DEPENDENCY Cannot find dependency '@vitest/coverage-v8'`), dan QA tidak menambah dependency.
- Belum ada test dua tab (`storage` event). Perilaku sekarang: last-write-wins, tanpa notifikasi (B-54.2).
- Belum ada test TTL/pruning dan draf yatim (N3).
- Reload disimulasikan dengan `clearNuxtState` (bukan browser reload nyata). Untuk `/app/**` (`ssr: false`,
  `nuxt.config.ts:161-163`) simulasi ini setara untuk `useState`; tidak ada hydration SSR yang bisa
  "membekukan" `draftDay` — risiko yang disebut B-54.2 tidak berlaku selama route tetap `ssr: false`.
- Jalur kuota penuh hanya memastikan tidak crash + draf hidup di state; UI tidak memberi tahu user bahwa
  persistensi gagal (label `memo.draftKept` berbunyi "selama sesi", jadi tidak berbohong).
- `isIsoDate()` menerima tanggal kalender tidak nyata (`2025-02-30` → rollover, bukan `Invalid Date`); tidak
  terjangkau dari UI (tanggal selalu dari `journalDates`) dan util dipakai lintas fitur, jadi hanya dicatat.

---

## Rekomendasi

**Putaran 2 (setelah rework):**

1. Tutup **R1** (Low): dahulukan `externalTail` di `mergeText` atau sisakan anggaran untuk ekor eksternal sebelum
   `slice(0, MEMO_TEXT_MAX)`; tambahkan test permanennya.
2. Sebelum persistensi halaman jurnal dikerjakan, selesaikan **R2**: simpan base/snapshot bersama draf di
   localStorage, atau merge draf storage vs halaman saat mount. Kalau tidak, BUG-54-01 akan kembali lewat jalur
   reload lintas sesi.
3. Pertimbangkan notifikasi ringan saat merge terjadi (developer sudah menandainya sebagai sisa risiko) supaya
   user tahu halamannya berubah.
4. B-54.1/B-54.2 (draf plaintext, TTL/pruning) tetap berdiri seperti putaran 1.

**Putaran 1 (arsip):**

1. **Perbaiki BUG-54-01 sebelum menandai task selesai**: revalidasi draf saat `showDay` dipanggil untuk
   tanggal yang sama, atau deteksi konflik halaman di `save()` (base version/hash). Tambahkan test regresi
   permanen untuk urutan draft → append → save.
2. Tindak lanjuti **B-54.1**: enkripsi draf (kunci perangkat) atau pindahkan ke IndexedDB ciphertext; tambah
   TTL/pruning draf (mis. buang draf > 30 hari saat app dibuka).
3. Perbarui komentar `useMemos.ts:41-45` dan label `memo.draftKept` supaya sesuai perilaku baru.
4. Pertimbangkan debounce tulis draf + flush saat `pagehide`/`visibilitychange` bila profiling INP menunjukkan
   biaya `localStorage.setItem` per keystroke.
5. Kalau tim memutuskan temuan ini di luar lingkup #54, AC-A tetap hijau dan task bisa ditutup — tetapi
   BUG-54-01 wajib menjadi task lanjutan dengan severity mayor.
