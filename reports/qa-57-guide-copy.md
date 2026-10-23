# QA #57 — Selaraskan copy Panduan dengan Goals & `#goal` (T15-03/04/05)

**Task:** Ergonio #57 `Selaraskan copy Panduan dengan Goals & #goal (T15-03/04/05)`
**Tanggal:** 23 Okt 2026 · **QA:** Fajar
**Status saat diuji:** `review` (dipindah orchestrator)
**Tree:** working tree bersama agent lain. Saat QA mulai sudah ada perubahan **bukan dari QA ini**:
`M packages/core/src/io/io.goal-invariants.test.ts` dan `?? apps/web/app/pages/app/memo.draft.qa.test.ts`.
QA tidak menyentuh keduanya.
**Environment:** Linux, `vitest 5.0.3`, Nuxt `4.5.2`, `@nuxt/test-utils` (env `nuxt`), Node dari sesi repo.

Rules dibaca: `CLAUDE.md` root, `.claude/rules/{shared-security,shared-code-quality,ergonio-status-flow}.md`,
`apps/web/AGENTS.md` → `apps/web/CLAUDE.md` → `apps/web/.claude/rules/{security,performance,code-quality}.md`.

---

## Verdict: **LULUS dengan catatan (non-blocking)**

Semua **AC-A (AC-57.1 … AC-57.6)** lulus. Tiap klaim copy yang jadi lingkup task ini sudah dicocokkan ke
**kode nyata**, bukan hanya ke test:

- F13 Goals: `ready`, persistensi terenkripsi, progres core, tautan task/habit/jadwal — **benar**.
- F6 Kalender: penanda target goal + akhir chapter, memo & mood hari itu (tanpa "tiga lapis") — **benar**.
- F7 Habit: capaian habit ikut persentase goal — **benar**.
- F8 Journal: mengajari `@jadwal` **dan** `#goal`/chapter jadi chip, status jujur "masih sesi" — **benar**.
- F15 Akun: lupa OTP/QR/hapus akun/indikator sync, tanpa klaim sync otomatis — **benar**.
- FAQ reload: memisahkan jurnal (sesi) vs goal (tersimpan terenkripsi) — **benar**.

Dua catatan non-blocking (detail di §Temuan): (1) nama test QA basi `guide.qa.test.ts:75` — sudah QA
rapikan (test-only), (2) pernyataan "semua data dienkripsi" di bagian keamanan terlalu luas untuk draf
jurnal & centang rutinitas harian yang tersimpan **plaintext** di `localStorage` — di luar delta #57,
perlu task lanjutan.

---

## Scope & test plan

**Yang diuji**

| Area | Level | Bukti |
|---|---|---|
| Isi `guide.ts` vs kode fitur (F13, F6, F7, F8, F15, FAQ) | review kode + test otomatis | `guide.test.ts`, `guide.qa.test.ts` |
| Halaman Panduan benar-benar merender F1–F16, anchor, FAQ `<details>` | integrasi (`mountSuspended`) | `GuidePage.qa.test.ts` |
| Route `/app/panduan` menang atas `[feature].vue` | integrasi router | `guideRouting.qa.test.ts` |
| Pintu navigasi ke Panduan | integrasi | `ShellNavGuide.qa.test.ts` |
| Klaim persistensi/encryption/progres goal | unit + integrasi storage | `useGoals*.test.ts`, `goals/persistence.test.ts`, `goals.links.qa.test.ts` |
| Klaim mention `#goal`, review goal → jurnal, filter/overview/kalender | unit + komponen | `memo.test.ts`, `MemoGoalMention.qa.test.ts`, `DailyGoalReviewCard.qa.test.ts`, `HabitForm.goal.qa.test.ts`, `useMemos*.test.ts` |
| Lint & format file copy | statis | `eslint --max-warnings 0`, `prettier --check` |
| Grep klaim berisiko ("belum/segera/disiapkan/mock/in-memory/tiga lapis") | statis | grep manual, tiap hit dibaca konteksnya |

**Yang TIDAK diuji (dan alasannya)**

- E2E browser sungguhan (Playwright) untuk kartu review goal di Daily dan penanda kalender — perilaku
  komponennya sudah diuji di level RNTL/VTU; E2E web adalah task terpisah (T16). Tidak ada server/DB nyata
  di sesi QA ini.
- Enkripsi at-rest dibuktikan lewat **rantai kode** (record → `sealRecord` sodium), bukan dengan membuka
  IndexedDB browser; test unit memakai provider base64 sebagai double. Detail di AC-57.1.
- Sync antar perangkat tidak diuji karena **memang belum ada** (dan copy tidak mengklaimnya).

---

## Hasil per acceptance criteria

### AC-57.1 — F13 Goals `ready`: persist terenkripsi + progres + tautan ✅ PASS

| Klaim copy | Bukti kode |
|---|---|
| `status: 'ready'` | `apps/web/app/utils/guide.ts:61` |
| "tersimpan terenkripsi di perangkat ini" | `app/composables/useGoals.ts:33-44` (record core di penyimpanan terenkripsi, bukan mock) → `app/utils/goals/persistence.ts:142-163` (`session.writer.write`) → `app/utils/storage/record-writer.ts:122` (`encodeRecord`) → `app/utils/storage/record-codec.ts:51-60` (`provider.sealRecord`); provider & `dataKey` asli: `app/utils/storage/session.ts:187,200,229` |
| "progres dihitung otomatis dari task, habit, serta jadwal" | `packages/core/src/calc/goal.ts:76` (task), `:99` (habit), `:156` (jadwal), `:277` (`goalProgressReport`) |
| "tautan item tersimpan" | `app/utils/goals/links.ts:40` (repo `goal_link`), `:122,133` (lewat `session.writer`, ikut tersegel) |
| "pilihan 'Untuk goal' di task, habit, jadwal" | `TodoForm.vue:120`, `HabitForm.vue:222`, `ScheduleForm.vue:157` (semua `<GoalPicker>`) |
| "Satu item hanya dihitung sekali" | `packages/core/src/domain/entities/goal.ts:267` (`checkGoalBundle` → `checkGoalLinksUnique`) |
| "item yang dihapus tidak ikut menghapus goal" | `app/utils/goals/persistence.ts:30-33,216` (`resolveGoalLinks`, tautan yatim dilewati) |
| "review chapter terlewat: perpanjang/geser/tutup; akhir pekan goal aktif juga ditanya" | `app/utils/goals.ts:235-279` (`goalReviewTargets`), `DailyGoalReviewCard.vue:115-125` |
| "jawabannya masuk jurnal dengan chip `#goal`" | `DailyGoalReviewCard.vue:59-66` (`memos.append(today, note + "\n\n#[goalId]")`) + render chip `JournalNote.vue:81` → `MemoGoalMention.vue` |
| "progres goal muncul di Overview" | `app/composables/useOverview.ts:151,377,448` |
| "target goal & akhir chapter ditandai di Kalender" | `app/composables/useCalendarData.ts:74-100` |
| "sampul dari koleksi sticker yang sama" | `app/pages/app/goals.vue:122` (`<LazyDecoPicker>`), `GoalHero.vue:38` (`DecoStickerArt`) |
| "daftar goal bisa disaring per status" | `app/components/features/goal/GoalFilters.vue:4-14` |

Tidak ada lagi klaim "hilang setelah reload" untuk goal (`guide.ts:62-68`). Test regresi
`guide.test.ts:112-123` mengunci `ready` + "tersimpan/terenkripsi/progres" dan menolak
`belum tersimpan|selama sesi|masih disiapkan`.

### AC-57.2 — F6 Kalender: penanda goal/chapter + memo/mood, bukan "tiga lapis" ✅ PASS

- Copy: `guide.ts:79` menyebut "penanda tanggal target goal dan akhir chapter, serta ringkasan memo dan
  mood hari itu"; tip `:84` "Panel hari menampilkan memo dan mood tanggal itu, lengkap dengan tautan ke
  jurnalnya".
- Kode: `useCalendarData.ts:64-102` (`kind: 'countdown' | 'goal' | 'chapter'`), `:105-115` (`memoOn` =
  memo terbaru + mood), `CalendarDayPanel.vue:74-81` (penanda) dan `:224-236` (memo + mood + link jurnal).
- "hari/pekan/bulan": `app/utils/schedule.ts:467` (`CALENDAR_VIEWS`), default per hari di HP:
  `app/pages/app/kalender.vue:16-18`.
- `grep -nE "tiga lapis"` → tidak ada hit.

### AC-57.3 — F7 Habit & F8 Journal ✅ PASS

- F7 tip `guide.ts:173`: "Habit bisa ditautkan ke goal saat dibuat, dan capaiannya selama periode chapter
  ikut menghitung persentase goal." → `HabitForm.vue:221-234` (GoalPicker), `goals/persistence.ts:317-327`
  (`habitRate` per periode chapter) → `core/calc/goal.ts:369-380` (habit slice masuk progres).
  Streak "hari non-jadwal netral" sesuai `packages/core/src/calc/streak.ts:9-27`.
- F8 tip `guide.ts:187`: "`@` untuk jadwal, `#` untuk goal dan chapter; keduanya jadi chip." →
  `app/utils/memo.ts:41-56` (`goal-mention`), `:81-93` (`goalMentionQuery`, `insertGoalMention`),
  `MemoEditor.vue:69-81` (picker goal **+ chapter**), chip dirender `JournalNote.vue:81` /
  `MemoEntry.vue:48`.
- Test lama yang melarang `#` sudah diganti menjadi **mewajibkan** `#`: `guide.test.ts:101-110`
  (`/tulis @/` + tip berisi `#` yang menyebut goal). Tidak ada `.only`/`.skip` di 4 file panduan.
- Status F8 `partial` konsisten: `useMemos.ts:41-47` dan `useJournalDay.ts:18-23` memang in-memory
  (`useState`), bukan persist.

### AC-57.4 — F15 Akun ✅ PASS

| Klaim | Bukti |
|---|---|
| login tanpa password: OTP email / Google | `components/features/auth/AuthEmailStep.vue:16-45`, `useLoginFlow.ts:42` (callback Google di server) |
| tautan "Tidak bisa menerima kode?" → passkey/kode/berkas terenkripsi | `i18n/locales/id.json:1099`, `AuthRecoveryStep.vue:4-15,50-52` → `AccountUnlockForm` |
| tambah perangkat lewat QR, 2 menit & sekali pakai | `useDevicePairing.ts:27-41`; `KEY_TRANSFER_TTL_SECONDS = 120` (`packages/contracts/src/keys.test.ts:134`), sekali pakai ditegakkan server (`claimed_at`) |
| daftar perangkat + logout jarak jauh | `app/utils/account/devices-gateway.ts:12-29,77` |
| hapus akun: konfirmasi email + kode 6 digit, permanen | `useAccountDeletion.ts:20-32,99-130`, `DeleteAccountDialog.vue:7` |
| indikator sync di shell, hanya antrean lokal | `useSyncStatus.ts:1-30`, `features/shell/ShellSyncStatus.vue:26` |
| **tidak** mengklaim sync otomatis | `guide.ts:258,263` ("Yang belum: sinkronisasi otomatis…"), FAQ `:428`; test `guide.test.ts:141-151` menolak `/sudah tersinkron otomatis/` & `/sync otomatis sudah/` |

### AC-57.5 — FAQ reload memisahkan jurnal vs goal ✅ PASS

`guide.ts:441-443`: jurnal (termasuk mood) bertahan selama sesi; goal/chapter tersimpan terenkripsi;
task, habit, jadwal, countdown, sesi Pomodoro tetap ada setelah reload. Semua klaim persistensi dicek:
`useTasks`/`useHabits`/`useSchedules`/`useCountdowns.ts:12`/`usePomodoro.ts:27,151` memakai repository
terenkripsi. Tidak ada FAQ yang bertentangan: FAQ sync (`:428`) dan `GUIDE_SECURITY.soon` (`:364`)
sama-sama bilang sync otomatis belum ada.

### AC-57.6 — Test & "copy tidak mengklaim fitur yang belum ada" ✅ PASS (dengan 1 catatan)

- 5 file panduan hijau: **39/39** (lihat §Perintah).
- Copy tidak mengklaim fitur yang belum ada untuk lingkup #57 — semua klaim F13/F6/F7/F8/F15 sudah
  ditelusuri ke kode di atas.
- Catatan: pernyataan enkripsi menyeluruh di bagian keamanan (bukan bagian dari delta #57) terlalu luas —
  lihat Temuan #3.

---

## Temuan

### #1 — LOW (proses, sudah diperbaiki QA): nama test QA basi `guide.qa.test.ts:75`

- **Klaim vs kenyataan:** nama test "… & QR masih belum ada" sudah tidak benar (tambah-perangkat lewat QR
  sudah rilis: `useDevicePairing.ts`, `KeyRecoveryGate.qr.qa.test.ts`). Assertion-nya sendiri **masih
  valid**: `GUIDE_SECURITY.soon` (`guide.ts:364`) memang memuat "QR" dan "belum" (yang belum = sync
  otomatis).
- **Tindakan QA:** nama test diganti menjadi
  `pemulihan lewat perangkat baru menyebut OTP bukan pembuka kunci; QR sudah ada, sync otomatis yang belum`
  + komentar alasan. Assertion **tidak diubah**. Test-only, sesuai batas kewenangan QA.
- **File:** `apps/web/app/utils/guide.qa.test.ts:75-84`.

### #2 — LOW (proses): perintah verifikasi di task menunjuk path yang tidak ada, dan tetap "hijau"

- Perintah literal memakai `app/pages/app/GuidePage.qa.test.ts` (tidak ada; file aslinya
  `app/components/features/guide/GuidePage.qa.test.ts`) dan tidak menyertakan
  `app/components/features/shell/ShellNavGuide.qa.test.ts`. Vitest **diam-diam mengabaikan** path yang
  tidak cocok: perintah literal hanya menjalankan **3 file / 29 test**, bukan 39.
- Ini bukan bug produk, tapi jebakan false-green untuk handoff. Klaim "39/39" baru terbukti dengan
  perintah terkoreksi di §Perintah (5 file).
- **Rekomendasi:** pakai path yang benar di template verifikasi QA berikutnya.

### #3 — MEDIUM (non-blocking, di luar delta #57, perlu task lanjutan): "semua data dienkripsi" vs data plaintext di `localStorage`

- **Klaim copy:** `guide.ts:325` "Data disimpan lokal di perangkatmu dan **dienkripsi** dengan kunci yang
  cuma kamu pegang" dan `guide.ts:330` "**Semua data** dienkripsi dengan kunci ini".
- **Kenyataan kode:** dua jenis data pengguna disimpan **plaintext** di `localStorage`, bukan lewat
  repository tersegel:
  - draf jurnal (`ip-memo-draft-<tanggal>`): `app/composables/useMemoDraft.ts:11-14,67-76,93-102`;
  - centang & langkah rutinitas harian (`ip-daily`): `app/composables/useDailyRoutine.ts:22-38`.
  Mitigasi yang sudah ada: key ber-prefix `ip-` ikut dihapus saat logout/hapus akun (`clearAppStorage`),
  dan draf dibuang setelah halaman disimpan.
- **Dampak:** user bisa menyimpulkan seluruh teks jurnal yang sedang ditulis sudah terenkripsi, padahal
  drafnya tersimpan terbaca di perangkat. Tidak ada klaim "fitur ada padahal tidak" pada delta #57, jadi
  **tidak menghalangi** AC-A; tapi ini copy keamanan, jadi sebaiknya diperbaiki (enkripsi draf, atau
  persempit kalimat menjadi "data yang disimpan lewat penyimpanan terenkripsi").
- **Terkait:** FAQ `guide.ts:443` bilang isi jurnal "bertahan selama sesi", padahal draf yang belum
  disimpan justru **selamat setelah reload** (`useMemoDraft.ts:48-64,118-126`). Arahnya aman
  (under-promise), tapi dua kalimat ini sebaiknya diselaraskan dalam satu task copy.

---

## Cek tiga pilar

| Pilar | Status | Catatan |
|---|---|---|
| **Keamanan** | ⚠️ catatan | Copy panduan tidak memakai `v-html`/`innerHTML`/`eval` (dikunci `guide.qa.test.ts:129-158`); tidak ada data sensitif di copy. Satu-satunya isu = Temuan #3 (kalimat enkripsi menyeluruh vs draf/rutinitas plaintext). |
| **Performa** | ✅ | Perubahan hanya data statis (`guide.ts`) + 1 nama test. Tidak menambah dependency, tidak menyentuh jalur render data/fetch. `GuidePage.qa.test.ts` memastikan halaman tetap statis (tanpa `useFetch`). |
| **Kerapian** | ✅ | `eslint --max-warnings 0` dan `prettier --check` hijau untuk `guide.ts` **dan** file test yang QA sentuh; tidak ada `.only`/`.skip`/test di-comment; tidak ada `console.*`; nama test kini sesuai perilaku. |

---

## Coverage & celah test yang tersisa

1. **Tidak ada E2E browser** untuk kartu review goal di Daily → jurnal (chip `#goal`) dan penanda
   kalender. Rantainya diuji per unit/komponen, tapi integrasi halaman nyata belum (task E2E T16).
2. **Klaim F6/F7/F15 "lupa OTP"** sebagian hanya diverifikasi manual (QA baca kode), belum dikunci test
   copy. `guide.test.ts` mengunci F6 (goal/memo, bukan "tiga lapis"), F15 (QR/hapus akun/indikator), tapi
   tidak mengunci frasa "Tidak bisa menerima kode?" atau "capaian habit ikut persentase goal".
   Rekomendasi: tambah 2 assertion copy bila ingin mencegah regresi (bukan blocker).
3. **Klaim enkripsi menyeluruh** tidak punya test yang membandingkan copy dengan daftar storage plaintext
   — itulah sebabnya Temuan #3 tidak tertangkap otomatis.

---

## Perintah verifikasi & hasil (verbatim)

```bash
# 1) Perintah dari task (path GuidePage salah + ShellNavGuide tidak disertakan)
pnpm --filter @improve-personal/web exec vitest run app/utils/guide.test.ts app/utils/guide.qa.test.ts app/pages/app/GuidePage.qa.test.ts app/utils/guideRouting.qa.test.ts
# -> Test Files 3 passed (3) · Tests 29 passed (29)   <-- vitest mengabaikan path yang tidak ada

# 1b) Terkoreksi (4 file)
pnpm --filter @improve-personal/web exec vitest run app/utils/guide.test.ts app/utils/guide.qa.test.ts app/components/features/guide/GuidePage.qa.test.ts app/utils/guideRouting.qa.test.ts
# -> Test Files 4 passed (4) · Tests 37 passed (37)

# 1c) Terkoreksi lengkap = klaim 39/39 (setelah perbaikan nama test QA)
pnpm --filter @improve-personal/web exec vitest run app/utils/guide.test.ts app/utils/guide.qa.test.ts app/components/features/guide/GuidePage.qa.test.ts app/utils/guideRouting.qa.test.ts app/components/features/shell/ShellNavGuide.qa.test.ts
# -> Test Files 5 passed (5) · Tests 39 passed (39)

# 2)
pnpm --filter @improve-personal/web exec eslint app/utils/guide.ts --max-warnings 0
# -> exit 0, tanpa output

# 3)
pnpm exec prettier --check apps/web/app/utils/guide.ts
# -> Checking formatting... All matched files use Prettier code style!  (exit 0)

# 4)
grep -nE "belum|segera|disiapkan|mock|in-memory|tiga lapis" apps/web/app/utils/guide.ts
# -> 15 baris; semuanya dibaca: sisa "belum" hanya untuk jurnal (sesi), sync otomatis, tema belum ikut
#    akun, dan banner badge. Tidak ada "segera/disiapkan/mock/in-memory/tiga lapis".

# tambahan: regresi area klaim (goals, goal links, review card, memo/journal)
pnpm --filter @improve-personal/web exec vitest run app/composables/useGoals app/utils/goals app/components/features/goal app/components/features/habit/HabitForm.goal.qa.test.ts app/components/features/daily/DailyGoalReviewCard.qa.test.ts app/utils/memo app/components/features/memo app/composables/useMemos app/components/features/journal
# -> Test Files 16 passed (16) · Tests 75 passed (75)

# tambahan: file test yang QA sentuh tetap bersih
pnpm --filter @improve-personal/web exec eslint app/utils/guide.qa.test.ts --max-warnings 0   # exit 0
pnpm exec prettier --check apps/web/app/utils/guide.qa.test.ts                                # All matched files use Prettier code style!
grep -rn "\.only\|\.skip\|it\.todo\|xit(" app/utils/guide*.test.ts app/components/features/guide/GuidePage.qa.test.ts app/utils/guideRouting.qa.test.ts  # tidak ada hit
```

---

## File yang QA ubah/tambah

| File | Jenis | Alasan |
|---|---|---|
| `apps/web/app/utils/guide.qa.test.ts` | ubah (test-only, baris 75-84) | Rename test basi "QR masih belum ada" → perilaku saat ini; assertion tidak diubah. Temuan #1 / B-57.1 |
| `reports/qa-57-guide-copy.md` | tambah | Laporan ini |

**Tidak ada kode produk yang diubah.** Tidak ada commit (sesuai instruksi). Perubahan
`packages/core/src/io/io.goal-invariants.test.ts` dan `apps/web/app/pages/app/memo.draft.qa.test.ts` yang
muncul di working tree **bukan** dari QA ini (sudah ada sebelum QA mulai).

---

## Rekomendasi untuk orchestrator

1. **#57 → `done`** (AC-A hijau, bukti 39/39 + 75 test regresi area klaim, eslint/prettier bersih).
2. Buat task lanjutan (Low/Medium, copy keamanan): selaraskan kalimat "semua data dienkripsi" dengan draf
   jurnal (`ip-memo-draft-*`) dan rutinitas harian (`ip-daily`) yang plaintext — atau enkripsi keduanya.
3. Perbaiki template perintah verifikasi QA (path `GuidePage.qa.test.ts` + sertakan `ShellNavGuide`),
   supaya "39/39" tidak lagi terlihat lulus padahal hanya 29 test yang jalan.
