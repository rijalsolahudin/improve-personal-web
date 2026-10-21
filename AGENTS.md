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

Aturan dimuat bertahap: root selalu, rules app hanya saat task menyentuh app itu.

**Selalu, semua task:**

1. `CLAUDE.md` (root) - tiga pilar + aturan bersama
2. `.claude/rules/shared-security.md`
3. `.claude/rules/shared-code-quality.md`
4. `.claude/rules/ergonio-status-flow.md`

**Hanya app yang disentuh - jangan muat app lain:**

| Task mengubah file di | Tambahan wajib dibaca |
|---|---|
| `apps/web/**` | `apps/web/AGENTS.md` -> `apps/web/CLAUDE.md` -> `apps/web/.claude/rules/{security,performance,code-quality}.md` |
| `apps/mobile/**` | `apps/mobile/AGENTS.md` -> `apps/mobile/CLAUDE.md` -> `apps/mobile/.claude/rules/{security,performance,code-quality}.md` |
| `packages/**` | rules root saja (kontrak lintas app ada di `.claude/rules/shared-code-quality.md`) |

Menyentuh `apps/web` tidak memuat aturan mobile, dan sebaliknya. Aturan app lain baru dimuat kalau task ini memang mengubah file di app itu juga.

DILARANG mengedit file di `apps/<app>/**` sebelum daftar di tabel itu dibaca. Di ringkasan akhir, tulis `Rules dibaca: ...` supaya bisa diaudit.

### Lacak task di Ergonio

Setiap task kerja (ubah kode/config, bug fix, riset yang menghasilkan keputusan) dilacak di Ergonio project `personal-productivity` lewat MCP `ergonio`. Skip untuk pertanyaan singkat atau perintah sekali jalan.

Alur status: developer ambil dari `backlog` -> `todo` -> `prog` -> `status-1792622088574` (Ready to Review). QA (`fajar`) ambil dari Ready to Review -> `review`, lalu `done` kalau lulus atau `status-1792622168795` (Failed) kalau ada bug. Developer tidak boleh set `review`/`done`; QA tidak boleh memperbaiki kode produk.

Kerjakan task yang tidak saling bergantung secara paralel (lihat `### PARALEL` di `docs/PRD.md`), satu task satu agent, dan jangan dua agent mengedit file yang sama bersamaan.

Detail: `.claude/rules/ergonio-status-flow.md`, alur tool: `.claude/skills/ergonio/SKILL.md`. Dua task atau lebih sekaligus: skill `orchestration` (pembagian ke subagent, batas file, siapa memindahkan status).

### Referensi (baca saat relevan, jangan di-import)

- Arsitektur repo: `ARCHITECTURE.md`
- Produk: `docs/PRD.md`
- Arsitektur per app: `apps/<app>/ARCHITECTURE.md`
