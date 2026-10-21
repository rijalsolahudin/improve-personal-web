<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->

## Aturan project

Monorepo: `apps/web` (Nuxt) + `apps/mobile` (React Native).

### Tiga pilar wajib

Setiap perubahan wajib memenuhi ketiganya - bukan cuma "fiturnya jalan":

1. **Keamanan** - input divalidasi, authz dicek di server, secret tidak bocor, data sensitif dilindungi.
2. **Performa** - tidak ada regresi di jalur panas, bundle/render/query efisien, terukur.
3. **Kerapian** - kode konsisten, terbaca, terstruktur, ter-test, tanpa dead code.

Kalau satu pilar sengaja dikorbankan, tulis trade-off-nya eksplisit (detail: `CLAUDE.md` root).

### Wajib dibaca sebelum mengerjakan task

Baca berurutan, jangan dilewati:

1. `CLAUDE.md` (root) - aturan project lengkap + aturan bersama
2. `.claude/rules/keamanan-bersama.md`
3. `.claude/rules/kerapian-bersama.md`
4. Menyentuh app? Lanjut ke `apps/<app>/CLAUDE.md` dan `apps/<app>/.claude/rules/*.md`

### Lacak task di Ergonio

Setiap task kerja (ubah kode/config, bug fix, riset yang menghasilkan keputusan) dilacak di Ergonio project `personal-productivity` lewat MCP `ergonio`: buat task dulu, update status & progress sampai selesai. Skip untuk pertanyaan singkat atau perintah sekali jalan. Alur lengkap: `.claude/skills/ergonio/SKILL.md`.

### Referensi (baca saat relevan, jangan di-import)

- Arsitektur repo: `ARCHITECTURE.md`
- Produk: `docs/PRD.md`
- Arsitektur per app: `apps/<app>/ARCHITECTURE.md`
