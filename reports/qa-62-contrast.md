# QA #62 — Kontras AA teks state terpilih di semua gaya × tema (MAYOR-2 #30)

- **Task Ergonio:** #62 (project `personal-productivity`) — turunan QA #30 (T16) MAYOR-2 / B8 yang didefer T25
- **Tanggal:** 2026-10-23
- **QA:** Fajar
- **Build diuji:** working tree (belum commit) di atas `765369d`; perubahan #62 ada di `packages/tokens/src/{colors,styles,contrast.qa.test}.ts`
- **Snapshot pembanding:** `git show HEAD:...` = commit `8aa272d` (T25, sudah membawa sebagian fix) sebagai **"sebelum"**
- **Rules dibaca:** `CLAUDE.md` root, `.claude/rules/shared-code-quality.md`, `.claude/rules/ergonio-status-flow.md`, `apps/web/AGENTS.md` → `apps/web/CLAUDE.md` → `apps/web/.claude/rules/{performance,code-quality}.md`, `reports/qa-t16-e2e-web.md` §5.2, komentar handoff #62
- **Skrip QA (tidak di-commit):** `/tmp/opencode/qa62/{contrast,usage-scan,token-diff,opacity-case,category-colors,goal-dot,crosscheck}.ts` + `before/` & `after/` (salinan sumber token). Rumus luminansi relatif ditulis ulang sendiri; **tidak** memakai `contrastRatio` milik repo dan **tidak** memakai satu pun angka handoff.

---

## Verdict

## **LULUS DENGAN CATATAN**

Semua acceptance criteria #62 terpenuhi, diverifikasi ulang dari sumber token (bukan dari angka handoff):

1. **Pasangan state lulus di 21 kombinasi.** Matriks penuh 25 pasangan × 21 kombinasi = **525 hitungan**: **0** yang < 4,5:1, **0** yang < 4,62:1. Minimum **4,624:1** (`accent` di `soft`, cute-pure/hijau); sebelumnya (HEAD `8aa272d`) minimum 4,505:1 dengan 27/525 di bawah 4,62.
2. **441 pasangan permukaan utama T25 tidak turun satu pun**: 0 regresi, 3 naik (semua karena token teks digelapkan, bukan karena permukaan berubah). Minimum tetap **4,506:1** (`placeholder` di `paper`, kertas/ungu) — sama seperti baseline T25.
3. **Anti-regresi nyata, bukan hardcode.** `contrast.qa.test.ts` membaca token efektif; saya buktikan dengan **mutation test** di salinan luar repo: mengembalikan `mute-3` tegas ke nilai HEAD (#646464) membuat test merah (`tegas/ungu · ramp mute-3 di soft … = 4.57:1`), menerangkannya lebih jauh (#8A7F73) juga merah (3,01–3,20:1).
4. **Pemakaian nyata bersih**: teks redup di 7 komponen yang diminta tidak ada yang duduk di permukaan yang gagal. Semua pemakaian muted-on-state sekarang ≥ **4,835:1**.
5. **Gerbang hijau**: tokens 30/30, vitest web (kalender+pomodoro, lihat catatan perintah di §7), `nuxt typecheck` exit 0, eslint & prettier bersih.

**Tidak memblokir #62** (semua pre-existing, sudah tercatat atau jadi calon task baru):
- Permukaan `--primary` masih gagal (sudah jadi **task #67**): ramp redup 3,573–4,149:1; `StatTile` label `--deep` 3,975:1; ikon `DailyWeatherPicker` 1,14–3,96:1.
- `--dash` sebagai **latar teks** gagal 3 dari 4 pasangan (1,89–2,74:1) — **tidak ada teks yang dirender di atas `--dash`**; token ini garis/dekorasi dan pemakaiannya sudah diverifikasi (lihat §4.2).
- Temuan baru di luar lingkup: teks `--paper` di atas warna **kategori solid** (centang habit, angka stepper goal) 2,03–4,45:1; dan pola `opacity` untuk state "selesai" (mis. title to-do selesai 2,97:1). Keduanya bukan permukaan token state → calon task terpisah, bukan blocker #62.

Catatan kecil (P3, non-blocking): handoff menyebut "24 nilai token" — yang berubah **20 deklarasi** (19 pasangan nilai unik), ΔE76 maks 0,948, dan klaim "42/42 test kalender+pomodoro" **tidak tereproduksi** dengan perintah yang ditulis di handoff (hasil nyata 1 file/3 test; lihat §7).

---

## 1. Scope & test plan

**Diuji (dengan eksekusi, bukan membaca laporan):**

| # | Yang diuji | Metode |
|---|---|---|
| 1 | 21 kombinasi (7 gaya × 3 tema), token efektif = `palette` + `themes[tema]` + `uiStyles[gaya].neutrals` + `brand[tema]` | skrip sendiri, rumus WCAG 2.1 ditulis ulang |
| 2 | Pasangan #30: `mute-3`/`mute`/`accent`/`ink-2` × `soft`/`hover`/`dash` (12 pasangan × 21 = 252) | idem, sebelum vs sesudah |
| 3 | Matriks state penuh: 8 token teks × {`soft`,`hover`,`chip`} + `ink-2@dash` = 25 pasangan × 21 = 525 | idem, ambang 4,5 **dan** 4,62 |
| 4 | 441 pasangan permukaan utama T25 (21 pasangan × 21) + delta sebelum→sesudah | idem |
| 5 | Permukaan `--primary` (8 token teks × 21) | idem, dilaporkan terpisah |
| 6 | Pemakaian nyata: `CalendarTimeGrid`, `PomodoroHistory`, `Card`, `StatTile`, `HabitGrid`, `GoalStepper`, `Sheet`, `Button`, `Segmented`, + pindai heuristik seluruh `apps/web/app/**/*.vue` | skrip pindai CSS (45 kombinasi latar×teks) + verifikasi manual tiap temuan |
| 7 | Kualitas test `contrast.qa.test.ts` (menghitung vs hardcode, ambang, `.only`/`.skip`) | baca kode + mutation test di salinan `/tmp` |
| 8 | Perubahan token: token mana yang berubah, ΔE76, apakah permukaan ikut berubah | `token-diff.ts` (CIELAB ΔE76) |

**Tidak diuji (dan alasannya):**

- **Mobile** — task ini web/tokens; `packages/tokens` dipakai bersama, jadi nilai baru ikut ke RN, tapi kontras mobile tidak diukur (di luar lingkup, tidak ada perubahan layout mobile).
- **Render piksel nyata (screenshot/axe di browser)** — task meminta verifikasi kontras token + pemakaian; axe otomatis tidak menangkap teks di atas `color-mix`/`opacity` dengan baik dan butuh server. Kandidat penguatan berikutnya (§10).
- **`color-mix`/`opacity` diukur menyeluruh** — pola `opacity` ada di 15+ tempat; saya ukur satu contoh terburuk sebagai ilustrasi (§4.4), bukan audit penuh.
- **Baseline T16 asli** tidak bisa dihitung ulang: tree yang diukur T16 (3,506 / 3,747 / 3,866 / 4,295 / 4,135) adalah WIP T25 yang **tidak pernah di-commit**. Angka itu saya kutip di §3 hanya sebagai rujukan, bukan hasil ukur saya.

---

## 2. Hasil per acceptance criteria

| AC #62 | Status | Bukti |
|---|---|---|
| Semua teks normal ≥ 4,5:1 di 21 kombinasi gaya × tema **termasuk pasangan state** | **PASS** | §3.1–3.3; minimum matriks 25 pasangan = 4,624:1; 0/525 < 4,5 |
| `packages/tokens` punya test kontras untuk pasangan state (anti-regresi) | **PASS** | §6: 5 test state + loop matriks 24 pasangan, semua menghitung dari token (mutation test membuktikan) |
| Tidak mengubah palet utama yang sudah lulus 441 pasangan | **PASS** | §5: **0** token permukaan (`paper`/`bg`/`alt`/`soft`/`hover`/`chip`/`primary`/`dash`/`line`) berubah; 0 pasangan T25 turun, 3 naik |
| Angka sebelum/sesudah dilampirkan | **PASS** | §3 (semua tabel punya kolom before/after) |

---

## 3. Angka ukur sendiri — sebelum vs sesudah

Legenda: **sebelum** = `git show HEAD` (`8aa272d`), **sesudah** = working tree #62. Semua angka = **rasio terendah** dari 21 kombinasi, beserta kombinasi tempat nilai terendah itu muncul. Ambang teks normal WCAG 2.1 SC 1.4.3 = 4,5:1 (semua teks yang diperiksa < 18,66px bold / < 24px, jadi ambang "large text" tidak dipakai).

### 3.1 Pasangan #30 (12 pasangan × 21 = 252 hitungan)

| Pasangan | Sebelum | Sesudah | Δ | Status sesudah |
|---|---|---|---|---|
| `mute-3` @ `soft` | 4,567 (tegas/ungu) | **4,636** (tegas/ungu) | +0,069 | LULUS |
| `mute-3` @ `hover` | 4,906 (cute/kuning) | **4,981** | +0,075 | LULUS |
| `mute` @ `soft` | 4,965 (vintage/ungu) | **4,965** | 0 | LULUS |
| `mute` @ `hover` | 5,391 (cute/kuning) | **5,391** | 0 | LULUS |
| `accent` @ `soft` | 4,576 (vintage/hijau) | **4,624** (cute-pure/hijau) | +0,048 | LULUS |
| `accent` @ `hover` | 4,881 (cute/kuning) | **4,951** | +0,070 | LULUS |
| `ink-2` @ `soft` | 5,828 (cute/hijau) | **5,828** | 0 | LULUS |
| `ink-2` @ `hover` | 6,264 (cute/hijau) | **6,264** | 0 | LULUS |
| `ink-2` @ `dash` | 4,505 (kertas/hijau) | **4,627** (kertas/hijau) | +0,122 | LULUS |
| `mute-3` @ `dash` | 1,862 (kertas/hijau) | **1,890** | +0,028 | **GAGAL** — token garis, 0 teks dirender di atasnya (§4.2) |
| `mute` @ `dash` | 2,349 (kertas/hijau) | **2,349** | 0 | **GAGAL** — idem |
| `accent` @ `dash` | 2,698 (vintage/hijau) | **2,739** | +0,041 | **GAGAL** — idem |

Rujukan historis (kutipan §5.2 `qa-t16-e2e-web.md`, tree WIP tidak pernah commit, **bukan** hasil ukur saya): `mute-3`@`soft` 3,506 (21/21 gagal) · `mute`@`soft` 3,747 (15/21) · `accent`@`soft` 3,866 (16/21) · `mute`@`hover` 4,295 (4/21) · `ink-2`@`dash` 4,135 (2/21). Kelima temuan MAYOR-2 itu **hilang** di hasil ukur saya: 4,636 / 4,965 / 4,624 / 5,391 / 4,627.

### 3.2 Matriks state penuh (25 pasangan × 21 = 525 hitungan)

Pasangan = 8 token teks (`ink`, `ink-2`, `mute`, `mute-2`, `mute-3`, `accent`, `deep`, `deeper`) × 3 permukaan (`soft`, `hover`, `chip`) + `ink-2`@`dash`.

| Pasangan | Sebelum | Sesudah | Pasangan | Sebelum | Sesudah |
|---|---|---|---|---|---|
| `ink` @ soft | 9,214 | 9,214 | `deep` @ soft | 4,889 | 4,889 |
| `ink` @ hover | 10,543 | 10,543 | `deep` @ hover | 5,255 | 5,255 |
| `ink` @ chip | 9,972 | 9,972 | `deep` @ chip | 5,415 | 5,415 |
| `ink-2` @ soft | 5,828 | 5,828 | `deeper` @ soft | 6,259 | 6,259 |
| `ink-2` @ hover | 6,264 | 6,264 | `deeper` @ hover | 6,727 | 6,727 |
| `ink-2` @ chip | 6,208 | 6,208 | `deeper` @ chip | 6,932 | 6,932 |
| `mute` @ soft | 4,965 | 4,965 | `mute-3` @ soft | 4,567 | **4,636** |
| `mute` @ hover | 5,391 | 5,391 | `mute-3` @ hover | 4,906 | **4,981** |
| `mute` @ chip | 5,265 | 5,265 | `mute-3` @ chip | 4,791 | **4,865** |
| `mute-2` @ soft | 5,334 | 5,334 | `accent` @ soft | 4,576 | **4,624** |
| `mute-2` @ hover | 5,732 | 5,732 | `accent` @ hover | 4,881 | **4,951** |
| `mute-2` @ chip | 5,831 | 5,831 | `accent` @ chip | 4,767 | **4,835** |
| `ink-2` @ dash | 4,505 | **4,627** | _(25 pasangan)_ | — | — |

- **Minimum sesudah: 4,624:1** (`accent` @ `soft`, cute-pure/hijau). Minimum sebelum: 4,505:1 (`ink-2`@`dash`, kertas/hijau).
- Gagal < 4,5: **0 / 525** (sebelum juga 0).
- Gagal < 4,62 (gerbang `STATE_MARGIN`): **0 / 525** (sebelum **27 / 525**: `mute-3`@soft 10, `accent`@soft 13, `ink-2`@dash 4).
- Sisa ruang minimum ke AA: **+0,124**; ke gerbang test 4,62: **+0,004** (lihat catatan §6.3).

### 3.3 441 pasangan permukaan utama T25 (21 pasangan × 21)

| Pasangan | Sebelum | Sesudah | Pasangan | Sebelum | Sesudah |
|---|---|---|---|---|---|
| `ink` @ paper | 11,742 | 11,742 | `accent` @ paper | 5,545 | 5,545 |
| `ink` @ bg | 10,640 | 10,640 | `accent` @ bg | 5,067 | **5,124** |
| `ink` @ alt | 11,042 | 11,042 | `paper` @ accent | 5,545 | 5,545 |
| `ink-2` @ paper | 7,547 | 7,547 | `placeholder` @ paper | 4,506 | 4,506 |
| `deep` @ paper | 6,386 | 6,386 | prio-urgent | 4,629 | 4,629 |
| `deeper` @ soft | 6,259 | 6,259 | prio-medium | 4,607 | 4,607 |
| `mute` @ paper | 6,148 | 6,148 | prio-low | 4,591 | 4,591 |
| `mute` @ bg | 5,600 | 5,600 | `success` @ paper | 4,591 | 4,591 |
| `mute-2` @ paper | 6,969 | 6,969 | `success` @ success-soft | 4,992 | 4,992 |
| `mute-3` @ paper | 5,308 | **5,389** | `danger` @ paper | 4,901 | 4,901 |
| `mute-3` @ bg | 5,097 | **5,175** | | | |

**0 dari 21 pasangan turun**, 3 naik (`mute-3`@paper +0,081, `mute-3`@bg +0,078, `accent`@bg +0,057), 18 tidak berubah. Minimum tetap **4,506** (`placeholder` @ `paper`, kertas/ungu) — sama dengan baseline T25, jadi tidak ada regresi. Diverifikasi juga bahwa **tidak satu pun token permukaan berubah** (audit §5), sehingga kenaikan/penurunan hanya bisa datang dari penggelapan tinta.

### 3.4 Permukaan `--primary` — temuan terpisah (task #67), bukan blocker #62

| Pasangan (sesudah) | Min | Gagal <4,5 | Terendah di |
|---|---|---|---|
| `deeper` @ primary | 5,088 | 0/21 | cute/hijau |
| `ink-2` @ primary | 4,589 | 0/21 | cute/ungu |
| `mute-2` @ primary | 4,149 | 2/21 | cute/ungu |
| `deep` @ primary | **3,975** | 2/21 | cute/hijau |
| `mute` @ primary | **3,824** | 3/21 | cute/ungu |
| `accent` @ primary | **3,575** | 15/21 | cute/ungu |
| `mute-3` @ primary | **3,573** | 10/21 | cute/ungu |
| `ink` @ primary | 7,722 | 0/21 | cute/ungu |

Total **32/168** hitungan gagal (sebelum: 38/168 — penggelapan `accent`/`mute-3` memperbaiki 6: `mute-3` 15→10 kombinasi, `accent` 16→15; sisanya tetap). Pemakaian nyata yang gagal:

- `app/components/ui/StatTile/index.vue:51,78` → `value` = `--deeper` (aman 5,09) tapi `label` = `--deep` di `--primary` = **3,975** (cute/hijau, cute/kuning).
- `app/components/features/daily/DailyWeatherPicker.vue:55-59` → ikon terpilih berwarna `WEATHER_META.color` di `--primary`: **1,14–3,96** (cerah #E6A800 = 1,14 di ungu), gagal juga ambang non-teks 3:1.
- `Card` varian `primary` (`app/components/ui/Card/index.vue:58`) — **tidak dipakai** di app (hanya `paper`/`tinted`), teks default `--ink` di `--primary` = 7,722 aman.

→ Sudah tercatat sebagai **task #67**; saya tidak menjadikannya blocker #62 (bukan pasangan state, dan bukan regresi dari perubahan ini).

---

## 4. Pemakaian nyata

### 4.1 Komponen yang diminta — semua teks redup aman

| Komponen | Pasangan | Min (21 kombinasi) | Status |
|---|---|---|---|
| `CalendarTimeGrid.vue:223-227` `.head.selected .dow` (12px) | `mute-2` @ `soft` | **5,334** | aman |
| `CalendarTimeGrid.vue:237-241` `.head.today .num` (22px) | `deep` @ `soft` | **4,889** | aman |
| `CalendarTimeGrid.vue:365-368` `.slot:hover` (10,5px) | `mute-2` @ `hover` | **5,732** | aman |
| `CalendarTimeGrid.vue:215-220,316-322` `.dow`/`.hour` (11-12px, latar `.board` = `--paper`) | `mute-3` @ `paper` | **5,389** | aman |
| `PomodoroHistory.vue:115-118` `.skipped .badge` | `ink-2` @ `chip` | **6,208** | aman |
| `PomodoroHistory.vue:105-106` `.badge` | `paper` @ `accent` | **5,545** | aman |
| `PomodoroHistory.vue:136-145` `.time`/`.empty` | `mute` @ `paper` | **6,148** | aman |
| `HabitGrid.vue:268-303` `.th-day.today .dow` (10px) | `deeper` @ `soft` | **6,259** | aman |
| `HabitGrid.vue:354-361,443` `.freq`/`.streak-unit` | `mute` @ `paper` | **6,148** | aman |
| `HabitGrid.vue:242,295` `.th-name`/`.dow` (sticky `--paper`) | `mute-3` @ `paper` | **5,389** | aman |
| `GoalStepper.vue:154` `.period` (13px) | `mute` @ `paper` | **6,148** | aman |
| `Sheet/index.vue:66-71` `.grabber` | `--dash` (bukan teks) | — | aman (dekorasi 44×5px) |
| `StatTile` `tile-soft .value` | `ink` @ `soft` | **9,214** | aman |
| `StatTile` `tile-primary .value` | `deeper` @ `primary` | 5,088 | aman |
| `StatTile` `.label` di `tile-primary` | `deep` @ `primary` | **3,975** | **gagal** → #67 |
| `Card` `card-soft` (teks slot) | `ink` @ `soft` | **9,214** | aman |
| `Button .btn-chip` / `:hover` | `deep` @ `chip` / `hover` | 5,415 / 5,255 | aman |
| `Button .btn-primary`, `Segmented` terpilih | `paper` @ `accent` | **5,545** | aman |

Pindai heuristik seluruh `apps/web/app/**/*.vue` (aturan CSS berlatar `--soft`/`--hover`/`--chip`/`--dash`/`--primary`/`--alt`/`--bg`/`--paper` + warna teks di aturan yang sama atau turunannya) menemukan 45 kombinasi latar×teks. Setelah verifikasi manual, **satu-satunya yang gagal** adalah `deep`@`primary` (StatTile, §3.4). Enam temuan "paper@paper 1,000" dari skrip adalah **false positive** pola centang-tak-terlihat: `.checkbox { background: --paper; color: --paper }` lalu `[aria-checked='true'] { background: --success }` — glyph baru dirender saat latar berubah (`Checkbox/index.vue:41-42,56-58`, `CalendarGridEvent.vue:329-337`, `CalendarGridTask.vue:75-82`, `DailyHabitCard.vue:219-226`, `JournalIntentionNote.vue:117-124`).

Tambahan di luar AC (karena T25 tidak menguji ramp redup di `--alt`/`--bg`): saya ukur 8 pasangan × 21 = 168 hitungan — `mute-3`@alt **5,389** · `mute`@alt 5,847 · `mute-2`@alt 6,499 · `mute-2`@bg 6,023 · `deep`@alt 5,957 · `deep`@bg 5,521 · `deeper`@alt 7,626 · `ink-2`@bg 6,582. **0 gagal**, jadi tidak ada celah tersembunyi dari permukaan `alt`/`bg`.

### 4.2 `--dash` sebagai latar teks: keputusan "token garis" terverifikasi di kode

`--dash` (dan `dash-2`) gagal sebagai latar teks (`mute-3` 1,890 / `mute` 2,349 / `accent` 2,739), tapi **tidak ada teks yang dirender di atasnya**. Bukti: seluruh pemakaian `background: var(--dash…)` di `apps/web/app` hanya 3, semuanya non-teks —

- `app/components/features/habit/HabitGrid.vue:375` → `.off` titik 5×5px (hari tak terjadwal);
- `app/pages/app/habit.vue:202` → titik legenda 5×5px;
- `app/components/ui/Sheet/index.vue:71` → `.grabber` 44×5px.

`--dash-2` hanya dipakai sebagai `border` (9 tempat: `Button/index.vue:139`, `CalendarGridTask.vue:50`, `DailyTodoCard.vue:137`, `DecoLayer.vue:262`, `DecoStickerButton.vue:43`, `CalendarMonth.vue:142`, `RecoveryBackupCard.vue:267`, `countdown.vue:180`, `goals.vue:209`). `HabitGrid.vue:385` `.box` memakai `--dash` sebagai `border`, bukan latar. Satu-satunya pemakaian lama sebagai latar teks (`PomodoroHistory` badge "dilewati") sudah pindah ke `--chip` (`PomodoroHistory.vue:113-118`).

→ **Bukan pelanggaran WCAG**: yang dinilai adalah teks yang dirender. Risiko sisa: pemakaian baru di masa depan. Rekomendasi murah ada di §10.

### 4.3 Catatan akurasi komentar komponen

Komentar di `CalendarTimeGrid.vue:223-225` (mute-2 di soft "terendah 5,33:1"), `:237-239` (`--deep` di soft "terendah 4,89:1") dan `:367` (mute-2 di hover "terendah 5,73:1") **cocok** dengan ukur saya (5,334 / 4,889 / 5,732).

Satu angka usang: `PomodoroHistory.vue:113-115` menulis "`--ink-2` di atas `--dash` gagal di kertas (4,14:1)". Dengan token sekarang nilainya **4,627** (sebelum #62: 4,505). Angka 4,14 berasal dari baseline T16 (tree WIP) — historis, bukan salah, tapi menyesatkan pembaca yang mengukur ulang. P3.

### 4.4 Temuan di luar lingkup (pre-existing, calon task baru — **bukan** blocker #62)

Bukan permukaan token state, tapi terukur dan berisiko; saya laporkan supaya tidak hilang:

1. **Teks `--paper` di atas warna kategori solid.** `HabitGrid.vue:166,412-416` (centang `✓` 13px di `--h-solid`), `DailyHabitCard.vue` (`.box.on`) dan `CalendarGridEvent.vue:330,336-338` (`.done .check` di `--ev-solid`):
   `#E6A800` **2,03** · `#10A8D8` 2,66 · `#FF6A13` 2,78 · `#1DA20F` 3,25 · `#F03FBF` 3,28 · `#E2445C` 3,88 · `#9B4FC9` 4,65 · `#0A55E6` 5,86.
   `GoalStepper.vue:120-124` (angka langkah di dot selesai, `--cat-*`): kesehatan **3,68** · keuangan 4,24 · relasi 4,40 · diri 5,25 · kerja 5,86 · karier 5,98 · trip 7,00 (kuning; hijau/ungu ±0,03).
   → 6/8 warna habit dan 3/7 kategori goal < 4,5; semuanya > 3,0 sehingga ambang non-teks 1.4.11 masih lolos. Severity: **Minor–Medium** (indikator status tetap terbaca lewat isi latar).
2. **State "selesai" lewat `opacity`.** 15+ tempat memakai `opacity: 0.35–0.8` untuk teks yang masih konten aktif (bukan komponen disabled yang dikecualikan WCAG). Contoh terukur: `TodoRow.vue:83-86` `.done .title` (`--ink` 13,78:1 dipudarkan `opacity: .5`) → **2,97:1** di ketiga tema. Severity: **Medium**, sistemik → butuh audit sendiri.
3. `StatTile` tidak dipakai di mana pun (`app/components/ui/StatTile/**` hanya muncul di auto-import `.nuxt` dan `source-ui/`): kandidat dead code per `.claude/rules/shared-code-quality.md`. P3, pre-existing, mungkin sudah tercatat di task lain.

---

## 5. Perubahan token yang diverifikasi (audit independen)

ΔE76 dihitung di CIELAB (D65) dari snapshot `before/` vs `after/`.

| ΔE76 | Token | Kombinasi |
|---|---|---|
| 0,948 | `ink-2` `#2A2A27 → #282825` | kertas ×3 |
| 0,446 | `ink-2` `#4A3826 → #493725` | vintage ×3 |
| 0,416 | `mute-3` `#675944 → #665843` | vintage ×3 |
| 0,414 | `mute-3` `#645A71 → #635970` | cute-pure/ungu |
| 0,413 | `accent` `#576235 → #566134` | vintage/hijau |
| 0,412 | `mute-3` `#586551 → #576450` | hijau |
| 0,410 | `mute-3` `#64645F → #63635E` | kertas+simple ×6 |
| 0,410 | `mute-3` `#6E6152 → #6D6051` | kuning |
| 0,410 | `mute-3` `#646464 → #636363` | tegas ×3 |
| 0,410 | `mute-3` `#69635C → #68625B` | cute-pure ×3 |
| 0,407 | `mute-3` `#6D675E → #6C665D` | elegan ×3 |
| 0,407 | `accent` `#935409 → #925308` | kuning |
| 0,406 | `accent` `#7E643C → #7D633B` | elegan/kuning |
| 0,405 | `accent` `#7B5F77 → #7A5E76` | elegan/ungu |
| 0,405 | `accent` `#8D4928 → #8C4827` | vintage/kuning |
| 0,399 | `accent` `#6D49B1 → #6C48B0` | ungu |
| 0,398 | `accent` `#366E2B → #356D2A` | hijau |
| 0,383 | `accent` `#6948D9 → #6847D8` | cute-pure/tegas/simple ×3 |
| 0,377 | `accent` `#AA4C16 → #A94B15` | kuning |

**ΔE76 maksimum 0,948** (< 1 = praktis tidak terlihat) → klaim handoff "ΔE76 ≤ 0,95, hue tetap" **benar**.
**Token permukaan berubah: 0** (`paper`, `paper-2`, `bg`, `alt`, `chip`, `hover`, `soft`, `primary`, `dash`, `line` identik sebelum-sesudah) → tidak mungkin 441 pasangan T25 turun karena latar; terbukti hanya 3 pasangan berubah dan semuanya naik.
**Jumlah nilai berubah: 20 deklarasi** di `colors.ts` (6) + `styles.ts` (14), 19 pasangan nilai unik. Handoff menulis "24 nilai token" — **overcount 4** (P3, tidak mengubah substansi).

`packages/tokens/dist/tokens.css` **tidak** di-track git (artefak build) dan sudah sinkron dengan sumber (saya jalankan `node scripts/build-css.ts`: isi identik, `git status` bersih untuk `dist/`). Turbo menjalankan `^build` sebelum `test`/`typecheck`/`build` web (`turbo.json`), jadi nilai baru ikut ke CSS web dan theme object RN.

---

## 6. Verifikasi test kontras (`packages/tokens/src/contrast.qa.test.ts`)

### 6.1 Benar-benar menghitung, bukan hardcode

- Kode: `violations()` membangun token efektif per kombinasi (`tokensFor` = `palette` + `themes` + `neutrals` + `brand`), memanggil `contrastRatio()`, mengumpulkan pesan pelanggaran; assertion-nya `toEqual([])`. Tidak ada angka rasio yang ditulis tangan; satu-satunya konstanta adalah ambang (`AA_NORMAL = 4.5`, `STATE_MARGIN = 4.62`).
- **Mutation test** (salinan di `/tmp/opencode/qa62/mutant`, repo tidak disentuh):

| Mutasi | Hasil |
|---|---|
| salinan apa adanya | 12/12 lulus |
| `themes.kuning.mute-3` digelapkan `#6D6051 → #4A4033` | tetap lulus (arah aman, wajar) |
| `themes.kuning.mute-3` diterangkan `#8A7F73` | **3 test gagal**: `cute/kuning · ramp mute-3 di soft … = 3.01:1`, `… di hover = 3.20:1`, `… di chip = 3.12:1` |
| `uiStyles.tegas.neutrals['mute-3']` dikembalikan ke nilai HEAD `#646464` | **2 test gagal**: `tegas/ungu · ramp mute-3 di soft: (#646464) di (#E6DEFB) = 4.57:1` |

  Kesimpulan: test membaca token sungguhan dan gerbangnya menangkap nilai pra-perbaikan.
- Tidak ada `.only`, `.skip`, atau test yang di-comment: `grep -nE "\.(only|skip)\(" contrast.qa.test.ts` → kosong (exit 1).

### 6.2 Cakupan test vs cakupan ukur saya

| Grup | Di test | Diukur skrip saya | Selisih |
|---|---|---|---|
| Pasangan state (soft/hover/chip + ink-2@dash) | 24 pasangan di loop + 16 pasangan eksplisit (sebagian beririsan) | 25 pasangan | 0 (gabungan keduanya = 25 pasangan unik) |
| `--dash` sebagai latar teks | hanya `ink-2`@`dash` (disengaja) | 4 pasangan | 3 pasangan gagal — **diterima** dengan alasan §4.2 |
| 441 T25 | 21 pasangan × 21 | 21 × 21 | 0 |
| `--primary` | tidak ada | 8 × 21 | gap, sudah jadi #67 |

### 6.3 Ambang `STATE_MARGIN = 4,62` — masuk akal?

Masuk akal, dengan satu catatan pinggir:

- 4,62 = AA + 2,7%. Untuk teks 10–22px margin setipis itu memang perlu, karena `--mute-3` duduk di persimpangan `soft` yang berbeda 0,1–0,4 antar gaya.
- **Terbukti tidak kosong**: nilai pra-fix `tegas/ungu mute-3@soft = 4,567` < 4,62 → merah (lihat 6.1).
- **Catatan**: minimum matriks sesudah = **4,624**, jadi sisa ruang ke gerbang hanya **0,004**. Artinya gerbang ini praktis "pas" dengan nilai sekarang: satu langkah penerangan 1 satuan RGB di cute-pure/hijau `accent` langsung memerahkan CI. Untuk nilai yang dipilih, ini konsekuensi yang disadari (komentar test: "sisa ruang ≥0,12 di atas 4,5" — dan memang 4,624 − 4,5 = **0,124**, konsisten). Kalau nanti gerbang ini terasa terlalu kaku, naikkan headroom token-nya, jangan turunkan ambangnya.
- Klaim komentar test "`.head.today .num` 22px, bobot < 700 sehingga bukan large text" **tidak akurat untuk 4 dari 7 gaya**: `weights.display` = 800 (cute, cute-pure), 700 (vintage, tegas) → 22px bold = large text (3:1). Test tetap memakai 4,5 (lebih ketat), jadi tidak ada salah ukur — hanya komentar yang perlu diperbaiki. P3.

---

## 7. Perintah & hasil (apa adanya)

| # | Perintah | Hasil |
|---|---|---|
| 1 | `pnpm --filter @improve-personal/tokens exec vitest run` | **exit 0** — `Test Files 3 passed (3) · Tests 30 passed (30)` (272 ms) |
| 2 | `pnpm --filter @improve-personal/web exec vitest run app/components/features/calendar app/components/features/pomodoro` | **exit 0** — `Test Files 1 passed (1) · Tests 3 passed (3)` (5,78 s). Hanya `calendar.perf.test.ts` yang cocok: **tidak ada file test komponen** di kedua folder. Handoff mengklaim "42/42"; angka itu **tidak tereproduksi** dengan perintah tersebut (lihat baris 2b). |
| 2b | `pnpm --filter @improve-personal/web exec vitest run calendar pomodoro` | **exit 0** — `6 file / 54 test lulus` (perintah alternatif yang menyapu nama file/folder) |
| 2c | `pnpm --filter @improve-personal/web exec vitest run app/composables/useTimeGrid.test.ts app/composables/dailyCalendar.qa.test.ts app/composables/usePomodoro.test.ts app/utils/calendarGrid.test.ts app/utils/calendarViews.qa.test.ts app/utils/pomodoro.test.ts app/components/features/calendar` | **exit 0** — `7 file / 55 test lulus` (6,02 s) — regresi area kalender & pomodoro |
| 3 | `npx nuxt typecheck` (cwd `apps/web`) | **exit 0**, tanpa output |
| 3b | `pnpm --filter @improve-personal/tokens typecheck` | **exit 0** (`tsc -p tsconfig.json && tsc -p tsconfig.node.json`) |
| 4 | `npx eslint . --max-warnings 0` (cwd `packages/tokens`) | **exit 0** |
| 4b | `npx eslint <7 file komponen terkait + 3 file tokens> --max-warnings 0` | **exit 0** |
| 5 | `npx prettier --check packages/tokens/src/{colors,styles,contrast.qa.test}.ts apps/web/app/components/features/{calendar/CalendarTimeGrid,pomodoro/PomodoroHistory,habit/HabitGrid,goal/GoalStepper}.vue apps/web/app/components/ui/{Card,StatTile,Sheet}/index.vue` | **exit 0** — "All matched files use Prettier code style!" |
| 6 | `node /tmp/opencode/qa62/contrast.ts` (skrip QA sendiri) | baseline & sesudah: lihat §3 |
| 7 | mutation test di `/tmp/opencode/qa62/mutant` (salinan + `node_modules/vitest` symlink) | lulus 12/12; 2 mutasi memerahkan test seperti diharapkan (§6.1) |
| 8 | `pnpm audit`? | **tidak** dijalankan di #62 (bukan area task; MAYOR-3 #30 punya jalur sendiri) |

Tidak ada test yang saya longgarkan, hapus, atau `skip`. Tidak ada file produk yang saya ubah.

---

## 8. Tiga pilar

| Pilar | Penilaian |
|---|---|
| **Keamanan** | Tidak ada permukaan baru. Perubahan hanya nilai warna (ΔE76 < 1) + test. Tidak menyentuh auth/input/secret. Catatan: 3 bg `--dash` adalah dekorasi, jadi tidak ada jalur baru untuk menyembunyikan teks informatif. |
| **Performa** | Netral, cenderung positif: 0 byte JS/CSS tambahan (hanya nilai hex berubah), tidak ada dependency baru, tidak ada render tambahan. Test kontras murni CPU ringan (30 test · 272 ms). |
| **Kerapian** | Baik: nilai diubah di sumber token (bukan tambal per komponen); komponen memakai token sesuai peran (`--mute-2` untuk caption di `soft`, `--deep` untuk aksen, `--chip` untuk badge arsip) dengan komentar "kenapa"; ambang diekstrak jadi konstanta bernama (`STATE_MARGIN`); matriks di-loop, bukan disalin 24×. Sisa: 3 angka/klaim komentar usang (P3, §4.3 & §6.3), `StatTile` tak terpakai (P3). |

---

## 9. Sisa pasangan gagal + klasifikasi

| Pasangan | Min | Klasifikasi |
|---|---|---|
| `mute-3`/`mute`/`accent` @ `dash` | 1,890 / 2,349 / 2,739 | **Bukan blocker** — `--dash` token garis; 0 teks dirender di atasnya (3 pemakaian = titik 5px & grabber 44×5). Keputusan tercatat di test + komentar. |
| 6 pasangan ramp @ `--primary` | 3,573–4,149 | **Task terpisah #67** (sudah ada). Bukan pasangan state, bukan regresi. |
| `paper` @ warna kategori solid (habit/goal) | 2,03–4,45 | **Calon task baru**, pre-existing, Minor–Medium. Di luar lingkup #62. |
| Teks "selesai" dengan `opacity` | 2,97 (contoh TodoRow) | **Calon task baru** (audit aksesibilitas state selesai/arsip), Medium, sistemik. |
| 441 T25: `placeholder` @ `paper` | 4,506 | Lulus tapi margin 0,006 — **baseline T25, tidak berubah** oleh #62. Catat sebagai risiko laten. |

---

## 10. Celah test yang tersisa & rekomendasi

1. **Tidak ada test komponen** untuk `CalendarTimeGrid`/`PomodoroHistory`; jaminan kontras bertumpu pada token + review. Untuk perubahan CSS token, ini memadai selama token-lah yang menjaga (dan sekarang `mute-3@soft` = 4,636 lulus bahkan tanpa pemilihan token khusus). Kalau mau lebih kuat: satu test ringan yang memastikan kelas state memakai token yang benar (`/\.head\.selected \.dow[\s\S]*?color: var\(--mute-2\)/`) — murah, tanpa browser.
2. **Penjaga "`--dash` bukan latar teks"** belum otomatis. Rekomendasi paling murah: satu test yang memindai `apps/web/app/**/*.vue` dan gagal bila ada aturan CSS yang memakai `background: var(--dash)` **dan** `color:` teks pada aturan yang sama/keturunannya (pola yang sama dengan skrip `/tmp/opencode/qa62/usage-scan.ts`). Alternatif lebih ringan: dokumentasikan `--dash`/`--dash-2` sebagai token garis di `packages/tokens` + `apps/web/.claude/rules/code-quality.md`.
3. **`--primary`** (task #67): ramp redup + label `StatTile` + ikon `DailyWeatherPicker` perlu diselesaikan; sesudah itu tambahkan grup `PRIMARY` ke `contrast.qa.test.ts` dengan ambang 4,5.
4. **Kategori solid & opacity** (§4.4): buat task audit kontras tersendiri (habit/goal/countdown, dan semua `opacity` pada teks yang masih konten aktif). Ini akan menangkap lebih banyak pelanggaran AA daripada sisa temuan token.
5. **Selaraskan angka di dokumen**: handoff "24 nilai token" → 20 deklarasi; "42/42 kalender+pomodoro" → perintah menghasilkan 1/3 (atau 6/54 dengan filter nama); komentar `PomodoroHistory.vue:113-115` (4,14 → 4,627); komentar test soal bobot `.num` (§6.3). Semua P3, tidak menahan merge.
6. Kalau #62 ditutup, jalankan juga suite web penuh sekali (`vitest run`) sebelum rilis: #62 hanya menyentuh token, tapi token menyentuh semua halaman.
