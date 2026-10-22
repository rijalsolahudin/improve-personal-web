# QA verification #3 — Task #24 [T10] Habit: CRUD, check-in, streak

Tanggal: 2026-10-22 · Reviewer: Fajar (QA) · Tree: `9c434e4` (perbaikan T10 = `561d73f`)
Report sebelumnya: `qa-report.md` (GAGAL, F1–F7), `qa-report-2.md` (LULUS dengan catatan, F8 + gap carry-over)

Rules yang dibaca: root `CLAUDE.md` + `.claude/rules/{shared-security,shared-code-quality,ergonio-status-flow}.md`,
`apps/web/CLAUDE.md`, `apps/web/.claude/rules/{security,performance,code-quality}.md`, `AGENTS.md`.
Requirement: `docs/PRD.md` F7 (baris 274–316) dan AC T10 (baris 1094: *"Streak benar untuk habit hari tertentu
(hari non-jadwal tidak memutus); unit test streak"*).

Environment: Node `v24.18.0`, `vitest 5.0.3`, pnpm workspace, host TZ `Asia/Jakarta` (UTC+7).
Tidak ada MCP/Ergonio di sesi ini — status task tidak saya ubah (sesuai instruksi).

**Tidak ada kode produk yang diubah QA.** Diff kerja QA murni 6 file test baru (`git status`):
`git status --short` → hanya `?? apps/web/app/**/{habit-color,habit-read-path,useHabits.qa,useHabits.consumers,HabitGrid,HabitForm.validation}.test.ts`
(plus `M .commandcode/taste/workflow/taste.md` yang sudah ada sebelum saya mulai, bukan milik saya).

---

## Verdict: **LULUS (dengan catatan)**

Ketiga perubahan `561d73f` **terbukti lewat eksekusi test yang saya tulis sendiri**, bukan pembacaan kode
dan bukan mengulang test developer:

1. **Warna habit** kini round-trip: index UI → hex core → index UI, termasuk record lama tanpa `color`
   (jadi 0, tidak melempar) dan hex tak dikenal (jadi 0).
2. **Aturan klik check-in** benar-benar satu untuk semua hari: hari lampau target 3 → 1, 2, 3, lalu 0;
   hari ini sama; target 1 → 0→1→0.
3. **Grid** menampilkan `count/target` untuk hari lampau parsial dengan `aria-label` yang benar, hari depan
   tetap `disabled`.
4. **Arsip** hilang dari grid, Daily, Overview (streak, heatmap, completion rate) dan target Pomodoro;
   streak **tidak** putus oleh hari non-jadwal; riwayat check-in tetap utuh saat dikembalikan.
5. **CRUD** (rename, ubah target, hapus beserta check-in) tidak meninggalkan data yatim.

Semua gate hijau tanpa satu pun warning. Catatan yang **tidak memblokir**: tiga batas/gap lama yang tidak
disentuh commit ini (F8 jendela baca 400 hari, `goalId` belum dipersist, ikon hilang saat sticker dipakai)
plus empat nit kerapian. Tidak ada bug baru.

---

## Hasil gate (dijalankan di tree ini, exit code diambil apa adanya)

| # | Command (cwd) | Exit | Hasil |
|---|---|---|---|
| 1 | `npx nuxt typecheck` (`apps/web`) | **0** | senyap = tanpa error tipe |
| 2 | `npx eslint app --max-warnings 0` (`apps/web`) | **0** | tanpa output = bersih |
| 3 | `npx vitest run app i18n` (`apps/web`) | **0** | **76 file, 624 test lulus** (baseline sebelum test QA: 70 file / 577 test) |
| 4 | `npx vitest run` (`packages/core`) | **0** | **11 file, 190 test lulus** |
| 5 | `pnpm exec prettier --check` 6 file test QA (root) | **0** | "All matched files use Prettier code style!" |

Baseline diukur lebih dulu (sebelum saya menulis test): `70 passed (70)` / `577 passed (577)` — jadi
**+6 file / +47 test** adalah milik QA, dan tidak ada test developer yang hilang/berubah.

---

## Test yang saya tambahkan (47 kasus, semuanya lulus)

| File (baru) | Kasus | Isi |
|---|---|---|
| `apps/web/app/utils/habits/habit-color.test.ts` | 8 | round-trip warna palet 0–7, hex tersimpan, record lama tanpa `color`, hex asing, huruf/spasi, index di luar palet, warna saat edit, `color: null` |
| `apps/web/app/utils/habits/habit-read-path.test.ts` | 2 | bentuk query hydrate (1× `queryByRange`, 0× scan `habit_checkin`, 1× batch `getRecords`), jumlah dekripsi, query tidak tumbuh dengan jumlah habit |
| `apps/web/app/composables/useHabits.qa.test.ts` | 14 | urutan klik hari lampau/hari ini/target 1, record hilang saat 0, persist setelah sesi baru, warna lewat `save`, CRUD (rename/target/hapus), validasi, arsip |
| `apps/web/app/composables/useHabits.consumers.test.ts` | 11 | streak non-jadwal (murni + lewat store), Daily, Overview (streak/heatmap/rate), Pomodoro, kembalikan dari arsip |
| `apps/web/app/components/features/habit/HabitGrid.test.ts` | 8 | `count/target` hari lampau, `aria-label`/`aria-pressed`, hari depan disabled, hari bukan jadwal, baris arsip, nama berisi HTML |
| `apps/web/app/components/features/habit/HabitForm.validation.test.ts` | 4 | `maxlength` nama, `aria-invalid` + pesan, batas target 1–20 di UI, "Hari tertentu" kosong ditolak |

Semua sesi uji memakai IndexedDB + libsodium **sungguhan** (`habit-color.test.ts`, `// @vitest-environment node`)
atau adaptor memori core dengan kripto tiruan murah untuk pengukuran (`habit-read-path.test.ts`,
`useHabits.qa.test.ts`). Tidak ada `it.only`/`.skip`/`any`/`@ts-ignore` (grep di 6 file → **tidak ada match**),
dan grep repo-wide `app/**` + `i18n/**` untuk `.only(`/`xit(`/`xdescribe(` hanya menemukan `IDBKeyRange.only`
(API browser di `utils/storage/indexeddb.ts`) — bukan skip test.

---

## Acceptance criteria

| AC / bukti yang diminta | Status | Bukti (perintah + lokasi test) |
|---|---|---|
| **a. Warna bertahan setelah simpan → reload sesi baru** | **LULUS** | `habit-color.test.ts:92` — 8 habit (index 0–7) disimpan, **sesi IndexedDB baru** dibuka, semua index kembali sama (`colorById` = `saved.map(color)`). Bug lama membuat semuanya `0` → assertion indeks 1–7 gagal. `useHabits.qa.test.ts:265` — lewat `save()` composable: state `color 5`, record core `color: '#E6A800'`, reload → `color 5`. `:279` edit warna 0→6 juga bertahan. |
| **a1. Record lama tanpa `color` → index 0, tidak throw** | **LULUS** | `habit-color.test.ts:118` — payload `habit` mentah tanpa key `color` (simulasi record versi lama) → `loadHabits` **resolve** dengan `color: 0` (kalau `.default(null)` dicabut, `habitSchema.parse` melempar dan test gagal). `:173` untuk `color: null` eksplisit. |
| **a2. Hex tak dikenal → index 0** | **LULUS** | `habit-color.test.ts:127` (`#123456` → 0, tidak melempar), `:136` (`#e6a800` → 5, `' #FF6A13 '` → 1), `:148` (index 99 **tidak** disimpan sebagai hex karangan: core `color: null` → UI 0) |
| **b. Hari lampau target 3: 3 klik → 1,2,3; klik ke-4 → 0 & record hilang** | **LULUS** | `useHabits.qa.test.ts:151` — `toggleDay` hari lampau (15 Okt) berturut: `1, 2, 3` (dengan `isMet` hanya true di 3), DB berisi 1 baris `amount: 3`, klik ke-4 → state `0`, `listAll({includeDeleted:false})` kosong, dan **setelah reload** hari itu tetap kosong. Kode lama (`nextCount(habit,count,isToday)` → `target` sekali klik untuk hari lampau) membuat assertion `1` gagal. |
| **b1. Hari ini aturan sama** | **LULUS** | `useHabits.qa.test.ts:185` — `1, 2, 3, 0` untuk hari ini, record terhapus di akhir. |
| **b2. Target 1: 0→1→0** | **LULUS** | `useHabits.qa.test.ts:201` — hari ini **dan** hari lampau masing-masing `1` lalu `0`. `:216` klik ketiga tidak menumpuk jadi 2. |
| **b3. Parsial hari lampau bertahan setelah sesi baru** | **LULUS** | `useHabits.qa.test.ts:229` — 2 klik → DB `amount: 2` → reload → `{ [hari]: 2 }`. |
| **b4. Hari depan & hari bukan jadwal tidak bisa di-check-in** | **LULUS** | `useHabits.qa.test.ts:248` — `toggleDay` besok & Selasa lalu untuk habit Senin: `checkIns` kosong, DB kosong. |
| **c. Grid: hari lampau parsial tampil `count/target`, aria-label benar, hari depan disabled** | **LULUS** | `HabitGrid.test.ts:93` — sel 15 Okt: teks `2`, class `partial`, `aria-label="Minum air, Kamis, 15 Okt: 2/3"`, `aria-pressed=false`, **tidak** disabled. `:107` hari lampau tercapai → `✓` + `aria-label …: tercapai` + `aria-pressed=true`. `:150` hari depan (20 Okt) `disabled` + `belum tiba`. `:161` hari bukan jadwal = titik libur tanpa tombol (27 dari 31 sel). `:130` hari ini `1/3`, target 1 → `belum`. Kode lama (`partial`/label hanya untuk `info.isToday`) membuat `:93` dan `:119` gagal. |
| **d. Streak tidak putus oleh hari non-jadwal** | **LULUS** | `useHabits.consumers.test.ts:99` — Sen–Jum, Senin 12–Jumat 16 + Senin 19 → streak **6**; `:106` pembanding habit harian dengan data sama → **1** (putus di Minggu); `:114` hari jadwal terlewat tetap memutus (3); `:128` hari ini belum tercapai tidak memutus + target>1 parsial (2/3) tidak dihitung; `:139` composable memberi angka yang sama dari state aplikasi. |
| **d1. Arsip tidak muncul di Daily** | **LULUS** | `useHabits.consumers.test.ts:168` — `habitsToday` = `['Jalan pagi']`, `habitProgress = {done:1,total:1,percent:100}`. `:234` setelah dikembalikan dari arsip, keduanya muncul lagi. |
| **d2. Arsip tidak muncul / tidak dihitung di Overview** | **LULUS** | `:185` `habitRows` = `['Jalan pagi']` (streak arsip tidak ikut), `:197` `heatmapHabits` & `heatmap.name` hanya habit aktif, `:209` stat completion rate = **14%** (aktif 1/7 hari); kalau arsip (0/7) ikut dirata-rata hasilnya 7% — assertion ini yang menangkap kebocoran. `:222` pilihan target Pomodoro juga bersih. |
| **d3. Arsip hilang dari grid + bisa dikembalikan** | **LULUS** | `HabitGrid.test.ts:179` (baris arsip tidak ada di tabel), `useHabits.qa.test.ts:390` (arsip → `habits` kosong, `archivedHabits` berisi, `toggleDay`/`toggleToday` ditolak, persist setelah sesi baru, `setArchived(false)` mengembalikan). `:413` riwayat check-in arsip tidak hilang saat dikembalikan. |
| **e. CRUD: rename / ubah target / hapus beserta check-in** | **LULUS** | `useHabits.qa.test.ts:294` — rename `Lari pagi`→`Lari sore` (spasi di-trim) + target 1→3 + warna 2: DB `{name, targetPerDay:3, color:'#1DA20F'}`, reload tetap, 3 check-in lama utuh, dan setelah target naik hari 1/3 tidak lagi dianggap tercapai. `:333` hapus 1 dari 2 habit: state bersih, baris check-in turun 3→1, reload menyisakan habit & check-in yang benar saja. |
| **Keamanan: validasi input form** | **LULUS** | `HabitForm.validation.test.ts:41` (`maxlength=80`), `:47` (`aria-invalid=true` + "Nama habit wajib diisi."), `:58` target tidak bisa melewati 20 (`+` disabled di 20, `−` disabled di 1), `:73` "Hari tertentu" tanpa hari → "Pilih minimal satu hari.". Batas penyimpanan: `useHabits.qa.test.ts:363` — 6 draft tidak sah (nama kosong, 81 char, hari kosong, target 0/21/2.5) ditolak dengan kode yang tepat dan **DB tetap kosong**. |
| **Keamanan: tidak ada `innerHTML` dari input user** | **LULUS** | grep `v-html\|innerHTML` di `app/**` (non-test) → hanya 1 match, yaitu **komentar** di `app/utils/icons.ts:3`. Test render: `HabitGrid.test.ts:190` nama `<b>jangan</b><img src=x onerror=alert(1)>` tampil sebagai teks, `row.find('b')`/`find('img')` tidak ada. |
| **Performa: tidak ada N+1 / scan penuh di jalur grid** | **LULUS** | `habit-read-path.test.ts:164` — DB 3 habit × 450 hari check-in (1.350 baris): hydrate hanya **1** `queryByRange`, **0** `listIndexByType('habit_checkin')`, **1** batch `getRecords`, dan **1.197** baris terdekripsi (= 3 × 399 hari yang masuk jendela, < 1.350 baris tersimpan); semua baris yang didekripsi dipakai (hari yang dimuat = baris terbaca), dekripsi total = 1.197 + 3 payload habit. `:212` jumlah query tetap **1** saat habit 1 vs 10 → bukan query per habit. |
| **Kerapian: tidak ada sisa `isToday` untuk aturan klik / dead code** | **LULUS** | grep `isToday` di `app/**` (non-test): di `HabitGrid.vue` hanya untuk penanda visual (`:class`, `current`), **tidak** dipakai menentukan aturan klik; `nextCount(habit, count)` sekarang 2 parameter (`utils/habits.ts:155`) dengan **satu** call site produk (`useHabits.ts:301`) — tidak ada sisa pemanggil bentuk lama. Tidak ada `console.*` di file habit (grep). |

### Non-vakum: kenapa test ini akan merah kalau fix dicabut

Saya **tidak** melakukan mutation test (dilarang mengubah kode produk), jadi setiap kasus dipilih supaya
nilainya persis berlawanan dengan perilaku sebelum `561d73f` — dibuktikan lewat `git show 561d73f`:

| Fix | Perilaku lama (dari diff) | Assertion QA yang gagal kalau fix dicabut |
|---|---|---|
| `color` dipetakan hex↔index | `fromCoreHabit` selalu `DEFAULT_HABIT_COLOR`; schema core tanpa `color` | `habit-color.test.ts:92` (indeks 1–7 kembali 0), `:109` (tidak ada hex tersimpan) |
| `.default(null)` di schema core | record tanpa key `color` → parse gagal | `habit-color.test.ts:118` (harus `resolves`, bukan reject) |
| `nextCount` tanpa `isToday` | hari lampau sekali klik = penuh (`target`) | `useHabits.qa.test.ts:151` (klik pertama harus 1, bukan 3) |
| `partial`/label tanpa `isToday` | angka & label hanya untuk hari ini | `HabitGrid.test.ts:93` (class `partial` + label `2/3`), `:119` (`0/3`) |
| `habits` = habit aktif saja | arsip masih ikut dikembalikan | `useHabits.consumers.test.ts:168,185,209` (nama arsip muncul / rate jadi 7%) |

---

## Bug baru

**Tidak ada bug baru.** Tidak ada temuan yang menghalangi `done`.

## Batas/gap lama yang masih terbuka (bukan regresi commit ini, tidak memblokir)

| # | Sev | Temuan | Bukti / pemilik |
|---|---|---|---|
| F8 | Low | Check-in yang dibuat >400 hari ke belakang **tersimpan tapi tidak terbaca lagi** setelah reload; grid masih mengizinkan navigasi bulan tanpa batas (`pages/app/habit.vue:56`) dan hanya hari depan yang dinonaktifkan (`HabitGrid.vue:164`). Sudah tercatat di report #2 dan didokumentasikan sebagai trade-off di `persistence.ts` (`CHECKIN_LOOKBACK_DAYS = HABIT_LOOKBACK_DAYS`). | `apps/web/app/utils/habits/persistence.ts` (jendela baca) — pemilik `dimas` |
| G1 | Low | `goalId` **tidak** dipersist (form punya chip "Untuk goal"): pilihan goal hilang setelah reload. `color` sudah tidak termasuk daftar ini, jadi warna bukan lagi gap. | `persistence.ts` (`goalId: null` di `fromCoreHabit`) — butuh relasi `goal_link`, pemilik `bayu` lalu `dimas` (T18) |
| G2 | Low | Ikon hilang saat sticker dipakai (`iconSticker` satu kolom): `icon:'heart'` + sticker → setelah reload `icon:'star'`. Kosmetik. | `persistence.ts` `DEFAULT_HABIT_ICON` |

Catatan: F8/G1/G2 **tidak** saya tulis sebagai test "perilaku yang diharapkan" — mengunci bug sebagai
ekspektasi test justru menyesatkan. Semua sudah tercatat di report sebelumnya.

## Nit kerapian (tidak memblokir)

- **N1** `useHabits.ts:196,416-417` — `activeHabits` diekspor sebagai kunci kedua yang nilainya identik
  dengan `habits`. Tidak dipakai kode produk (hanya test & dokumentasi). Pilih satu nama.
- **N2** `useHabits.ts` `remove()` mengembalikan `{ ok: true }` kalau habit tidak ada di state (tidak
  menghapus apa pun) — belum terjangkau UI, tapi bentuk ini menyembunyikan "tidak ada yang dihapus".
- **N3** `HabitGrid` memberi `aria-label` `"0/3"` untuk hari lampau target>1 yang kosong, sedangkan target 1
  memberi `"belum"`. Dua kosakata untuk keadaan yang sama; pembaca layar tetap mendapat informasi benar.
  Konsistenkan jadi `"0/3"` atau `"belum"` untuk keduanya.
- **N4** `HabitGrid.vue` tetap >200 baris termasuk `<style>`; bagian `<script setup>` sendiri ±105 baris,
  jadi masih dalam batas aturan (logika >20 baris sudah di composable). Bukan temuan.

---

## Tiga pilar

**Keamanan — lulus.** Validasi dua lapis: batas input di form (`maxlength=80`, stepper target 1–20,
`aria-invalid`) dan penolakan di jalur simpan (`validateHabitDraft`, 6 kasus diuji, DB tetap kosong). Tidak
ada `v-html`/`innerHTML` dengan data user di `app/**` (satu-satunya match adalah komentar); nama habit berisi
HTML dirender sebagai teks (diuji). Tidak ada `console.*` di file habit. Data tetap terenkripsi: nama habit
tidak muncul di blob record (diuji developer; saya tidak mengulang). `color` yang tidak dikenal **tidak**
pernah disimpan sebagai hex karangan (diuji: index 99 → `null`).

**Performa — lulus (terukur).** Jalur baca grid/Daily/Overview tetap **satu** query rentang ber-index untuk
semua habit, **nol** scan tabel `habit_checkin`, **satu** batch `getRecords` untuk daftar habit — dan jumlah
query tidak berubah saat habit bertambah 1 → 10 (bukti bukan N+1). Dekripsi dibatasi jendela 400 hari: 1.197
baris untuk DB 1.350 baris, dan **semua** yang didekripsi terpakai (tidak ada pembacaan sia-sia). Render grid
sendiri murni komputasi di `computed` (tidak ada IO per sel; 31 sel × jumlah habit tanpa fetch). Tidak ada
dependency baru di commit ini.

**Kerapian — lulus.** `nuxi typecheck` 0, `eslint --max-warnings 0` 0, `prettier --check` hijau untuk file
QA. Tidak ada `any`, `@ts-ignore`, `eslint-disable`, `.only`/`.skip`, atau `console.*` di file QA. Konstanta
sihir sudah dinamai (`HABIT_LOOKBACK_DAYS`, `CHECKIN_LOOKBACK_DAYS`, `DEFAULT_HABIT_COLOR`,
`DEFAULT_HABIT_ICON`), komentar menjelaskan "kenapa" (mis. alasan hex vs index, alasan satu aturan klik).
Sisa nit N1–N4 di atas.

---

## Coverage & celah test yang tersisa

**Sekarang permanen (milik QA, 47 kasus):** warna hex↔index + record lama/hex asing; aturan klik hari
lampau/hari ini/target 1 & 3 + persist setelah sesi baru; grid (`count/target`, `aria-label`,
`aria-pressed`, disabled, hari libur, nama-HTML); streak non-jadwal (murni + store); arsip hilang dari grid/
Daily/Overview/Pomodoro + riwayat utuh saat dikembalikan; CRUD rename/target/hapus; validasi form & jalur
simpan; bentuk query + jumlah dekripsi jalur baca.

**Belum ada (celah, tidak memblokir):**

1. **Klik di UI grid tidak diuji end-to-end ke penyimpanan.** `HabitGrid`/`HabitForm` memanggil
   `useHabits()` tanpa opsi, jadi tidak ada seam untuk menyuntik sesi di level komponen (kalau dipaksa,
   `setDay` akan rollback karena sesi `null`). Aturan klik saya buktikan di lapisan yang memilikinya
   (`toggleDay` + `nextCount`), dan render grid di level komponen dengan state tersemai. Menutup celah ini
   butuh seam sesi (prop/`useNuxtApp` inject) dari `dimas` — sama dengan celah #1 report #2.
2. **Jalur sukses arsip/kembalikan/hapus di level komponen** juga hanya teruji di composable (alasan sama).
3. **Tidak ada E2E Playwright** untuk alur Habit (navigasi bulan → klik backfill → arsip → kembalikan →
   hapus). F1 dulu lolos justru karena celah ini.
4. **Non-fungsional visual tidak diuji:** responsif, dark mode, screen reader nyata, Lighthouse/INP (butuh
   build + preview + browser; tidak dijalankan di putaran ini).
5. **Timezone perjalanan/DST di tengah malam** di luar cakupan; semua test memakai tanggal lokal yang
   dihitung dengan helper produk (`fromIsoDate`/`addDays`) sehingga TZ-agnostik untuk CI.
6. `habit.color` hanya diuji untuk satu akun; isolasi antar akun diuji di suite `account-scope` (bukan
   lingkup T10).

---

## Rekomendasi (urut)

1. **Tutup F8 dengan mencegah, bukan memperlebar jendela:** nonaktifkan sel grid sebelum `now − 400 hari`
   atau batasi navigasi bulan — supaya UI tidak bisa membuat data yang tidak bisa ditampilkannya sendiri.
2. **Beri seam sesi pada `HabitGrid`/`HabitForm`/`HabitArchive`** supaya klik kotak → persist dan jalur
   sukses arsip/hapus bisa diuji end-to-end di level komponen (menutup celah 1 & 2 sekaligus).
3. **Rapikan N1–N3** (hapus alias `activeHabits`, `remove()` no-op sebagai kegagalan eksplisit, satukan
   kosakata aria-label `0/3` vs `belum`).
4. **Jadwalkan G1 (`goalId`) bersama `bayu`** (relasi `goal_link`) sebelum T18; sekarang pilihan goal di form
   habit hanya bertahan sampai reload.
5. Pertimbangkan **E2E Playwright minimal 1 skenario** Habit (buat → backfill → arsip → kembalikan → hapus)
   sebagai jaring regresi lintas lapisan.

Kepemilikan: F8, N1–N4, dan celah test 1–4 → web (`dimas`). G1/G2 → `bayu` (schema/relasi core) lalu `dimas`.
