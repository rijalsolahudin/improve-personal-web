# Supply chain T63 — `pnpm audit` bersih + gate CI (QA #30 MAYOR-3 / H3)

Pelaksana: Bayu (Backend) · Tanggal: 2026-10-23 · HEAD: `765369d` (`docs(qa): laporan QA T9 sampai T52`)
Lingkup: root dependency config, lockfile, workflow CI. **Tidak menyentuh** `apps/**`, `packages/**`, `.claude/**`.
Rules dibaca: `CLAUDE.md` (root), `.claude/rules/shared-security.md`, `.claude/rules/shared-code-quality.md`,
`.claude/rules/ergonio-status-flow.md`, `apps/web/.claude/rules/security.md` §11–12 (dependency & build),
`reports/qa-t16-e2e-web.md` MAYOR-3, `reports/be-security/analysis-security.md` H3.

---

## 1. Ringkasan

| Target | Hasil |
|---|---|
| `pnpm audit --audit-level=high` | **exit 0** — 0 critical, 0 high aktif (1 high di-ignore: node-forge, tanpa versi patched) |
| 2 critical + 2 high `simple-git`/`argv-parser` | **tertutup** (akar: `@nuxt/devtools` dipin 3.4.3; ditambah override guard 4.0.2 / 2.0.1) |
| `braces` | **tidak perlu ditambal** — advisory GHSA-vfj7-8cjw-p6xm **withdrawn** 2026-10-23T12:53:02Z |
| `node-forge` | **exception terdokumentasi** — tidak ada versi patched (1.4.0 rilis terakhir) |
| Gate CI High/Critical | **ada**: `.github/workflows/security-audit.yml` (PR, push main, cron mingguan) |
| Lockfile | `pnpm-lock.yaml` berubah (+2 baris `overrides`), `--frozen-lockfile` konsisten |
| Smoke test | vitest 22 test / 5 file **lulus**, `nuxt typecheck` **exit 0** |

**Tiga temuan penting saat verifikasi (jangan dilewat):**

1. **Advisory di deskripsi task sudah tidak mereproduksi di HEAD.** Commit `d514674`
   (`chore(deps): tambah uqr dan pin @nuxt/devtools 3.4.3`) sudah mem-pin `@nuxt/devtools` ke 3.4.3,
   yang melepas dependency `simple-git` + `@simple-git/argv-parser`. Di lockfile HEAD keduanya **tidak ada**
   (`pnpm why simple-git` kosong). Jadi 2 critical sudah 0 sebelum task ini; yang tersisa cuma 1 high
   `node-forge` (di-ignore eksplisit).
2. **`pnpm.overrides` di root `package.json` tidak dibaca pnpm 11.17.0.** Verbatim:
   `[WARN] The "pnpm" field in package.json is no longer read by pnpm. The following keys were ignored: "pnpm.overrides".`
   Karena itu override wajib ditulis di `pnpm-workspace.yaml` (tempat override repo ini sudah berada).
   Acceptance "tambah `pnpm.overrides` di root package.json" **tidak bisa** dijalankan di versi pnpm ini —
   deviasi ini disengaja dan alasannya di atas.
3. **`braces` GHSA-vfj7-8cjw-p6xm sudah ditarik** (`withdrawn_at: 2026-10-23T12:53:02Z`) dan tidak muncul
   lagi di `pnpm audit`. Entri ignore lamanya dicabut supaya tidak jadi dead config yang menyembunyikan
   advisory baru. `braces@3.0.3` tetap terpasang (versi terakhir) tapi tanpa advisory aktif.

---

## 2. Tabel paket sebelum → sesudah

| Paket | Sebelum task (HEAD `765369d`) | Sesudah | Mekanisme |
|---|---|---|---|
| `simple-git` | **tidak ada di lockfile** (sebelum `d514674`: `3.36.0`) | tidak ada di graf, **override `4.0.2`** aktif sebagai guard | pin `@nuxt/devtools` 3.4.3 + override |
| `@simple-git/argv-parser` | **tidak ada** (sebelum `d514674`: `1.1.1`) | tidak ada di graf, **override `2.0.1`** aktif sebagai guard | idem |
| `@nuxt/devtools` | `3.4.3` | `3.4.3` (tidak berubah — ini akar penutupan critical) | sudah ada di `pnpm-workspace.yaml:20-22` |
| `node-forge` | `1.4.0` (via `listhen@1.10.1`) | `1.4.0` — **tidak bisa dinaikkan** | exception, lihat §4 |
| `braces` | `3.0.3` (via `micromatch@4.0.8`) | `3.0.3` — advisory withdrawn | ignore dicabut |
| `nuxt` | `4.5.2` | `4.5.2` | follow-up (butuh `>=4.6.2`, di luar boundary) |
| `esbuild` (via `fontless`) | `0.27.7` | `0.27.7` | low, follow-up |
| `esbuild` (via `drizzle-kit` → `@esbuild-kit/*`) | `0.18.20` | `0.18.20` | moderate, follow-up |

`pnpm why` sesudah (verbatim, dipotong):

```
$ pnpm why node-forge
node-forge@1.4.0
└─┬ listhen@1.10.1
  ├─┬ @nuxt/cli@3.37.0
  │ └─┬ nuxt@4.5.2
  ...
  └─┬ nitropack@2.13.4
    └── @nuxt/nitro-server@4.5.2 [deduped]

$ pnpm why braces
braces@3.0.3
└─┬ micromatch@4.0.8
  ├─┬ fast-glob@3.3.3
  │ ├─┬ @intlify/unplugin-vue-i18n@11.2.5
  │ │ └─┬ @nuxtjs/i18n@10.6.0

$ pnpm why simple-git     # kosong, exit 0 — paket tidak ada di graf
$ pnpm why @simple-git/argv-parser   # kosong, exit 0
```

---

## 3. Matriks advisory

| Advisory | Paket | Severity | Status sebelum | Status sesudah | Bukti |
|---|---|---|---|---|---|
| GHSA-x6jw-m9v5-85vh | `simple-git` | critical | tertutup oleh pin devtools (tidak ada di lockfile) | tertutup + override `>=4.0.1` guard | `pnpm audit` tidak memunculkannya |
| GHSA-v5rq-49vh-5v5c | `@simple-git/argv-parser` | critical | tertutup (tidak ada di lockfile) | tertutup + override `2.0.1` guard | idem |
| GHSA-g4wm-2vf7-vfgr | `simple-git` | high | tertutup | tertutup | idem |
| GHSA-858h-whjf-mvg5 | `simple-git` | high | tertutup | tertutup | idem |
| GHSA-86w9-cpqp-85rv | `node-forge` | high | **gagal gate** | **exception** (`ignoreGhsas`) | `pnpm audit --audit-level=high` → exit 0, "(1 ignored)" |
| GHSA-vfj7-8cjw-p6xm | `braces` | high | di-ignore | **withdrawn** — entri ignore dicabut | GitHub Advisory API `withdrawn_at: 2026-10-23T12:53:02Z` |
| GHSA-vjh5-4x84-xrqp | `nuxt`/`@nuxt/nitro-server` | moderate | ada | ada (non-blocking) | §6 sisa risiko |
| GHSA-xfq5-w38q-pc2x | `nuxt` | moderate | ada | ada (non-blocking) | idem |
| GHSA-67mh-4wv8-2f99 | `esbuild` (drizzle-kit) | moderate | ada | ada (non-blocking) | idem |
| GHSA-g7r4-m6w7-qqqr | `esbuild` (fontless) | low | ada | ada (non-blocking) | idem |
| GHSA-jjm6-p2m9-9w4x | `nuxt` | low | ada | ada (non-blocking) | idem |

Bukti gate benar-benar memblokir (uji negatif di proyek scratch `/tmp/opencode/t63-nooverride`,
`@nuxt/devtools@3.4.2` **tanpa** override):

```
$ pnpm audit --audit-level=high ; echo $?
4 vulnerabilities found
Severity: 2 high | 2 critical
1
```

Dengan override yang sama seperti repo (`simple-git: 4.0.2`, `@simple-git/argv-parser: 2.0.1`):

```
$ pnpm why simple-git
simple-git@4.0.2
├─┬ @nuxt/devtools@3.4.2
│ └── t63-override-test (dependencies)
$ pnpm audit --audit-level=high
No known vulnerabilities found
```

Artinya: override yang dipasang bukan kosmetik — ia menutup 2 critical + 2 high pada jalur devtools lama,
dan perintah gate mengembalikan exit 1 saat masih rentan.

---

## 4. Exception eksplisit — `node-forge` GHSA-86w9-cpqp-85rv

**Kenapa tidak bisa ditutup:** GitHub Advisory API untuk `GHSA-86w9-cpqp-85rv` mengembalikan
`vulnerable_version_range: "<= 1.4.0"` dan **`first_patched_version: null`**. Rilis upstream terakhir
`node-forge@1.4.0` (`pnpm view node-forge version` → `1.4.0`, dicek 2026-10-23). Tidak ada `1.4.1`/`1.5.x`
yang bisa di-override; memaksa versi yang tidak ada akan menggagalkan install.

**Jalur masuk:** `node-forge@1.4.0 ← listhen@1.10.1 ← @nuxt/cli@3.37.0 | nitropack@2.13.4 ← nuxt@4.5.2`.
`listhen` memakainya untuk self-signed HTTPS server saat dev (`nuxt dev --https`), bukan jalur request aplikasi.

**Dampak runtime production:** rendah dan terukur.
- `node-forge` **tidak ikut artefak produksi**: `apps/web/.output/server/node_modules/node-forge` tidak ada
  (dicek langsung; direktori ada isinya hanya runtime dep seperti `h3`, `postgres`, `libsodium*`).
- Devtools dimatikan di `$production` (`apps/web/nuxt.config.ts:486-488`), jadi panel devtools tidak terekspos.
- Kode aplikasi tidak memverifikasi sertifikat/tanda tangan RSA dari input user (grep `node-forge|forge` di
  `apps/web/server`, `apps/web/app`, `packages` → nol hasil).

**Mitigasi:**
1. Advisory di-ignore **per-GHSA**, bukan mematikan audit: `pnpm-workspace.yaml:35-37`. Advisory lain tetap
   memblokir gate (dibuktikan uji negatif di §3).
2. Aturan tertulis di komentar config: kalau nanti butuh verifikasi tanda tangan PKCS#1 v1.5 di server,
   **jangan** pakai `node-forge` (pakai `@noble/*`/WebCrypto).
3. CI menjalankan audit juga tiap Senin (cron) supaya begitu `1.4.1` terbit, ada sinyal untuk mencabut ignore.

**Cara mencabut:** hapus `GHSA-86w9-cpqp-85rv` dari `auditConfig.ignoreGhsas`, lalu
`pnpm audit --audit-level=high` harus tetap exit 0 dengan `node-forge` versi baru terpasang.

**Trade-off yang diterima:** satu High berstatus "diketahui & di-ignore" (bukan hilang) sampai upstream rilis.
Alternatifnya adalah gate merah permanen tanpa aksi yang mungkin — itu melatih tim mengabaikan gate, yang
lebih berbahaya daripada exception sempit + mitigasi ini.

---

## 5. Perubahan file

| File | Perubahan |
|---|---|
| `pnpm-workspace.yaml:15-24` | tambah `overrides: simple-git: 4.0.2`, `@simple-git/argv-parser: 2.0.1` + alasan (guard kalau devtools memasangnya lagi) |
| `pnpm-workspace.yaml:26-37` | komentar exception dipersempit ke `node-forge` (bukti `first_patched_version: null`, jalur, tidak masuk bundle, mitigasi); entri `braces` **dicabut** karena advisory withdrawn |
| `package.json:17` | script `"audit:security": "pnpm audit --audit-level=high"` — satu perintah yang sama dipakai lokal & CI |
| `pnpm-lock.yaml:9-10` | `overrides` baru ikut terkunci (`simple-git: 4.0.2`, `'@simple-git/argv-parser': 2.0.1`) |
| `.github/workflows/security-audit.yml` (baru) | gate CI: PR, push `main`, cron Senin 02:00 UTC, `workflow_dispatch`; `permissions: contents: read`; action dipin ke commit SHA |
| `reports/security-t63-audit.md` (baru) | laporan ini |

Tidak ada perubahan kode produk. `apps/**` dan `packages/**` tidak disentuh.

---

## 6. Perintah & hasil (verbatim)

### 6.1 Audit — sebelum (HEAD `765369d`, sebelum perubahan)

```
$ pnpm audit --audit-level=high ; echo $?
7 vulnerabilities found
Severity: 2 low | 4 moderate | 1 high (1 ignored)
0
```

Catatan: sudah exit 0 karena 2 critical + 2 high `simple-git` hilang oleh pin devtools (`d514674`), dan
1 high `node-forge` sudah di-ignore. Kondisi yang dilaporkan QA/H3 (2 critical + 4 high, exit 1)
direproduksi ulang di proyek scratch tanpa override — lihat §3.

### 6.2 Install (setelah override ditambahkan)

```
$ pnpm install
Scope: all 6 workspace projects
✓ Lockfile passes supply-chain policies (verified 10h ago)
Progress: resolved 1296, reused 1083, downloaded 0, added 0, done
. prepare$ husky
apps/web postinstall$ nuxt prepare
apps/web postinstall: ◆  Types generated in .nuxt.
[WARN] Issues with peer dependencies found. Run "pnpm peers check" to list them.
Done in 42.7s using pnpm v11.17.0
exit 0
```

Satu-satunya perubahan lockfile adalah blok `overrides` (+2 baris):

```
$ git diff --stat pnpm-lock.yaml
 pnpm-lock.yaml | 2 ++
```

### 6.3 Frozen lockfile

```
$ pnpm install --frozen-lockfile
Scope: all 6 workspace projects
Already up to date
Done in 55ms using pnpm v11.17.0
exit 0
```

### 6.4 Audit — sesudah

```
$ pnpm audit --audit-level=high ; echo $?
7 vulnerabilities found
Severity: 2 low | 4 moderate | 1 high (1 ignored)
0
```

`--json` (metadata):

```
{'info': 0, 'low': 2, 'moderate': 4, 'high': 1, 'critical': 0}
```

`high: 1` adalah `node-forge` yang di-ignore (§4); tidak ada critical.

### 6.5 Smoke test setelah install

```
$ pnpm --filter @improve-personal/web exec vitest run app/utils/io app/server/tests
 RUN  v5.0.3 /media/DATA/Development/stackinnov/products/improve-personal/apps/web
 Test Files  5 passed (5)
      Tests  22 passed (22)
   Duration  4.21s
exit 0

$ pnpm --filter @improve-personal/web exec nuxt typecheck
exit 0   (tanpa output)
```

### 6.6 Format & validasi config

```
$ pnpm exec prettier --check package.json pnpm-workspace.yaml .github/workflows/security-audit.yml
All matched files use Prettier code style!
exit 0
```

---

## 7. Gate CI

`.github/workflows/security-audit.yml`

- Trigger: `pull_request`, `push` ke `main`, `schedule` cron `0 2 * * 1`, `workflow_dispatch`.
- `permissions: contents: read` — tidak butuh secret/token tulis.
- Action dipin ke **commit SHA** (`actions/checkout@3d3c42e… # v7.0.1`,
  `pnpm/action-setup@ff378ebe… # v6.0.10`, `actions/setup-node@949feb24… # v7.1.0`) supaya tag yang
  dipindahkan tidak bisa menyuntik kode ke pipeline.
- Langkah: `pnpm install --frozen-lockfile --ignore-scripts` (memastikan lockfile konsisten, tanpa
  lifecycle script) lalu `pnpm run audit:security` (= `pnpm audit --audit-level=high`).
- Tanpa build/test, `timeout-minutes: 10` — realistis < 1 menit.

Cara menjalankan lokal (identik dengan CI):

```
pnpm install --frozen-lockfile --ignore-scripts
pnpm run audit:security        # exit != 0 = blokir
```

Uji bahwa gate memblokir: uji negatif di §3 (`@nuxt/devtools@3.4.2` tanpa override → exit 1).
Saat workflow ini pertama kali muncul di PR, GitHub akan menjalankannya otomatis; tidak ada secrets
yang perlu didaftarkan.

---

## 8. Trade-off tiga pilar

**Keamanan (naik).** High/Critical sekarang punya gate otomatis (PR + push + cron), bukan cuma
`pnpm audit` manual. Critical `simple-git` tidak bisa masuk lagi diam-diam lewat devtools karena ada
override guard. Exception `node-forge` sempit (1 GHSA), terdokumentasi, disertai mitigasi dan jalur cabut.
Trade-off: satu High tetap "diketahui" sampai upstream rilis — kesadaran risiko ditukar dengan gate yang
realistis dan tidak diabaikan.

**Performa (netral).** Tidak ada kode runtime yang berubah; `node-forge`/`listhen`/`braces` tetap hanya di
toolchain build/dev dan tidak masuk `.output`. CI audit tidak melakukan build (hanya resolve + audit),
jadi tambahan waktu CI kecil dan tidak menyentuh jalur panas aplikasi.

**Kerapian (naik).** Override tetap satu sumber (`pnpm-workspace.yaml`, sesuai konvensi repo dan satu-satunya
tempat yang dibaca pnpm 11). Entri ignore yang sudah tidak berlaku (`braces`) dicabut supaya tidak menyembunyikan
advisory baru. Alasan setiap override/ignore ditulis di komentar (kenapa, bukan apa), dan gate CI memakai
perintah yang sama dengan lokal (`pnpm run audit:security`) supaya tidak ada drift.

---

## 9. Sisa risiko & follow-up

1. **`nuxt@4.5.2` — 3 moderate + 1 low** (GHSA-vjh5-4x84-xrqp: route rules server dilewati untuk path
   beda kapital; GHSA-xfq5-w38q-pc2x: server islands `useHeadSafe` tanpa sanitasi; GHSA-jjm6-p2m9-9w4x).
   Perlu naik ke `nuxt >=4.6.2` — **di luar boundary task ini** (`apps/web/package.json`) dan wajib
   diverifikasi ulang (build + e2e) karena menyentuh framework. Rekomendasi: task terpisah prioritas tinggi.
   Belum diverifikasi apakah app memakai server islands / route rules (kalau tidak, dampak praktis kecil).
2. **`esbuild@0.18.20` via `drizzle-kit → @esbuild-kit/*` (moderate GHSA-67mh-4wv8-2f99)** — paket
   `@esbuild-kit/*` sudah deprecated; menaikkan esbuild di jalur ini berisiko ke `drizzle-kit` dan tidak
   perlu untuk gate High. Ikuti saat `drizzle-kit` upgrade.
3. **`esbuild@0.27.7` via `@nuxt/fonts → fontless` (low GHSA-g7r4-m6w7-qqqr)** — arbitrary file read
   hanya di dev server Windows; proyek di Linux. Non-blocking.
4. **`node-forge` exception** harus ditinjau ulang tiap upgrade `nuxt`/`listhen`/`nitropack` dan tiap
   advisory baru; cron mingguan memberi sinyal.
5. **`@nuxt/devtools` tetap terpasang di `node_modules` produksi** (dependency `nuxt`, bukan devDependency
   eksplisit) walau fitur dimatikan di `$production`. Tidak ikut `.output`, tapi memperbesar permukaan
   `node_modules` di image jika image membawa seluruh `node_modules`. Rekomendasi lanjutan (di luar task):
   produksi pakai output Nitro saja (`.output`) seperti yang sudah jadi pola build.
6. **Uji negatif memakai proyek scratch** (`/tmp/opencode/t63-*`), bukan PR dummy di GitHub — workflow belum
   pernah dieksekusi di runner GitHub. Yang bisa dibuktikan di sini: YAML valid, command exit code benar,
   dan action SHA ter-resolve. Verifikasi pertama akan terjadi saat PR berikutnya.
