# QA #69 — Teks "selesai"/arsip tidak lagi diredupkan via opacity (sistemik)

- **Task Ergonio:** #69 (project `personal-productivity`), id `4ea1f635-3bed-4355-b7fe-2705fe0733f8`
- **Tanggal:** 2026-10-23
- **QA:** Fajar
- **Build diuji:** working tree (belum commit) di atas `765369d`; perubahan #69 = 16 komponen Vue + `packages/tokens/src/contrast.qa.test.ts` + `apps/web/app/components/features/doneState.qa.test.ts` (total 18 file)
- **Snapshot pembanding "sebelum":** `git show HEAD:<file>` per komponen (aturan `opacity` asli)
- **Rules dibaca:** `CLAUDE.md` root, `.claude/rules/{shared-code-quality,ergonio-status-flow}.md`, `apps/web/AGENTS.md` → `apps/web/CLAUDE.md` → `apps/web/.claude/rules/{security,performance,code-quality}.md`, `reports/qa-62-contrast.md`, komentar handoff #69
- **Skrip QA (tidak di-commit):** `/tmp/opencode/qa69/{measure,akun,before,landing,guard-scan}.ts` + `*.bak` untuk restore mutation test. Rumus luminansi relatif WCAG 2.1 ditulis ulang sendiri; **tidak** memakai `contrastRatio` repo dan tidak memakai angka handoff.

---

## Verdict

## **LULUS DENGAN CATATAN** (lingkup #69)

Semua acceptance #69 terpenuhi dan diverifikasi ulang dari sumber token + aturan CSS asli:

1. **Tidak ada lagi `opacity` pada teks state persisten.** 25 aturan CSS yang cocok pola `.done`/`.dim`/`.outside`/`revoked` dipindai: **0** yang memakai `opacity`. Sisa `opacity` di repo sudah diverifikasi sebagai disabled/dekorasi/animasi (lihat §5).
2. **Kontras pasangan baru lulus AA di 21 kombinasi gaya × tema.** 8 pasangan yang diminta (`mute-3` @ paper/bg/alt/soft, `mute` @ paper/alt/hover/chip) = **168 hitungan**, minimum **4,636:1** (`mute-3` @ `soft`, tegas/ungu); **0/168** di bawah 4,5 maupun 4,62. Seluruh permukaan lain yang benar-benar dirender (tint kategori 8%/15%, 8 tint countdown, 3 latar hardcoded) juga lulus; minimum keseluruhan **4,728:1** pada teks yang masih memakai `opacity` 0,7 (drag).
3. **State selesai tetap terbedakan tanpa opacity**: coret + checkbox/`aria-checked`/✓ + tint kartu (15%→8%) + badge teks. 2 test perilaku mem-*mount* `TodoRow`/`DailyPriorityRow` dan memastikan kelas `done` + centang + judul tetap dirender.
4. **Test benar-benar menjaga, dibuktikan 4 mutation test** (bukan sekadar klaim): opacity 0,5 dikembalikan di `.done .title` → merah; `line-through` dihapus → merah; token `mute`/`mute-3` diterangkan → test kontras merah; semuanya dipulihkan (md5 identik).

**Catatan non-blocking untuk #69:**
- **P3 — penjaga statis tidak benar-benar mencakup `.revoked`.** Test bernama "…perangkat dicabut memakai token teks" (`doneState.qa.test.ts:143`) memakai `DIM_TEXT = /\.(dim|outside|revoked)\b/` (`:39`) yang **tidak bisa** cocok dengan BEM modifier `.device--revoked` (dua strip). Mutation test membuktikan: `opacity: 0.6` dikembalikan di `akun.vue:237-240` → **5/5 test tetap hijau**. Kode produk sekarang benar (mute-3), tapi regresi di masa depan untuk perangkat dicabut tidak akan tertangkap. Detail §4.1.
- **P3 — angka "sebelum" `device-meta` di komentar & handoff melewatkan opacity bersarang.** `.device--revoked {opacity:.6}` × `.device-meta {opacity:.75}` = alpha efektif 0,45 → **2,591:1**, bukan 6,066:1 (`akun.vue:244-246`). Arah klaim tetap aman (sesudah 7,025), hanya angka baseline yang salah.
- **P3 — handoff menulis `CalendarGridEvent …→4,887`,** padahal tint `.event.done` sekarang 8% → terukur **5,426**; 4,887 adalah nilai di tint 15% (kondisi pra-perbaikan). Understate, tidak berbahaya.
- **Gate repo belum hijau, tetapi bukan dari #69:** `nuxt typecheck` gagal di `app/composables/useMemos.ts:241` dan suite penuh punya 1 file merah (`useMemos.test.ts`, 1-3 test). Keduanya area task memo/jurnal yang masih WIP di tree yang sama; 0 error/failure menyentuh file #69. **Jangan pindahkan #69 ke `done` sebelum pemilik task memo membereskan dua hal itu** — `done` berarti gate hijau.

---

## 1. Scope & test plan

| # | Yang diuji | Metode |
|---|---|---|
| 1 | Diff 18 file #69 (16 komponen + 2 test) | baca diff per file, `git show HEAD:` untuk kondisi "sebelum" |
| 2 | 8 pasangan baru × 21 kombinasi (7 gaya × 3 tema) | skrip sendiri, token efektif = `palette` + `themes[tema]` + `uiStyles[gaya].neutrals` + `brand[tema]` |
| 3 | Latar nyata yang tidak tercakup token: tint kategori 8%/15% (7 warna jadwal), 8 tint countdown, `#f3f9ef`, `#fffdf8`, `#fffbf4` | idem, `color-mix` gaya CSS + alpha compositing |
| 4 | Sisa `opacity` di seluruh `apps/web/app/**/*.vue` (teks vs disabled/dekorasi) | grep + verifikasi manual tiap aturan |
| 5 | Penanda state (bukan warna saja) per komponen | baca template: `aria-checked`, `aria-pressed`, glyph ✓, `text-decoration`, tint |
| 6 | Kualitas test penjaga (bukan vacuous) | `guard-scan.ts` (hitung aturan yang benar-benar cocok) + 4 mutation test |
| 7 | Test kontras tokens membaca token (bukan hardcode) | mutation di `colors.ts`/`styles.ts`, dipulihkan |

**Tidak diuji:** render piksel/axe di browser (butuh server; jaminan di level CSS-source, sama seperti batasan yang sudah ditulis handoff); mobile RN (task web; token ikut tapi tidak ada perubahan layout mobile).

---

## 2. Angka ukur sendiri — tabel yang diminta (8 pasangan × 21 = 168 hitungan)

Ambang WCAG 2.1 SC 1.4.3 = 4,5:1 (semua teks < 18,66px bold / < 24px). Kolom `<4,62` = gerbang `STATE_MARGIN` di test.

| Pasangan | Min (21 komb.) | Terendah di | <4,5 | <4,62 |
|---|---|---|---|---|
| `mute-3` @ `paper` | **5,389** | kertas/ungu | 0/21 | 0/21 |
| `mute-3` @ `bg` | **5,175** | cute/kuning | 0/21 | 0/21 |
| `mute-3` @ `alt` | **5,389** | kertas/ungu | 0/21 | 0/21 |
| `mute-3` @ `soft` | **4,636** | tegas/ungu | 0/21 | 0/21 |
| `mute` @ `paper` | **6,148** | elegan/kuning | 0/21 | 0/21 |
| `mute` @ `alt` | **5,847** | elegan/kuning | 0/21 | 0/21 |
| `mute` @ `hover` | **5,391** | cute/kuning | 0/21 | 0/21 |
| `mute` @ `chip` | **5,265** | cute/kuning | 0/21 | 0/21 |

Minimum keseluruhan grup ini **4,636:1** — sama dengan yang dilaporkan di #62 untuk `mute-3@soft`, konsisten.

### 2.1 Latar tint kategori (alasan `--mute`, bukan `--mute-3`, di kartu jadwal)

| Kombinasi (7 warna × 21 = 147) | Min | Terendah di | <4,5 |
|---|---|---|---|
| `mute-3` @ `mix(solid 15%, paper)` | **4,319** | kertas/ungu · `#0A55E6` | **3/21** (gagal) |
| `mute-3` @ `mix(solid 8%, paper)` | 4,805 | kertas/ungu · `#0A55E6` | 0/147 |
| `mute` @ `mix(solid 15%, paper)` | **4,887** | elegan/kuning · `#0A55E6` | 0/147 |
| `mute` @ `mix(solid 8%, paper)` | 5,426 | elegan/kuning · `#0A55E6` | 0/147 |

→ Klaim komentar `TodoLine.vue:95-100` ("`--mute-3` bisa jatuh ke 4,32:1 di sana") **benar** (4,319) dan `--mute` memang pilihan yang tepat.

### 2.2 Permukaan hardcoded / tint lain yang dirender

| Pasangan | Min | Terendah di | Status |
|---|---|---|---|
| `mute` @ 8 tint countdown (`utils/countdown.ts:36-45`) | **4,947** | elegan/kuning `#DDE7FB` | 0/189, LULUS |
| `mute-3` @ `#f3f9ef` (`JournalIntentionNote` `.note.done`) | **5,305** | elegan/kuning | LULUS |
| `mute-3` @ `#fffdf8` (`akun.vue` `.card`) | **5,589** | elegan/kuning | LULUS |
| `mute-2` @ `#fffdf8` (`.device-meta`) | **7,025** | cute/hijau | LULUS |
| `mute-2` @ `paper` (`AppearanceMenu`) | 6,969 | cute/hijau | LULUS |
| `mute-2` @ `soft` (opsi gaya terpilih) | **5,334** | cute/hijau | LULUS |
| `mute-3` @ `#fffbf4` (`LandingPreviewCard` `.done .todo-label`, pre-existing) | 5,508 | elegan/kuning | LULUS |

### 2.3 Teks yang **masih** memakai `opacity` (wajib tetap ≥ 4,5)

| Aturan | Alpha | Min | Terendah di | Status |
|---|---|---|---|---|
| `.event.dragging` (`EisenhowerCard.vue:68-71`, `EisenhowerPool.vue:102-105`) | 0,7 | **4,842** (`paper`) / **4,728** (`alt`) | vintage/kuning | LULUS |
| `.hint` (`akun.vue:207-213`), `.lead` (`import-export.vue:75-79`) | 0,8 | 6,545 (`paper`) / 6,257 (`alt`) | vintage/kuning | LULUS |

### 2.4 Bandingkan dengan klaim handoff (semua angka "sebelum" saya hitung sendiri)

| Klaim handoff | Ukur saya | Cocok? |
|---|---|---|
| TodoRow 2,819→5,389 | 2,819 (ink@0,5/paper) → 5,389 | ✔ |
| TodoLine 3,009→4,887 | 3,009 (ink@0,55/mix15) → 4,887 (`mute`@mix15) | ✔ |
| CalendarDayPanel 3,218→5,389 | 3,218 → 5,389 | ✔ |
| CalendarGridEvent 3,367→4,887 (tint 15%→8%) | 3,367 (ink@0,6/mix15) → **5,426** (`mute`@mix8); 4,887 = mix 15% | angka "sesudah" **understate** (aman) |
| CountdownListCard 4,705→4,947 | 4,705 (ink@0,7/tint) → 4,947 | ✔ |
| DailyPriorityRow nomor 2,299→5,389 | 2,299 (accent@0,55/paper) → 5,389 | ✔ |
| Eisenhower drag 1,983→4,842 | 1,983 (ink@0,35) → 4,842 | ✔ |
| GoalSection 3,218→5,389 | 3,218 → 5,389 | ✔ |
| JournalIntentionNote 3,790→5,305 | 3,790 (ink@0,6/#f3f9ef) → 5,305 | ✔ |
| AppearanceMenu `.style-desc` 4,071→5,334 | 4,071 (deeper@0,8/soft) → 5,334 | ✔ |
| akun revoked 3,894→5,589 | 3,894 (ink@0,6/#fffdf8) → 5,589 | ✔ |
| device-meta 6,066→7,025 | **2,591** (ink@0,6×0,75=0,45) → 7,025 | ✖ baseline salah, arah aman (§4.2) |

---

## 3. Hasil per acceptance criteria

| AC #69 | Status | Bukti |
|---|---|---|
| Ganti opacity dengan token warna ≥ 4,5:1 | **PASS** | §2; 25 aturan state, 0 `opacity`; semua pasangan ≥ 4,636 |
| Semua kombinasi gaya × tema lulus | **PASS** | 168 + 147 + 189 + 84 hitungan, 0 gagal pada pasangan yang benar-benar dirender |
| Test kontras tokens mencakup pasangan ini | **PASS** | `contrast.qa.test.ts:272-300`; mutation `mute`/`mute-3` → merah (§6) |
| State selesai tetap terbedakan (coret/ikon/warna) | **PASS** | §5; 2 test perilaku + `line-through`/checkbox/✓/badge/tint |
| Tidak ada regresi visual besar | **PASS dengan catatan** | Perubahan hanya warna teks + tint kartu 15%→8%; `.card.dim` & `.cell.outside` kini dibedakan warna+badge/teks, bukan pucat seluruh blok (§4.3) |

---

## 4. Temuan (urut severity)

### 4.1 LOW — Penjaga statis mengklaim `.revoked`, tetapi regex-nya tidak pernah cocok

- **Di mana:** `apps/web/app/components/features/doneState.qa.test.ts:39` (`DIM_TEXT = /\.(dim|outside|revoked)\b/`), dipakai test `:143` "teks redup arsip/luar bulan/perangkat dicabut memakai token teks"; komentar file `:24-25` juga menyebut `revoked`.
- **Masalah:** kelasnya `.device--revoked` (`apps/web/app/pages/app/akun.vue:237`). Regex butuh titik tepat sebelum `revoked`; `--revoked` tidak cocok. `PERSISTENT_STATE:35` punya lubang yang sama, jadi **tidak satu pun** dari tiga test memeriksa `.device--revoked`.
- **Reproduksi (sudah dijalankan):**
  1. tambahkan `opacity: 0.6;` ke `.device--revoked` (`akun.vue:240`);
  2. `pnpm --filter @improve-personal/web exec vitest run app/components/features/doneState.qa.test.ts`;
  3. **hasil: 5/5 hijau** (seharusnya merah). File dipulihkan, md5 identik.
- **Expected:** penjaga merah saat opacity dikembalikan ke `.device--revoked`.
- **Actual:** hijau.
- **Dampak:** kode produk saat ini benar; risikonya regresi masa depan untuk perangkat dicabut lolos CI.
- **Saran (1 baris):** `const PERSISTENT_STATE = /\.(done|dim|outside|revoked)\b|--revoked\b/` (atau `[-_.]revoked\b`), plus satu test yang meng-assert jumlah aturan yang cocok > 0 agar tidak vacuous.
- **Non-blocking untuk #69:** AC #69 tidak mensyaratkan penjaga statis; ini bonus dari handoff.

### 4.2 P3 — Angka "sebelum" `device-meta` salah (opacity bersarang)

- **Di mana:** `apps/web/app/pages/app/akun.vue:244-246` (komentar "Dulu opacity 0.75 × `--ink` (6,07:1)").
- **Fakta:** `.device--revoked {opacity:.6}` (`HEAD`) membungkus `.device-meta {opacity:.75}` → alpha efektif **0,45**. Kontras sebenarnya **2,591:1** (vintage/kuning), bukan 6,066:1. Perbaikan tetap benar dan naik ke **7,025:1**.
- **Dampak:** dokumentasi/handoff menyepelekan beratnya bug lama; tidak memengaruhi hasil.

### 4.3 INFO — Dua state tidak punya penanda non-warna

- `.cell.outside` (`CalendarMonth.vue:145-149`): beda hanya latar `--alt` + teks `--mute-3` (warna). `.card.dim` (`CountdownListCard.vue:73-81`): teks `--mute` + tombol berubah label ("Batal arsip") — ini penanda tekstual, jadi aman.
- Untuk `.cell.outside`, pola ini pre-existing dan lazim di kalender (posisi + header bulan menjadi konteks). Tidak menahan #69; kalau audit SC 1.4.1 ketat diinginkan, tambahkan penanda non-warna (mis. angka tanggal lebih kecil/normal weight). **P3.**

### 4.4 BLOCKER LINTAS-TASK (bukan #69) — gate repo merah di area memo

- `nuxt typecheck` → `app/composables/useMemos.ts(241,29): error TS2322: Type 'Promise<Memo>' is not assignable to type 'Promise<void>'`. Penyebab: `background((session) => persistMemo(...))` mengembalikan `Promise<Memo>`.
- Suite penuh web → **1 file gagal / 177**: `app/composables/useMemos.test.ts` > "menghapus tulisan mempertahankan mood hari itu" (`:287`), `expected 'Halaman dengan mood.' to be ''`; reproducible saat file dijalankan sendiri (1 failed/12 passed). Run paralel penuh sempat melaporkan 3 failure di file yang sama.
- Tidak satu pun file #69 terlibat (`git diff` #69 = CSS komentar + 2 test); perintah test #69 hijau.

---

## 5. Audit state & sisa `opacity`

### 5.1 Penanda state (bukan warna saja)

| Komponen | Bukti penanda |
|---|---|
| `TodoRow.vue:26-33` | `role="checkbox"` + `aria-checked` + `line-through` |
| `TodoLine.vue:30-37` | checkbox `:checked` + `line-through` |
| `CalendarDayPanel.vue:176-183` | checkbox + `line-through` |
| `CalendarGridEvent.vue:82-90,142-156` | tombol ✓ `aria-checked` + tint 15%→8% + `line-through` |
| `CountdownListCard.vue:36-40,73-81` | teks redup + label tombol "batal arsip" |
| `DailyHabitCard.vue:48-55` | check-in `aria-pressed` + `line-through` |
| `DailyPriorityRow.vue:128-140` | checkbox + `line-through` (+ nomor ikut redup) |
| `EisenhowerCard.vue:22-25,92-95` | checkbox + `line-through` |
| `GoalSection.vue:92-103,311-314` | checkbox + `line-through` |
| `JournalIntentionNote.vue:23-31,136-138` | `aria-pressed` + glyph ✓ + `line-through` |
| `ScheduleLinkedTasks.vue:33-40,97-99` | checkbox + `line-through` |
| `TaskRow/index.vue:26-31,87-91` | `Checkbox` + `line-through` |
| `akun.vue:102-109,237-240` | badge teks "revoked/dicabut" + warna redup |
| `AppearanceMenu.vue:175-183` | bukan state (deskripsi gaya) → `mute-2` |

### 5.2 Sisa `opacity` di `apps/web/app/**/*.vue` — semua di luar teks konten

| Lokasi | Jenis | Boleh? |
|---|---|---|
| `Button/index.vue:67`, `IconButton:58`, `Segmented:111`, `Input:57`, `PomodoroTarget:182` | `:disabled` | Ya (WCAG mengecualikan komponen disabled) |
| `QrScanner:170-174` (video), `AccountUnlockForm:216` (input file 1×1) | media/hidden input | Ya |
| `Tape/index.vue:41`, `JournalNote:93`, `JournalIntentionNote:78`, `MascotCanvas:67`, `CountdownListCard:168`, `CalendarGridEvent:408-409` (handle 3px), `ShellPomodoroPill:167-177` (dot pulse) | dekorasi/animasi | Ya |
| `EisenhowerCard:70`, `EisenhowerPool:104` (drag 0,7) | state transien, tetap ≥ 4,728 | Ya (terukur) |
| `akun.vue:212` (`.hint`), `import-export.vue:78` (`.lead`) | teks konten, 0,8 | Ya (≥ 6,257 terukur) |

Tidak ada teks konten persisten yang masih redup di bawah 4,5:1.

---

## 6. Kualitas test (anti-regresi dibuktikan, bukan diklaim)

`guard-scan.ts` memakai logika regex yang sama dengan test: dari **1.662 aturan CSS** di seluruh `apps/web/app/**/*.vue`, pola `PERSISTENT_STATE` mencocokkan **25 aturan** (0 memakai opacity), `DONE_TITLE` **12 aturan**, `DIM_TEXT` **2 aturan** — jadi assertion tidak vacuous (kecuali `revoked`, §4.1).

Mutation test (semua di repo, dipulihkan + diverifikasi md5):

| Mutasi | Hasil yang diharapkan | Hasil nyata |
|---|---|---|
| `opacity: 0.5` dikembalikan di `TodoRow .done .title` | 1 test merah | **merah** — `/…/TodoRow.vue · .done .title · opacity 0.5` |
| `line-through` dihapus dari `TodoRow .done .title` | test "tetap dicoret" merah | **merah** — `TodoRow.vue · .done .title` |
| `themes.kuning.mute` → `#8A7F73` | test "teks redup di kartu arsip…" merah | **merah** (5 test gagal, termasuk yang baru) |
| `uiStyles.tegas.neutrals['mute-3']` → `#8A8A8A` | test "judul selesai di permukaan…" merah | **merah** (4 test gagal, termasuk yang baru) |
| `opacity: 0.6` dikembalikan di `.device--revoked` | merah | **hijau** → bukti gap §4.1 |

Tidak ada `.only`/`.skip`/test di-comment di kedua file test (`grep` exit 1; satu-satunya `skip?.trigger` adalah variabel di `PasskeyOnboarding.test.ts`, bukan `it.skip`).

---

## 7. Perintah & hasil (apa adanya)

| # | Perintah | Hasil |
|---|---|---|
| 1 | `pnpm --filter @improve-personal/tokens exec vitest run` | **exit 0** — `Test Files 3 passed · Tests 32 passed` (206 ms) |
| 2 | `pnpm --filter @improve-personal/web exec vitest run app/components/features/doneState.qa.test.ts app/components/features/daily app/components/features/calendar app/components/features/todo app/components/features/eisenhower` | **exit 0** — `Test Files 6 passed · Tests 22 passed` (3,7 s). Perintah ini **tidak** menghasilkan "12 file/51 test" seperti handoff (folder `todo` tidak punya file test; itu angka perintah lain) |
| 3 | `cd apps/web && npx nuxt typecheck` | **exit ≠ 0** — 1 error: `app/composables/useMemos.ts(241,29) TS2322` (§4.4, bukan #69) |
| 4 | `npx eslint <16 komponen #69 + doneState.qa.test.ts> --max-warnings 0` (cwd `apps/web`) | **exit 0** |
| 5 | `npx eslint . --max-warnings 0` (cwd `packages/tokens`) | **exit 0** |
| 6 | `npx prettier --check packages/tokens/src/contrast.qa.test.ts <16 komponen> apps/web/app/components/features/doneState.qa.test.ts` | **exit 0** — "All matched files use Prettier code style!" |
| 7 | `pnpm --filter @improve-personal/web exec vitest run` (suite penuh, regresi) | **exit ≠ 0** — `Test Files 1 failed | 176 passed (177) · Tests 3 failed | 1367 passed (1370)`; semua di `app/composables/useMemos.test.ts` (bukan #69) |
| 8 | `node /tmp/opencode/qa69/measure.ts` | tabel §2 |
| 9 | `node /tmp/opencode/qa69/before.ts`, `akun.ts`, `landing.ts` | angka "sebelum" & latar hardcoded §2.4 |
| 10 | `node /tmp/opencode/qa69/guard-scan.ts` | cakupan regex penjaga §6 |
| 11 | 4 mutation test + 1 mutation pembuktian gap | §6 |

Tidak ada test yang saya longgarkan, hapus, atau `skip`; tidak ada file produk yang saya ubah (semua mutasi dipulihkan, md5 `colors.ts`, `styles.ts`, `TodoRow.vue`, `akun.vue` identik dengan sebelum mutasi).

---

## 8. Tiga pilar

| Pilar | Penilaian |
|---|---|
| **Keamanan** | Netral-positif. Tidak ada permukaan baru, tidak menyentuh auth/input/secret. Efek samping positif: `.device--revoked` tidak lagi memudarkan badge status "dicabut", jadi indikator keamanan perangkat justru lebih terbaca (5,18:1, sebelumnya terpangkas opacity 0,6). |
| **Performa** | Netral. Hanya nilai `color`/`background` + komentar; 0 byte JS/CSS tambahan (beberapa aturan malah lebih sedikit), tanpa dependency baru. Test penjaga memindai 1.662 aturan CSS sekali (~1 ms). |
| **Kerapian** | Baik: redup lewat token peran (`--mute-3` untuk paper/alt/soft, `--mute` untuk latar tint), alasan ditulis di komentar "kenapa", penjaga statis + test perilaku, ambang diekstrak (`STATE_MARGIN`). Sisa: regex `.revoked` salah (§4.1), satu angka baseline salah (§4.2), nama test masih menyebut "QA #62" (sumber temuan, wajar). |

---

## 9. Celah test yang tersisa & rekomendasi

1. **Perbaiki regex penjaga** agar `.device--revoked` (dan modifier BEM lain seperti `.is-done`, `[data-state='done']`) tercakup; tambahkan assertion "jumlah aturan cocok > 0" per pola supaya penjaga tidak bisa diam-diam vacuous. Prioritas tertinggi dari #69.
2. **`DONE_TITLE` hanya mencakup 5 nama kelas** (`title|name|task-title|item-title|note-text`). `.done .num`/`.done .text` (`DailyPriorityRow.vue:130-133`) hanya dijaga dari `opacity`, bukan dari token warna. Perluas daftar atau ubah pendekatan: untuk semua aturan di bawah `.done`, wajibkan `color: var(--mute*`)` bila ada `color:`.
3. **Penjaga tidak melihat permukaan.** Test kontras memastikan `mute-3` lulus di `paper/bg/alt/soft`, tetapi tidak bisa tahu kalau suatu komponen memindahkan `.done` ke atas `mix(solid 15%, paper)` (4,319 — gagal). Saat ini tidak ada kasus seperti itu (diverifikasi manual), tapi jaminannya bergantung pada review.
4. **Opsional**: satu test ringan yang memeriksa `.event.done` memakai tint ≤ 8% (atau `not.toContain('15%')`), karena alasan "tint diturunkan supaya state tetap terlihat" hanya ada di komentar.
5. **Verifikasi render**: sesudah gate repo hijau, jalankan sekali axe/Lighthouse di halaman To-do, Kalender, Daily, Countdown, dan Akun — jaminan #69 masih di level CSS-source (batasan yang sudah diakui handoff).

---

## 10. Kesimpulan

Perbaikan #69 tepat sasaran: semua teks state "selesai"/arsip yang sebelumnya diredupkan lewat `opacity` sekarang memakai token teks yang terukur **≥ 4,636:1 di 21 kombinasi gaya × tema** (dan ≥ 4,887:1 di latar tint kategori), sementara state tetap terbedakan lewat coret + centang + tint + badge. Penjaga otomatis terbukti menangkap regresi opacity dan penurunan kontras token. Satu lubang penjaga (`.revoked`) dan dua angka dokumentasi perlu dibetulkan, tetapi tidak menahan hasil #69. Gate repo (`typecheck` + 1 file test) masih merah karena pekerjaan memo yang belum selesai — bukan dari perubahan ini.
