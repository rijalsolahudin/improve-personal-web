# QA Report — T14: Halaman Daily (F12) + label menu sidebar "Daily"

**Task:** Ergonio #28 (`stackinnov/personal-productivity`) · **Tanggal:** 2026-10-23
**Commit diuji:** `f8a9a5c` + working tree (area Daily tidak diubah QA)
**Lingkup app:** `apps/web` (Nuxt 4) — route `/app` (`app/pages/app/index.vue`)

---

## Status akhir (putaran 2, setelah fix `dimas`)

## **LULUS** — dengan catatan non-blocking

Lima file test QA putaran 1 dijalankan **apa adanya** (hash identik, tidak ada assertion dilonggarkan): **25/25 lulus**. B1, B2, dan B3 tertutup; regresi area terdampak **113/113 lulus**; tidak ada bug blocking baru. Catatan Low yang tidak menghalangi `done`: lihat **§8.8** (quick add tepat pada detik 23:59, sisa field legacy `addedTaskIds`, dan perubahan working tree dari task lain).

> Verdict di bawah ini adalah **putaran 1 (historis)** dan dipertahankan sebagai jejak audit. Detail putaran 2 ada di **§8**.

## Verdict putaran 1 (historis — sudah diperbaiki)

## **GAGAL**

AC1, AC2, AC4, AC5, AC6 **lulus**. **AC3 gagal**: quick add tidak memakai deadline hari ini (berbeda dari teks panduan yang dibaca user & PRD F12) sehingga task hasil quick add hilang dari To-do setelah reload/besok, dan daftar To-do dipotong diam-diam di 10 item sehingga progres "x/10" salah saat task hari ini lebih dari 10.

Tidak ada bug pada urutan/penanda Prioritas, edit/hapus dari widget, ekspansi jadwal recurring, maupun label sidebar.

| Ringkasan test | Hasil |
|---|---|
| Test QA baru (5 file) | **22 lulus / 3 gagal** (3 gagal = reproduksi B1 & B2, sengaja) |
| Regresi area terdampak (10 file) | **108 lulus / 0 gagal** |
| `npx eslint` (5 file test baru) | bersih (exit 0) |
| `npx nuxt typecheck` | lulus (exit 0) |

---

## 1. Scope & test plan

### Yang diuji

| Level | File (baru) | Fokus |
|---|---|---|
| Unit (fungsi murni) | `app/utils/dailyRoutine.qa.test.ts` (6 test) | AC1 urutan/kelompok/dedupe/tanpa batas 3, task selesai; AC3 overdue + batas hari + limit 10 (reproduksi B2) |
| Integrasi composable (Nuxt env) | `app/composables/useDailyRoutine.qa.test.ts` (8 test) | AC2 edit/hapus tercermin di store & widget lain; AC3 quick add (2 reproduksi B1), quick habit check + streak; AC5 cuaca per hari |
| Integrasi composable kalender | `app/composables/dailyCalendar.qa.test.ts` (4 test) | AC4 recurring ter-expand, task deadline hari ini, task tertaut, refleksi edit deadline ke F6 |
| Komponen (Vue Test Utils) | `app/components/features/daily/dailyWidgets.qa.test.ts` (6 test) | AC1 lipat 7 + penanda asal; AC3 progres/meta overdue/edit emit/quick add; AC2 edit & hapus 2 klik lewat `TodoForm` |
| Komponen navigasi | `app/components/features/shell/ShellDailyLabel.qa.test.ts` (1 test) | AC6 label sidebar `/app` = "Daily", bukan "Home" |

Data disemai lewat `useState` yang sama dengan yang dibaca composable (`tasks`, `schedules`, `habits`, `habitsCheckIns`, `now`) — bukan mocking composable internal. `now` selalu di-inject agar test tidak bergantung jam mesin.

### Yang **tidak** diuji (dan alasannya)

- **E2E browser / Lighthouse / INP nyata**: tidak ada harness E2E di repo dan browser tidak tersedia di sesi ini; AC T14 tidak menyebut angka performa.
- **Mount halaman `/app` utuh**: halaman memuat layer dekorasi, PWA, dan seluruh widget; wiring edit sudah dibuktikan di level komponen (`emit('edit', id)` + `index.vue:88`) dan level store. Mount halaman penuh akan menguji kerangka layout, bukan AC.
- **Review berkala (F13)**: kondisional dan belum ada store goal/chapter yang lengkap untuk skenario chapter berakhir; bukan bagian AC T14.
- **Cuaca jaringan/offline sungguhan**: implementasi memang tidak memanggil jaringan (lihat AC5).
- **Jadwal all-day**: UI web tidak bisa membuatnya (`createSchedule` selalu `allDay: false`); hanya bisa masuk lewat impor, dan `DailySchedule` menyembunyikan baris all-day (`isBare`). Dicatat sebagai celah, bukan bug T14.

---

## 2. Hasil per acceptance criteria

| # | Acceptance criteria | Hasil | Bukti |
|---|---|---|---|
| **AC1** | Widget Prioritas tanpa batas 3: kuadran Penting & Mendesak dulu, lalu urgent; tanpa duplikat; masing-masing urut deadline | **PASS** | `dailyRoutine.qa.test.ts` — "tanpa batas 3: semua kuadran ... 15 item" (12 urgent + 3 kuadran, urut deadline, tanpa deadline di akhir), "task urgent di kuadran ... hanya muncul sekali" (origin `quadrant`, tanpa duplikat), "task selesai hanya tampil kalau dicentang hari ini". `dailyWidgets.qa.test.ts` — "7 item pertama tampil ... Lihat 2 lagi" (7 → klik → 9 baris), "chip Penting & Mendesak + badge Urgent". Kode: `app/utils/dailyRoutine.ts:65-79`, `DailyPriorityList.vue:9-12,41-51`, `DailyPriorityRow.vue:25-33` |
| **AC2** | Task di Prioritas & To-do hari ini bisa diedit/dihapus dari widget; perubahan tercermin di F2/F3/F6 | **PASS** | `useDailyRoutine.qa.test.ts` — "simpan dari form mengubah task yang sama (bukan salinan)" (id `urgent-1` tetap, keluar dari Prioritas setelah prioritas diturunkan), "menggeser deadline ke besok mengeluarkan task dari To-do", "hapus task ... hilang dari Prioritas, To-do, dan store F2". `dailyWidgets.qa.test.ts` — "ikon edit mengirim id task yang sama", "edit ... tombol hapus butuh konfirmasi dua klik" (klik 1 tetap ada, klik 2 terhapus + `close`). `dailyCalendar.qa.test.ts` — "edit deadline dari widget Daily langsung menggeser penanda di kalender hari ini (F6)". Wiring: `index.vue:54,64,88`, `DailyPriorityRow.vue:46-55`, `TodoLine.vue:48-58`, `TodoForm.vue:52-68,137-139` |
| **AC3** | To-do hari ini (termasuk terlambat) + progress benar; quick add masuk To-do; quick habit check update streak | **FAIL** | **Lulus sebagian:** overdue & batas hari hijau (`dailyRoutine.qa.test.ts` — "memuat deadline hari ini + yang terlambat", "batas hari inklusif 00:00 & 23:59"), quick add masuk To-do sesi berjalan (`useDailyRoutine.qa.test.ts` — "quick add masuk To-do hari ini"), streak naik/turun (`... — "quick habit check menaikkan progres & streak"`, streak 2 → 3 → 2). **Gagal:** (a) deadline quick add `null`, bukan hari ini → B1; (b) task quick add hilang setelah state halaman dimuat ulang → B1/B3; (c) 12 task jatuh tempo hari ini hanya 10 yang masuk, progres jadi "x/10" → B2 |
| **AC4** | Kalender hari ini menampilkan jadwal (recurring ter-expand) + task tertaut/ber-deadline hari ini | **PASS** | `dailyCalendar.qa.test.ts` — "recurring yang mulai kemarin tampil hari ini (sudah di-expand), jadwal besok tidak ikut" (harian mulai H-1 tampil; jadwal besok tidak), "task ber-deadline hari ini tampil sebagai penanda, task besok tidak" (start 14:00), "task yang tertaut ke jadwal hari ini tampil bersama jadwalnya". Kode: `useTimeGrid.ts:94-135` (recurring via `occurrencesByDay`, marker task), `DailySchedule.vue:36-46` (grid 1 hari), `useCalendarData.ts:42-58` |
| **AC5** | Cuaca gagal/offline tidak memblokir widget lain & menampilkan data terakhir; koordinat cuaca tidak disimpan di server | **PASS** (dengan catatan) | `useDailyRoutine.qa.test.ts` — "pilihan cuaca terakhir tampil lagi untuk hari yang sama dan tidak mengganggu widget lain": `setWeather('hujan')` → Prioritas/To-do tetap terisi; ganti hari → kosong; kembali → "hujan" lagi. Kode: `DailyWeatherPicker.vue:4-9` (pilihan manual, tanpa jaringan), `useDailyRoutine.ts:194-199` (per tanggal). `grep -rni "geolocation\|open-meteo\|latitude\|longitude" server app` → tidak ada; `grep -rni weather server` → tidak ada endpoint. **Catatan:** karena tidak ada jaringan, "gagal/offline" tidak pernah menghalangi widget; tapi tidak ada label "terakhir diperbarui", prakiraan per jam, atau cache 30 menit seperti PRD F12, dan pilihan cuaca hilang saat reload (lihat B3) |
| **AC6** | Label menu sidebar "Daily" benar | **PASS** | `ShellDailyLabel.qa.test.ts` — tautan `href="/app"` berlabel tepat `Daily`, dan nav tidak memuat "Home". Kode: `i18n/locales/id.json:8-11` (`feature.home.label = "Daily"`), `features.ts:72`, `ShellSidebar.vue:32-42` |

---

## 3. Bug

### B1 — Quick add tidak memakai deadline hari ini; task hilang dari To-do setelah reload/besok

- **Severity: Medium** — melanggar AC3 ("quick add masuk To-do") secara durable dan bertentangan dengan teks yang dibaca user.
- **Reproduksi otomatis:**
  ```bash
  cd apps/web
  npx vitest run app/composables/useDailyRoutine.qa.test.ts
  # × B1 (reproduksi): quick add harus memakai deadline hari ini ... expected null not to be null
  # × B1b (reproduksi): task hasil quick add tetap ada di To-do setelah state halaman dimuat ulang
  #   expected [] to deeply equal [ 'Bayar listrik' ]
  ```
- **Reproduksi manual:** buka `/app` → ketik "Bayar listrik" di input To-do → Enter. Task muncul sesaat. Reload halaman (F5) atau buka besok: task hilang dari widget To-do dan tidak pernah menjadi task "terlambat" (deadline `null`).
- **Expected:** sesuai `guide.ts:48` ("Quick add ... membuat task baru dengan **deadline hari ini**") dan PRD F12 baris 560 ("judul + deadline default hari ini + prioritas"); setelah reload task tetap tampil (hari ini) dan besok tampil sebagai terlambat.
- **Actual:** `addTodayTask()` memanggil `add(title, 'medium', null)` — deadline `null`, prioritas hardcoded `medium`; keberadaannya di To-do hanya ditopang `addedTaskIds` milik `useState('daily-routine')` yang tidak dipersistensi. Setelah state halaman kosong, `todayTasks` tidak punya alasan memasukkan task tanpa deadline.
- **Bukti kode:** `apps/web/app/composables/useDailyRoutine.ts:137-142` (baris 138: `add(title, 'medium', null)`; komentar mengakui "beda dari PRD F12"), `apps/web/app/utils/dailyRoutine.ts:102-122` (hanya `addedIds`/deadline yang meloloskan task), `apps/web/app/utils/guide.ts:48`. UI quick add hanya punya input judul: `DailyTodoCard.vue:69-79`.
- **Dampak:** task yang dibuat dari halaman utama jadi "yatim" — tidak muncul di Daily lagi, tidak masuk filter "Hari ini"/"Terlambat" F2, dan tidak muncul di kalender F6. Ini bertentangan dengan integrasi PRD F12 ("Quick add task → F2 (task baru)").
- **Arah perbaikan (untuk `dimas`, bukan QA):** kirim deadline akhir hari ini (mis. `deadlineFrom(today, END_OF_DAY)`) + prioritas yang dipilih/`medium`; atau persist `daily-routine` bila produk tetap ingin quick add tanpa deadline. Test B1/B1b akan hijau tanpa diubah kalau deadline diisi hari ini (B1b butuh deadline, bukan persistensi state).

### B2 — To-do dipotong 10 item tanpa penanda; progres "x/10" salah saat task hari ini > 10

- **Severity: Medium** — AC3 "progress benar" gagal; task bisa "hilang" dari widget tanpa indikator.
- **Reproduksi otomatis:**
  ```bash
  cd apps/web
  npx vitest run app/utils/dailyRoutine.qa.test.ts
  # × B1 (reproduksi): 12 task jatuh tempo hari ini semuanya harus masuk & dihitung progresnya
  #   expected [ … ] to have a length of 12 but got 10
  ```
- **Reproduksi manual:** buat 12 task dengan deadline hari ini (boleh beberapa terlambat) → buka `/app`. Kartu To-do hanya merender 10 baris dan meta berbunyi "0/10 selesai", bukan "0/12"; 2 task tidak muncul dan tidak ada tombol "Lihat 2 lagi" (berbeda dengan widget Prioritas yang punya `PRIORITY_VISIBLE_COUNT` + "Lihat N lagi"). Tidak ada jaminan 10 yang tampil adalah yang terlambat/terdekat — `slice` memakai urutan array task.
- **Expected:** PRD F12 baris 555-557: "Task yang deadline-nya hari ini + task terlambat ... Progress bar selesai / total"; total = seluruh to-do hari ini. Kalau widget memang dibatasi, sisanya harus dilipat dengan penanda "Lihat N lagi" seperti Prioritas (PRD baris 550).
- **Actual:** `todayTasks` memotong di `TODAY_TASK_LIMIT = 10`; `DailyTodoCard` menghitung `doneCount/items.length` dari hasil yang sudah terpotong.
- **Bukti kode:** `apps/web/app/utils/dailyRoutine.ts:84` (`TODAY_TASK_LIMIT = 10`), `:113-121` (`.slice(0, TODAY_TASK_LIMIT)`), `apps/web/app/components/features/daily/DailyTodoCard.vue:23-24` (persen dari `items`), `:55` (meta `{done}/{total}`).
- **Dampak:** user dengan hari sibuk melihat progres yang terlalu optimistis/berbeda dari F2, dan task bisa terlewat tanpa disadari.
- **Arah perbaikan:** hitung `done`/`total` dari seluruh task eligible lalu lipat tampilan (mis. `TODO_VISIBLE_COUNT` + "Lihat N lagi"), atau tampilkan semua dengan virtualisasi/scroll.

### B3 — State harian (`daily-routine`) tidak persisten: centang & cuaca hilang saat reload

- **Severity: Low** — bukan blocker utama, tapi melanggar janji "tetap tampil tercoret sampai ganti hari" (PRD F12 baris 549) dan "menampilkan data terakhir" untuk cuaca.
- **Reproduksi:** buka `/app` → centang satu task di Prioritas (tetap tampil tercoret) atau pilih cuaca "Hujan" → reload (F5). Task yang tadi dicentang hilang dari daftar Prioritas (karena `done` dan `checkedTaskIds` kosong), pilihan cuaca kembali kosong. Langkah rutinitas yang dicentang juga kembali.
- **Expected:** state harian bertahan sampai ganti hari (setidaknya sampai reload berikutnya), karena PRD menyebut perilaku "sampai ganti hari" dan cuaca "data terakhir".
- **Actual:** `useState('daily-routine', ...)` hanya hidup di memori; tidak ada `useLocalData`/persistence untuk `checkedTaskIds`, `weather`, `doneSteps`, `addedTaskIds`.
- **Bukti kode:** `apps/web/app/composables/useDailyRoutine.ts:45-49` (satu-satunya penyimpanan, in-memory), `:51-56` (`updateDay` hanya menulis state), `:127-131` (checked ids per hari), `:194-199` (cuaca). Bukti test: `B1b` (state halaman kosong → task quick add hilang).
- **Catatan:** B3 dan B1b adalah akar yang sama (state halaman tidak dipersistensi); memperbaiki deadline quick add (B1) membuat B1b hijau, tetapi centang/cuaca tetap hilang saat reload.

---

## 4. Cek tiga pilar

| Pilar | Status | Catatan |
|---|---|---|
| **Keamanan** | OK | Tidak ada `v-html`/`innerHTML`/`console.*` di area Daily (`grep` pada `components/features/daily`, `useDailyRoutine.ts`, `dailyRoutine.ts`, `pages/app/index.vue` bersih). Judul task/habit/jadwal dirender lewat interpolasi (ter-escape). Route `/app/**` = `ssr: false` tanpa cache (`nuxt.config.ts:155-158`), jadi tidak ada data per-user di payload SSR. Cuaca tidak memanggil jaringan dan tidak menyimpan koordinat di server (tidak ada endpoint weather). Data task/habit tetap lewat sesi data lokal terenkripsi. |
| **Performa** | PASS (terbatas) | Prioritas/To-do = computed O(n) atas store yang sudah dimuat; kalender hari ini memakai satu ekspansi `occurrencesByDay` untuk satu hari (`useTimeGrid.ts:137-144`). Tidak ada polling; `useNow` dari satu ticker. Tidak ada pengukuran Lighthouse/INP di sesi ini (tidak ada harness browser) — AC T14 tidak menetapkan angka. |
| **Kerapian** | OK dengan catatan | Tidak ada `it.only`/`.skip`/`console.log`/`any`/`@ts-ignore` di file yang diuji; `eslint --max-warnings 0` dan `nuxt typecheck` hijau. Catatan: `DailyHabitCard.vue` 235 baris (di atas ~200 baris yang disarankan rules), dan `createRoutineMock()` (`app/composables/routine/mock.ts`) menaruh 8 langkah rutinitas contoh ke UI produksi + ikut dihitung di progres header (`useDailyRoutine.ts:166-176`) — widget ini tidak ada di daftar konten PRD F12. Bukan blocker AC, tapi perlu keputusan produk. |

---

## 5. Coverage & celah yang tersisa

Sudah tercakup test baru:

- Prioritas: >3 item, batas 7 + lipat, urutan dua grup, dedupe kuadran/urgent, task selesai hanya bila dicentang hari ini, asal item.
- To-do: overdue, batas 00:00/23:59, task selesai hari ini, pengecualian besok/tanpa deadline, progres & meta, edit emit, quick add emit + trim.
- Edit/hapus: id task tetap (bukan salinan), keluar dari widget saat kriteria berubah, hapus 2 klik, refleksinya ke marker kalender.
- Kalender hari ini: recurring mulai H-1 ter-expand, jadwal besok tidak ikut, task deadline hari ini, task tertaut, edit deadline menggeser marker.
- Habit: quick check menaikkan `done`/streak dan klik kedua mengembalikan; progres habit.
- Cuaca: nilai per hari, tidak mengganggu widget lain.
- Sidebar: label "Daily".

Celah / rekomendasi tiket lanjutan:

1. **B1/B2/B3** di atas — perbaiki lalu jalankan ulang 5 file test QA ini; tidak perlu full suite.
2. **Jadwal all-day** tidak tampil di Daily (baris all-day disembunyikan oleh `isBare`, dan `useTimeGrid` memfilter `allDay`). Belum bisa dibuat dari UI web, tapi data impor bisa memuatnya. Tambah test + keputusan produk.
3. **Task ber-deadline 00:00–04:59** tidak muncul di timeline Daily (grid mulai 05:00) meski masuk To-do. Perlu keputusan apakah penanda dipindah ke baris all-day/00:00.
4. **Weather F12 penuh** (kondisi sekarang, min/maks, peluang hujan, prakiraan per jam, cache ±30 menit, label "terakhir diperbarui") belum ada; implementasi sekarang = pilihan manual per hari sesuai design `Home Daily`, bukan PRD F12. Perlu tiket produk/QA terpisah kalau API cuaca memang diinginkan.
5. **Lighthouse/CWV halaman `/app`** belum diukur karena tidak ada harness browser.
6. `DailyHabitCard.vue` >200 baris dan `createRoutineMock` (data contoh di produksi) — rapikan di tiket kerapian bila widget rutinitas dipertahankan.

---

## 6. Perintah & hasil

```bash
cd apps/web

# 1. Test QA T14 (5 file)
npx vitest run app/utils/dailyRoutine.qa.test.ts \
               app/composables/useDailyRoutine.qa.test.ts \
               app/components/features/daily/dailyWidgets.qa.test.ts \
               app/composables/dailyCalendar.qa.test.ts \
               app/components/features/shell/ShellDailyLabel.qa.test.ts
# Test Files  2 failed | 3 passed (5)
#      Tests  3 failed | 22 passed (25)
#   Duration  3.01s
# 3 gagal = reproduksi B1 (2 test) + B2 (1 test); 22 sisanya hijau.

# 2. Regresi area terdampak
npx vitest run app/utils/dailyRoutine.test.ts app/composables/useDailyRoutine.test.ts \
               app/utils/features.test.ts app/composables/useTimeGrid.test.ts \
               app/utils/tasks.test.ts app/utils/schedule.test.ts app/utils/habits.test.ts \
               app/composables/useHabits.consumers.test.ts app/composables/useTasks.test.ts \
               app/composables/useSchedules.test.ts
# Test Files  10 passed (10)
#      Tests  108 passed (108)
#   Duration  4.43s

# 3. Lint & typecheck
npx eslint app/utils/dailyRoutine.qa.test.ts app/composables/useDailyRoutine.qa.test.ts \
           app/components/features/daily/dailyWidgets.qa.test.ts \
           app/composables/dailyCalendar.qa.test.ts \
           app/components/features/shell/ShellDailyLabel.qa.test.ts --max-warnings 0
# exit 0, tanpa output
npx nuxt typecheck
# exit 0, tanpa output
```

Full suite **tidak** dijalankan (sesuai batas tugas: ada agent lain yang bekerja di area kalender/akun/kripto/io/memo dan `packages/core/src/sync`).

**File yang ditambahkan (hanya test + report):**

- `apps/web/app/utils/dailyRoutine.qa.test.ts`
- `apps/web/app/composables/useDailyRoutine.qa.test.ts`
- `apps/web/app/composables/dailyCalendar.qa.test.ts`
- `apps/web/app/components/features/daily/dailyWidgets.qa.test.ts`
- `apps/web/app/components/features/shell/ShellDailyLabel.qa.test.ts`
- `reports/qa-t14-daily.md` (laporan ini)

Tidak ada file kode produk yang diubah, tidak ada commit, status Ergonio tidak diubah dari `review`.

---

## 7. Rekomendasi status

- **Status task:** **Failed** (`status-1792622168795`) — AC3 tidak terpenuhi (B1 & B2). B3 Low bisa digabung.
- **Untuk `dimas`:** (1) isi deadline akhir hari ini saat quick add (atau persist state harian bila tanpa deadline memang keputusan produk) — `useDailyRoutine.ts:138`; (2) hitung progres dari seluruh task eligible lalu lipat tampilan, jangan `slice` diam-diam — `dailyRoutine.ts:84,117` + `DailyTodoCard.vue:23-24,55`; (3) pertimbangkan persistensi `daily-routine` untuk checked/weather — `useDailyRoutine.ts:45-56`.
- **QA ulang setelah fix:** cukup 5 file test QA di atas + regresi `dailyRoutine`/`useDailyRoutine`/`useTimeGrid`/`useTasks`/`useSchedules`; B1/B1b/B2 harus hijau tanpa melonggarkan assertion.

---

## 8. Putaran 2 — QA ulang setelah fix (2026-10-23, `review` → verifikasi)

### 8.1 Verdict putaran 2

## **LULUS** (dengan catatan non-blocking)

B1, B2, B3 **tertutup**, semua AC diuji ulang **PASS**, baseline test putaran 1 utuh, dan tidak ada regresi di area terdampak. Temuan baru hanya catatan Low/observasi (bukan pelanggaran AC, bukan blocker `done`).

| Ringkasan putaran 2 | Hasil |
|---|---|
| 5 file QA putaran 1, dijalankan apa adanya | **25 lulus / 0 gagal** (sebelumnya 22/3) |
| 2 file QA baru (bukti B2/B3 yang dulu tak bisa diuji) | **9 lulus / 0 gagal** |
| Regresi area terdampak (11 file, termasuk `DailyTodoCard.test`) | **113 lulus / 0 gagal** |
| `npx eslint` (7 file QA, `--max-warnings 0`) | exit 0 |
| `npx nuxt typecheck` | file Daily bersih; 2 error **pra-ada** di file task lain (`DeleteAccountDialog.vue`, `ui/QrCode`) — lihat §8.8 N4 |

### 8.2 Integritas baseline putaran 1 (tidak ada assertion dilemahkan/dihapus)

Kelima file tidak disentuh sejak putaran 1: mtime semuanya **sebelum** laporan putaran 1 ditulis (04:22), hash diambil dua kali (sebelum & sesudah sesi ini) dan **identik**.

| File | mtime | sha256 (awal = akhir sesi) | Jumlah test |
|---|---|---|---|
| `app/utils/dailyRoutine.qa.test.ts` | 2026-10-23 04:13:51 | `88b152f4108159daa35e0debfca849a3a95dbad91e29c0b14bc9de57462afbc9` | 6 |
| `app/composables/useDailyRoutine.qa.test.ts` | 2026-10-23 04:19:00 | `222713b7988d586fb4c19087c43597ecd5cedd569f4a151ffedeab5704dc5572` | 8 |
| `app/components/features/daily/dailyWidgets.qa.test.ts` | 2026-10-23 04:11:46 | `05f4f73a770164d66aa6d7c7fd3309a6fab6d4e3d0a793b3b331fe9a5533feec` | 6 |
| `app/composables/dailyCalendar.qa.test.ts` | 2026-10-23 04:18:30 | `6256c19190316d6bfc2ed22c1b8ea3637efbea2e9fab678154efe74b207b8b21` | 4 |
| `app/components/features/shell/ShellDailyLabel.qa.test.ts` | 2026-10-23 04:12:45 | `348e2700b8c2aed3beb0f4005ecbf3cf9cde8733a5e846de0090fef0d892bbd3` | 1 |

Assertion kunci masih ketat seperti putaran 1: `expect(added?.task.deadline).not.toBeNull()` + tanggal `TODAY` (B1), `expect(list).toHaveLength(12)` (B2), dan `todayList` harus berisi task quick add setelah `clearNuxtState(['daily-routine'])` (B1b). Ketiganya sekarang hijau karena kode berubah, bukan karena test berubah.

### 8.3 Perbaikan yang diverifikasi (hanya area Daily)

| Masalah | Perbaikan | Bukti kode |
|---|---|---|
| **B1** quick add tanpa deadline | `addTodayTask` memakai `deadlineFrom(today, END_OF_DAY)` (23:59) | `app/composables/useDailyRoutine.ts:152-154`, `app/utils/tasks.ts:25-26,121-123` |
| **B2** To-do dipotong 10 | `todayTasks` tidak lagi `slice`; `TODAY_TASK_LIMIT` jadi batas **tampilan** dengan tombol "Lihat N lagi"/"Lipat lagi"; progres/meta dihitung dari seluruh item | `app/utils/dailyRoutine.ts:163-167,185-204`, `DailyTodoCard.vue:24-26,37-41,62,78-88`, i18n `daily.todo.more/less` |
| **B3** state harian hilang saat reload | `ip-daily` di `localStorage`: baca tervalidasi + tulis per perubahan hari, dibatasi 14 hari; ikut terhapus saat logout lewat prefix `ip-` | `useDailyRoutine.ts:22-42,67-71`, `utils/dailyRoutine.ts:66-121`, `useLogout.ts:12-17,43`, `shared/tech-identity.ts:32` |

Tidak ada perubahan pada `dailyPriorities` (aturan prioritas tidak disentuh) maupun pada komponen/jadwal di luar To-do.

### 8.4 Hasil per acceptance criteria (putaran 2)

| # | AC | Hasil | Bukti putaran 2 |
|---|---|---|---|
| **AC1** | Prioritas tanpa batas 3, kuadran dulu lalu urgent, tanpa duplikat, urut deadline | **PASS** | `dailyRoutine.qa.test.ts` "tanpa batas 3 … 15 item" + "hanya muncul sekali …"; `dailyWidgets.qa.test.ts` "7 item pertama … Lihat 2 lagi" (7 → 9 baris) |
| **AC2** | Edit/hapus dari Prioritas & To-do, tercermin di F2/F3/F6 | **PASS** | `useDailyRoutine.qa.test.ts` (id task tetap, keluar widget saat kriteria berubah, hapus bersih di store); `dailyWidgets.qa.test.ts` (emit id, hapus 2 klik + `close`); `dailyCalendar.qa.test.ts` (deadline digeser → marker kalender hilang) |
| **AC3** | To-do hari ini + terlambat + progres benar; quick add masuk To-do; quick habit check | **PASS** | **Lulus penuh sekarang.** Deadline quick add = 23:59 hari ini + tetap ada setelah reload (`useDailyRoutine.qa.test.ts` B1/B1b hijau); 12 task → `todayTasks` 12 + `todayList` 12, komponen meta `0/12 selesai` + "Lihat 2 lagi" → klik = 12 baris (`dailyTodoFold.qa.test.ts`); besok task quick add jadi `isOverdue: true` (`persistence.qa.test.ts`); overdue/batas hari/streak dari putaran 1 tetap hijau |
| **AC4** | Kalender hari ini: recurring ter-expand + task deadline/tertaut | **PASS** | `dailyCalendar.qa.test.ts` 4/4 hijau (tidak berubah) |
| **AC5** | Cuaca gagal/offline tidak memblokir widget, data terakhir tampil | **PASS** | Cuaca manual per hari 100% lokal (tanpa jaringan) → tidak mungkin memblokir; sekarang **bertahan setelah reload** dan **hilang saat logout** (`persistence.qa.test.ts`) |
| **AC6** | Label menu sidebar "Daily" | **PASS** | `ShellDailyLabel.qa.test.ts` hijau |

### 8.5 Status bug putaran 1

| Bug | Status | Bukti |
|---|---|---|
| **B1** quick add tanpa deadline / hilang setelah reload | **TERTUTUP** | `deadline` hari ini 23:59 (`useDailyRoutine.ts:153`); test B1 hijau (deadline != null, tanggal = `TODAY`), B1b hijau (setelah `clearNuxtState(['daily-routine'])`, task tetap di `todayList` karena deadline, bukan karena state) |
| **B2** To-do dipotong 10, progres "x/10" | **TERTUTUP** | `todayTasks` mengembalikan 12; `DailyTodoCard` meta memakai `items.length` dan menyediakan "Lihat 2 lagi" (buka = 12 baris; 3 selesai = "3/12") |
| **B3** centang & cuaca hilang saat reload | **TERTUTUP** | `persistence.qa.test.ts`: `toggleTask` + `setWeather('hujan')` → `ip-daily` terisi → state halaman dikosongkan → cuaca & task tercoret kembali; logout menghapus `ip-daily` |

### 8.6 Test QA baru (hanya test; kode produk tidak disentuh)

| File | Test | Kenapa baru di putaran 2 |
|---|---|---|
| `app/composables/useDailyRoutine.persistence.qa.test.ts` | 7 | Putaran 1 hanya bisa membuktikan B3 secara manual (state masih in-memory). Sekarang ada `ip-daily`, jadi reload/logout bisa diuji langsung: persistensi centang task + langkah rutinitas + cuaca, storage rusak tidak memblokir, storage manual terbaca, logout menghapus `ip-daily` tanpa menyentuh key situs lain, dan quick add lintas hari (besok = terlambat) |
| `app/components/features/daily/dailyTodoFold.qa.test.ts` | 2 | Integrasi store → komponen untuk B2: 12 task hari ini → progres `0/12` & "Lihat 2 lagi" → 12 baris; plus kasus 3 selesai → `3/12` |

Bukti tambahan milik developer yang juga dijalankan sebagai regresi: `DailyTodoCard.test.ts` (1 test lipat 12) — hijau.

### 8.7 Cek tiga pilar (perubahan dimas)

| Pilar | Status | Catatan |
|---|---|---|
| **Keamanan** | OK | `ip-daily` hanya berisi id task/langkah, `weather`, dan tanggal — tanpa judul, PII, token, atau data akun. Data dari storage diperlakukan tak tepercaya: `parseDailyDays` memvalidasi tanggal ISO, membuang field asing/array/null, membatasi panjang id (120) & jumlah id (200) dan menyimpan maksimal 14 hari (`dailyRoutine.ts:72-112`). Baca/tulis dibungkus `try/catch` (storage diblokir/rusak → halaman tetap jalan), dan hanya di client (`import.meta.client`; route `/app` `ssr:false`), jadi tidak ada kebocoran ke payload SSR. Logout & hapus akun membersihkan lewat prefix `ip-` (`useLogout.ts:12-17,43`). Tidak ada `v-html`/`innerHTML`/`console.*` di area Daily (grep bersih). |
| **Performa** | OK | `writeDays`/`parseDailyDays` jalan hanya saat state hari berubah, maksimal 14 entri — bukan di jalur render. `todayTasks` tetap O(n) satu kali; batas tampilan 10 baris dipertahankan (tidak merender 100+ node), dan `hiddenCount`/`visibleRows` hanya `computed`. Tidak ada polling/jaringan baru. Tidak ada pengukuran Lighthouse/INP di sesi ini (tanpa harness browser), sama seperti putaran 1; AC T14 tidak menyebut angka. |
| **Kerapian** | OK dengan catatan | `eslint --max-warnings 0` hijau untuk 7 file QA; `DailyTodoCard.vue` 160 baris (di bawah ~200), logika tampilan di `computed`, test regresi ada untuk kedua bug. Catatan: sisa field `addedTaskIds` + cabang legacy-nya (`dailyRoutine.ts:55-56,107,195-198`) tidak lagi punya penulis sejak B1 diperbaiki — kandidat dead code (§8.8 N2). |

### 8.8 Catatan & observasi (non-blocking, tidak mengubah verdict)

- **N1 (Low, edge)** — `END_OF_DAY` = `23:59` tepat, jadi quick add pada 23:59:00–23:59:59 langsung tampil "terlambat" karena `deadline < now` (`tasks.ts:26`, `dailyRoutine.ts:202`). Dampak kosmetik di detik terakhir hari; bukan pelanggaran AC. Kalau ingin rapi: pakai `23:59:59.999` atau `start + MS_PER_DAY - 1`.
- **N2 (Low, kerapian)** — `addedTaskIds` dipertahankan "untuk data versi lama", padahal versi lama tidak pernah menulis ke `localStorage` (state-nya in-memory), sehingga cabang itu tidak reachable. Bisa dihapus saat tiket kerapian berikutnya.
- **N3 (di luar scope T14)** — Working tree berisi perubahan task lain yang bukan bagian perbaikan ini: `app/pages/app/index.vue` mendapat `<DailyGoalReviewCard />` (F13/goals, komponen dibuat 07:13) dan `i18n/locales/id.json` mendapat key `daily.goalReview`/`goal`. Tidak menyentuh widget/aturan T14 dan tidak diuji di sini; dicatat supaya tidak diatribusikan ke T14.
- **N4 (pra-ada, bukan T14)** — `npx nuxt typecheck` gagal di `app/components/features/account/DeleteAccountDialog.vue` (tipe emit) dan `app/components/ui/QrCode/index.vue` (modul `uqr` belum ada). Keduanya file untracked milik task akun (T22), tidak terimport area Daily; semua file Daily & test QA bersih dari error typecheck.
- **N5** — Halaman `/app` utuh tetap tidak di-mount (alasan sama dengan putaran 1: layer dekorasi/PWA, dan wiring edit sudah terbukti di level composable + komponen). Tidak ada browser di sesi ini, jadi verifikasi "manual" dilakukan lewat test yang menjalankan aksi user sebenarnya (submit form, klik centang, reload state, logout).

### 8.9 Perintah & hasil (putaran 2)

```bash
cd apps/web

# 1. 5 file QA putaran 1 - dijalankan apa adanya
npx vitest run app/utils/dailyRoutine.qa.test.ts \
               app/composables/useDailyRoutine.qa.test.ts \
               app/components/features/daily/dailyWidgets.qa.test.ts \
               app/composables/dailyCalendar.qa.test.ts \
               app/components/features/shell/ShellDailyLabel.qa.test.ts
# Test Files  5 passed (5)
#      Tests  25 passed (25)

# 2. Bukti tambahan putaran 2 (B2 UI + B3 reload/logout)
npx vitest run app/composables/useDailyRoutine.persistence.qa.test.ts \
               app/components/features/daily/dailyTodoFold.qa.test.ts
# Test Files  2 passed (2)
#      Tests  9 passed (9)

# 3. Regresi area terdampak (11 file)
npx vitest run app/utils/dailyRoutine.test.ts app/composables/useDailyRoutine.test.ts \
               app/utils/features.test.ts app/composables/useTimeGrid.test.ts \
               app/utils/tasks.test.ts app/utils/schedule.test.ts app/utils/habits.test.ts \
               app/composables/useHabits.consumers.test.ts app/composables/useTasks.test.ts \
               app/composables/useSchedules.test.ts app/components/features/daily/DailyTodoCard.test.ts
# Test Files  11 passed (11)
#      Tests  113 passed (113)

# 4. Logout (memastikan jalur pembersihan storage tetap hijau)
npx vitest run app/composables/useLogout.test.ts
# Test Files  1 passed (1) · Tests  3 passed (3)

# 5. Lint 7 file QA
npx eslint app/utils/dailyRoutine.qa.test.ts app/composables/useDailyRoutine.qa.test.ts \
           app/components/features/daily/dailyWidgets.qa.test.ts \
           app/composables/dailyCalendar.qa.test.ts \
           app/components/features/shell/ShellDailyLabel.qa.test.ts \
           app/composables/useDailyRoutine.persistence.qa.test.ts \
           app/components/features/daily/dailyTodoFold.qa.test.ts --max-warnings 0
# exit 0, tanpa output

# 6. Typecheck (hanya error pra-ada di file task lain - lihat N4)
npx nuxt typecheck 2>&1 | grep -E "daily|useDailyRoutine|DailyTodo"
# (kosong)
```

Full suite **tetap tidak** dijalankan (sesuai batas tugas; ada agent lain aktif di area tema/goals/akun/memo dan `packages/core`). Tidak ada commit, tidak ada perubahan kode produk oleh QA, status Ergonio tidak diubah dari `review` (transisi `done` dilakukan orchestrator).

### 8.10 Celah tersisa & rekomendasi

1. Tutup N1 (presisi akhir hari) dan N2 (hapus cabang legacy) di tiket kerapian bila disepakati — keduanya tidak menghalangi AC.
2. Celah dari putaran 1 yang tetap berlaku dan bukan bagian T14: jadwal all-day tidak tampil di Daily, task deadline 00:00–04:59 tidak masuk timeline, dan cakupan cuaca PRD F12 penuh (prakiraan/cache) belum ada.
3. `Lighthouse/CWV /app` tetap belum diukur (tidak ada harness browser).
4. Rekomendasi status: **`done`** + `progressPct: 100`, catatan non-blocking §8.8 disertakan di komentar verdict.

---

**Rules dibaca:** `CLAUDE.md` root, `.claude/rules/shared-security.md`, `.claude/rules/shared-code-quality.md`, `.claude/rules/ergonio-status-flow.md`, `apps/web/AGENTS.md` → `apps/web/CLAUDE.md` → `apps/web/.claude/rules/{security,performance,code-quality}.md`, `docs/PRD.md` F12 (baris 536-607).
