# T64 — Tutup 4 celah aturan agent dari QA #60

**Task:** Ergonio #64 `bb3b84e1-6b56-4140-b2e9-cad7a89efdca` (project `personal-productivity`)
**Tanggal:** 23 Okt 2026 · **Pelaksana:** Bayu
**Sumber temuan:** `reports/qa-60-agent-docs.md` (§Temuan #1–#4)
**Scope:** dokumen aturan agent + guard script. Tidak menyentuh `apps/**`, `packages/**`,
`package.json`, `pnpm-lock.yaml`.

Rules dibaca: `CLAUDE.md` root, `.claude/rules/shared-code-quality.md`,
`.claude/rules/ergonio-status-flow.md`, `.claude/skills/{ergonio,orchestration}/SKILL.md`,
6 `.claude/agents/*.md`, `AGENTS.md`, `.opencode/README.md`, `scripts/{check-agent-docs,sync-agent-config}.mjs`.
Rules app tidak dimuat karena task ini tidak mengubah file app.

---

## Perubahan per temuan

### #1 [Medium] Daftar tool mutasi terlarang tidak memuat `deleteTask`

| File | Perubahan |
|---|---|
| `.claude/rules/ergonio-status-flow.md:68-78` | Daftar larangan kini memuat `deleteTask`, `createMilestone`, `updateMilestone`, `deleteMilestone`; ditambah alasan (`deleteTask` menghapus seluruh subtask) dan penutup "semua tool di luar daftar baca terlarang - daftar ini contoh minimum, bukan izin" |
| `.claude/skills/orchestration/SKILL.md:15` | Daftar larangan yang sama, konsisten (termasuk catatan `deleteTask` menghapus seluruh subtask) |
| `.opencode/README.md:9-15` | Menyebut larangan tool destruktif + "semua tool di luar daftar baca dianggap terlarang" |
| `scripts/check-agent-docs.mjs` | Guard baru: `MUTATION_TOOLS` (10 tool) wajib muncul di rules + skill orchestration; `deleteTask` wajib muncul di `.opencode/README.md`. Daftar yang bolong = exit 1 |

### #2 [Low] 5 agent masih menyiratkan `todo` wajib

`.claude/agents/{arif:18,bayu:19,dimas:19,raka:19,yoga:18}.md` →
`- Ambil task dari \`backlog\` -> (\`todo\`) -> \`prog\` saat mulai dikerjakan; \`todo\` opsional, cuma penanda antrean.`

`fajar` tidak diubah (perannya QA, tidak melewati `backlog`). Guard baru: setiap agent yang
menyebut `` `backlog` `` wajib juga menyebut `` `todo` opsional ``. `.qoder`, `.commandcode`,
`.opencode` ikut tersinkron lewat `pnpm run sync:agents`.

### #3 [Low] Guard bocor + `.opencode/README.md` tidak diawasi

| Sebelum | Sesudah |
|---|---|
| `SETS_PROGRESS = /`?progressPct`?\s*:/` | `/["'`]?progressPct["'`]?\s*[:=]\s*["'`]?(?:\d\|true\|false\|null)/i` |
| `FALSE_MCP_CLAIM = /subagent[^\n]*tidak punya[^\n]*MCP\|tidak punya tool MCP/i` | `/(?:tidak\|tak\|nggak\|bukan)\s+(?:punya\|dapat\|bisa\|ada\|memiliki\|memegang)…\bMCP\b\|\btanpa\s+(?:tool\s+)?MCP\b/i` dengan pengecualian negasi sah (`di-set`, `diatur`, `dikirim`, `kirim`) |
| `AGENT_DOCS` tanpa `.opencode/README.md` | `OPENCODE_README` masuk `AGENT_DOCS` |
| hanya `AGENTS.md` dijaga soal `todo` | `AGENTS.md` + setiap agent yang memuat `backlog` |
| daftar tool mutasi tidak dijaga | `MUTATION_TOOLS` + `deleteTask` di README |

Alasan desain regex `SETS_PROGRESS`: instruksi lama yang nyata selalu berbentuk nilai
(`progressPct: 90`, `progressPct: 100`). Dengan mewajibkan nilai numerik/boolean, penjelasan
read-only seperti `` `progressPct`: dihitung server `` tidak jadi false positive — dibuktikan
di uji FP1/FP2.

### #4 [Low] Sisa frasa "update status/progress"

- `CLAUDE.md:23` → "update status sampai selesai (progress mengikuti status, tidak di-set manual)"
- `.claude/skills/ergonio/SKILL.md:3` (frontmatter `description`) → "update status sampai selesai (progress mengikuti status)"

Verifikasi: `grep -rn "status/progress\|status & progress"` di `.claude .qoder .commandcode .opencode AGENTS.md CLAUDE.md` → 0 hit.

---

## Uji negatif (wajib)

File dimutasi lalu dipulihkan dengan salinan backup (`/tmp/opencode/t64/*.bak`), bukan
`git checkout`, karena perubahan task ini belum di-commit. Checksum sebelum/sesudah identik.

| # | Mutasi | Exit | Pesan |
|---|---|---|---|
| 1 | `progressPct: 90` di `.claude/skills/orchestration/SKILL.md` | **1** | `... jangan menginstruksikan progressPct` |
| 2 | `"progressPct": 90` di file yang sama | **1** | idem |
| 3 | `progressPct = 90` di file yang sama | **1** | idem |
| 4 | `subagent tidak dapat memakai MCP` | **1** | `klaim "subagent tidak punya MCP" tidak akurat di OpenCode` |
| 5 | hapus `` `todo` opsional `` di `AGENTS.md` | **1** | `AGENTS.md: alur status harus menyebut ...` |
| 6 | hapus `deleteTask` dari rules | **1** | `... daftar tool mutasi terlarang belum memuat deleteTask` |
| 7 | hapus `deleteTask` dari skill orchestration | **1** | idem |
| 8 | hapus `` `todo` opsional `` dari `.claude/agents/bayu.md` | **1** | `.claude/agents/bayu.md: alur status ...` |
| FP1 | tambah `` `progressPct`: dihitung server `` (read-only) | **0** | tidak false positive |
| FP2 | tambah `` `progressPct` tidak bisa di-set lewat MCP `` | **0** | tidak false positive |
| FP3 | tambah `Subagent jalan tanpa MCP` | **1** | klaim MCP terlarang tertangkap |

Setelah semua uji: `node scripts/check-agent-docs.mjs` → exit 0.

## Perintah verifikasi

```sh
$ node scripts/check-agent-docs.mjs
check-agent-docs OK: 3 pilar + 3 rules sinkron          # exit 0

$ pnpm run sync:agents
.qoder disinkronkan dari .claude: 6 agent, 2 skill
.commandcode disinkronkan dari .claude: 6 agent (skill dibaca langsung dari .claude/skills)
.opencode disinkronkan dari .claude: 6 agent (skill dibaca dari .qoder/skills lewat opencode.json, model ikut sesi induk)
# checksum seluruh file generated sebelum vs sesudah sync: identik (idempoten)

$ diff -r .claude/skills .qoder/skills ; echo $?
0

$ git status --porcelain -- .claude .qoder .commandcode .opencode scripts AGENTS.md CLAUDE.md \
    | awk '{print $2}' | xargs pnpm exec prettier --check
All matched files use Prettier code style!               # exit 0

$ git diff --check ; echo $?
0

$ node --check scripts/check-agent-docs.mjs ; echo $?
0
```

Status generated: `.qoder/agents` +5, `.commandcode/agents` +5, `.opencode/agents` +5,
`.qoder/skills` 2 file — semuanya hasil sync, bukan edit manual.

## Tiga pilar

- **Keamanan** — batas subagent sekarang menyebut tool destruktif secara eksplisit
  (`deleteTask` menghapus seluruh subtask) dan menutup celah "tool di luar daftar = boleh".
  Guard mencegah daftar itu menyusut lagi. Tidak ada secret/PII tersentuh.
- **Performa** — guard membaca 12 file kecil + 1 `readdir`, orde milidetik di pre-commit.
  Tidak ada perubahan jalur panas aplikasi.
- **Kerapian** — satu sumber `.claude` + sync idempoten terbukti (checksum generated identik),
  regex guard kini menangkap varian JSON/assignment/parafrase dengan pengecualian read-only
  yang diuji, frasa "status/progress" hilang, prettier & `git diff --check` bersih.

## Sisa risiko

1. Guard tetap heuristik: `progressPct` tanpa nilai (`progressPct: sesuai kondisi`) lolos
   karena regex sengaja mewajibkan nilai agar tidak false-positive pada dokumentasi read-only.
   Trade-off dipilih sesuai temuan QA (#3 menyebut risiko false-positive eksplisit).
2. `.qoder/agents`, `.commandcode/agents`, `.opencode/agents` tidak diawasi guard (generated),
   jadi drift hanya mungkin kalau seseorang mengedit hasil sync manual — README + pre-commit
   `sync-agent-config` sudah menutup jalur normal.
3. Klaim "OpenCode membuang `tools:`" tetap bergantung pada perilaku OpenCode V2; kalau
   perilaku itu berubah, teks di 3 dokumen perlu ditinjau ulang (sudah dicek konsisten).
4. Tidak ada test otomatis untuk `sync-agent-config.mjs` itu sendiri (celah lama, di luar
   scope task ini).
