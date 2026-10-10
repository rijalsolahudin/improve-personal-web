# Improve Personal

Monorepo: `apps/web` (Nuxt) + `apps/mobile` (React Native).

## Tiga pilar wajib

Setiap perubahan **wajib** memenuhi ketiga pilar ini - bukan cuma "fiturnya jalan":

1. **Keamanan** - input divalidasi, authz dicek di server, secret tidak bocor, data sensitif dilindungi.
2. **Performa** - tidak ada regresi di jalur panas, bundle/render/query efisien, terukur.
3. **Kerapian** - kode konsisten, terbaca, terstruktur, ter-test, tanpa dead code.

Kalau satu pilar sengaja dikorbankan, tulis trade-off-nya secara eksplisit. Detail tiap pilar per app ada di `apps/<app>/.claude/rules/` dan dimuat lewat `CLAUDE.md` app masing-masing.

## Aturan bersama
- Aturan yang berlaku buat web + mobile taruh di sini, bukan di CLAUDE.md per app.
- Settings, agents, MCP: di root `.claude/`. Jalanin Claude dari root.
- Setiap task kerja: lacak di Ergonio (project `personal-productivity`) pakai skill `ergonio` - buat task dulu, update status/progress sampai selesai.
