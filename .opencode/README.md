# .opencode — agent dihasilkan otomatis

`agents/*.md` adalah salinan `.claude/agents/*.md` dengan penyesuaian format
OpenCode V2: `mode: subagent`, batasan tool ditulis sebagai `permissions`
(`tools` sudah legacy), dan `model` diwarisi dari sesi induk supaya agent tidak
terikat ke satu provider. Agent yang di sumbernya cuma punya `Write` (tanpa
`Edit`) hanya diizinkan mengedit `reports/**`.

Karena field `tools:` dibuang, subagent OpenCode **mewarisi seluruh tool sesi
induk, termasuk MCP ergonio**. Batas "hanya baca, jangan ubah status/komentar"
karena itu aturan tertulis (`.claude/rules/ergonio-status-flow.md`), bukan sandbox.
Transisi status dan komentar task tetap milik orchestrator.

**Jangan diedit langsung** — ubah persona di sumbernya, lalu jalankan:

```sh
pnpm run sync:agents
```

Skill tidak disalin ke `.opencode/skills`: `opencode.json` di root menunjuk
`.qoder/skills` (hasil generate dari `.claude/skills`), jadi OpenCode memakai
salinan yang sama dengan Qoder. OpenCode juga tetap membaca `.claude/skills`
sebagai compatibility source; nama skill yang sama di dua sumber di-dedupe.

Script: `scripts/sync-agent-config.mjs` (juga jalan otomatis di pre-commit).
