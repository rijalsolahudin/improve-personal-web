# QA #60 — Perbaiki aturan agent: `progressPct` & akses MCP subagent

**Task:** Ergonio #60 `Perbaiki aturan agent: progressPct & akses MCP subagent` (`b3f6fba6-9049-4627-8058-331baad830fb`)
**Tanggal:** 23 Okt 2026 · **QA:** Fajar
**Status saat diuji:** `review` (dipindah orchestrator)
**Scope perubahan:** docs/aturan agent saja — tidak menyentuh `apps/**` maupun `packages/**`.
**Letak perubahan di git:** commit `849c15b chore(agents): satukan konfigurasi agent lintas .claude, .qoder, .commandcode, .opencode` (working tree bersih untuk seluruh path yang diuji).
**Tree:** working tree dipakai bersama agent lain. Saat QA mulai ada perubahan **bukan dari QA ini**
(`apps/web/app/utils/guide.qa.test.ts`, `packages/core/src/io/io.goal-invariants.test.ts`, `apps/web/app/composables/useBackupImport.ts`,
plus file `*.qa.test.ts` / report lain yang muncul selama sesi). QA tidak menyentuh satu pun.
**Environment:** Linux, Node dari sesi repo, `pnpm 11.17.0`, git `core.hooksPath=.husky/_`.

Rules dibaca: `CLAUDE.md` root, `.claude/rules/shared-security.md`, `.claude/rules/shared-code-quality.md`,
`.claude/rules/ergonio-status-flow.md`, `AGENTS.md`. Rules app tidak dimuat karena task ini tidak menyentuh `apps/**`.

---

## Verdict: **LULUS dengan catatan (non-blocking)**

Semua **AC-A (AC-60.1 … AC-60.6)** lulus dan bisa dibuktikan ulang dengan perintah di §Perintah & hasil.
Guard anti-regresi **benar-benar membaca file nyata dan tidak kosong**: uji negatif `progressPct: 90`
menghasilkan exit 1 di skill **dan** di agent, lalu hijau lagi setelah file dipulihkan.

Catatan non-blocking (detail di §Temuan):

1. **[Medium]** Daftar tool mutasi yang dilarang untuk subagent **tidak memuat `deleteTask`** (juga
   `createMilestone`/`updateMilestone`/`deleteMilestone`) — padahal MCP ergonio punya tool itu dan
   `deleteTask` menghapus semua subtask. AC-60.2 memang menyebut daftar persis itu, jadi developer
   memenuhi AC; tapi batas yang disebut "eksplisit" masih berlubang.
2. **[Low]** 5 dari 6 `.claude/agents/*.md` masih menulis `backlog` -> `todo` -> `prog` seolah `todo` wajib,
   bertentangan dengan `backlog` -> (`todo`) -> `prog` di rules & `AGENTS.md`.
3. **[Low]** Guard regex punya celah varian (`"progressPct": 90`, `progressPct = 90`,
   "subagent **tidak dapat** memakai MCP") dan bisa false-positive untuk penjelasan read-only yang memakai
   titik dua; `.opencode/README.md` tidak ikut diawasi guard.
4. **[Low]** Sisa frasa "update status/progress" di `CLAUDE.md:23` dan deskripsi skill `ergonio`.

---

## Scope & test plan

**Diuji**

| Area | Level | Bukti |
|---|---|---|
| B1 — tidak ada instruksi set `progressPct` | statik (grep + baca tiap hit) + diff commit | `grep -rn "progressPct" .claude .opencode .qoder AGENTS.md CLAUDE.md` |
| B2 — klaim "subagent tidak punya MCP" hilang, batas tool eksplisit | statik + cek nama tool ke MCP live | grep frasa klaim, `search(namespace: ergonio)` (22 tool) |
| B3 — `backlog` -> (`todo`) -> `prog`, todo opsional | statik (AGENTS.md + rules + skill + agent) | baca langsung + grep |
| B4 — pre-commit men-stage 4 path | statik + status hook | `.husky/pre-commit`, `git config core.hooksPath`, `.husky/_/h` |
| Guard `check-agent-docs.mjs` | positif + **negatif** (4 skenario) | lihat §Uji negatif |
| Sync idempoten & `.qoder/skills` identik | jalankan `pnpm run sync:agents` + `diff -r` + sha256 | §Perintah & hasil |
| Format & whitespace | `prettier --check`, `git diff --check` | §Perintah & hasil |
| Klaim dokumen vs skema MCP | observasi `progressPct` lintas status (read-only) | §Cek skema MCP |

**Tidak diuji (dan alasannya)**

- Uji sandbox tool subagent — OpenCode tidak menyediakan sandbox; ini memang risiko yang diakui di B-60.1.
  Yang bisa diuji hanya ketegasan teks + akurasi klaim, itu yang dilakukan.
- `updateTask` menolak `progressPct` secara langsung — itu operasi **mutasi**, dilarang untuk QA/subagent.
  Diganti bukti tidak langsung: nilai `progressPct` konsisten dengan status (tabel di §Cek skema MCP) +
  kutipan skema di deskripsi task ("Progress is not settable: it follows the task's status").
- Hook pre-commit end-to-end lewat `git commit` — repo sedang dipakai bersama agent lain; menjalankan
  `git commit` akan mencampur perubahan agent lain. Diganti verifikasi isi hook + `core.hooksPath` + mode bit.
- Rules `apps/**` — tidak tersentuh task ini.

---

## Hasil per acceptance criteria

### AC-60.1 (B1) — instruksi `progressPct` hilang — **PASS**

Diff `849c15b` menghapus semua bentuk instruksi, mis.
`.claude/agents/fajar.md`: `- Lulus -> done + progressPct: 100 + verdict` → `- Lulus -> done + verdict & bukti ...`,
`.claude/rules/ergonio-status-flow.md`: `prog + progressPct sesuai kondisi` → `prog`, `progressPct: 90` dihapus dari
langkah Ready to Review, `progressPct: 100` dihapus dari langkah QA.

Sisa kata `progressPct` **semuanya penjelasan read-only**, sudah dibaca satu per satu:

| Lokasi | Isi | Status |
|---|---|---|
| `.claude/rules/ergonio-status-flow.md:23` | "tidak bisa di-set lewat MCP ... dihitung server dari status" | read-only |
| `.claude/rules/ergonio-status-flow.md:113` | "Satu `updateTask` ... (tanpa `progressPct`, field itu dihitung dari status)" | read-only |
| `.claude/skills/ergonio/SKILL.md:45` | "tulis kemajuan di `description` (jangan kirim `progressPct` ...)" | read-only |
| `.claude/skills/ergonio/SKILL.md:67` | "`progressPct` read-only ... Jangan kirim field itu" | read-only |
| `.claude/skills/orchestration/SKILL.md:35` | "progress mengikuti status; jangan kirim `progressPct`" | read-only |
| `.qoder/skills/*` (2 hit, salinan) | identik dengan `.claude/skills` (sha256 sama) | read-only |
| `AGENTS.md:53` | "`progressPct` dihitung dari status - jangan dikirim lewat `updateTask`" | read-only |
| `scripts/check-agent-docs.mjs:79,85` | regex + pesan error guard | bukan instruksi |

`.claude/agents/*.md` (6 file) dan `.commandcode/agents/*` (6 file): **0 hit** `progressPct`.

### AC-60.2 (B2) — batas subagent eksplisit — **PASS**

- Klaim salah hilang: `grep -rn "tidak punya MCP\|tidak dapat MCP\|tanpa MCP\|tidak punya tool MCP\|tidak ada MCP"`
  di `.claude .opencode .qoder .commandcode AGENTS.md CLAUDE.md` → **exit 1 (nol match)**.
- Batas tertulis lengkap: `.claude/rules/ergonio-status-flow.md:58-98` (bagian "Komentar task"),
  `.claude/skills/orchestration/SKILL.md:13-16` dan `:47-48`, `.opencode/README.md:9-12`.
  Isinya: subagent **boleh** `getTask`/`getTaskComments`/`searchTasks`/`queryTasks`/`getProject`/`listFields`;
  **dilarang** `createTask`/`updateTask`/`createSubtasks`/`createComment`/`updateComment`/`deleteComment`;
  transisi status **dan** komentar = milik orchestrator.
- Akurasi teknis klaim "OpenCode membuang `tools:` saat sync sehingga subagent mewarisi MCP induk": **benar** —
  `scripts/sync-agent-config.mjs:70,75-78` memfilter `name|tools|model` dan menggantinya dengan `mode`/`permissions`;
  `.qoder/agents/*` & `.commandcode/agents/*` masih memakai `tools:`. Saya sendiri (subagent) memang bisa
  memanggil `tools.ergonio.getTask/getTaskComments/queryTasks/searchTasks` di sesi ini → klaim akurat.
- `queryTasks` yang disebut sebagai tool baca **benar ada** di MCP (dicek lewat discovery 22 tool).
- Nama tool lengkap yang tersedia di MCP ergonio (untuk pembanding): baca = `getActivity`, `getCompletionTrend`,
  `getProject`, `getProjectStats`, `getTask`, `getTaskComments`, `getWorkload`, `listFields`, `listMembers`,
  `listProjects`, `queryTasks`, `searchTasks`; mutasi = `createComment`, `createMilestone`, `createSubtasks`,
  `createTask`, `deleteComment`, `deleteMilestone`, `deleteTask`, `updateComment`, `updateMilestone`, `updateTask`.

### AC-60.3 (B3) — alur status konsisten, `todo` opsional — **PASS (dengan catatan Low)**

- `.claude/rules/ergonio-status-flow.md:30-31`: `backlog` -> (`todo`) -> `prog` -> Ready to Review, plus kalimat
  "`todo` opsional - pakai kalau task belum langsung dikerjakan".
- `AGENTS.md:53`: "`backlog` -> `prog` (`todo` opsional, cuma penanda antrean ...)".
- Catatan: 5 agent (`.claude/agents/{arif:18,bayu:19,dimas:19,raka:19,yoga:18}.md`) masih menulis
  "Ambil task dari `backlog` -> `todo` saat jadi antrean berikutnya -> `prog`" tanpa penanda opsional — lihat Temuan #2.

### AC-60.4 (B4) — pre-commit men-stage 4 path — **PASS**

- `.husky/pre-commit:3`: `git add .qoder .commandcode/agents .opencode opencode.json`.
- Hook aktif: `git config core.hooksPath` → `.husky/_`; `.husky/_/h` menjalankan `$(repo)/pre-commit`
  (`sh -e "$s"`), `.husky/pre-commit` mode `-rwxrwxrwx`. `package.json` punya `"prepare": "husky"` sehingga
  `core.hooksPath` dipulihkan di clone baru lewat `pnpm install`.
- Semua path target ada dan tracked: `opencode.json`, `.husky/pre-commit`, `.opencode/README.md` + 6 agent,
  `.qoder/{agents,skills}`, `.commandcode/agents`.
- Urutan hook benar: `check-agent-docs` → `sync-agent-config` → `git add ...` → lint-staged → typecheck,
  jadi docs yang gagal guard memblokir commit **sebelum** file dipaksakan masuk index.

### AC-60.5 (B4 guard) — assertion anti-regresi ada & efektif — **PASS (dengan catatan Low)**

`scripts/check-agent-docs.mjs:65-108` menguji 4 hal: `SETS_PROGRESS`/`FALSE_MCP_CLAIM` untuk `AGENTS.md`,
`CLAUDE.md`, rules, 2 skill, dan **semua** `.claude/agents/*.md` (di-`readdir`, bukan daftar hard-code);
frasa `` `todo` opsional `` di `AGENTS.md`; frasa protokol komentar (`getTaskComments`, `handoff`, `mulai cek`,
`LULUS`) di rules + rujukan "Komentar task" di kedua skill.

**Bukan assertion kosong** — dibuktikan 4 uji negatif (§Uji negatif). Guard juga membaca file nyata
(`readFile(join(root, name))`), dan `AGENT_DOCS` mencakup 6 agent (uji negatif #3 membuktikannya).

### AC-60.6 (sync & format) — **PASS**

- `pnpm run sync:agents` → `.qoder 6 agent, 2 skill`, `.commandcode 6 agent`, `.opencode 6 agent`; `git status`
  **tidak** menampilkan satu pun path `.claude/.qoder/.commandcode/.opencode/scripts/.husky/AGENTS.md/CLAUDE.md`/`opencode.json` → idempoten.
- `.qoder/skills` identik: `diff -r .claude/skills .qoder/skills` exit 0; sha256 kedua file sama
  (`e1f9d105…` ergonio, `212caf74…` orchestration).
- `prettier --check` pada semua file #60 → "All matched files use Prettier code style!".
- `git diff --check` (working tree) exit 0; `git diff --check 849c15b^ 849c15b` exit 0.

---

## Perintah & hasil (verbatim)

```sh
$ node scripts/check-agent-docs.mjs
check-agent-docs OK: 3 pilar + 3 rules sinkron        # exit 0

$ pnpm run sync:agents
$ node scripts/sync-agent-config.mjs
.qoder disinkronkan dari .claude: 6 agent, 2 skill
.commandcode disinkronkan dari .claude: 6 agent (skill dibaca langsung dari .claude/skills)
.opencode disinkronkan dari .claude: 6 agent (skill dibaca dari .qoder/skills lewat opencode.json, model ikut sesi induk)
# exit 0

$ git status --short
 M apps/web/app/composables/useBackupImport.ts          # agent lain (#55), bukan QA ini
 M apps/web/app/utils/guide.qa.test.ts                  # agent lain, bukan QA ini
 M packages/core/src/io/io.goal-invariants.test.ts      # agent lain (#56), bukan QA ini
?? apps/web/app/composables/useBackupImport.race.qa.test.ts
?? apps/web/app/composables/useMemoDraft.qa.test.ts
?? apps/web/app/pages/app/memo.draft.qa.test.ts
?? reports/qa-54-memo-draft.md
?? reports/qa-56-goal-invariants.md
?? reports/qa-57-guide-copy.md
# tidak ada diff di path milik #60 → sync idempoten

$ git status --porcelain -- .claude .qoder .opencode .commandcode scripts .husky AGENTS.md CLAUDE.md opencode.json
# (kosong)

$ grep -rn "progressPct" .claude .opencode .qoder AGENTS.md CLAUDE.md scripts
# 11 hit, semuanya penjelasan read-only / regex guard (lihat tabel AC-60.1)

$ grep -rn "progressPct" .commandcode
# exit 1 (nol match)

$ grep -rn "tidak punya MCP\|tidak dapat MCP\|tanpa MCP\|tidak punya tool MCP\|tidak ada MCP" .claude .opencode .qoder .commandcode AGENTS.md CLAUDE.md
# exit 1 (nol match)

$ diff -r .claude/skills .qoder/skills ; echo $?
0

$ pnpm exec prettier --check AGENTS.md CLAUDE.md ".claude/skills/ergonio/SKILL.md" \
    ".claude/skills/orchestration/SKILL.md" ".claude/rules/ergonio-status-flow.md" \
    scripts/check-agent-docs.mjs scripts/sync-agent-config.mjs .opencode/README.md \
    ".claude/agents/*.md" opencode.json
Checking formatting...
All matched files use Prettier code style!        # exit 0

$ git diff --check ; echo $?
0
$ git diff --check 849c15b^ 849c15b ; echo $?
0

$ git config core.hooksPath
.husky/_
```

---

## Uji negatif (wajib)

Semua uji dilakukan di working tree, file dipulihkan dengan `git checkout --` dan dicek ulang hash/`git status`.

| # | Mutasi sengaja | Perintah | Harapan | Hasil |
|---|---|---|---|---|
| 1 | tambah `- progressPct: 90` di `.claude/skills/orchestration/SKILL.md` | `node scripts/check-agent-docs.mjs` | gagal | **exit 1** — `orchestration/SKILL.md: jangan menginstruksikan progressPct - nilainya dihitung dari status` |
| 1b | pulihkan (`git checkout --`) | idem | hijau | **exit 0**, sha256 kembali `212caf74…` |
| 2 | tambah "…subagent tidak punya tool MCP, jadi tidak bisa baca task." di `.claude/skills/ergonio/SKILL.md` | idem | gagal | **exit 1** — `ergonio/SKILL.md: klaim "subagent tidak punya MCP" tidak akurat di OpenCode - tulis batas tool-nya` |
| 2b | pulihkan | idem | hijau | **exit 0**, sha256 kembali `e1f9d105…` |
| 3 | tambah `- progressPct: 90` di `.claude/agents/yoga.md` (membuktikan agent ikut diawasi) | idem | gagal | **exit 1** — `.claude/agents/yoga.md: jangan menginstruksikan progressPct …` |
| 3b | pulihkan | idem | hijau | **exit 0** |
| 4 | ganti `` `todo` opsional `` → `TODO-WAJIB` di `AGENTS.md` | idem | gagal | **exit 1** — `AGENTS.md: alur status harus menyebut \`todo\` opsional (boleh \`backlog\` -> \`prog\`)` |
| 4b | pulihkan | idem | hijau | **exit 0**, `git status` path #60 bersih |

**Probe kekuatan guard (di luar AC, untuk mengukur celah):**

| Probe | Mutasi | Hasil | Arti |
|---|---|---|---|
| A | `` - `"progressPct": 90` `` (key berkutip ala JSON) | **exit 0 (lolos)** | tidak tertangkap regex `SETS_PROGRESS` |
| B | `- progressPct = 90` (assignment) | **exit 0 (lolos)** | idem |
| C | "subagent tidak dapat memakai MCP" | **exit 0 (lolos)** | `FALSE_MCP_CLAIM` hanya menangkap "tidak punya" |

Ketiga probe dipulihkan dan `node scripts/check-agent-docs.mjs` kembali exit 0 (`git status` bersih).
Kesimpulan: guard **nyata dan menangkap bentuk historis** (yang benar-benar pernah ada di repo), tapi belum
menangkap parafrase. Bukan blocker AC-60.5.

---

## Cek skema MCP (progress dihitung dari status)

Observasi read-only lintas status pada task nyata (tidak ada `updateTask` dipanggil):

| status | contoh task | `progressPct` |
|---|---|---|
| `backlog` | My Office #4 | 0 |
| `todo` | My Office #16 | 0 |
| `prog` | Personal Productivity #55 | 50 |
| `review` | Personal Productivity #60 (task ini) | 80 |
| `done` | Personal Productivity #1 | 100 |

→ `progressPct` konsisten mengikuti status, jadi dokumen baru **tidak bertentangan** dengan skema MCP
(deskripsi task juga mengutip "Progress is not settable: it follows the task's status").

---

## Temuan

### #1 — [Medium] Daftar tool mutasi terlarang untuk subagent tidak memuat `deleteTask`

`.claude/rules/ergonio-status-flow.md:70-72`, `.claude/skills/orchestration/SKILL.md:15`,
`.opencode/README.md:9-12`.

Dokumen menyebut batas ini "eksplisit" dan mendaftar `createTask`, `updateTask`, `createSubtasks`,
`createComment`, `updateComment`, `deleteComment` — tetapi MCP ergonio juga punya `deleteTask`
(dihapus bersama seluruh subtask di semua kedalaman), `createMilestone`, `updateMilestone`, `deleteMilestone`.
Agent yang membaca daftar itu sebagai definisi "tool yang mengubah data" bisa menyimpulkan `deleteTask` boleh.
MCP tidak memblokirnya (subagent mewarisi seluruh tool), jadi satu-satunya batas adalah teks ini.

- Expected: daftar (atau kalimat penutup) mencakup **semua** tool mutasi, minimal `deleteTask`.
- Actual: 4 tool mutasi tidak disebut.
- Severity: Medium (batas keamanan yang hanya tertulis, tapi eksplisit menghapus data).
- Non-blocking untuk AC-60.2 karena AC memang menyebut daftar persis tersebut.
- Saran: tambah `deleteTask`, `createMilestone`, `updateMilestone`, `deleteMilestone` (atau tulis
  "semua tool selain daftar baca di atas") + tambahkan ke guard. Pemilik: `bayu` (docs MCP/agent) atau `yoga`.

### #2 — [Low] 5 agent masih menyiratkan `todo` wajib

`.claude/agents/arif.md:18`, `bayu.md:19`, `dimas.md:19`, `raka.md:19`, `yoga.md:18`
("Ambil task dari `backlog` -> `todo` saat jadi antrean berikutnya -> `prog`"), dan nuansa serupa di
`.claude/skills/ergonio/SKILL.md:43`.

Bandingkan `.claude/rules/ergonio-status-flow.md:30-31` dan `AGENTS.md:53` yang menyatakan `todo` opsional.
Efek: agent yang hanya membaca file agent-nya sendiri bisa merasa wajib melewati `todo`.
Guard tidak menangkap ini (hanya menguji `AGENTS.md`).
Saran: sisipkan "(opsional)" di kelima agent itu — satu baris per file, lalu `pnpm run sync:agents`.

### #3 — [Low] Guard regex: celah varian + false-positive risk + cakupan file

`scripts/check-agent-docs.mjs:79-80`.

- `SETS_PROGRESS = /`?progressPct`?\s*:/` lolos untuk `"progressPct": 90` dan `progressPct = 90` (probe A/B).
- `FALSE_MCP_CLAIM` lolos untuk "subagent tidak dapat memakai MCP" (probe C).
- Sebaliknya, penjelasan read-only yang menulis `` `progressPct`: nilai dihitung server `` akan **gagal**
  (false positive) — dokumentasi sekarang aman karena memakai "**tidak bisa di-set**", bukan titik dua.
- `AGENT_DOCS` tidak memuat `.opencode/README.md`, padahal AC-60.2 menaruh aturan di sana → drift di file itu
  tidak terdeteksi guard (dan pre-commit me-`git add .opencode` sehingga drift bisa ikut ter-commit).

Saran: `/(?:["'`]?progressPct["'`]?\s*(?::|=))/i`, `/(?:tidak (?:punya|dapat|bisa|ada)[^\n]{0,40}MCP)/i`,
tambah `.opencode/README.md` ke `AGENT_DOCS`.

### #4 — [Low] Sisa frasa "update status/progress"

`CLAUDE.md:23` ("update status/progress sampai selesai") dan `.claude/skills/ergonio/SKILL.md:3`
("lalu update status & progress sampai selesai"). Secara teknis "progress" tidak bisa di-update manual,
jadi frasa ini bisa dibaca sebagai instruksi lama. Saran: "update status (progress mengikuti status)".

### #5 — [Info] Markdown tidak masuk lint-staged

`package.json` `lint-staged` hanya mencakup `*.{ts,mts,cts,js,mjs,cjs,vue,json,jsonc,yml,yaml,css,html}`
(glob root, tanpa `**`), jadi file `.md` di `.claude/**`/`.opencode/**` tidak pernah di-`prettier --check`
otomatis. Drift docs yang dijaga `check-agent-docs` tetap tertangkap karena script itu jalan langsung di
pre-commit. Bukan masalah untuk #60, hanya celah format.

---

## Tiga pilar

- **Keamanan** — batas tool subagent sekarang jujur (tidak lagi mengklaim "tidak punya MCP") dan menyebut
  bahwa itu aturan, bukan sandbox: **baik**. Lubangnya: daftar mutasi belum memuat `deleteTask` (#1).
  Tidak ada secret/PII yang disentuh task ini.
- **Performa** — tidak berubah (docs + 2 script Node yang jalan di pre-commit; `check-agent-docs` membaca
  ~10 file kecil, `sync-agent-config` menulis 18 file — orde milidetik). Tidak ada regresi jalur panas.
- **Kerapian** — satu sumber kebenaran `.claude` + sync idempoten terbukti (git bersih setelah `sync:agents`),
  guard mencegah drift yang sama terulang, prettier & `git diff --check` bersih. Catatan #2/#3/#4 adalah sisa
  inkonsistensi kecil yang layak dibereskan di task lanjutan.

---

## Coverage & celah yang tersisa

- Guard tidak mengawasi `.opencode/README.md`, `.qoder/agents/*`, `.commandcode/agents/*` (dua terakhir
  generated, jadi wajar), dan tidak menguji konsistensi kata "opsional" di agent.
- Guard hanya mendeteksi bentuk literal `progressPct:` / "tidak punya … MCP"; parafrase lolos.
- Tidak ada test otomatis untuk `sync-agent-config.mjs` itu sendiri (mis. fixture yang memastikan
  `tools:` benar-benar dibuang dan `permissions` hanya untuk agent Write-only). Pre-commit + `git status`
  bersih adalah penggantinya saat ini; cukup untuk #60, tapi regresi transform bisa lolos kalau seseorang
  mengubah transformer tanpa memperbarui ekspektasi.
- Verifikasi hook end-to-end (commit sungguhan) belum dilakukan karena working tree dipakai bersama agent lain.

---

## Rekomendasi

1. Task lanjutan (docs, non-blocking): lengkapi daftar tool mutasi terlarang (#1) — prioritas tertinggi dari
   temuan ini karena menyangkut penghapusan data.
2. Sekalian: "(opsional)" di 5 agent (#2), perkuat regex guard + masukkan `.opencode/README.md` (#3),
   rapikan frasa "status/progress" (#4), lalu `pnpm run sync:agents` dan commit ulang.

---

## File yang diubah QA

**Tidak ada file produk/dokumen yang diubah.** Satu-satunya file baru dari QA ini: `reports/qa-60-agent-docs.md`.
Uji negatif mengubah sementara `.claude/skills/{orchestration,ergonio}/SKILL.md`, `.claude/agents/yoga.md`, dan
`AGENTS.md`; semuanya dipulihkan dengan `git checkout --` dan diverifikasi (`git status` untuk path #60 kosong,
`node scripts/check-agent-docs.mjs` exit 0). Tidak ada commit dibuat.
