# .commandcode — agent dihasilkan otomatis

`agents/*.md` adalah salinan `.claude/agents/*.md` dengan dua penyesuaian format
Command Code: nama tool (`Read` -> `read_file`, `Bash` -> `shell_command`, dst.)
dan pin `model`. **Jangan diedit langsung** — ubah persona di sumbernya, lalu jalankan:

```sh
pnpm run sync:agents
```

Skill tidak disalin: `settings.json` menunjuk langsung ke `.claude/skills`.
Script: `scripts/sync-agent-config.mjs` (juga jalan otomatis di pre-commit).
