# QA T46 — Rapikan `AGENTS.md` + sambungkan `.claude` skills/agents ke Qoder

**Verdict: LULUS DENGAN CATATAN (tidak blocking).**

Semua acceptance criteria mekanis task ini lulus dan dibuktikan dengan eksekusi: `AGENTS.md`
root memuat tiga pilar inline + tabel apa-saja-yang-wajib-dibaca per app + alur Ergonio +
pointer referensi; `apps/{web,mobile}/AGENTS.md` murni pointer (tanpa salinan isi); `sync:agents`
idempoten dan tidak menyentuh sumber; `check-agent-docs` lulus dan menangkap drift; `.qoder/skills`
identik byte-for-byte dengan `.claude/skills`; `.opencode/agents` sesuai transform (diverifikasi
runtime lewat `opencode debug agents`); `opencode.json` menunjuk `.qoder/skills` dan termuat;
pre-commit menjalankan sync + `git add` termasuk `.opencode/agents`.

Catatan yang membuat ini bukan "LULUS bersih":

| # | Severity | Ringkas | Status |
|---|---|---|---|
| B1 | Medium | Instruksi `progressPct` di `.claude/**` bertentangan dengan skema MCP (tidak bisa di-set) | **pre-existing**, bukan dari T46 |
| B2 | Low-Medium | Klaim "subagent tidak punya MCP" tidak benar di OpenCode (subagent mewarisi `tools.ergonio.*`) | **pre-existing**, bukan dari T46 |
| B3 | Low | `AGENTS.md:53` menyiratkan `backlog -> todo -> prog` wajib, sedangkan rule membolehkan `backlog -> prog` | dari T46 |
| B4 | Low | `.opencode/README.md` tidak pernah masuk commit (pathspec pre-commit hanya `.opencode/agents`) | dari T46 |
| B5 | Low | Klaim yang tidak bisa diverifikasi di README generated (perilaku pemindaian Qoder, dedupe skill OpenCode) | dokumentasi |

B1/B2 ada di `.claude/rules` + `.claude/skills` + `.claude/agents` — file yang bukan deliverable
T46 (dan sudah ada di HEAD, lihat bukti diff). Karena itu T46 tidak saya jatuhkan ke Failed;
B1/B2 saya rekomendasikan jadi task follow-up (lihat "Rekomendasi").

- **Rules dibaca:** `CLAUDE.md` (root), `.claude/rules/shared-security.md`,
  `.claude/rules/shared-code-quality.md`, `.claude/rules/ergonio-status-flow.md`;
  app-specific **tidak dimuat** — task ini hanya menyentuh `AGENTS.md`, `scripts/`, `.husky/`,
  `.claude/`, `.qoder/`, `.opencode/`, dan `reports/**` (tidak ada perubahan di `apps/**`).
- **Batas QA dipatuhi:** hanya `reports/qa-t46-agents.md` yang ditulis. Status Ergonio task #46
  tidak saya ubah.

---

## 1. Scope & test plan

Diuji (dengan eksekusi nyata di working tree, bukan pembacaan saja):

1. Struktur & isi `AGENTS.md` root + `apps/web/AGENTS.md` + `apps/mobile/AGENTS.md`.
2. Konsistensi `AGENTS.md` ↔ `CLAUDE.md` (root & app): duplikasi yang disengaja vs kontradiksi.
3. `scripts/sync-agent-config.mjs`: cakupan salinan, transform per klien, idempotensi, tidak
   menulis ke sumber.
4. `.husky/pre-commit`: urutan langkah, pathspec `git add`, dan bukti bahwa drift generated
   benar-benar ikut ter-stage (simulasi di repo sementara `/tmp/opencode/hooktest`).
5. `node scripts/check-agent-docs.mjs`: jalur lulus + jalur gagal (negative test).
6. `.qoder/skills` vs `.claude/skills` (byte), `.qoder/agents` vs `.claude/agents` (minus `model:`),
   `.commandcode/agents` (rename tool + pin model), `.opencode/agents` (frontmatter V2 + `permissions`).
7. `opencode.json` → `.qoder/skills`, dan pemuatan agent/permission di runtime OpenCode v2.1.2.
8. Akurasi dua catatan yang sudah diketahui: `progressPct` via MCP, dan akses `tools.ergonio.*`
   dari subagent.

Tidak diuji (dengan alasan):

- **Tampilan Qoder** (panel Skills/Subagents, `/ergonio` di UI) — tidak ada Qoder CLI/headless di
  environment ini; yang bisa dibuktikan hanya isi direktori + drift guard.
- **Command Code runtime** — tidak terpasang; transform diverifikasi struktural (reverse-map).
- **`pnpm exec lint-staged` dan `pnpm run typecheck`** — bagian ekor pre-commit, bukan kontrak task
  ini; repo sedang berisi puluhan perubahan task lain yang belum selesai sehingga hasilnya tidak
  bisa diatribusikan ke T46. Keberadaan perintah + urutannya diverifikasi.
- **Full `pre-commit` end-to-end di repo asli** — sengaja tidak dijalankan karena hook melakukan
  `git add` (mengubah index) dan `git status` menunjukkan proses git lain aktif
  (`index.lock` sempat ada). Penggantinya: simulasi 1:1 di repo sementara + `git add --dry-run`.

---

## 2. Hasil per acceptance criteria

### AC1 — `AGENTS.md` root: 3 pilar inline, daftar wajib dibaca per app, tracking Ergonio, pointer referensi → **PASS**

| Yang diminta | Bukti |
|---|---|
| 3 pilar wajib inline | `AGENTS.md:20-22` (Keamanan/Performa/Kerapian), plus konsekuensi trade-off `AGENTS.md:24` |
| Daftar wajib dibaca semua task | `AGENTS.md:30-35` (root `CLAUDE.md` + 3 shared rules) |
| Daftar per app (on-demand) | `AGENTS.md:39-45` tabel `apps/web/**`, `apps/mobile/**`, `packages/**` |
| Larangan muat aturan app lain | `AGENTS.md:45,47` |
| Aturan tracking Ergonio + alur status | `AGENTS.md:49-57` (`backlog -> todo -> prog -> status-1792622088574`, QA `review` → `done`/`status-1792622168795`) |
| Pointer referensi (baca saat relevan) | `AGENTS.md:59-63` (`ARCHITECTURE.md`, `docs/PRD.md`, `apps/<app>/ARCHITECTURE.md`) |
| Blok turborepo utuh | `AGENTS.md:1-10` (`<!-- BEGIN/END:turborepo-agent-rules -->` masih lengkap) |

Semua path yang ditunjuk benar-benar ada: `ARCHITECTURE.md`, `docs/PRD.md`, `apps/{web,mobile}/ARCHITECTURE.md`,
`.claude/rules/{shared-security,shared-code-quality,ergonio-status-flow}.md`,
`apps/{web,mobile}/CLAUDE.md`, `apps/{web,mobile}/.claude/rules/{security,performance,code-quality}.md`,
serta `apps/{web,mobile}/docs/PRD.md` → symlink valid ke `../../../docs/PRD.md`.
`### PARALEL` yang dirujuk `AGENTS.md:55` memang ada di `docs/PRD.md:1110`.

### AC2 — `apps/web/AGENTS.md` & `apps/mobile/AGENTS.md` = daftar pointer, bukan duplikasi → **PASS**

Keduanya identik strukturnya: deklarasi "tidak ada salinan" (`:3`), muat on-demand (`:4`),
5 langkah baca berurutan (`:6-12`), lalu pointer arsitektur/produk (`:14`). Isi aturan tidak
disalin; hanya path. Urutannya konsisten dengan tabel di `AGENTS.md:41-42`
(`AGENTS.md` → `CLAUDE.md` app → 3 rules app). Tidak ada aturan yang hanya ada di file app
sehingga hilang konteksnya.

### AC3 — Tidak ada duplikasi/kontradiksi `AGENTS.md` ↔ `CLAUDE.md` → **PASS (1 catatan: B3)**

- Duplikasi yang ada **disengaja dan dijaga mesin**: tiga pilar (`AGENTS.md:20-22` vs
  `CLAUDE.md:9-11`). `CLAUDE.md:15` menyatakan eksplisit "kalau berubah, ubah keduanya", dan
  `scripts/check-agent-docs.mjs:26-34` membandingkan teksnya persis → tidak mungkin drift diam-diam.
- Import di `CLAUDE.md:19-21` semuanya disebut di `AGENTS.md:33-35`, tidak ada yatim; dijaga
  `check-agent-docs.mjs:36-44` (terbukti: `check-agent-docs OK: 3 pilar + 3 rules sinkron`).
- App: `apps/*/CLAUDE.md` hanya berisi rujukan + daftar `@.claude/rules/*` (mode Claude Code),
  sedangkan `apps/*/AGENTS.md` menuliskan path yang sama sebagai teks (mode Qoder, tanpa `@import`).
  Keduanya menunjuk 3 file rules yang sama → konsisten, bukan salinan.
- Temuan **B3**: `AGENTS.md:53` menulis alur developer sebagai `backlog -> todo -> prog` (tanpa
  syarat), sedangkan sumber otoritatif `.claude/rules/ergonio-status-flow.md:25-26` membolehkan
  `backlog -> prog` langsung, dan `.claude/skills/orchestration/SKILL.md:32` menulis
  "`backlog`/`todo` -> `prog`". Bukan kontradiksi dengan `CLAUDE.md` (CLAUDE.md tidak membahas
  urutan ini), tapi ringkasan `AGENTS.md` lebih ketat daripada rule-nya.

### AC4 — `scripts/sync-agent-config.mjs`: cakupan + idempoten + tidak mengedit sumber → **PASS**

- Cakupan sesuai: agents → `.qoder`/`.commandcode`/`.opencode` (`:111-114`), skills → `.qoder`
  saja (`:112`), dan itu memang desainnya (`.commandcode/settings.json` → `.claude/skills`,
  `opencode.json` → `.qoder/skills`).
- Transform per klien terverifikasi:
  - `.qoder`: `model:` dibuang (`:23`) — tidak ada sisa `^model:` di `.qoder/agents/*`
    (`grep -rn '^model:' .qoder/agents` → kosong), isi lain identik dengan sumber
    (`sed '/^model:/d'` vs file generated: **0 beda** untuk 6 file).
  - `.commandcode`: nama tool dipetakan (`:27-35`) + `model: deepseek/deepseek-v4.1-flash` (`:26`).
    Contoh `.commandcode/agents/fajar.md:5-6`. Reverse-map 6/6 file → body **identik** dengan sumber,
    jadi tidak ada perubahan teks liar di luar rename tool.
  - `.opencode`: `mode: subagent` + `permissions` hanya untuk agent `Write`-only (`:54-79`);
    `name`/`tools`/`model` dibuang. Verifikasi struktural 6/6 file: `fm=OK body=OK`,
    `permBlock=true` hanya untuk `arif.md` & `yoga.md` (di sumber `tools: ... Write` tanpa `Edit`),
    `false` untuk `bayu/dimas/fajar/raka`.
- **Idempoten**: hash `.qoder`, `.commandcode/agents`, `.opencode/agents` sebelum dan sesudah
  `pnpm run sync:agents` dua kali → **identik** (run1 == run2 == kondisi awal).
- **Tidak mengedit sumber**: hash `.claude/agents` + `.claude/skills` sebelum vs sesudah dua kali
  sync → **tidak berubah**.

### AC5 — `.husky/pre-commit`: sync + `git add` (termasuk `.opencode/agents`) lalu lint/typecheck → **PASS (1 catatan: B4)**

`.husky/pre-commit:1-5`:

```sh
node scripts/check-agent-docs.mjs      # gagal cepat kalau AGENTS.md drift
node scripts/sync-agent-config.mjs     # regenerate .qoder/.commandcode/.opencode
git add .qoder .commandcode/agents .opencode/agents
pnpm exec lint-staged
pnpm run typecheck
```

Bukti bahwa ini benar-benar mencegah drift (simulasi di `/tmp/opencode/hooktest`, repo git bersih
berisi file yang sama):

1. Jalankan baris 1-3 tanpa perubahan sumber → `git status` bersih (sync tidak menghasilkan drift
   palsu).
2. Ubah `.claude/agents/fajar.md` + `.claude/skills/ergonio/SKILL.md`, jalankan baris 1-3 →
   `git diff --cached --name-only` memuat `.qoder/agents/fajar.md`, `.commandcode/agents/fajar.md`,
   `.opencode/agents/fajar.md`, dan `.qoder/skills/ergonio/SKILL.md`. Perubahan satu baris
   (`uji drift`) muncul di ketiga klien → propagasi benar.
3. Jalankan sync dua kali di repo itu → `git diff --cached --stat` sama (`19 files changed, 4 insertions(+), 3 deletions(-)`)
   → idempoten juga saat ada perubahan.

`git add --dry-run .qoder .commandcode/agents .opencode/agents` di repo asli → sukses, men-stage
`.qoder/skills/*` + 6 `.opencode/agents/*`.
Wiring husky aktif: `git config core.hooksPath` = `.husky/_`, `.husky/_/pre-commit` meng-source
hook, `.husky/pre-commit` executable (`-rwxrwxrwx`).

**B4**: pathspec hanya `.opencode/agents`, sehingga `.opencode/README.md` (ditulis manusia, bukan
hasil generate) **tidak pernah ikut ter-commit** — `git status` masih `?? .opencode/`, dan dry-run
hanya menyebut 6 agent. Dampak: setelah clone bersih, direktori `.opencode` tanpa README penjelas.

### AC6 — `check-agent-docs` lulus + `.qoder/skills` identik + `.opencode/agents` sesuai transform → **PASS**

| Perintah | Hasil |
|---|---|
| `node scripts/check-agent-docs.mjs` | `check-agent-docs OK: 3 pilar + 3 rules sinkron`, exit 0 |
| `pnpm run check:agent-docs` | sama, exit 0 |
| `diff -r .claude/skills .qoder/skills` | tidak ada output → **identik byte-for-byte** |
| Transform `.opencode` (6 file) | `body=OK note=OK fm=OK`, permission block hanya `arif`/`yoga` |
| Negative test `check-agent-docs` | ubah satu kata di pilar `AGENTS.md` → `check-agent-docs gagal: - Teks tiga pilar di AGENTS.md beda dengan CLAUDE.md - samakan`, **exit 1** |

Jalur gagal juga mencakup: pilar < 3 (`:26-31`), rule yang di-import `CLAUDE.md` tidak disebut
`AGENTS.md` (`:36-38`), rule yatim (`:40-44`), dan 3 rules app hilang/tidak disebut
(`apps/*/AGENTS.md` → `:48-63`).

### AC7 — `opencode.json` → `.qoder/skills`, termuat → **PASS (runtime)**

- `opencode.json:3` → `"skills": [".qoder/skills"]`.
- `opencode debug config` (v2.1.2) memuat dokumen project:
  `{"$schema":"https://opencode.ai/config.json","skills":[".qoder/skills"]}`.
- `opencode debug agents` → 13 agent total; **6 agent project** semuanya `mode=subagent`,
  `hidden=false`, `system` terisi: `arif`, `bayu`, `dimas`, `fajar`, `raka`, `yoga`.
  Permission hasil transform benar-benar berlaku:
  - `arif`, `yoga`: `edit "*" deny` + `edit "reports/**" allow`
  - `bayu`, `dimas`, `fajar`, `raka`: tanpa entri `edit` tambahan (default sesi)
  - `model` tidak di-pin → diwarisi sesi induk (terlihat di header agent yang saya jalankan).
- Nama skill `ergonio` & `orchestration` tersedia di sesi OpenCode ini — konsisten dengan isi
  `.qoder/skills`. Atribusi sumber (`.qoder/skills` vs compatibility `.claude/skills`) tidak bisa
  dibedakan dari dalam sesi; yang terbukti adalah config termuat dan skill terdaftar (lihat B5).

### AC8 — Dua catatan yang sudah diketahui → **TIDAK AKURAT, lihat B1 & B2**

- `progressPct` **memang tidak bisa di-set** lewat MCP. Skema `tools.ergonio.updateTask` tidak punya
  field itu, dan deskripsinya eksplisit: *"Progress is not settable: it follows the task's status,
  so change the status to move it."* → instruksi `progressPct: 90/100` di banyak file adalah bug
  dokumentasi (B1).
- Subagent **punya** `tools.ergonio.*` di OpenCode. Sesi ini sendiri adalah subagent (spawn dari
  sesi induk) dan berhasil memanggil `tools.ergonio.getTask`, `getTaskComments`, `searchTasks` →
  klaim "subagent tidak punya MCP" salah untuk jalur OpenCode (B2).

---

## 3. Bug / temuan (urut severity)

### B1 — Medium — Instruksi `progressPct` tidak sesuai skema MCP (pre-existing, di luar deliverable T46)

- **Lokasi:** `.claude/rules/ergonio-status-flow.md:27`, `:29`, `:43`, `:92`;
  `.claude/skills/ergonio/SKILL.md:45-46`; `.claude/skills/orchestration/SKILL.md:32`, `:34`, `:35`;
  `.claude/agents/{arif,bayu,dimas,raka,yoga}.md:19-20`; `.claude/agents/fajar.md:20`.
  Tersebar ke generated: `.qoder/agents/*`, `.commandcode/agents/*`, `.opencode/agents/*`.
- **Reproduksi:** `grep -rn progressPct .claude` → 15 baris instruksi. Lalu cek skema
  `tools.ergonio.updateTask` → field `progressPct` tidak ada; deskripsi: *"Progress is not settable:
  it follows the task's status"*.
- **Expected:** instruksi agent hanya mengubah `status` (+ `description`), tanpa `progressPct`.
- **Actual:** agent diperintahkan mengirim `progressPct: 25/50/75/90/100`; nilai itu tidak diterima
  skema sehingga progress yang dilaporkan ke user tidak benar-benar di-set oleh agent.
- **Bukti tambahan:** task #46 sendiri ber-`progressPct: 100` sementara tidak ada field itu di MCP —
  nilai tersebut berasal dari status/`completedAt` (`completedAt: 2026-10-23T01:53:36.857Z`), bukan
  dari `updateTask`.
- **Bukan regresi T46:** versi di HEAD sudah memuat `progressPct` (baris `-2. Lulus: done +
  progressPct: 100 ...` pada sisi minus `git diff .claude/rules/ergonio-status-flow.md`); edit T46
  mempertahankannya.
- **Dampak ke tiga pilar:** kerapian (aturan tidak akurat) + kepercayaan pada status (agent melapor
  progress yang tidak tersimpan).

### B2 — Low-Medium — Klaim "subagent tidak punya MCP" salah untuk OpenCode (pre-existing)

- **Lokasi:** `.claude/rules/ergonio-status-flow.md:53` ("Subagent tidak punya MCP - orchestrator
  yang memposting komentar atas nama hasil subagent");
  `.claude/skills/orchestration/SKILL.md:13` ("Subagent tidak punya tool MCP ergonio ... Subagent
  tidak boleh diminta memanggil MCP").
- **Reproduksi:** jalankan subagent (`fajar`) di sesi OpenCode yang punya MCP `ergonio`
  (`~/.config/opencode/opencode.json` → `mcp.servers.ergonio`), lalu panggil `tools.ergonio.getTask`.
- **Expected (menurut dokumen):** tool tidak tersedia.
- **Actual:** tool tersedia dan berfungsi (dipakai untuk audit ini: `getTask`, `getTaskComments`,
  `searchTasks`). Penyebab struktural: `scripts/sync-agent-config.mjs:69-73` membuang `tools:`
  dari frontmatter `.opencode/agents`, sehingga subagent OpenCode mewarisi seluruh tool sesi induk,
  termasuk MCP. `opencode debug agents` juga menampilkan keenam agent project sebagai `subagent`
  tanpa batasan tool selain `permissions edit` untuk `arif`/`yoga`.
- **Dampak:** orchestrator mengerjakan pekerjaan ganda (mem-posting komentar atas nama subagent),
  dan aturan "subagent tidak boleh diminta memanggil MCP" tidak bisa ditegakkan — malah berpotensi
  membuat dua penulis status/komentar untuk task yang sama.
- **Catatan desain terkait:** `fajar`/`bayu`/`dimas`/`raka` di OpenCode tanpa `permissions` tambahan
  → boleh mengedit seluruh repo (guardrail "hanya file test" hanya tekstual di persona). Bukan
  regresi dibanding Claude Code, tapi perlu disadari.

### B3 — Low — `AGENTS.md` lebih ketat dari rule status (dari T46)

- **Lokasi:** `AGENTS.md:53` vs `.claude/rules/ergonio-status-flow.md:25-26` dan
  `.claude/skills/orchestration/SKILL.md:32`.
- **Reproduksi:** baca ketiga baris. `AGENTS.md` menulis `backlog -> todo -> prog` tanpa pengecualian;
  rule menulis "Kalau langsung dikerjakan, `backlog` -> `prog` boleh sekalian".
- **Dampak:** agent Qoder yang hanya membaca `AGENTS.md` membuat transisi `todo` yang tidak perlu
  (satu panggilan MCP + satu approval user terbuang). Tidak merusak data.

### B4 — Low — `.opencode/README.md` tidak pernah ter-commit (dari T46)

- **Lokasi:** `.husky/pre-commit:3` (`git add .qoder .commandcode/agents .opencode/agents`).
- **Reproduksi:** `git status --porcelain` → `?? .opencode/`; `git add --dry-run .qoder
  .commandcode/agents .opencode/agents` → hanya 6 file `.opencode/agents/*.md`, README tidak ikut.
  Script sync juga tidak membuat README (`scripts/sync-agent-config.mjs:84-96` hanya menulis agent).
- **Actual:** README penjelas direktori generated tetap untracked; clone bersih tidak punya
  `.opencode/README.md`.
- **Saran:** ganti pathspec jadi `git add .qoder .commandcode/agents .opencode` (atau tambahkan
  `.opencode/README.md`).

### B5 — Low — Klaim README yang belum bisa diverifikasi

- `.qoder/README.md:10` — "Qoder hanya memindai `.qoder/skills` dan `.qoder/agents` — bukan `.claude`".
- `.opencode/README.md:17-19` — "OpenCode juga tetap membaca `.claude/skills` sebagai compatibility
  source; nama skill yang sama di dua sumber di-dedupe".
- Keduanya tidak bisa dibuktikan di environment ini (tidak ada Qoder; sumber OpenCode tidak tersedia).
  Jangan dianggap teruji; kalau salah, akibatnya cuma duplikasi skill, bukan kegagalan fungsi.

### Observasi (bukan bug, bahan perbaikan berikutnya)

- **N1 — rantai baca app untuk Qoder bergantung pada `@import`.** `apps/*/AGENTS.md:8` menyuruh baca
  `../../CLAUDE.md` (root), tetapi shared rules di root `CLAUDE.md:19-21` ditulis sebagai `@import`
  — sintaks yang menurut premis project (`scripts/check-agent-docs.mjs:3-4`) tidak didukung Qoder.
  Aman selama agent sudah membaca `AGENTS.md` root (`:30-35` menyebut ketiga rules sebagai teks),
  tapi kalau masuk lewat `apps/*/AGENTS.md` langsung, jalur ke shared rules rapuh. Saran: ulangi 3
  path shared rules di `apps/*/AGENTS.md`.
- **N2 — `AGENTS.md` root tidak menyatakan `.qoder`/`.commandcode`/`.opencode` generated.**
  Larangan "jangan edit hasil generate + jalankan `pnpm sync:agents`" hanya ada di note tiap agent
  (`:6`/`:8`/`:13`) dan README masing-masing, tidak di entry point Qoder.
- **N3 — status task #46 saat audit = `done`, `progressPct: 100`, `completedAt`
  2026-10-23T01:53:36Z**, padahal brief menyebut `review`. Sesuai batas QA, status tidak saya ubah;
  saya catat supaya tidak ada dua pihak mengubahnya bersamaan.

---

## 4. Cek tiga pilar

- **Keamanan** — PASS dengan catatan. Generated agent tidak membawa secret; `Bash`/MCP diwarisi
  (B2) sehingga batas "agent ini tidak boleh menyentuh X" tidak lagi ditegakkan runtime untuk 4 dari
  6 agent di OpenCode; `arif`/`yoga` benar-benar dibatasi `edit` hanya `reports/**` (terbukti di
  `opencode debug agents`). `.env` tetap di-`ask` oleh default global, bukan oleh transform ini.
  Tidak ada token/credential di file generated (dicek: hanya teks aturan + path).
- **Performa** — PASS. Entry point ringkas: `AGENTS.md` root 63 baris, `apps/*/AGENTS.md` 14 baris;
  aturan detail dibaca on-demand, tidak di-`@import` massal. Sync hanya menyentuh ~19 file kecil.
- **Kerapian** — PASS dengan catatan. Satu sumber kebenaran (`.claude`), tiga klien generated,
  drift dijaga pre-commit + `check-agent-docs` (terbukti dua arah). Catatan: B4 (README tak
  ter-commit), B3 (ringkasan vs rule), N2 (entry point tidak menyebut direktori generated).

---

## 5. Coverage & celah yang tersisa

Sudah tercakup: struktur dokumen, konsistensi lintas dokumen, idempotensi sync, propagasi perubahan
sumber → 3 klien, jalur lulus & gagal `check-agent-docs`, isi `.qoder`/`.commandcode`/`.opencode`,
pemuatan config & agent di OpenCode runtime, dan akurasi dua catatan yang diminta.

Celah:

1. **Qoder tidak diuji runtime** (tidak ada binary). Yang terbukti hanya isi direktori + klaim README.
2. **Command Code tidak diuji runtime** (`settings.json` → `.claude/skills` belum dibuktikan dibaca).
3. **Ekor pre-commit (`lint-staged`, `typecheck`) tidak dijalankan** — hasil tidak bisa
   diatribusikan ke T46 karena repo berisi banyak perubahan task lain.
4. **Skill loading OpenCode**: config termuat, nama skill terdaftar; atribusi sumber
   (`.qoder/skills` vs `.claude/skills`) tidak bisa dipisahkan.
5. **Perilaku `updateTask` saat menerima properti tak dikenal** (`progressPct`) tidak diuji langsung
   — saya tidak mengubah data Ergonio. Cukup bukti dari skema + deskripsi tool.
6. **Windows/CRLF** tidak diuji; transform berbasis regex `\n` (`scripts/sync-agent-config.mjs:23,36`)
   akan gagal senyap pada file CRLF.

## 6. Rekomendasi

1. **Task follow-up (prioritas Medium):** hapus instruksi `progressPct` dari
   `.claude/rules/ergonio-status-flow.md`, `.claude/skills/{ergonio,orchestration}/SKILL.md`, dan 6
   `.claude/agents/*.md`; ganti jadi "progress mengikuti status". Setelah itu `pnpm sync:agents`
   menyebar otomatis (jangan edit generated).
2. **Task follow-up (Low-Medium):** perbaiki klaim "subagent tidak punya MCP" agar dikualifikasi per
   klien (Claude Code vs OpenCode), atau tegakkan lewat `permissions` di `.opencode/agents`.
3. **Perbaikan kecil (Low, bisa digabung):** `AGENTS.md:53` tambahkan "boleh `backlog -> prog`
   langsung"; `.husky/pre-commit:3` → `git add .qoder .commandcode/agents .opencode`; sebutkan
   direktori generated + `pnpm sync:agents` di `AGENTS.md` root; ulangi 3 path shared rules di
   `apps/*/AGENTS.md`.
4. Pertimbangkan tes otomatis untuk script sync (mis. snapshot hash `sync → sync` dan reverse-map
   transform per klien seperti yang saya lakukan manual) supaya regresi transform tertangkap tanpa
   mengandalkan pre-commit.

---

## 7. Perintah & hasil (apa adanya)

| # | Perintah | Hasil |
|---|---|---|
| 1 | `pnpm run sync:agents` (run 1) | `.qoder: 6 agent, 2 skill`; `.commandcode: 6 agent`; `.opencode: 6 agent`; exit 0 |
| 2 | `pnpm run sync:agents` (run 2) | output sama; hash `.qoder`/`.commandcode/agents`/`.opencode/agents` run1 == run2 → **identik** |
| 3 | hash `.claude/agents` + `.claude/skills` sebelum vs sesudah (2×) | **tidak berubah** (sumber tidak disentuh) |
| 4 | `node scripts/check-agent-docs.mjs` | `check-agent-docs OK: 3 pilar + 3 rules sinkron`, exit 0 |
| 5 | `pnpm run check:agent-docs` | sama, exit 0 |
| 6 | `diff -r .claude/skills .qoder/skills` | tanpa output → identik |
| 7 | `for f in .claude/agents/*.md; do sed '/^model:/d' $f \| diff - .qoder/agents/$(basename $f); done` | 0 beda (6 file) |
| 8 | reverse-map tool `.commandcode/agents/*` | 6/6 `IDENTIK setelah reverse-map` |
| 9 | cek frontmatter `.opencode/agents/*` (node script) | 6/6 `body=OK note=OK fm=OK`; `permBlock=true` hanya `arif`, `yoga` |
| 10 | `grep -rn '^\(tools\|model\|name\):' .opencode/agents` | kosong (benar) |
| 11 | `grep -rn '^model:' .qoder/agents` | kosong (benar) |
| 12 | `opencode debug config` | dokumen project `{"$schema":"https://opencode.ai/config.json","skills":[".qoder/skills"]}` |
| 13 | `opencode debug agents` | 13 agent; 6 project `mode=subagent`, `hidden=false`; `arif`/`yoga` `edit "*" deny` + `edit "reports/**" allow` |
| 14 | `git add --dry-run .qoder .commandcode/agents .opencode/agents` | 8 path (2 skill + 6 agent), exit 0 |
| 15 | simulasi hook di `/tmp/opencode/hooktest` (baris 1-3) | baseline bersih tanpa drift; ubah 1 agent + 1 skill → ketiga klien + `.qoder/skills` ter-stage; sync 2× → stat sama |
| 16 | negative test `check-agent-docs` (ubah 1 kata pilar) | `check-agent-docs gagal: - Teks tiga pilar di AGENTS.md beda dengan CLAUDE.md - samakan`, exit 1 |
| 17 | `git config core.hooksPath` | `.husky/_` (hook aktif) |
| 18 | `git status --porcelain` | `?? .opencode/` (README tidak ter-commit) + modifikasi `.claude`/`.qoder` milik pekerjaan ini |
| 19 | `grep -rn progressPct .claude` | 15 baris instruksi → B1 |
| 20 | skema `tools.ergonio.updateTask` | tidak ada `progressPct`; *"Progress is not settable: it follows the task's status"* → B1 |
| 21 | panggil `tools.ergonio.{getTask,getTaskComments,searchTasks}` dari subagent | berhasil → B2 |

Catatan lingkungan: `git add --dry-run` pertama gagal karena `.git/index.lock` ada (proses git lain
aktif di repo yang sama); diulang setelah 2 detik dan berhasil. Karena itu saya tidak menjalankan
operasi yang menulis index di repo asli.

**Kesimpulan ulang: LULUS DENGAN CATATAN.** Mekanisme yang dibangun T46 terbukti bekerja dan tidak
drift; tiga catatan kecil (B3, B4, N2) ada di deliverable-nya sendiri, dua bug dokumentasi (B1, B2)
sudah ada sebelum T46 dan butuh task terpisah.
