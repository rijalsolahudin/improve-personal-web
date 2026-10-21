# .qoder — dihasilkan otomatis

Direktori ini **jangan diedit langsung**. Isinya salinan dari `.claude/`:

| Dari | Ke | Dibaca sebagai |
| --- | --- | --- |
| `.claude/agents/*.md` | `.qoder/agents/*.md` | subagent |
| `.claude/skills/<nama>/` | `.qoder/skills/<nama>/` | skill |

Qoder hanya memindai `.qoder/skills` dan `.qoder/agents` — bukan `.claude`. Karena
workspace ini berada di mount `fuse` yang tidak mendukung symlink, isinya disalin
(lihat `scripts/sync-qoder-config.mjs`).

Setelah mengubah agent atau skill di `.claude/`, jalankan:

```sh
pnpm run sync:qoder
```

Script ini juga jalan otomatis di pre-commit.
