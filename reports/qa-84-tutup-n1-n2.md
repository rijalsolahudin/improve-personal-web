# QA report - #84 Tutup 2 Low QA #82: gate false-green delta unmapped + drift salinan agent

## Verdict

**LULUS** (re-check, 3 poin handoff saja; tidak ada area baru dibuka).

- Tier: T1 · Delta: `scripts/gate-delta.sh`, `scripts/check-agent-docs.mjs` (+ salinan `.qoder/.commandcode/.opencode` hasil sync)
- Gate: `bash scripts/gate-delta.sh --files packages/core/src/index.ts` -> PASS (4s) sebagai penjaga agar fix tidak salah memicu MANUAL; delta task sendiri docs/tooling-only (semua langkah SKIP, PASS)

## Acceptance criteria (poin re-check)

| # | Hasil | Bukti |
| --- | --- | --- |
| 1. Delta unmapped-only -> baris `unmapped` + verdict `-> MANUAL`, exit 0 | pass | `apps/mobile/probe.ts` sementara; `gate-delta.sh --tier t1 --files apps/mobile/probe.ts` -> `GATE-DELTA tier=t1 files=1 -> MANUAL (1s)`, baris `- unmapped: SKIP (-) 1 file di luar peta paket - verifikasi manual`, `EXIT=0`. Run kedua tanpa `--files` (delta working tree 17 file, probe ikut terdeteksi git) -> `files=17 -> MANUAL`, `EXIT=0`. Probe dihapus (`ls` -> No such file) |
| 2. Delta docs-only biasa tetap `-> PASS`, exit 0 | pass | `bash scripts/gate-delta.sh --files AGENTS.md` -> `prettier PASS 1s`, `eslint/vitest SKIP`, tanpa baris `unmapped`, `-> PASS (1s)`, `EXIT=0` |
| 3a. Drift `.qoder/agents/fajar.md` -> gagal + arahan sync | pass | sisip 1 baris -> `check-agent-docs gagal: - .qoder/agents/fajar.md: drift dari .claude/agents/fajar.md - jalankan \`pnpm sync:agents\``, `EXIT=1` |
| 3b. Drift `.qoder/skills/ergonio/SKILL.md` -> gagal + arahan sync | pass | sisip 1 baris -> `- .qoder/skills/ergonio/SKILL.md: drift dari sumber - jalankan \`pnpm sync:agents\``, `EXIT=1` |
| 3c. `pnpm sync:agents` -> `check:agent-docs` hijau | pass | `sync-agent-config`: `.qoder 6 agent, 2 skill` / `.commandcode 6 agent` / `.opencode 6 agent`, `SYNC_EXIT=0`; `check-agent-docs OK: 3 pilar + 3 rules sinkron`, `EXIT=0` |
| 3d. Working tree kembali seperti semula | pass | `git diff \| sha256sum` sebelum = sesudah = `93c8d3d5b166...22ca1`; `git status --porcelain` identik (16 entri, `STATUS_IDENTIK`); tidak ada file probe tersisa |

## Bug

Tidak ada bug blocking. N1 (false green) dan N2 (drift senyap) tertutup.

## Tiga pilar

- **Keamanan:** tidak tersentuh delta ini (script lokal, tanpa jaringan/kredensial; `mktemp` + `trap cleanup`).
- **Performa:** gate unmapped 1s, docs-only 1s, sanity paket 4s (vitest core 6 test 2s) - jauh di bawah batas T1.
- **Kerapian:** `pnpm check:agent-docs` hijau sebelum & sesudah drift/sync; tidak ada `it.only`/`.skip`; tidak ada file sisa.

## Sisa risiko / tidak diuji

- `MANUAL` hanya muncul saat `PACKAGE_STEPS=0`: delta campuran (1 file unmapped + kode ter-map) tetap `-> PASS` walau baris `unmapped` tercetak. Verdict hijau bisa terbaca sebagai lulus - mitigasi: baris unmapped tetap wajib dibaca.
- Verdict `MANUAL` keluar dengan **exit 0** (sesuai AC), jadi CI/orchestrator yang hanya melihat exit code tetap tidak tahu; yang menangkapnya harus teks verdict.
- `.commandcode`/`.opencode` hanya dicek **keberadaan** salinan (bukan isi/kebaruan); skill selain `SKILL.md` dan file non-`SKILL.md` di folder agent tidak dibandingkan.
- Tidak diuji ulang: `--list` pada delta unmapped, `--base <ref>`, timeout env, `--no-lint/--no-test` (di luar 3 poin handoff, tidak ada perubahan di jalur itu).
