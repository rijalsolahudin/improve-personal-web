# QA Report — T9: Kalender view hari/pekan/bulan + panel detail hari

**Task:** Ergonio #23 (`stackinnov/personal-productivity`) · **Tanggal:** 2026-10-22 (putaran 1), 2026-10-23 (putaran 2)
**Commit diuji:** `f8a9a5c` + working tree (putaran 1: tanpa perubahan kode produk dari QA; putaran 2: fix `dimas` di working tree)
**Lingkup app:** `apps/web` (Nuxt 4) — route `/app/kalender` (`ssr: false`)

> **Status terbaru: LULUS (dengan catatan)** — hasil QA ulang setelah fix B1/B2 ada di **§9 Putaran 2**.
> Verdict di bawah ini adalah verdict **putaran 1** (dipertahankan sebagai riwayat).

---

## Verdict (putaran 1)

## **GAGAL (blocking)**

2 dari 3 acceptance criteria **LULUS**. AC performa **GAGAL**: view bulan butuh **458–537 ms** untuk 500 kejadian, bukan < 100 ms. Penyebabnya bukan lingkungan uji — biaya `Intl.DateTimeFormat` di mesin ini 2,7 µs/panggilan, sementara komputasi yang sama untuk 500 kejadian butuh 458 ms.

Tidak ada bug fungsional pada recurring, panel detail hari, maupun navigasi. Kegagalan murni performa + satu temuan UX level rendah.

| Ringkasan test | Hasil |
|---|---|
| Test baru (recurring 3 view, panel detail, navigasi, timezone) | **26 lulus / 0 gagal** |
| Test AC performa (sengaja merah sebagai reproduksi bug B1) | **0 lulus / 3 gagal** |
| Regresi area terdampak (`schedule.test.ts`, `calendarGrid`, `time`, `useTimeGrid`, `useSchedules`, `useTasks`) | **85 lulus / 0 gagal** |
| `npx eslint` (3 file test baru) | bersih (exit 0) |
| `npx nuxt typecheck` | lulus (exit 0) |

---

## 1. Scope & test plan

### Yang diuji

| Level | File | Fokus |
|---|---|---|
| Unit (fungsi murni) | `apps/web/app/utils/calendarViews.qa.test.ts` (baru, 17 test) | Ekspansi recurring di rentang hari/pekan/bulan, konsistensi antar view, pengecualian & batas akhir, bulan pendek, pekan/grid lintas bulan & tahun, timezone per-jadwal, DST, batas rentang ekspansi |
| Integrasi halaman (Nuxt + Vue Test Utils) | `apps/web/app/pages/app/kalender.test.ts` (baru, 9 test) | Render 3 view dari data nyata (`useState` yang sama dengan composable), klik tanggal → panel detail (jadwal + to-do + jurnal), navigasi prev/next/“Hari ini”, pindah view mempertahankan tanggal terpilih |
| Benchmark performa | `apps/web/app/components/features/calendar/calendar.perf.test.ts` (baru, 3 test) | AC “render bulan < 100 ms untuk 500 kejadian” lewat hitung data + render komponen asli |

Data uji disemai lewat `useState` yang dibaca composable (`schedules`, `tasks`, `memos`, `goals`, `countdowns`, `now`, `calendar-*`) — bukan dengan mem-mock composable internal, sesuai `.claude/rules/shared-code-quality.md` (mock di batas, bukan di tengah).

### Yang **tidak** diuji (dan alasannya)

- **E2E browser sungguhan (Playwright) / Lighthouse**: tidak ada harness E2E di repo ini, dan menjalankan browser tidak dimungkinkan di sesi ini. Angka performa diukur di Node (V8) dengan kalibrasi `Intl` eksplisit — lihat §3.
- **Buat jadwal dari slot kosong, tarik tepi (resize), centang kehadiran, tautan task dari detail jadwal**: alur F1/form, bukan AC T9; sudah punya test sendiri di `useTimeGrid.test.ts` / `useSchedules.test.ts`.
- **Marker countdown/goal/chapter** di sel bulan: bagian F5/F13, bukan AC T9.
- **View default di HP** (`matchMedia('(max-width: 599px)')` → `hari`): butuh emulasi media query; bukan AC T9.
- **Load/perf di perangkat mobile nyata**: AC T9 hanya menyebut angka render, dan angka itu sudah gagal di lingkungan tercepat (desktop Node), jadi pengukuran perangkat tidak akan mengubah verdict.

---

## 2. Hasil per acceptance criteria

| # | Acceptance criteria | Hasil | Bukti |
|---|---|---|---|
| AC1 | Recurring (T3) tampil benar di 3 view: hari, pekan, bulan | **PASS** | `calendarViews.qa.test.ts` — “view hari: hanya tanggal yang cocok pola…”, “view pekan: 7 hari…”, “view bulan: kejadian jatuh di semua Senin & Kamis…”, “hasil tiga view konsisten: hari ⊆ pekan ⊆ bulan”. Halaman: `kalender.test.ts` — “recurring muncul di sel tanggal yang benar…” (35 sel, Senin 1 & Kamis 4 Sep berisi `Kelas AWS`, Selasa 2 & Rabu 3 tidak; Kamis 2 Okt di sel luar-bulan juga berisi). Kode: `app/utils/schedule.ts:220-252`, `app/components/features/calendar/CalendarMonth.vue:26-51`, `CalendarTimeGrid.vue:43-67` |
| AC2 | Klik hari menampilkan jadwal + to-do + jurnal hari itu | **PASS** | `kalender.test.ts` — “panel menampilkan jadwal + to-do + jurnal hari yang diklik”: klik 10 Sep → panel `10 September`, `0 jadwal · 1 deadline`, to-do `Kirim laporan`, jurnal `Hari ini fokus belajar IAM.`; klik 11 Sep → `1 jadwal · 0 deadline`, `Kelas AWS`, `09:00–10:30`, `Mingguan, Sen & Kam`, `Nggak ada deadline di tanggal ini.`, `Belum ada memo di tanggal ini.` Kode: `app/components/features/calendar/CalendarDayPanel.vue:24-38, 86-237`, `app/composables/useCalendarData.ts:34-93` |
| AC3 | Render bulan < 100 ms untuk 500 kejadian | **FAIL** | `calendar.perf.test.ts` — **458–480 ms** (hitung data) dan **523–537 ms** (render komponen). Detail metode & angka di §3, bug **B1** |
| AC4 | Tidak ada regresi: navigasi antar view, tanggal, panel detail (termasuk minggu lintas bulan/tahun, timezone lokal) | **PASS** (dengan catatan UX **B2**) | `calendarViews.qa.test.ts` — “pekan yang melintasi tahun tetap 7 hari berurutan” (29 Des 2025 – 4 Jan 2026), “recurring mingguan tetap benar di pekan lintas tahun”, “grid Januari 2026 dimulai di Desember 2025”, “geser anchor: bulan lewat pergantian tahun”, “Februari tahun kabisat & bukan kabisat”, “zona jadwal menang atas zona perangkat”, “DST: jam lokal 09:00 tetap 09:00 (selisih 23 jam)”. Halaman: `kalender.test.ts` — 3 test navigasi (bulan lintas tahun, pekan 7 hari + “Hari ini”, hari next) dan “tanggal yang dipilih tetap dipakai saat pindah view” |

---

## 3. AC3 — metode pengukuran & angka

**Metode** (`calendar.perf.test.ts`):

1. Satu pemanasan (JIT, kompilasi template, cache formatter Intl) dibuang dari hitungan.
2. Diukur **3 kali, diambil nilai terbaik** — paling ramah ke implementasi, supaya mesin uji yang sibuk tidak dianggap bug.
3. Dua angka dipisah:
   - **hitung data**: `monthDays(anchor)` + `occurrencesOn(schedules, day)` per hari — persis yang dilakukan `computed(() => …)` di `CalendarMonth.vue:26-51`;
   - **render komponen**: `mountSuspended(CalendarMonth)` dengan data yang sama sampai DOM siap (35 sel).
4. Pembanding kalibrasi: `Intl.DateTimeFormat#formatToParts` di lingkungan ini = **2,7 µs/panggilan** (5.000 panggilan = 13,5 ms), jadi angka ratusan milidetik **bukan** efek `Intl` yang lambat di Node.

**Lingkungan:** Node v24.18.0, Intel i7-14700 (28 thread), Vitest 5.0.3 + `@nuxt/test-utils` (env `nuxt`, happy-dom), 2026-10-22.

| Skenario | Kejadian di grid | Waktu (terbaik dari 3) | Status AC |
|---|---|---|---|
| 500 jadwal sekali-jadwal di bulan — **hitung data** | 500 | **458–480 ms** | GAGAL |
| 500 jadwal sekali-jadwal di bulan — **render `CalendarMonth`** | 500 | **523–537 ms** (3×: 525/523/552) | GAGAL |
| 2 jadwal mingguan Sen–Jum sejak Jan 2020 — hitung data | 50 | **732 ms** | GAGAL |
| 15 jadwal harian mulai 1 Sep 2025 — hitung data | 525 | 85–86 ms | lulus, **tanpa headroom** |
| 100 jadwal sekali-jadwal — hitung data | 100 | 97 ms | lulus, tepat di batas |
| **Pembanding:** ekspansi sekali untuk seluruh grid (bukan kode produk, hanya pembuktian target bisa dicapai) | 500 | **14,4 ms** | target tercapai |

---

## 4. Bug

### B1 — View bulan mem‑expand ulang seluruh jadwal untuk **setiap hari** → 458–537 ms untuk 500 kejadian

- **Severity:** **High** — memblokir AC T9, dan makin memburuk seiring umur seri (bukan seiring jumlah kejadian). Di perangkat lambat ini terasa sebagai freeze saat membuka/menggeser bulan.
- **Reproduksi otomatis:** `cd apps/web && npx vitest run app/components/features/calendar/calendar.perf.test.ts` → 3 test gagal:
  - `hitung data bulan 500 kejadian = 458.3 ms: expected 458.25162 to be less than 100`
  - `render CalendarMonth 500 kejadian = 522.7 ms (3x: 525/523/552): expected … to be less than 100`
  - `hitung data bulan seri sejak 2020 = 732.2 ms: expected … to be less than 100`
- **Reproduksi manual:** buka `/app/kalender`, buat ±500 jadwal sekali-jadwal (atau impor), pilih view **Bulan**. Panel “Performance” DevTools: satu kali render `cells` makan **> 450 ms**; memilih tanggal lain memicu hitung ulang yang sama.
- **Expected:** render bulan untuk 500 kejadian < 100 ms (PRD F6).
- **Actual:** 458–537 ms (≈ 4,6–5,4× anggaran); dengan 2 seri mingguan lama hanya 50 kejadian pun 732 ms.
- **Bukti kode (akar masalah, bukan gejala):**
  - `app/components/features/calendar/CalendarMonth.vue:26-31` — `computed` `cells` memanggil `occurrences(day)` **untuk tiap 35–42 sel**;
  - `app/composables/useCalendarData.ts:34-36` — `occurrences(day)` = `occurrencesOn(schedules, day)`, **tanpa cache**; panel hari (`CalendarDayPanel.vue:28`) dan timeline (`useTimeGrid.ts:94-135`) juga memanggil ulang per hari;
  - `app/utils/schedule.ts:220-251` — `occurrencesBetween` **mengulang seluruh daftar jadwal** untuk setiap panggilan, dan per jadwal menghitung `scheduleStartAt` → `fromLocalDateTime` (berbasis `Intl`) di `toCoreSchedule` (`schedule.ts:112-125`) — jadi biayanya O(jumlah jadwal × jumlah hari);
  - `packages/core/src/recurrence/expand.ts:144-171` — ekspansi tetap **berjalan dari tanggal seed** setiap kali dipanggil (bukan dari awal rentang), sehingga biaya tumbuh mengikuti **umur seri**: 2 seri sejak 2020 = 732 ms walau hanya 50 kejadian. Ini bertentangan dengan prinsip “expand hanya rentang yang dilihat” (PRD F1/F6, komentar `expand.ts:34-36`).
- **Bukti kuantitatif pemisahan penyebab:** untuk 500 kejadian yang sama, ekspansi **satu kali** untuk seluruh grid = **14,4 ms**, sedangkan 35 ekspansi satu-hari = **454 ms** (31× lebih lambat, hasil identik: 500 kejadian). Artinya anggaran 100 ms **bisa** dicapai tanpa virtualization.
- **Arah perbaikan (untuk `dimas`/`bayu`, bukan QA):** hitung `occurrencesBetween(schedules, firstGridDay, lastGridDay)` **sekali** per perubahan `anchor`/`schedules`, kelompokkan hasilnya per `day` (Map), lalu `CalendarMonth`, `CalendarTimeGrid`/`useTimeGrid`, dan `CalendarDayPanel` membaca dari hasil itu. Alternatif tambahan: lewati jadwal yang `start` > akhir rentang atau yang sudah berakhir (`ends.until`/`count`) sebelum ekspansi.
- **Setelah diperbaiki:** test performa di `calendar.perf.test.ts` akan hijau tanpa diubah (ambang 100 ms, 3 file test lain tidak perlu disentuh).

### B2 — Tombol ‹/› tidak memindahkan tanggal terpilih, papan dan panel bisa menunjukkan tanggal berbeda

- **Severity:** **Low** (UX/konsistensi; tidak memblokir AC, PRD tidak mengatur eksplisit).
- **Reproduksi:** buka `/app/kalender` → view **Hari** pada 10 Sep 2025 → klik **›**. Header papan menjadi “Jumat, 12 September 2025”, tetapi panel kanan tetap “Kamis 11 September” (tanggal terpilih sebelumnya, termasuk daftar jadwalnya).
- **Expected:** di view hari, papan dan panel menunjuk tanggal yang sama (seperti tombol “Hari ini” yang mengubah keduanya).
- **Actual:** `‹`/`›` hanya mengubah `anchor`, `selected` dibiarkan (`apps/web/app/pages/app/kalender.vue:70-73` vs `42-45`). Di view pekan, panel juga bisa menampilkan tanggal di luar pekan yang sedang tampil.
- **Dampak:** user bisa membaca detail hari yang berbeda dari timeline yang terlihat; membingungkan, tapi tidak salah data.
- **Saran:** saat `view === 'hari'` (atau saat `selected` keluar dari rentang tampil), ikutkan `selected` ke tanggal baru; atau beri penanda jelas di panel kalau tanggalnya di luar rentang papan.

---

## 5. Cek tiga pilar

| Pilar | Status | Catatan |
|---|---|---|
| **Keamanan** | OK (tidak ada temuan) | Tidak ada `v-html`/`innerHTML` di area kalender (`grep` pada `components/features/calendar`, `useCalendarData.ts`, `kalender.vue`: kosong); judul jadwal, judul task, dan teks jurnal dirender lewat interpolasi (ter-escape). Route `/app/**` = `ssr: false` dan tanpa cache (`nuxt.config.ts:158,161-165`), jadi tidak ada data per-user di payload SSR/cache. Tidak ada `console.*`, tidak ada akses storage untuk data kalender selain sesi data lokal terenkripsi. |
| **Performa** | **GAGAL** | B1. Selain biaya bulan, catatan tambahan: view pekan ikut memakai pola per-hari (`useTimeGrid`) sehingga seri lama juga memperlambat pekan (7× vs 35× bulan). Anggaran 100 ms tidak tercapai dan tidak ada headroom (kasus terbaik 85 ms). |
| **Kerapian** | OK | Tidak ada `console.log`, `TODO`, `any`, `@ts-ignore` di area kalender; `eslint --max-warnings 0` bersih untuk file test baru; `nuxt typecheck` lulus. Nama test mengikuti konvensi repo (`*.qa.test.ts` untuk test QA, `pages/app/<page>.test.ts` untuk integrasi halaman). |

---

## 6. Coverage & celah yang tersisa

Sudah tercakup oleh test baru:

- Pola recurring: mingguan 1 hari & multi-hari (Sen & Kam), interval 2 minggu, bulanan tanggal 31 (dilewati di bulan pendek), `until`, `count` (sudah ada di `schedule.test.ts`), pengecualian.
- Tiga view: jumlah hari/kolom/sel, tanggal yang berisi vs tidak berisi, konsistensi hari ⊆ pekan ⊆ bulan.
- Navigasi: prev/next di 3 view, “Hari ini”, pindah view mempertahankan tanggal terpilih, bulan & pekan lintas tahun.
- Timezone: zona per-jadwal mengalahkan zona perangkat, dua zona berbeda untuk jam dinding sama, DST (23 jam), batas rentang ekspansi.

Celah yang direkomendasikan untuk tiket lanjutan:

1. **Perf**: setelah B1 diperbaiki, tambahkan benchmark untuk view **pekan** (mis. 150 kejadian) dan untuk **500 jadwal berulang aktif** (bukan hanya sekali-jadwal), plus ukur di browser nyata (Playwright + Performance API) supaya angka Node tidak jadi satu-satunya acuan.
2. **B2**: putuskan perilaku yang diinginkan, lalu tambah test regresi untuk paging × tanggal terpilih.
3. All-day event & marker countdown/goal di grid bulan (F5/F13) belum diuji di level UI.
4. View default mobile (`matchMedia`) dan perilaku saat viewport berubah belum diuji.
5. `CalendarDayPanel` hanya menampilkan **satu** memo terbaru sebagai “ringkasan jurnal”; kalau PRD F8 ingin ringkasan lebih kaya (judul, perasaan, status lengkap/sebagian), perlu tiket terpisah — bukan regresi T9.

---

## 7. Perintah & hasil

```bash
cd apps/web

# 1. Test baru T9 (correctness + panel + navigasi) + benchmark AC performa
npx vitest run app/utils/calendarViews.qa.test.ts \
               app/pages/app/kalender.test.ts \
               app/components/features/calendar/calendar.perf.test.ts
# Test Files  1 failed | 2 passed (3)
#      Tests  3 failed | 26 passed (29)      <- 3 gagal = benchmark AC performa (B1)
#   Duration  10.20s

# 2. Regresi area terdampak (tanpa perubahan kode produk dari QA)
npx vitest run app/utils/schedule.test.ts app/utils/calendarGrid.test.ts \
               app/utils/time.test.ts app/composables/useTimeGrid.test.ts \
               app/composables/useSchedules.test.ts app/composables/useTasks.test.ts
# Test Files  6 passed (6)
#      Tests  85 passed (85)

# 3. Lint & typecheck
npx eslint app/utils/calendarViews.qa.test.ts app/pages/app/kalender.test.ts \
           app/components/features/calendar/calendar.perf.test.ts    # exit 0, tanpa output
npx nuxt typecheck                                                   # exit 0, tanpa output
```

Full suite **tidak** dijalankan (sesuai batas tugas: ada agent lain yang bekerja di area akun/kripto dan sync).

**File yang ditambahkan (hanya test):**

- `apps/web/app/utils/calendarViews.qa.test.ts`
- `apps/web/app/pages/app/kalender.test.ts`
- `apps/web/app/components/features/calendar/calendar.perf.test.ts`
- `reports/qa-t9-kalender.md` (laporan ini)

Tidak ada file kode produk yang diubah, tidak ada commit, status Ergonio tidak diubah dari `review`.

---

## 8. Rekomendasi status (putaran 1)

- **Status task:** **Failed** (`status-1792622168795`) — AC3 tidak terpenuhi; B1 blocking.
- **Untuk developer (`dimas`, dengan dukungan `bayu` untuk mesin ekspansi):** perbaiki B1 dengan ekspansi sekali per rentang tampil (bukti: 14,4 ms vs 454 ms), lalu jalankan ulang `calendar.perf.test.ts` sampai hijau. B2 (Low) bisa menyusul atau digabung.
- **QA ulang setelah fix:** cukup 3 file test di atas + regresi `schedule`/`calendarGrid`/`useTimeGrid`; tidak perlu full suite.

---

# 9. Putaran 2 — QA ulang setelah fix `dimas` (2026-10-23)

## Verdict putaran 2

## **LULUS (dengan catatan)**

B1 dan B2 **terbukti diperbaiki**, bukan sekadar klaim:

- Gate yang disepakati di putaran 1 ("`calendar.perf.test.ts` hijau tanpa diubah") terpenuhi: **29/29 test lulus**, dan **tidak ada assertion yang dilonggarkan** (§9.2).
- Angka perf turun **±29× (hitung data)** dan **±41× (render)**; bahkan diukur **cold** (cache kosong, objek jadwal baru) dataset AC tetap **24,6 ms** — jauh di bawah 100 ms.
- B2 terbukti: `‹/›` menyinkronkan papan tanggal + panel detail di view hari/pekan/bulan, termasuk geser lintas bulan dan setelah klik sel.
- Regresi: **113 test** area terdampak hijau, `eslint --max-warnings 0` + `nuxt typecheck` bersih.

Satu catatan non-blocking (**C1**, Medium) dibuka untuk sisa biaya di jalur **cold** pada data recurring tua; itu **bukan regresi** (sebelum fix 35× lebih lambat) dan akarnya di `packages/core` (di luar fix B1 ini). Detail §9.5.

| Skenario (metode test apa adanya, best-of-3, warm-up dibuang) | Putaran 1 | Putaran 2 | Anggaran |
|---|---|---|---|
| Hitung data bulan, 500 jadwal sekali | 458–480 ms | **1,8 ms** | < 100 ms |
| Render `CalendarMonth`, 500 kejadian | 523–537 ms | **12,7 ms** (3×: 12,7/13,9/13,0) | < 100 ms |
| Hitung data bulan, 2 seri mingguan sejak 2020 | 732 ms | **1,1 ms** | < 100 ms |
| Hitung data bulan, 15 jadwal harian | 85–86 ms | **1,4 ms** | < 100 ms |
| Hitung data pekan, 500 jadwal sekali (probe) | — | **0,3 ms** | — |

Angka di atas **sesuai metode test QA yang tidak diubah** (1 pemanasan dibuang, 3 kali ukur, ambil terbaik). Catatan metode: karena sekarang ada cache, pemanasan juga mengisi cache — jadi angka tabel = steady state. Karena itu §9.4 mengukur ulang **cold** secara terpisah, dan untuk dataset AC hasilnya tetap lulus.

## 9.1 Perubahan kode yang diverifikasi

| File | Perubahan | Bukti |
|---|---|---|
| `apps/web/app/utils/schedule.ts` | Cache ekspansi per objek jadwal (`WeakMap`) + kunci field yang memengaruhi hasil; `expansionWindow` (hari tunggal → satu grid bulan); `recurringOccurrences`/`pickDays`; jadwal sekali jadi O(1); `from > to` → `[]` | `schedule.ts:228-300` (cache & window), `:323-379` (ekspansi per jadwal), `:381-411` (`occurrencesBetween`), `:412-416` (`occurrencesOn`) |
| `apps/web/app/composables/useCalendarData.ts` | `occurrencesByDay(days)` — satu ekspansi untuk seluruh rentang hari | `useCalendarData.ts:42-56`, dipakai di `:120` |
| `apps/web/app/components/features/calendar/CalendarMonth.vue` | `days` + `byDay` computed; `cells` membaca map, bukan `occurrences(day)` per sel | `CalendarMonth.vue:30-31` (+ pemakaian di dalam `cells`) |
| `apps/web/app/components/features/calendar/CalendarTimeGrid.vue` | `byDay` untuk chip all-day | `CalendarTimeGrid.vue:43` |
| `apps/web/app/composables/useTimeGrid.ts` | `layout` ekspansi sekali, `entriesOf(day, dayOccurrences)` | `useTimeGrid.ts:94`, `:137-144` |
| `apps/web/app/pages/app/kalender.vue` | `shift()` menulis `anchor` **dan** `selected` | `kalender.vue:51-55`, `:81-82` |
| `apps/web/app/pages/app/kalender.paging.test.ts` | Test regresi B2 baru (dari developer) | 3 test, lihat §9.3 |

## 9.2 Bukti test QA tidak dilemahkan

Tiga file test putaran 1 adalah file **untracked** (belum di-commit), jadi `git diff` tidak bisa dipakai. Bukti yang dipakai:

1. **Timestamp file** — test QA terakhir ditulis **23:31:54 / 23:32:23 / 23:35:09**, laporan putaran 1 **23:38:26**, sedangkan file produk diperbaiki **23:45:52–23:51:02** (`CalendarMonth.vue` 23:45:52, `CalendarTimeGrid.vue` 23:45:55, `useTimeGrid.ts` 23:46:59, `kalender.vue` 23:47:04, `schedule.ts` 23:50:12, `useCalendarData.ts` 23:51:02) dan test paging developer 23:51:12. File test QA tidak tersentuh setelah fix.
2. **Jumlah test identik** dengan putaran 1 (`29` = 17 + 9 + 3), dan nama test + ambang (`BUDGET_MS = 100`, best-of-3, warm-up dibuang) sama persis dengan yang dikutip laporan putaran 1 (`calendar.perf.test.ts` §3).
3. **Tidak ada pelemahan** yang bisa lolos dari pembacaan ulang: tidak ada `it.only`/`.skip`/`it.todo`, tidak ada `eslint-disable`, tidak ada assertion komentar (grep bersih di 4 file).
4. **Hash file** (untuk audit berikutnya): `calendar.perf.test.ts` `1540ec76…`, `calendarViews.qa.test.ts` `877a7cc8…`, `kalender.test.ts` `44b78151…`, `kalender.paging.test.ts` `ad5212e0…`.

## 9.3 Hasil per acceptance criteria (putaran 2)

| # | Acceptance criteria | Hasil | Bukti |
|---|---|---|---|
| AC1 | Recurring (T3) tampil benar di hari/pekan/bulan | **PASS** | `calendarViews.qa.test.ts` 17/17 (hari, pekan, bulan, konsistensi hari ⊆ pekan ⊆ bulan, interval 2 minggu, `until`, pengecualian, bulan pendek, pekan/grid lintas tahun, kabisat, timezone, DST) + `kalender.test.ts` "recurring muncul di sel tanggal yang benar…" (35 sel, 1 & 4 Sep berisi `Kelas AWS`, 2 & 3 Sep tidak, 2 Okt di sel luar-bulan berisi). Perubahan pembacaan data (`occurrencesByDay`) menghasilkan set kejadian yang sama — diverifikasi silang di §9.4c |
| AC2 | Klik hari → panel jadwal + to-do + jurnal | **PASS** | `kalender.test.ts` "panel menampilkan jadwal + to-do + jurnal hari yang diklik" (10 Sep: `0 jadwal · 1 deadline` + `Kirim laporan` + jurnal; 11 Sep: `1 jadwal · 0 deadline`, `09:00–10:30`, `Mingguan, Sen & Kam`, `Belum ada memo…`). Panel tetap memakai `occurrences(day)` (`CalendarDayPanel.vue:28`), tidak terpengaruh refactor |
| AC3 | Render bulan < 100 ms untuk 500 kejadian | **PASS** | `calendar.perf.test.ts` 3/3 hijau: hitung data **1,8 ms**, render **12,7 ms**, seri 2020 **1,1 ms** (sebelum 458/523/732). Cold (objek baru, cache kosong): data **16,8 ms**, mount **24,6 ms** → tetap < 100 ms. Baseline pertama di proses ~93,6 ms adalah biaya mount/Vue sekali, bukan data |
| AC4 | Tidak ada regresi navigasi/tanggal/panel (lintas bulan-tahun, timezone) | **PASS** | `kalender.test.ts` 3 test navigasi + "tanggal terpilih tetap dipakai saat pindah view"; `kalender.paging.test.ts` 3 test (B2); probe B2 5/5 (§9.3b); regresi 113 test hijau (§9.6) |

### 9.3b Verifikasi B2 (langsung, probe sementara)

`kalender.paging.test.ts` (test developer) lulus 3/3. Saya tambah **5 probe independen** (file sementara, dihapus setelah dijalankan — tidak ada file baru yang ditinggal), semuanya lulus:

| Probe | Hasil |
|---|---|
| Bulan, anchor di tengah bulan (`2025-09-10`) → `›` / `‹` | papan `Oktober 2025` + panel `1 Oktober`; balik ke `September 2025` + `1 September` ✅ |
| Hari, `‹` dari 11 Sep | papan `Rabu, 10 September 2025`, panel `10 September`, timeline tetap 1 kolom ✅ |
| Pekan, `‹` | papan `1 Sep – 7 Sep 2025`, panel `3 September` (di dalam rentang) ✅ |
| Bulan, geser lalu klik sel 9 Okt | panel `9 Oktober`, papan `Oktober 2025` ✅ |
| Geser lalu "Hari ini" | papan `September 2025`, panel `10 September` ✅ |

**Keputusan UX yang dicatat, bukan bug:** di view **bulan**, `shiftAnchor` menormalkan anchor ke tanggal **1** (`schedule.ts:467-474`), jadi setelah `‹/›` panel menampilkan tanggal 1 bulan tujuan. Konsisten dengan papan, tidak melanggar AC/PRD, dan sekarang panel tidak lagi menunjuk tanggal di luar papan. Kalau produk ingin mempertahankan hari-ke-`n`, itu perubahan perilaku terpisah.

## 9.4 Pengukuran tambahan (cold vs warm) & sisa risiko

Metode: objek `Schedule` **baru** tiap pengukuran (cache dingin), mount Vue sudah panas, ambil terbaik dari 3. Grid = `2025-09-01 … 2025-10-05`.

**a. Cache benar-benar dipakai, dingin vs panas (data saja)**

| Dataset (kejadian di grid) | Cold | Warm | Catatan |
|---|---|---|---|
| 500 jadwal sekali (500) | **16,8 ms** | 0,4 ms | dataset AC |
| 2 seri mingguan sejak 2020 (50) | **28,4 ms** | 0,2 ms | kasus "seri lama" di test |
| 10 seri mingguan sejak 2020 (250) | **109,7 ms** | 0,3 ms | sudah > 100 ms saat cold |
| 23 seri mingguan sejak 2020 (575) | **243,0 ms** | 0,3 ms | idem |

**b. Biaya mengikuti UMUR seri, bukan jumlah kejadian** (23 seri, 575 kejadian/bulan):

| Mulai seri | Cold |
|---|---|
| 2025-07-01 (3 bulan) | 28,4 ms |
| 2024-01-01 (1,7 tahun) | 81,3 ms |
| 2020-01-06 (5,7 tahun) | 247,1 ms |

Artinya: cache menghapus pengali ×35 (per sel/per hari), tapi mesin ekspansi masih berjalan dari tanggal seed (temuan putaran 1 di `packages/core/src/recurrence/expand.ts`), jadi biaya per seri tua ≈ 10 ms tetap ada. **Pindah bulan** membuka jendela cache baru → biaya cold terulang: 23 seri tua = 248/246/252 ms per halaman bulan (Sep/Okt/Nov).

**c. Kesetaraan hasil setelah refactor** (probe sementara, 6/6 lulus): `occurrencesOn(day)` ≡ `occurrencesBetween(day, day)` untuk semua 35 hari grid; pindah bulan bolak-balik stabil; jadwal sekali, all-day, durasi lintas tengah malam, dua zona waktu berbeda, dan mutasi **in-place** (`exceptions`, `time`, `dur`, `ends`) semuanya langsung terlihat (cache tidak basi).

**d. Kesimpulan performa:** AC3 lulus untuk dataset AC dan untuk kasus "seri lama" yang diuji. Untuk data recurring tua yang lebih banyak, jalur **cold** masih di atas anggaran → **C1** di §9.5 (non-blocking, follow-up).

## 9.5 Temuan putaran 2

### C1 — Jalur cold data recurring tua masih > 100 ms, dan biaya itu berulang tiap pindah bulan

- **Severity: Medium (non-blocking untuk T9)** — bukan regresi (sebelum fix 35× lebih lambat: ±20 seri tua ≈ 7,3 s), dan dataset AC lulus. Tapi untuk user dengan ±20 jadwal berulang berumur > 1 tahun, halaman bulan pertama dan **setiap** `‹/›` menahan render ±200–250 ms (di atas anggaran 100 ms AC & mendekati budget INP 200 ms di `apps/web/.claude/rules/performance.md`).
- **Reproduksi (metode §9.4):** 20 seri mingguan Sen–Jum mulai `2020-01-06`, grid Sep 2025 (500 kejadian) → **205,8 ms** cold; 23 seri → 243–254 ms. Warm (objek sama) 0,3 ms. Pindah Okt/Nov dengan objek sama tapi jendela cache baru → 246/252 ms lagi.
- **Expected:** < 100 ms per render bulan (PRD F6), termasuk saat pertama kali & saat pindah bulan.
- **Actual:** 206–254 ms cold; 0,3 ms warm.
- **Akar masalah (bukan gejala):** `packages/core/src/recurrence/expand.ts` masih mengiterasi dari tanggal seed (dilaporkan di putaran 1 §4 B1); `schedule.ts:300-304` hanya menyempitkan jendela per permintaan, tidak mem-fast-forward. Cache `schedule.ts:253` membuatnya 1× per seri per jendela, bukan 35×.
- **Kenapa tidak memblokir:** gate yang disepakati putaran 1 ("`calendar.perf.test.ts` hijau tanpa diubah") terpenuhi; perbaikan ini menurunkan biaya 29–41× dan menghilangkan freeze multi-detik; akarnya di `packages/core` (area `bayu`), bukan di fix B1.
- **Saran tiket lanjutan:** (1) fast-forward ekspansi di `expand.ts` (mulai dari occurrence pertama ≥ `fromMs`, bukan dari seed; atau cache posisi per seri), dan/atau (2) simpan union rentang cache per jadwal supaya pindah bulan tidak selalu cold. Setelah itu tambahkan benchmark "500 kejadian dari ±20 seri lama" ke `calendar.perf.test.ts`.

### N1 — Catatan implementasi (Low, trade-off diterima)

- **`expansionWindow` (`schedule.ts:300-304`)** mengekspansi **satu grid bulan (35–42 hari)** untuk pembacaan satu hari, sedangkan PRD F6 menulis "View hari: expand 1 hari". Dampak terukur kecil karena biaya didominasi umur seri, bukan lebar rentang: 2 seri sejak 2020 = 28,4 ms untuk grid bulan vs ±21 ms untuk 1 hari (perkiraan dari angka putaran 1). Alasannya terdokumentasi di komentar fungsi. Kalau PRD ditafsirkan ketat, sempitkan ke `[from, to]` untuk pemanggil non-grid (panel/pomodoro) di tiket terpisah.
- **`EXPANSION_CACHE` (`schedule.ts:253`)** adalah state modul di `app/utils/` (aturan `code-quality` menyebut `utils` = fungsi murni). Secara perilaku tetap deterministik, `WeakMap` tidak menahan memori, dan kunci membandingkan field yang memengaruhi hasil (+ `exceptions` dicek per pemanggilan), jadi tidak ada kebocoran data antar-user/antar-request. Trade-off diterima, alasannya ditulis di komentar.
- **Belum ada test permanen untuk invalidasi cache** (mutasi in-place `exceptions`/`time`/`dur`/`ends`, pindah bulan bolak-balik). Probe sementara lulus 6/6; disarankan dijadikan test tetap agar refactor berikutnya tidak diam-diam membuat cache basi.

## 9.6 Cek tiga pilar (putaran 2)

| Pilar | Status | Catatan |
|---|---|---|
| **Keamanan** | OK | Perubahan hanya jalur baca/turunkan biaya. `grep` pada 6 file yang berubah: tidak ada `v-html`, `innerHTML`, `console.*`, `: any`, `@ts-ignore`. Tidak ada data baru yang masuk `useState`/payload; cache hanya memegang objek jadwal yang sudah ada di memori client (`/app/**` = `ssr: false`), `WeakMap` tidak menahan objek yang sudah dihapus. |
| **Performa** | PASS (dengan C1) | 29–41× lebih cepat; AC3 lulus untuk dataset AC bahkan cold (24,6 ms). Sisa: cold recurring tua (C1) dan biaya ekspansi dari seed di core. |
| **Kerapian** | OK | Komentar menjelaskan "kenapa" (cache, window, kenapa WeakMap); tidak ada dead code/`console`/`TODO`; `npx eslint … --max-warnings 0` exit 0; `npx nuxt typecheck` exit 0. Nama & struktur mengikuti konvensi (`*.qa.test.ts`, `pages/app/<page>.test.ts`, `occurrencesByDay` di composable). |

## 9.7 Perintah & hasil (putaran 2)

```bash
cd apps/web

# 1. Tiga file test QA putaran 1 - APA ADANYA (tidak diubah/dilonggarkan)
npx vitest run app/utils/calendarViews.qa.test.ts \
               app/pages/app/kalender.test.ts \
               app/components/features/calendar/calendar.perf.test.ts
# Test Files  3 passed (3)
#      Tests  29 passed (29)          <- putaran 1: 3 failed | 26 passed
#   Duration  3.76s

# 2. + test regresi B2 dari developer
npx vitest run app/utils/calendarViews.qa.test.ts app/pages/app/kalender.test.ts \
               app/components/features/calendar/calendar.perf.test.ts app/pages/app/kalender.paging.test.ts
# Test Files  4 passed (4)
#      Tests  32 passed (32)          <- 29 QA + 3 paging
#   Duration  3.66s

# 3. Regresi area terdampak (10 file)
npx vitest run app/utils/schedule.test.ts app/utils/calendarGrid.test.ts \
               app/utils/time.test.ts app/composables/useTimeGrid.test.ts \
               app/composables/useSchedules.test.ts app/composables/useTasks.test.ts \
               app/pages/app/kalender.paging.test.ts app/utils/overview.test.ts \
               app/composables/useDailyRoutine.test.ts app/utils/dailyRoutine.test.ts
# Test Files  10 passed (10)
#      Tests  113 passed (113)
#   Duration  4.06s

# 4. Lint & typecheck
npx eslint <6 file produk + 4 file test> --max-warnings 0     # exit 0, tanpa output
npx nuxt typecheck                                            # exit 0, tanpa output
```

Probe sementara yang dijalankan lalu **dihapus** (tidak ada file test baru yang ditinggal dari QA): pengukuran cold/warm + umur seri, kesetaraan hasil refactor & invalidasi cache (6/6), dan B2 paging (5/5). Working tree kembali hanya berisi perubahan developer + 4 file test (3 QA + 1 paging).

**Lingkungan:** Node v24.18.0, Intel i7-14700 (28 thread), Vitest 5.0.3 + `@nuxt/test-utils` (env `nuxt`, happy-dom), 2026-10-23.

## 9.8 Coverage & celah yang tersisa (putaran 2)

Sudah tertutup: AC1–AC4, B2 (test permanen `kalender.paging.test.ts` + probe), cache dingin/panas, invalidasi cache, kesetaraan hasil lama vs baru, lint/typecheck.

Masih terbuka:

1. **C1** — benchmark "500 kejadian dari ±20 seri berulang tua (cold)" dan benchmark pindah bulan; perbaikan di `packages/core` (`bayu`).
2. Test permanen invalidasi cache (mutasi in-place + pindah bulan bolak-balik) — sekarang hanya probe sementara.
3. Angka perf di browser nyata (Playwright + Performance API) belum ada harness; angka di laporan dari Node/V8.
4. All-day & marker countdown/goal di grid bulan (F5/F13) belum diuji di level UI; view default mobile (`matchMedia`) belum diuji.
5. `CalendarDayPanel` hanya menampilkan satu memo terbaru sebagai ringkasan jurnal (F8) — tiket terpisah, bukan regresi T9.

## 9.9 Rekomendasi status (putaran 2)

- **Status task:** **LULUS** → `done`, `progressPct: 100`. B1 & B2 terverifikasi; AC1–AC4 PASS; tidak ada bug baru yang memblokir.
- **Tiket lanjutan (bukan blocker):** **C1** (fast-forward ekspansi di `packages/core/src/recurrence/expand.ts` + cache union rentang per jadwal) dan **N1** (test invalidasi cache permanen; pertimbangkan menyempitkan `expansionWindow` untuk pemanggil non-grid).
- **Untuk `bayu`:** C1 adalah pekerjaan mesin ekspansi; ukuran keberhasilan: 500 kejadian dari 20 seri sejak 2020 < 100 ms **cold**, dan pindah bulan tidak mengulang biaya penuh.
