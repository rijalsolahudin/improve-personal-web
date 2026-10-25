# QA report - #82 Percepat QA: gate delta, template report, aturan timebox & stop-on-bug

## Verdict

**LULUS DENGAN CATATAN** (2 temuan Low, non-blocking).

- Tier: T1 · Delta: `scripts/gate-delta.sh` (baru), `reports/QA-TEMPLATE.md` (baru), `package.json`,
  `.claude/rules/ergonio-status-flow.md`, `.claude/skills/{ergonio,orchestration}/SKILL.md`,
  `.claude/agents/fajar.md`, `AGENTS.md` (+ salinan `.qoder/.commandcode/.opencode`)
- Gate: `pnpm gate:delta --list` (working tree) -> 13 file terdeteksi, exit 0. Delta ini tidak punya
  file kode, jadi prettier/eslint/vitest memang SKIP (lihat AC2); script-nya sendiri dibuktikan lewat
  7 skenario di bawah + satu run nyata `--tier t2` di delta kode (85s, exit 1 karena bug B1 di
  `reports/qa-batch-sync-regression.md`).

## Acceptance criteria

| AC | Hasil | Bukti |
| --- | --- | --- |
| 1. `--list` deteksi delta + paket, exit 0 | pass | `pnpm gate:delta --list` -> `13 file delta (tier t1)`, daftar file, `EXIT=0`. Pemetaan paket: `--list --files apps/web/app/composables/useAuthSession.ts,packages/core/src/index.ts,packages/contracts/src/index.ts` -> `-> apps/web: 1 file`, `-> packages/core: 1 file`, `-> packages/contracts: 1 file` |
| 2. Delta docs-only -> SKIP beralasan, exit 0 | pass | `pnpm gate:delta --files AGENTS.md` -> `prettier PASS 0s`, `eslint SKIP tidak ada file kode di paket`, `vitest SKIP ...`, `typecheck SKIP tier t1`, `-> PASS`, `EXIT=0` |
| 3. `--tier t3` ditolak exit 2 + arahan manual | pass | `pnpm gate:delta --tier t3 --files AGENTS.md` -> `--tier hanya t1 atau t2 (t3 = task payung/rilis, jalankan manual)`, `EXIT=2` |
| 4. File di luar peta paket -> peringatan | pass | `touch apps/mobile/probe.ts`; `--list` -> `gate-delta: tidak ada gate otomatis untuk: apps/mobile/probe.ts` + `(paket belum ter-scaffold / di luar peta paket)`, exit 0; probe dihapus |
| 5. Jalur FAIL: prettier FAIL + exit 1 | pass | file sementara `apps/web/probe-bad.json` (JSON tidak terformat) -> `prettier FAIL 0s`, `-> FAIL`, `EXIT=1`; probe dihapus. Catatan: percobaan pertama dengan `probe-bad.md` lolos karena isi teks bebas tetap dianggap Markdown valid - bukan bug, salah pilih jenis file |
| 6. `pnpm check:agent-docs` | pass | `check-agent-docs OK: 3 pilar + 3 rules sinkron`, exit 0 |
| 7. Aturan selaras script + tidak menabrak aturan lama | pass | `ergonio-status-flow.md:54-58` (gate wajib, larangan daftar test manual), `:64-67` (stop di bug blocking pertama), `:70-82` (tier T1/T2/T3 + timebox -> `BLOCKED`), `:108-112` (handoff wajib blok gate) cocok dengan opsi script (`--tier t1|t2`, `--list`, `--base`, `--files`, `--no-*`). Skill ergonio/orchestration memakai kalimat yang sama. `grep 'pnpm test\|suite penuh'` di `shared-code-quality.md`, `shared-security.md`, `apps/web/CLAUDE.md` -> tidak ada aturan lama yang bertabrakan |

## Bug

Tidak ada bug blocking.

| # | Severity | Ringkas | Bukti |
| --- | --- | --- | --- |
| N1 | Low | Delta yang seluruhnya di luar peta paket berakhir `GATE-DELTA ... -> PASS` tanpa baris "tidak ada gate otomatis" di blok ringkasan; peringatannya hanya di stderr. Blok yang ditempel ke komentar handoff bisa terlihat hijau padahal tidak ada yang digate | `scripts/gate-delta.sh:179` (peringatan ke stderr), `:351-355` (ringkasan tidak memuat status unmapped) |
| N2 | Low | `check:agent-docs` hanya memeriksa 3 pilar + 3 rules; salinan agent/skill di `.qoder/.commandcode/.opencode` tidak dijaga gate. Sekarang sinkron (`diff` skill identik; agent beda hanya header `model:`/tool), tapi drift berikutnya lolos | `scripts/check-agent-docs.mjs` (output "3 pilar + 3 rules sinkron") |

## Tiga pilar

- **Keamanan:** script hanya membaca file + menjalankan lint/test lokal; tidak ada kredensial, tidak
  menyentuh jaringan, tidak ada perintah destruktif (`mktemp` + `trap cleanup`). Path dinormalisasi
  (`$ROOT/*` di-strip) dan artefak build dikecualikan.
- **Performa:** gate kode nyata 85s (prettier 1s, eslint 5s, vitest 63s/100 file, typecheck 16s) - di
  dalam batas T2 20 menit. `--list` 0s. Tidak menambah dependensi.
- **Kerapian:** prettier PASS untuk seluruh file delta; template + aturan memakai kalimat yang sama di
  3 tempat (rules, skill ergonio, skill orchestration); `--help` lengkap; exit code konsisten
  (0 lulus, 1 gagal, 2 argumen salah).

## Sisa risiko / tidak diuji

- Tidak diuji: `--base <ref>`, `--no-lint/--no-test/--no-typecheck`, timeout (`GATE_*_TIMEOUT`), dan
  delta `packages/tokens` (tidak ada file delta di sana). Tidak ada e2e; #82 docs/tooling-only.
- N1 layak ditutup dengan satu baris di blok ringkasan (`unmapped: N file - verifikasi manual`).
