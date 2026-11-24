# Rencana #181 - App mobile + sync dua lapis

Task payung Ergonio: **#181** (`personal-productivity`). Keputusan arsitektur: **ADR 17** di
`ARCHITECTURE.md` (§7 kunci, §9 alur sync, §14). Desain:
https://claude.ai/artifact/HbkWse3KJkoEm6oZP65Upr (7 layar + 3 opsi navigasi).

Dokumen ini = urutan kerja dan batas tiap langkah. Kalau bentrok dengan `ARCHITECTURE.md`, ADR yang
menang dan dokumen ini diperbaiki.

---

## 1. Keputusan (2026-11-24)

| Topik | Keputusan |
|---|---|
| Data asli | Di perangkat: SQLite + SQLCipher (mobile), IndexedDB terenkripsi (web). Server hanya lisensi + relay ciphertext. |
| Sync | Dua lapis sekaligus: relay store-and-forward (realtime, TTL 7 hari, kuota fair use, saklar mati) + Google Drive user (`appDataFolder`). |
| Merge | LWW per record (HLC, ADR 3) + salinan versi kalah memo/jurnal 30 hari. |
| TTL lewat | Bukan data hilang: celah `seq` ditutup dari Drive / perangkat pengirim; rebase wajib setelah > 90 hari. |
| Biaya | Record teks ~1-2 KB; ~15 MB lalu lintas/user/bulan; lisensi lifetime tetap untung. Batas atas dijaga kuota, TTL, larangan lampiran di relay, saklar mati. |
| Navigasi mobile | Opsi C (dock + FAB terpisah) - default, bisa diganti. |
| MVP mobile | 7 layar desain: Hari ini, Kalender, To-do, Jurnal, Quick add, Habit, Lainnya. |
| Rilis | Android dulu (risiko Apple 3.1.3(b) soal IAP). |

## 2. Status fase

| Fase | Isi | Agent | Status |
|---|---|---|---|
| F0 | ADR 17 + kontrak `packages/contracts/src/sync.ts` | - | Ready to Review |
| F1 | Angkat logika web ke `packages/core` | bayu | To Do (rencana §3) |
| F2 | Mesin sync core: segmen, cursor, snapshot, Sync Key, merge + konflik; pindah crypto backup + `drive/api` ke core | bayu | Backlog |
| F3 | Relay sync di server (§5) | bayu | Backlog |
| F4 | Web: sync Drive + relay | dimas | Backlog (setelah F2, F3) |
| F5 | Kerangka mobile (§4) | raka | Backlog |
| F6 | Layar mobile sesuai desain | raka | Backlog (setelah F1c, F5) |
| F7 | Mobile: sync Drive + relay + background + penerima transfer QR | raka | Backlog (setelah F2, F5) |
| F8 | QA: drill restore + sinkron 2 perangkat + e2e Maestro | fajar | Backlog (terakhir) |

---

## 3. F1 - angkat logika web ke core

### Temuan

1. ~3.900 baris logika murni di 14 modul `apps/web/app/utils/`: `time`, `schedule`, `tasks`, `habits`,
   `goals`, `countdown`, `pomodoro`, `memo`, `memo/richtext`, `memo/layout`, `overview`, `calendarGrid`,
   `dailyRoutine`, `journal`. Tanpa Vue/DOM.
2. Bentuknya **model presentasi** (mis. `Schedule` = tanggal lokal + `HH:MM`), beda dari entitas core
   (epoch ms). ~20 nama bentrok dengan core (`Schedule`, `Habit`, `Goal`, `Countdown`, `QUADRANTS`,
   `MS_PER_*`, ...) - tidak bisa masuk barrel core apa adanya.
3. Duplikasi yang sudah ada: `MS_PER_*`, `isCountdownPast`, `chapterStatus`/progress goal
   (`goals.parity.qa.test.ts` menjaganya).
4. `habits`/`dailyRoutine` butuh tipe `IconName` dari `utils/icons.ts` (data SVG 45 KB); `memo` butuh
   `MemoPaperName` dari `packages/tokens`.
5. `utils/*/persistence.ts` terikat session IndexedDB web.
6. Core lebih ketat (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`) - kode pindahan butuh
   perbaikan kecil.
7. Working tree berisi pekerjaan backup/Drive yang di-stage tapi belum di-commit.

### Langkah

| Langkah | Isi | Bukti selesai |
|---|---|---|
| F1.0 | Commit pekerjaan backup/Drive yang di-stage (oleh user); catat baseline jumlah test util web | Angka baseline |
| F1a | `utils/icons.ts` → `packages/tokens/src/icons.ts` (aset desain bersama; mobile render via `react-native-svg`) | Typecheck web + tokens hijau |
| F1b | `packages/core/src/planner/` + sub-path `@improve-personal/core/planner`; 14 modul + 16 unit test lewat `git mv`; import gaya core (`.ts`, relatif); core boleh `import type` dari tokens - update ARCH §3 | Test core lulus, jumlah = baseline |
| F1c | Script ganti import web (`~/utils/<m>`, `./<m>`, `../<m>`) → `@improve-personal/core/planner`; auto-import Nuxt dicek via typecheck; QA test persistence (`goals.lifecycle`, `goals.links`) tetap di web | Typecheck + test web lulus, jumlah = baseline |
| F1d | Satukan duplikasi (`MS_PER_*`, `isCountdownPast`, `chapterStatus`/progress goal); parity test diganti test biasa | Satu sumber per fungsi |
| F1e | `utils/*/persistence.ts` → use case core di atas port `Repository`; web hanya adapter session IndexedDB | Test persistence web lulus lewat jalur core |

- Tier **T2**, `pnpm gate:delta --tier t2`. PR: F1a-F1d satu PR; F1e PR terpisah (paling berisiko).
- Di luar F1: crypto backup + `drive/api` (ikut F2).

---

## 4. F5 - kerangka mobile

1. Expo SDK 58 di `apps/mobile` (`@improve-personal/mobile`): Expo Router typed routes, New Architecture
   + Hermes, TS strict, `eslint-config-expo` + config bersama, Jest + RNTL, Metro untuk monorepo pnpm.
2. Struktur sesuai `apps/mobile/.claude/rules/code-quality.md`: `app/` route tipis, `src/features`,
   `platform`, `components/ui`, `theme`, `stores`, `providers`.
3. Tema dari `packages/tokens` (Kuning/Hijau/Ungu), font Baloo 2 + Nunito via `expo-font`, ikon dari F1a.
4. Adapter platform: `expo-sqlite` + SQLCipher (`synchronous = FULL`), `expo-secure-store`
   (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`), `react-native-libsodium`, `AppState`. Contract test storage core
   ke adapter SQLite (logika di Jest + smoke di perangkat).
5. Aktivasi lisensi: OTP/Google (`expo-auth-session` + PKCE), kunci app biometrik (membuka item
   Keystore yang terikat biometrik), `FLAG_SECURE`, `allowBackup=false`.
6. Primitif UI dari desain: StickerIcon, Card, Chip, SegmentedControl, BottomSheet, Dock + FAB (opsi C),
   kerangka 7 route.
7. Tiap library native dicek maintainer, permission, dan dukungan New Arch sebelum dipasang
   (`shared-security.md`).

Paralel dengan F1; layar asli (F6) menunggu F1c.

---

## 5. F3 - relay sync di server

1. Migrasi Drizzle: `license_activations.device_sign_pk`, `sync_frames`, `sync_pending`.
2. Kontrak aktivasi `POST /v1/license/token` menerima public key perangkat - web ikut diubah di PR yang
   sama (aturan kontrak bersama).
3. `server/routes/v1/sync/ws.ts` memakai pola relay transfer yang sudah ada (rate limit, sesi di memori).
4. Service relay: challenge-auth (`encodeSyncAuthMessage`), routing broadcast/unicast, ack → hapus,
   pemberitahuan `expired`, kuota (`SYNC_DAILY_SEND_MAX_BYTES`, `SYNC_QUEUE_MAX_BYTES`), saklar
   `NUXT_SYNC_RELAY_ENABLED` (validasi zod env), metrik tanpa isi.
5. Task terjadwal pembersih TTL 7 hari.
6. Test sesuai ARCH §13: auth, aktivasi dicabut, TTL, kuota, lisensi baca-saja, saklar mati, frame
   terhapus setelah semua ack.

Bergantung F0 saja.

---

## 6. Urutan

1. F1.0 (commit backup/Drive yang di-stage)
2. F1a → F1b → F1c → F1d
3. F5 (boleh mulai bersamaan dengan F1)
4. F3
5. F1e → F2 → F4 + F7 → F6 → F8

## 7. Keputusan terbuka

1. Commit pekerjaan backup/Drive yang di-stage sebelum refactor? (saran: ya)
2. Core boleh `import type` dari `packages/tokens` (`IconName`, `MemoPaperName`)? (saran: ya, tipe saja)
3. Urutan §6 disetujui?
