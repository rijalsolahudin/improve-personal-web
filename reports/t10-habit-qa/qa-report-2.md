# QA verification #2 — Task #24 [T10] Habit: CRUD, check-in, streak

Tanggal: 2026-10-22 · Reviewer: Fajar (QA) · Tree: `18ea58b` + perbaikan T10 (uncommitted)
Report sebelumnya: `reports/t10-habit-qa/qa-report.md` (verdict GAGAL, F1–F7)

Rules yang dibaca: root `CLAUDE.md`, `.claude/rules/{ergonio-status-flow,shared-security,shared-code-quality}.md`,
`apps/web/AGENTS.md`, `apps/web/CLAUDE.md`, `apps/web/.claude/rules/{security,performance,code-quality}.md`,
`.claude/rules/ergonio-status-flow.md`.

Environment: Node `v24.18.0`, `vitest 5.0.3`, pnpm workspace, host TZ `Asia/Jakarta` (offset −420).
Semua probe memakai `fake-indexeddb` + **libsodium asli** (`openLocalDataSession`) kecuali disebut lain.
File probe bersifat sementara dan **sudah dihapus**; `git status` kembali bersih (hanya diff developer).
**Tidak ada kode produk yang diubah QA.**

---

## Verdict: **LULUS (dengan catatan)**

F1–F6 **tertutup dan terbukti lewat eksekusi**, bukan pembacaan kode. AC1 "arsipkan" sekarang ada API, UI,
persistensi, dan efek lintas-consumer. Semua gate hijau (typecheck 0, eslint 0 warning, web 571 test,
core 182 test).

Catatan yang **tidak memblokir**: satu batas desain baru (F8, Low) — check-in yang dibuat lebih dari 400
hari ke belakang tersimpan tapi tidak terbaca lagi setelah reload — plus dua gap carry-over dari report
lama (warna/goal hilang setelah reload, ikon hilang saat sticker dipakai) yang butuh perubahan schema
`packages/core` (pemilik: `bayu`), bukan perbaikan web.

---

## Hasil command (semua dijalankan di tree ini, exit code diambil apa adanya)

| # | Command (cwd) | Exit | Hasil |
|---|---|---|---|
| 1 | `npx nuxt typecheck` (`apps/web`) | **0** | senyap. Non-vakum sudah dibuktikan di report #1 (file dengan error tipe → exit 2) |
| 2 | `npx eslint app/components/features/habit app/pages/app/habit.vue app/composables/useHabits.ts --max-warnings 0` (`apps/web`) | **0** | tanpa output = bersih |
| 3 | `npx eslint app/utils/habits.ts app/utils/habits --max-warnings 0` (`apps/web`, tambahan QA: `persistence.ts` tidak ada di command tugas) | **0** | bersih |
| 4 | `npx eslint app/{composables/useHabits,utils/habits,utils/habits/persistence,components/features/habit/HabitForm,components/features/habit/HabitArchive,pages/app/habit}.test.ts --max-warnings 0` (tambahan QA: file test baru) | **0** | bersih |
| 5 | `npx vitest run app i18n` (`apps/web`) | **0** | **70 file, 571 test lulus** |
| 6 | `npx vitest run` (`packages/core`) | **0** | **10 file, 182 test lulus** |
| P1 | `npx vitest run app/utils/habits/qa-probe-persistence.test.ts` (probe QA, dihapus) | **0** | 5/5 lulus (F1, F2, keamanan, arsip) |
| P2 | `npx vitest run app/composables/qa-probe-composable.test.ts` (probe QA, dihapus) | **0** | 15/15 lulus (F3, F4, F5, F6, AC1, F8) |
| P3 | `npx vitest run app/utils/habits/qa-probe-bench.test.ts` (probe QA, dihapus) | **0** | 2/2 lulus (angka performa) |
| P4 | `npx vitest run app/utils/habits/qa-probe-gaps.test.ts` (probe QA, dihapus) | **0** | 1/1 lulus (gap carry-over a/b) |

Catatan kejujuran: run pertama P1 gagal **karena assertion probe saya sendiri terlalu ketat** (bentuk baris
outbox punya `id` + `lastError`). Probe diperbaiki, bukan produk. Run pertama P2 juga gagal karena probe
saya menyiapkan state salah (habit belum ada di state saat `hydrate` mulai, sehingga `mergeHabits` benar
menganggapnya "belum pernah ada"). Keduanya kesalahan probe dan sudah dikoreksi.

---

## Acceptance criteria

| AC | Status | Bukti |
|---|---|---|
| 1. CRUD: create, edit, **archive**, delete | **PASS** | Create/edit/hapus: probe P2 + `useHabits.test.ts:176,311`. Arsip: `setArchived` (`useHabits.ts:372-386`), `activeHabits`/`archivedHabits` (`:196-197`), `habits` = aktif saja (`:416`), UI `HabitArchive.vue:11-51` + tombol "Arsipkan" (`HabitForm.vue:246-252`). Probe P2: arsip → `habits` kosong, `archivedHabits`='Baca buku', record core `isArchived:true`, **persist setelah sesi dibuka ulang**, dan "Kembalikan" mengembalikan ke aktif. |
| 2. Check-in menumpuk sampai target, bisa >1 per hari | **PASS** | 3 klik → `1,2,3`, 4 klik → 0 + record dihapus (`useHabits.test.ts:226`). Backfill sebelum tanggal habit dibuat sekarang **terbaca lagi** setelah reload (P1, P2) → F1 tutup. |
| 3. Streak mengabaikan hari bukan jadwal; daily vs weekly_days | **PASS** | `useHabits.test.ts:280` (Sen–Jum streak 6 vs harian 1), `habits.test.ts:43`. Pemetaan hari diverifikasi ulang dengan probe: `days:[1,3,5]` → core `{frequencyType:'weekly_days', frequencyDays:['senin','rabu','jumat']}` → dibaca kembali `[1,3,5]`; `days:null` → `{frequencyType:'daily', frequencyDays:null}` (`persistence.ts:89,114-118`). Test permanen hanya memeriksa roundtrip angka (`persistence.test.ts:72,95`), bukan nama hari — lihat celah test #2. |
| 4. Persist lewat repository (remount) + outbox | **PASS** | Reopen sesi: `persistence.test.ts:262`; probe P1/P2 (sesi baru, DB sama). Outbox: 1 baris per tulis, `delete` per record saat habit dihapus (probe P1). Blob terenkripsi, outbox tanpa plaintext (probe P1). |
| 5. Tidak ada regresi API/perilaku untuk consumer | **PASS** | Semua kunci lama masih ada; perubahan yang terlihat hanya `habits` sekarang **aktif saja** (didokumentasikan di `useHabits.ts:409-415`), dan itu yang membuat AC1 berlaku di Daily/Overview/Pomodoro tanpa mengubah consumer. `nuxi typecheck` 0, seluruh suite app 571 lulus. Detail consumer di bawah. |

### AC1 — arsip benar-benar hilang dari semua consumer (diukur, bukan diasumsikan)

Probe P2 memasang `useDailyRoutine()`, `useOverview()`, `usePomodoroTargets()` di dalam komponen harness
(konteks Nuxt penuh), lalu mengarsipkan satu dari dua habit:

| Consumer | Sebelum arsip | Sesudah arsip |
|---|---|---|
| Grid Habit (`HabitGrid.vue:19,48`) | `Jalan pagi`, `Baca buku` | `Jalan pagi` |
| Daily (`useDailyRoutine.ts:145-152`) | `Jalan pagi`, `Baca buku` | `Jalan pagi` |
| Overview — daftar streak (`useOverview.ts:215`) | keduanya | `Baca buku` hilang |
| Overview — heatmap (`useOverview.ts:223`) | `Jalan pagi`, `Baca buku` | `Jalan pagi` |
| Target Pomodoro (`usePomodoroTargets.ts:22,43`) | `Jalan pagi`, `Baca buku` | `Jalan pagi` |

Tambahan yang ikut diverifikasi: habit terarsip **tidak bisa di-check-in** (`toggleDay`/`toggleToday` menolak,
`useHabits.ts:297,305`), **tetap bisa dibuka** lewat `findHabit` (`:274`), **tetap bisa dihapus**, dan
**edit tidak mengaktifkannya kembali** (`applyHabitDraft(..., base.isArchived)`, `:326`).

### F6 — kegagalan tulis tidak lagi menyamar sebagai sukses (diukur)

| Skenario | Hasil (probe P2, writer dibuat throw) |
|---|---|
| `save` baru gagal | `{ok:false, error:'persist'}`; `habits` kosong (rollback); `error`='write gagal'; DB benar-benar kosong |
| `save` edit gagal | `{ok:false, error:'persist'}`; nilai lama kembali ('Jurnal'), DB tetap 'Jurnal' |
| `remove` gagal | `{ok:false, message:'remove gagal'}`; habit **masih ada** + check-in hari ini utuh; DB masih 1 habit |
| `setArchived` gagal | `{ok:false}`; `isArchived` kembali `false`; DB tetap aktif |

Di level UI (test developer, `vitest` lulus): simpan gagal → form tetap terbuka, `role="alert"` =
"Gagal menyimpan. Coba lagi.", tidak ada emit `saved`/`close` (`HabitForm.test.ts:65`); hapus gagal →
habit masih ada + pesan (`HabitForm.test.ts:113`); arsip gagal → `isArchived` tetap `false`
(`HabitForm.test.ts:101`); "Kembalikan" gagal → habit tetap di arsip + pesan (`HabitArchive.test.ts:61`);
halaman menampilkan banner dan **tidak** menampilkan "Belum ada habit" saat `status==='error'`
(`habit.vue:19,51,79`; `habit.test.ts:65`).

Probe P2 juga menguji jalur gabungan F4+F6: `hydrate` gagal → `status='error'` + pesan; sesi lokal pulih
(`localData.status='ready'`) → hydrate jalan ulang otomatis, `status='ready'`, `error` bersih, habit tampil.

---

## Status finding report #1

| # | Sev (lama) | Status | Bukti |
|---|---|---|---|
| F1 | High | **TUTUP** | Jendela baca sekarang **tetap** `CHECKIN_LOOKBACK_DAYS` = 400 hari dihitung dari "sekarang", bukan dari `habit.createdAt` (`persistence.ts:60,150-166`). Probe P1: habit dibuat hari ini + backfill H−7…H−1 (7 baris) + H−380 → **8 hari terbaca** setelah sesi dibuka ulang (sebelumnya `{}`). Regresi permanen: `persistence.test.ts:190`, `useHabits.test.ts:366`. |
| F2 | Medium | **TUTUP** | Hapus menyapu `listAll({includeDeleted:false})` lalu disaring `habitId`, bukan rentang tanggal (`persistence.ts:196-221`). Probe P1: check-in di H, H−48, H−380, H−420 → **0 baris hidup**, 4 tombstone, outbox `delete` untuk tiap record **dan** untuk habit; habit lain tidak tersentuh (dicek juga setelah reopen). Regresi permanen: `persistence.test.ts:225`. |
| F3 | Medium | **TUTUP** | `setArchived()` (`useHabits.ts:372`), `archivedHabits` (`:197`), `habits` = aktif (`:416`), `HabitArchive.vue`, tombol "Arsipkan" (`HabitForm.vue:246-252`), i18n `habit.archive.*` + `habit.form.archive` (`id.json`). Terverifikasi persist setelah reopen sesi baru (probe P1/P2) dan lintas-consumer (tabel AC1). |
| F4 | Medium | **TUTUP** | `watch(() => localData.state.value.status)` → `hydrate()` saat `ready` (`useHabits.ts:397-402`), dan `hydrateInFlight` di-reset di `finally` (`:237`). Probe P2: sesi `null` → `idle`; set `localData.status='ready'` → otomatis `ready` + habit termuat **tanpa reload**; panggilan `hydrate()` kedua setelah `null` juga berhasil. |
| F5 | Medium | **TUTUP** | `mergeHabits`/`mergeCheckIns` (`useHabits.ts:103-163,224-231`). Probe P2 dengan `listAll` yang ditahan: habit yang disimpan saat hydrate **tetap ada**; habit yang dihapus saat hydrate **tidak dihidupkan** dari snapshot lama. |
| F6 | Medium | **TUTUP** | `enqueue` menunggu tulisan selesai (`:253-272`), `save`/`remove`/`setArchived` mengembalikan hasil + rollback dengan penjaga revisi (`:320-390`), form menampilkan `persist`/`delete`/`archive` (`HabitForm.vue:26,73-127,239`), halaman menampilkan banner (`habit.vue:19,51`). Lihat tabel F6 di atas. |
| F7 | Low | **TUTUP (diukur)** | Dulu jendela tanpa batas bawah (dekripsi seluruh riwayat). Sekarang dibatasi 400 hari. Probe P3 dengan **1.800 baris** (3 habit × 600 hari): hydrate **22,3 ms**, **1.203** dekripsi, **1.200** hari dimuat, **0** scan index `habit_checkin`. Pembanding report #1: 5.475 baris → 93,7 ms tanpa batas. |

### Gap carry-over (bukan bagian perbaikan ini, masih terbuka)

| Gap | Real? | Sev | Bukti (probe P4) | Pemilik |
|---|---|---|---|---|
| (a) `color` & `goalId` tidak ada di schema core → reset setelah reload | **Ya** | **Medium** | simpan `color:5, goalId:<uuid>` → setelah reload `{color:0, goalId:null}`; ikon tunggal tetap (`icon:'heart'`). Mapping: `persistence.ts:112-120` (`icon: icon ?? DEFAULT_HABIT_ICON`, `color: DEFAULT_HABIT_COLOR`, `goalId: null`). Form menampilkan swatch warna & chip goal, jadi user melihat pilihannya hilang. | `bayu` (schema `packages/core`) lalu `dimas` |
| (b) Ikon hilang saat sticker dipakai | **Ya** | **Low** | `icon:'heart'` + `sticker:'aktivitas/belajar'` → setelah reload `icon:'star'`, `sticker` tetap. Satu kolom core `iconSticker` (`persistence.ts:89`), fallback `DEFAULT_HABIT_ICON` (`:52`, `:112`). Kosmetik. | `bayu` + `dimas` |

Keduanya **bukan regresi** perbaikan ini dan sudah tercatat di report #1; tetap saya buktikan ulang supaya
tidak ada yang mengira ikut beres.

---

## Finding baru

### F8 — Low — Check-in lebih tua dari 400 hari tersimpan tapi tidak terbaca lagi

**Di mana:** `apps/web/app/utils/habits/persistence.ts:164` (jendela `nowMs − 400 hari`), `apps/web/app/pages/app/habit.vue:56` (navigasi bulan tanpa batas ke belakang), `apps/web/app/components/features/habit/HabitGrid.vue:162` (hanya hari **depan** yang dinonaktifkan).

**Repro (probe P2, eksekusi nyata):**

1. Buat habit hari ini (2026-10-19).
2. Klik `‹` ±14 kali sampai ±2025-08-25 (H−420), klik kotaknya.
3. Kotak langsung menampilkan `1`; record `habit_checkin` tertulis (`amount=1`).
4. Reload / buka sesi baru.

**Expected:** check-in tetap tampil (record ada dan bukan tombstone).
**Actual:** `checkIns[habitId]` kosong; record tetap ada di IndexedDB (dibuktikan `listAll({includeDeleted:false})` = 1 baris). Di luar jendela baca 400 hari.

**Kenapa tidak memblokir:** batas ini **eksplisit didokumentasikan** sebagai trade-off di `persistence.ts:37-44`
("check-in di luar jendela tidak dibaca - bukan data hilang, hanya riwayat yang tidak pernah dipakai UI") dan
konsisten dengan batas streak `HABIT_LOOKBACK_DAYS` (`utils/habits.ts:84`). Kelas bug-nya sama dengan F1, tetapi
butuh ≥400 hari backfill manual, dan datanya tidak yatim (hapus habit tetap menyapu semuanya). Berbeda dari F1
yang menghilangkan check-in **kemarin**.

**Saran perbaikan (kecil, test-only tidak cukup):** nonaktifkan sel grid yang lebih tua dari jendela
(`HabitGrid`: tambah syarat `cell.day >= windowStart`), atau batasi navigasi bulan. Dengan begitu UI tidak bisa
membuat data yang tidak bisa ditampilkannya sendiri.

### Nit kerapian (tidak memblokir)

- **N1** `useHabits.ts:417` — `activeHabits` diekspor sebagai kunci kedua yang nilainya **identik** dengan
  `habits` (`:416`). Tidak dipakai kode produk (hanya test). Pilih satu nama supaya tidak ada dua "sumber arti
  aktif"; atau hapus dari objek return.
- **N2** `useHabits.ts:347` — `remove(id)` mengembalikan `{ok:true}` kalau habit tidak ada di state, **tanpa**
  menyentuh DB. Tidak terjangkau dari UI sekarang (tombol hapus hanya muncul untuk habit yang dibuka dari state),
  tapi bentuk ini menyembunyikan "tidak menghapus apa pun" sebagai sukses. Sebaiknya `{ok:false}` atau minimal
  komentar eksplisit.
- **N3** `setDay` (`useHabits.ts:279-295`) melakukan rollback klik check-in tanpa pesan apa pun. Kotak kembali
  sendiri (terlihat), jadi bisa diterima; kalau nanti ada toast global, sambungkan ke `error`.

---

## Cek test tidak palsu

- **Tidak ada** `it.only`/`describe.only`/`.skip(`/`xit(` di `apps/web/app`, `apps/web/i18n`, `packages/core/src`.
  Satu-satunya `skip()` yang ditemukan adalah API produk Pomodoro (`usePomodoro.test.ts:92,124`), bukan skip test.
- **Assertion berperilaku**, bukan detail implementasi: hasil `save`/`remove`/`setArchived`, isi `habits`/
  `archivedHabits`/`checkIns`, teks yang dirender + `role="alert"`, event yang di-emit (`saved`/`close`),
  dan **isi DB nyata** (`loadHabits`, `listAll`, `listOutbox`) lewat `fake-indexeddb` + libsodium asli.
- **Mock hanya di batas**: `useHabits.test.ts` menyuntik `session` (seam resmi `UseHabitsOptions.session`),
  bukan mem-mock modul internal; `persistence.test.ts` tidak memakai kripto tiruan sama sekali.
- Test baru benar-benar menguji perbaikan: tiap kasus F1–F6 punya nilai yang **persis** merupakan assertion
  yang gagal di report #1 (mis. F1: `checkIns[habitId]` berisi 7 hari backfill, sebelumnya `{}`).
- Test tidak "menghijaukan" diri dengan menguji implementasi internal: tidak ada assertion pada `hydrateInFlight`,
  `writeQueue`, atau `writeRevision`.
- **Batasan metodologi yang saya akui:** saya **tidak** melakukan mutation test pada kode produk (dilarang
  mengubah `app/**` non-test), jadi "test akan merah kalau fix dicabut" tidak saya buktikan dengan mengembalikan
  bug. Bukti penggantinya: probe QA yang saya tulis **independen** dari test developer menguji skenario yang sama
  dari nol dan lulus; dan setiap kasus menegaskan nilai konkret, bukan `toBeDefined()`.

Jumlah kasus test habit sekarang: `useHabits.test.ts` 15, `persistence.test.ts` 11, `habits.test.ts` 11,
`HabitForm.test.ts` 5, `HabitArchive.test.ts` 3, `habit.test.ts` 2. Provider coverage belum dikonfigurasi di
`apps/web`, jadi tidak ada angka persentase yang saya klaim.

---

## Tiga pilar pada diff

**Keamanan — lulus.** Probe P1 pada sesi nyata: blob `habit` tidak memuat nama habit (teks mentah maupun
setelah base64-decode); outbox hanya metadata (`id`, `recordId`, `op`, `queuedAtMs`, `attempts`, `lastError`) —
tanpa `blob`/`data`, tanpa plaintext nama habit. `dataKey` tetap di scope modul, tidak masuk `useState`
(`useLocalData.ts:12-19`). Tombstone menyimpan ciphertext, `getById` mengembalikan `null` untuk tombstone
(`repository.ts:64`). Tidak ada `v-html`/`innerHTML`, tidak ada input user yang masuk URL. Catatan retensi F2
sudah tutup (tidak ada lagi baris yatim). `console.*` nol di file yang diubah (grep). Isolasi per akun: browser
membuang sesi lokal saat `userId` berubah (`useLocalData.ts:92-96`) dan logout melakukan navigasi eksternal
(reload penuh, `useLogout.ts:47`) sehingga `useState('habits')` tidak bocor antar akun.

**Performa — lulus, dengan satu biaya yang terdokumentasi.** Jalur baca normal tetap ber-index dan **tidak
menambah full scan**: instrumentasi (probe P1/P3) menunjukkan `listIndexByType` hanya dipanggil untuk `habit`
(1×), check-in dibaca **satu** `queryByRange` dengan batas `now−400h … now+1h`, dan **0** scan index
`habit_checkin`. Dekripsi terbatas pada jendela (1.203 baris untuk DB 1.800 baris). Biaya baru ada di **hapus**:
`removeHabit` memakai `listAll` + filter per habit = O(n) seluruh check-in (`persistence.ts:196-221`) dan
**sudah didokumentasikan sebagai trade-off** (`:200-208`). Terukur: DB 600 baris (2 habit × 300 hari), hapus 1 habit → **300 tombstone dalam 247 ms** (termasuk scan+dekripsi 600 baris, ±0,8 ms/baris),
jadi habit harian 5 tahun (±1.825 baris) ≈ 1,5 s di desktop — terasa, tapi aksi sekali pakai, tombolnya
`disabled` selama `pending`, dan alternatifnya (arsip) tersedia. Tidak ada loop fetch, tidak ada N+1, tidak ada
dependency baru.

**Kerapian — lulus.** `eslint --max-warnings 0` dan `nuxi typecheck` hijau; tidak ada `any`, `@ts-ignore`,
`eslint-disable`, atau `console.*` di file yang diubah; `app/composables/habits/mock.ts` (mock fase 1) sudah
dihapus dan tidak ada sisa referensi `createHabitsMock`/`habits/mock`; konstanta sihir diangkat
(`CHECKIN_LOOKBACK_DAYS`, `DEFAULT_HABIT_COLOR`, `DEFAULT_HABIT_ICON`, `HABIT_LOOKBACK_DAYS`); komentar
menjelaskan "kenapa" (mis. alasan jendela tetap vs `createdAt`); SFC tetap di bawah ~200 baris logika
(`HabitForm.vue` 332 baris termasuk `<style>`, `HabitArchive.vue` 133); `v-for` pakai `:key` id; tidak ada mutasi
props. Nit N1–N3 di atas.

---

## Coverage & celah test yang tersisa

- **Sudah ada (permanen):** seluruh jalur F1–F6 di composable + persistence, plus 3 file test UI baru
  (`HabitForm`, `HabitArchive`, halaman `habit.vue`).
- **Belum ada (celah, tidak memblokir):**
  1. Jalur **sukses** di komponen arsip/form (`HabitForm` "Arsipkan" berhasil, `HabitArchive` "Kembalikan"
     berhasil, hapus berhasil) hanya diuji di level composable. Test komponen berjalan tanpa sesi, jadi hanya
     jalur gagal yang bisa diuji. Butuh seam sesi untuk komponen (mis. prop/`useNuxtApp` inject) kalau mau
     ditutup.
  2. `useOverview`, `usePomodoroTargets`, `useDailyRoutine` **tidak punya test file**. Jaminan "terarsip hilang
     dari semua consumer" saat ini bersandar pada satu test di `useHabits.test.ts` (bahwa `habits` = aktif).
     Probe QA membuktikan konsumennya benar, tapi probe itu tidak permanen → regresi consumer di masa depan
     tidak akan tertangkap.
  3. Tidak ada E2E (Playwright) untuk alur Habit: navigasi bulan, klik backfill, konfirmasi hapus, banner error.
     F1 dulu lolos justru karena celah ini.
  4. `habit.test.ts` menggerakkan banner error dengan menulis `useState('habitsStatus')='error'` langsung, bukan
     lewat kegagalan hydrate nyata. Cukup untuk menguji pemetaan render halaman; transisi status sebenarnya
     sudah saya buktikan di probe (tidak permanen).
- Provider coverage belum dikonfigurasi → tidak ada angka coverage yang diklaim.

---

## Risiko sisa

1. **F8** (Low): backfill >400 hari tidak terbaca setelah reload. Batas terdokumentasi, UI masih mengizinkan.
2. **Gap (a)/(b)** carry-over: warna & goal hilang setelah reload; ikon hilang saat sticker dipakai. Butuh
   schema core (`bayu`).
3. **Hapus O(n)** (`persistence.ts:209-221`): ±0,8 ms/baris; habit bertahun-tahun bisa terasa lambat. Kalau
   nanti jadi keluhan, jalannya adalah query per-habit di `packages/core`, bukan menambah kerja di web.
4. **`remove()` no-op dianggap sukses** kalau habit tidak ada di state (N2) — belum terjangkau UI.
5. **Streak dibatasi 400 hari** (`utils/habits.ts:125`) — pre-existing, konsisten dengan jendela baca.
6. **Timezone travel / DST di tengah malam** tetap tidak diuji (matriks zona dari report #1 tidak diulang di
   putaran ini; `localDate` otoritatif saat baca, risiko rendah).
7. **Outbox hanya menumpuk** — belum ada konsumen sync di lingkup T10, jadi `delete` intent belum pernah
   dikirim ke mana pun.
8. **Race tulis antar tab** tidak diuji (write queue bersifat per-instance modul, bukan lintas tab).

---

## Rekomendasi (urut)

1. **Tutup F8 dengan mencegah, bukan menambah jendela:** nonaktifkan sel grid sebelum `now − 400 hari`
   (atau batasi navigasi bulan). Satu perubahan kecil di `HabitGrid.vue` + 1 test.
2. **Tambahkan test consumer permanen** (`usePomodoroTargets.test.ts`, `useDailyRoutine` case habit) yang
   menegaskan habit terarsip tidak muncul — supaya jaminan AC1 tidak bergantung pada satu assertion di
   composable.
3. **Beri seam sesi pada `HabitForm`/`HabitArchive`** supaya jalur sukses arsip/hapus/kembalikan bisa diuji di
   level komponen (sekarang hanya jalur gagal).
4. **N1/N2/N3:** hapus alias `activeHabits` yang duplikat, jadikan `remove()` no-op sebagai kegagalan eksplisit,
   dan pertimbangkan menyambungkan kegagalan check-in ke notifikasi.
5. **Jadwalkan schema core** untuk `color`/`goalId`/ikon+sticker (gap a & b) bersama `bayu`.
6. Pertimbangkan **E2E Playwright** minimal 1 skenario: buat habit → backfill → arsip → kembalikan → hapus.

Kepemilikan: F8, N1–N3, dan celah test 1–4 → web (`dimas`). Gap (a)/(b) → core (`bayu`) lebih dulu.
