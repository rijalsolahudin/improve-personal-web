# QA — Task #52 Komentar task Ergonio untuk handoff developer ↔ QA

- **Task:** Ergonio #52 (`stackinnov/personal-productivity`) · status di Ergonio saat QA mulai **`status-1792622088574`**
  (Ready to Review). QA **tidak** memindahkan status (batas tugas: hanya `reports/**` yang boleh diubah).
- **Tanggal:** 2026-10-23
- **Tree:** `f8a9a5c` + working tree (banyak perubahan agent lain; QA tidak menyentuhnya)
- **Environment:** Linux, Node `v24.18.0`, Prettier `3.9.9`
- **Rules dibaca:** `CLAUDE.md` root · `AGENTS.md` root · `.claude/rules/shared-security.md` ·
  `.claude/rules/shared-code-quality.md` · `.claude/rules/ergonio-status-flow.md`.
  Rules app **tidak** dimuat — task ini tidak menyentuh `apps/**`.
- **Yang diubah QA:** hanya file report ini. `.claude/**`, `.qoder/**`, kode produk, status & komentar Ergonio tidak disentuh.

---

## Verdict: **LULUS** (dengan catatan non-blocking)

Acceptance criteria task terpenuhi: tiga dokumen memuat aturan **Failed → `prog` dulu** dan **protokol komentar**
(handoff / "mulai cek" / bug / balasan fix / verdict), `.qoder/skills` identik dengan `.claude/skills`, `check-agent-docs`
lulus, dan klaim nama tool komentar cocok dengan skema MCP yang hidup. Tidak ada kontradiksi dengan aturan lama
(developer dilarang set `review`/`done`; QA dilarang memperbaiki kode produk) dan tidak ada perubahan kode produk.

Ada **6 catatan non-blocking + 1 info** (§3). Yang paling perlu ditindaklanjuti: orchestration hanya menunjuk ke rules untuk
batas 5000 char / edit-hapus komentar sendiri / fallback (`c1–c3`), dan klaim lama `progressPct` bisa di-set lewat
`updateTask` ternyata tidak sesuai skema MCP (pre-existing, bukan dari diff ini).

---

## 1. Checklist

### 1a. Isi dokumen (a) Failed → `prog` dulu, (b) protokol komentar, (c) batas komentar

Matriks dihasilkan dari assertion otomatis (script QA di `/tmp`, tidak masuk repo):

| butir | rules | ergonio | orchestration |
|---|---|---|---|
| a. Failed → `prog` dulu saat memperbaiki | ADA (eksplisit) | ADA (implisit) | ADA (eksplisit) |
| b1. baca komentar sebelum mulai/rework | ADA | ADA | ADA |
| b2. komentar handoff saat Ready to Review | ADA | ADA | ADA |
| b3. komentar "mulai cek" saat review | ADA | ADA | ADA |
| b4. komentar bug saat Failed | ADA | ADA | ADA |
| b5. komentar verdict saat done | ADA | ADA | ADA |
| c1. maks 5000 karakter | ADA | ADA | **TIDAK** |
| c2. edit/hapus hanya komentar sendiri | ADA | ADA | **TIDAK** |
| c3. fallback ke `description` | ADA | ADA | **TIDAK** |

Bukti baris:

| Klaim | Bukti |
|---|---|
| Failed wajib `prog` dulu, "jangan langsung ke Ready to Review" | `.claude/rules/ergonio-status-flow.md:33-36` |
| Developer tidak boleh set `review`/`done` | `.claude/rules/ergonio-status-flow.md:32` · `.claude/skills/ergonio/SKILL.md:47` |
| QA tidak boleh memperbaiki kode produk | `.claude/rules/ergonio-status-flow.md:48` · `.claude/skills/ergonio/SKILL.md:51` |
| Protokol komentar lengkap (6 milestone) | `.claude/rules/ergonio-status-flow.md:50-69` |
| Batas 5000 char, edit/hapus komentar sendiri, fallback ke description | `.claude/rules/ergonio-status-flow.md:73-78` |
| QA mulai → komentar "mulai cek" | `.claude/rules/ergonio-status-flow.md:62-63` · `.claude/skills/ergonio/SKILL.md:51` · `.claude/skills/orchestration/SKILL.md:35` |
| Developer fix → `prog` dulu + balas komentar QA | `.claude/rules/ergonio-status-flow.md:66-68` · `.claude/skills/orchestration/SKILL.md:35` |
| Tool komentar + kapan dipakai | `.claude/skills/ergonio/SKILL.md:53-62` |
| Orchestrator yang posting komentar atas nama subagent | `.claude/skills/orchestration/SKILL.md:13` · `34` · `35` |
| Batas `c1–c3` untuk orchestration didelegasikan | `.claude/skills/orchestration/SKILL.md:44-45` (menunjuk bagian "Komentar task") |

Catatan: aturan **(c)** tidak diduplikasi di orchestration — hanya ditunjuk lewat referensi ke rules. Lihat §3 T1.

### 1b. Tidak ada kontradiksi dengan aturan lama

| Yang dicek | Hasil | Bukti |
|---|---|---|
| Developer dilarang set `review`/`done` | konsisten, tidak berubah | `.claude/rules/ergonio-status-flow.md:32`; `ergonio/SKILL.md:47`; `AGENTS.md:53` |
| QA dilarang memperbaiki kode produk | konsisten | `.claude/rules/ergonio-status-flow.md:48`; `ergonio/SKILL.md:51`; `.claude/agents/fajar.md:22` |
| Alur QA `Ready to Review → review → done/Failed` | konsisten di 3 dokumen | `ergonio/SKILL.md:51`; `orchestration/SKILL.md:35`; `AGENTS.md:53` |
| Komentar tidak menggantikan `description` | konsisten (ringkasan durable tetap di description, detail di `reports/**`) | `orchestration/SKILL.md:45`; `ergonio/SKILL.md:50` |
| Dokumen agent lain (bayu/dimas/raka/arif/yoga) soal Failed | konsisten ("balik ke `prog` saat memperbaiki"), walau tidak menyebut komentar | `.claude/agents/{arif,yoga}.md:21`, `.claude/agents/{bayu,dimas,raka}.md:22` |

### 1c. Sinkronisasi & pemeriksaan repo

| Butir | Hasil |
|---|---|
| `diff -r .claude/skills .qoder/skills` | **kosong** (exit 0) |
| Byte-identik per file | `cmp` → IDENTIK untuk `ergonio/SKILL.md` dan `orchestration/SKILL.md` |
| Reproduksi `sync:agents` tanpa menyentuh repo | dijalankan di sandbox `/tmp/opencode/qa-t52-sync` → hasil sandbox identik dengan `.qoder/skills` repo |
| `node scripts/check-agent-docs.mjs` / `pnpm run check:agent-docs` | `check-agent-docs OK: 3 pilar + 3 rules sinkron` (exit 0) |
| `git diff --check` untuk `.claude` + `.qoder` | tanpa whitespace error (exit 0) |
| Prettier | `npx prettier --check` 5 file → "All matched files use Prettier code style!" (exit 0). **Catatan: `*.md` di-ignore** `.prettierignore:16`, jadi hasil ini bukan bukti format isi. Dipaksa (`--ignore-path /dev/null`) file tetap gagal — tapi versi `HEAD` juga gagal identik (padding tabel lama), dan hunk baru tidak ikut dirapikan → **bukan regresi**. |
| `sync:agents` terjaga otomatis | `.husky/pre-commit:2` menjalankan `node scripts/sync-agent-config.mjs` + `git add .qoder ...` |

### 1d. Klaim nama tool MCP

Tidak ada source/konfigurasi MCP Ergonio di repo ini (grep `ergonio` di `*.json`/`*.ts`/`*.mjs` kosong; tidak ada
`.mcp.json` maupun `mcpServers` di `.claude/settings.json`), jadi verifikasi dilakukan terhadap **skema tool yang hidup**
di sesi ini:

| Tool di dokumen | Ada di MCP | Kesesuaian argumen |
|---|---|---|
| `getTaskComments({ taskId, limit? })` | ya | cocok (`ergonio/SKILL.md:57`) |
| `createComment({ taskId, text, parentCommentId })` | ya | cocok; `parentCommentId` opsional default `null`, `text` `maxLength: 5000` (`ergonio/SKILL.md:58`) |
| `updateComment({ commentId, text })` | ya | cocok; hanya komentar sendiri, `text` `maxLength: 5000` (`ergonio/SKILL.md:59`) |
| `deleteComment({ commentId })` | ya | cocok; "must be one you wrote", soft delete (`ergonio/SKILL.md:59`) |

Klaim "maks 5000 karakter" dan "hanya untuk komentar sendiri" **sesuai** deskripsi tool.

---

## 2. Perintah & hasil (apa adanya)

```bash
$ diff -r .claude/skills .qoder/skills; echo "DIFF_EXIT=$?"
DIFF_EXIT=0

$ for f in ergonio/SKILL.md orchestration/SKILL.md; do cmp -s ".claude/skills/$f" ".qoder/skills/$f" && echo "IDENTIK $f"; done
IDENTIK ergonio/SKILL.md
IDENTIK orchestration/SKILL.md

$ node scripts/check-agent-docs.mjs; echo "EXIT=$?"
check-agent-docs OK: 3 pilar + 3 rules sinkron
EXIT=0

$ pnpm run check:agent-docs; echo "EXIT_CHECK=$?"
check-agent-docs OK: 3 pilar + 3 rules sinkron
EXIT_CHECK=0

$ npx prettier --check .claude/rules/ergonio-status-flow.md .claude/skills/ergonio/SKILL.md \
    .claude/skills/orchestration/SKILL.md .qoder/skills/ergonio/SKILL.md .qoder/skills/orchestration/SKILL.md
All matched files use Prettier code style!   # *.md di-ignore .prettierignore

$ npx prettier --check --ignore-path /dev/null .claude/rules/ergonio-status-flow.md ...   # dipaksa
[warn] .claude/rules/ergonio-status-flow.md
[warn] .claude/skills/ergonio/SKILL.md
[warn] .claude/skills/orchestration/SKILL.md
EXIT=1        # sama untuk versi HEAD → bukan regresi (lihat §1c)

$ git diff --check -- .claude .qoder; echo "EXIT_WS=$?"
EXIT_WS=0

$ node /tmp/opencode/qa-t52-check-docs.mjs        # matriks assertion §1a
sel tanpa kecocokan: 3                            # c1/c2/c3 di orchestration

# reproduksi sync tanpa mengubah repo
$ cp -a .claude scripts /tmp/opencode/qa-t52-sync/ && cd /tmp/opencode/qa-t52-sync && node scripts/sync-agent-config.mjs
.qoder disinkronkan dari .claude: 6 agent, 2 skill
$ diff -r /tmp/opencode/qa-t52-sync/.qoder/skills <repo>/.qoder/skills   # kosong → IDENTIK
```

`git diff --stat` untuk lingkup task: 5 file, `+73 / -13` (3 dokumen `.claude` + 2 salinan `.qoder`). Tidak ada file
`apps/**`/`packages/**` di lingkup ini.

---

## 3. Temuan non-blocking (urut severity)

### T1 — `Low` — orchestration tidak memuat batas komentar (c1/c2/c3), hanya menunjuk rules
- **Bukti:** `.claude/skills/orchestration/SKILL.md:44-45` hanya mengarahkan ke `.claude/rules/ergonio-status-flow.md`
  bagian "Komentar task"; string `5000`, "hanya komentar sendiri", dan fallback tidak ada di file itu.
- **Dampak:** orchestrator adalah pihak yang **memposting** komentar, jadi aturan itu justru paling relevan untuknya.
  Risiko: mencoba mengedit komentar agent lain, atau memotong detail panjang ke komentar (bukan ke `reports/**`).
  Praktis tertutup karena referensi eksplisit ke bagian rules — agent yang membaca referensi tetap benar.
- **Reproduksi:** `grep -nE "5000|komentar sendiri|fallback" .claude/skills/orchestration/SKILL.md` → kosong.
- **Saran (pemilik dokumen, bukan QA):** satu baris di §Aturan orchestration: "Komentar: maks 5000 char, edit/hapus
  hanya komentar sendiri, fallback ke `description` bila tool tidak tersedia (detail: rules §Komentar task)."

### T2 — `Low` — (a) Failed → `prog` di `ergonio/SKILL.md` hanya implisit
- **Bukti:** `.claude/skills/ergonio/SKILL.md:60` — "balasan fix saat `prog` lalu Ready to Review" (urutan benar,
  tapi tidak ada frasa "Failed wajib pindah ke `prog` dulu / jangan langsung ke Ready to Review").
- **Dampak:** agent yang hanya membaca skill (tanpa membuka rules) bisa menganggap `Failed → Ready to Review` boleh.
- **Saran:** tambahkan "Task Failed: pindah ke `prog` dulu, jangan langsung ke Ready to Review" di langkah 3/5.

### T3 — `Low` — `progressPct` tidak bisa di-set lewat `updateTask` (pre-existing, bukan dari diff)
- **Bukti skema tool:** `updateTask` tidak punya field `progressPct`; deskripsinya: *"Progress is not settable:
  it follows the task's status, so change the status to move it."*
- **Bukti data:** task #52 sendiri `status: status-1792622088574` (Ready to Review) dengan `progressPct: 80` — bukan 90.
- **Terdampak:** `.claude/rules/ergonio-status-flow.md:27`, `29`, `43`, `92`; `.claude/skills/ergonio/SKILL.md:45-46`;
  `.claude/skills/orchestration/SKILL.md:32`, `34`, `35`; `.claude/agents/*.md`.
- **Status:** ada juga di `HEAD` (`git show HEAD:.claude/rules/ergonio-status-flow.md | grep progressPct` → baris 27/29/41/58),
  jadi **bukan regresi task ini**, tapi baris `rules:43` tersentuh diff. Kalau diikuti harfiah, `updateTask` bisa error/
  argumen diabaikan.
- **Saran:** task lanjutan — ganti instruksi `progressPct: X` menjadi "progress mengikuti status" atau pastikan server
  menerima field itu.

### T4 — `Low` — tool komentar juga butuh approval user, tidak disebut di skill
- **Bukti:** deskripsi `createComment`/`updateComment`/`deleteComment`: *"The user must approve before it is posted/saved."*
  `.claude/skills/ergonio/SKILL.md:66` hanya menyebut `createTask`/`updateTask`/`createSubtasks` butuh approval.
- **Dampak:** agent bisa menganggap komentar terkirim otomatis; alur "handoff wajib" bisa gagal diam-diam bila approval
  ditolak (aturan fallback belum menyebut kasus "approval ditolak").

### T5 — `Low` — klaim "Subagent tidak punya tool MCP ergonio" tidak akurat di sesi OpenCode
- **Bukti:** `.claude/skills/orchestration/SKILL.md:13` dan `.claude/rules/ergonio-status-flow.md:53` menyatakan subagent
  tanpa MCP; faktanya sesi subagent `fajar` ini mengekspos `tools.ergonio.*` (termasuk `createComment`/`updateComment`/
  `deleteComment`/`updateTask`).
- **Dampak:** potensi komentar ganda (subagent posting sendiri + orchestrator posting atas namanya) — melanggar
  "jangan spam"; juga orchestrator menahan pekerjaan yang sebenarnya bisa dilakukan subagent.
- **Catatan:** klaim ini pre-existing; baris `orchestration:13` diubah task ini dan memperluas klaim tersebut.
- **Saran:** bedakan per klien ("di Claude Code subagent tanpa MCP; di OpenCode subagent punya — tetap hanya orchestrator
  yang memposting") atau larang eksplisit subagent memposting komentar.

### T6 — `Low` (proses) — task #52 di Ready to Review tanpa komentar handoff
- **Bukti:** `getTaskComments(#52)` → `totalRootComments: 0`; status `status-1792622088574`.
- **Konteks:** `description` sudah memuat "Hasil:" dan "Verifikasi:", jadi informasi tidak hilang; aturan komentar baru
  dibuat oleh task ini sendiri sehingga belum berlaku saat handoff. Klausul fallback hanya untuk "tool tidak tersedia",
  bukan untuk "belum diposting".
- **Tidak memblokir**: bukan cacat dokumen. QA tidak memposting komentar (di luar batas tugas QA ini).

### T7 — `Info` — rules mengizinkan verdict di `description` **atau** report, orchestration menyebut `description`
- **Bukti:** `.claude/rules/ergonio-status-flow.md:43-44` vs `.claude/skills/orchestration/SKILL.md:45`.
- Tidak bertentangan keras (report = detail, description = ringkasan), tapi bisa dibaca sebagai dua aturan berbeda.

---

## 4. Cek tiga pilar

| Pilar | Penilaian | Catatan |
|---|---|---|
| **Keamanan** | Aman | Dokumen hanya menambah aturan proses; tidak ada secret/PII, tidak ada perintah destruktif baru. Aturan "edit/hapus hanya komentar sendiri" justru menutup penyalahgunaan komentar agent lain (defense in depth; server juga menolak). |
| **Performa** | N/A / netral | Tidak ada kode runtime yang berubah. Biaya proses: satu panggilan `getTaskComments` per rework/QA — dapat diabaikan, dan mencegah kerja ulang. |
| **Kerapian** | Baik | Satu sumber kebenaran (rules) + rujukan dari skill, bukan salinan penuh → risiko drift rendah; `.qoder` digenerate & dijaga pre-commit; `check-agent-docs` lulus; tanpa trailing whitespace/tab. Kekurangan: T1/T2 (detail tidak lengkap di satu dokumen) dan `progressPct` usang (T3). |

Trade-off yang disengaja: aturan **(c)** diduplikasi di rules + ergonio, tapi didelegasikan di orchestration — trade-off
anti-drift yang wajar, dengan konsekuensi T1.

---

## 5. Coverage & celah

**Sudah diverifikasi:** isi 3 dokumen (matriks 9 butir × 3 file), kesesuaian klaim tool dengan skema MCP hidup,
tidak ada kontradiksi dengan aturan lama, `diff -r` + `cmp`, reproduksi `sync:agents` di sandbox, `check-agent-docs`,
prettier (termasuk membuktikan `*.md` di-ignore dan kegagalan format sudah ada di `HEAD`), `git diff --check`,
dugaan duplikasi heading, dan tidak adanya perubahan kode produk dalam lingkup task.

**Tidak diverifikasi (dengan alasan):**

- **Eksekusi nyata `createComment`/`updateComment`/`deleteComment`** — di luar batas QA (mengubah data Ergonio) dan
  butuh approval user; verifikasi diganti dengan pembacaan skema tool (argumen, `maxLength: 5000`, aturan author-only).
- **Perilaku agent lain setelah membaca dokumen** — tidak ada harness eval prompt di repo; hanya bisa dinilai isi teks.
- **Penegakan otomatis isi protokol komentar** — `check-agent-docs.mjs` hanya memeriksa 3 pilar + jalur rules, tidak
  memeriksa frasa protokol. Jadi AC task ini **tidak** akan tertangkap CI bila nanti hilang.
- **Klien lain** (Qoder/Command Code) — hanya `.qoder` yang diminta; `.commandcode`/`.opencode` bukan bagian AC.

**Rekomendasi:**

1. Tambahkan assertion frasa (matriks §1a) ke `scripts/check-agent-docs.mjs` agar regresi dokumen tertangkap pre-commit.
2. Rapikan T1/T2 (satu baris masing-masing), lalu task terpisah untuk T3 (`progressPct`).
3. Pertimbangkan menyebut di aturan bahwa approval user juga berlaku untuk komentar (T4), dan perjelas T5 per klien.

---

## 6. Status Ergonio

Status task **tidak diubah** oleh QA ini (batas tugas: hanya `reports/**`): task masih `status-1792622088574`
(Ready to Review), bukan `review`/`done`. Verdict dan bukti ada di report ini; orchestrator/pemegang MCP yang
memindahkan status + `progressPct` + komentar verdict.
