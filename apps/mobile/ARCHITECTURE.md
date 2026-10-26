# Architecture — apps/mobile (Expo / React Native)

Android (APK) + iOS. Dokumen ini **cuma** soal `apps/mobile`.

| Rujukan | Di mana |
|---|---|
| Hal bersama (port & adapter, model data, kripto, auth, sync, env, kualitas, ADR) | [`../../ARCHITECTURE.md`](../../ARCHITECTURE.md) |
| Aturan kode + tiga pilar | [`CLAUDE.md`](CLAUDE.md) → [`.claude/rules/`](.claude/rules/) |
| Produk | [`docs/PRD.md`](docs/PRD.md) |

`docs/PRD.md` di folder ini **symlink** ke `../../docs/PRD.md`, bukan salinan. Jangan diganti jadi file biasa - dua salinan pasti divergen.

> **Status: belum ada kode.** `apps/mobile` baru berisi aturan (`.claude/rules/`) + dokumen ini. Isinya target, bukan deskripsi kode yang jalan. Keputusan arsitektur yang dulu tertunda sudah ditetapkan di §7 (task #59, 26 Oktober 2026).

---

## 1. Stack

| Hal | Keputusan | Sumber |
|---|---|---|
| Framework | Expo (dev build, bukan Expo Go buat rilis) | ADR Q4 |
| Routing | Expo Router (file-based, route group `(auth)`/`(app)`, typed routes) | ADR Q4 / §7 |
| State | Zustand 5 - cermin reaktif `core`, bukan pemilik data | §7 |
| Runtime | New Architecture (Fabric + TurboModules) + Hermes | `.claude/rules/performance.md` |
| Bahasa | TypeScript strict, tanpa `any` | `.claude/rules/code-quality.md` |
| Storage | SQLite + SQLCipher | §5 / §6 |
| Kunci | `expo-secure-store` (Keychain / Keystore) | §3 / §4 |
| OTA | EAS Update, channel per env + code signing | §12 |

## 2. Struktur

```
app/                    # Expo Router: file = route, tipis (≤ 40 baris)
src/
├── features/<domain>/  # screens, components, hooks, store opsional + index.ts
├── platform/           # adapter: SQLite, SecureStore, biometrik, HTTP, AppState
├── providers/          # provider React lintas fitur (theme, session)
├── stores/             # Zustand lintas fitur (session, sync, prefs)
├── components/ui/      # primitif UI reusable
├── hooks/              # hook lintas domain
├── theme/              # dari packages/tokens
└── utils/              # fungsi murni
assets/                 # font, gambar, ikon
docs/                   # symlink ke docs/ root
```

- `app/` cuma route: import screen, validasi param, `_layout` yang menyusun provider. DILARANG logika bisnis, fetch, atau akses `core`/SQLite di `app/**`.
- Organisasi per domain produk, bukan per tipe atau per layar. Import antar-feature ke internal feature lain dilarang - lewat `features/<domain>/index.ts`; yang dipakai bareng naik ke `components/ui/`, `hooks/`, `stores/`, atau paket shared.
- `src/platform/` satu-satunya tempat import modul native (`expo-sqlite`, `expo-secure-store`, `expo-local-authentication`, `expo-notifications`, `react-native-libsodium`).
- Arah dependensi ikut root §3: `apps/mobile` → `packages/core` + `packages/contracts` + `packages/tokens`; nggak boleh import `apps/web`.
- Konvensi nama & ukuran file: [`.claude/rules/code-quality.md`](.claude/rules/code-quality.md).

## 3. Adapter native

`packages/core` murni (tanpa React Native, tanpa Node API); yang platform-spesifik masuk lewat port di `core/ports.ts`.

| Port | Implementasi mobile |
|---|---|
| `StorageAdapter` | SQLite via `expo-sqlite` + SQLCipher (isi = ciphertext, sama seperti IndexedDB di web) |
| `SecureKeyStore` | `expo-secure-store` (Keychain / Keystore), material kunci tidak pernah ke disk polos, aksesibilitas `WHEN_UNLOCKED_THIS_DEVICE_ONLY` |
| `CryptoProvider` | `react-native-libsodium` - primitive identik web (ADR 8) |
| `Clock` | jam perangkat + HLC |
| `HttpClient` | `fetch` |
| `Scheduler` | `AppState` (foreground/background) |

`StorageAdapter` wajib lolos **contract test suite yang sama** dengan adapter IndexedDB web (§5, AC T23) - satu test, dua adapter.

## 4. Kunci app & biometrik

- Biometrik buat **membuka kunci item Keychain/Keystore yang diikat biometrik**, bukan cuma `if (success) showData()`.
- Kunci app saat app dibuka / balik dari background.
- Layar berisi data sensitif disembunyikan di app switcher (`FLAG_SECURE`).
- Logout wajib ngerjain: cabut sesi, kosongkan cache query, buang state persist berisi data user.
- Detail lengkap: [`.claude/rules/security.md`](.claude/rules/security.md).

## 5. Timer & sync

- **Pomodoro:** simpan `startedAt` + hitung sisa dari jam, bukan dari interval - harus tetap akurat ±1 detik setelah app ke-background 5 menit+ (AC T7).
- **Sync:** push setelah tulis (debounce), pull saat app dibuka dan tiap 5 menit di foreground, plus saat kembali online. Jalan di background, nggak pernah ngeblok UI (§9).

## 6. Build & rilis

- Build per-env lewat EAS (dev / preview / staging / production), channel OTA terpisah per env.
- OTA (EAS Update) cuma JS dan wajib code-signed; perubahan native tetap lewat rilis store.
- Release: Hermes bytecode + R8/ProGuard, `console.*` dibuang, dev menu / Flipper mati, `debuggable=false`.
- Keystore Android & sertifikat iOS di luar repo (EAS credentials / secret CI).
- Budget TTI, FPS, ukuran bundle: [`.claude/rules/performance.md`](.claude/rules/performance.md).

## 7. Keputusan arsitektur (ditetapkan 26 Oktober 2026)

Tiga keputusan yang dulu tertunda sudah final. Detail opsi, alasan, dan konsekuensi: [`reports/mobile-decisions.md`](../../reports/mobile-decisions.md).

| # | Keputusan | Ringkas |
|---|---|---|
| 1 | State | **Zustand 5** (`zustand@5.0.16`). Store = cermin reaktif `core`, bukan pemilik data. Domain data tetap dari repository/SQLite; dilarang cache domain kedua. TanStack Query belum dipasang; kalau nanti dipakai, hanya untuk data milik server (akun/perangkat). |
| 2 | Navigasi | **Expo Router** (`expo-router@58.0.26`, SDK 58), file-based, route group `(auth)`/`(app)`, typed routes (`experiments.typedRoutes`). Tidak ada `src/navigation/`, `RootStackParamList`, atau import `@react-navigation/*` langsung. |
| 3 | Posisi fitur | `app/` **hanya route**; logika/UI di `src/features/<domain>/`; adapter native di `src/platform/`; store lintas fitur di `src/stores/`; provider di `src/providers/`. Struktur §2 final. |

Aturan turunan:

- Semua tulis data lewat use case/repository `core`. Store tidak menulis DB, tidak fetch sendiri, tidak menyimpan token/master key.
- `app/**` maksimal: import screen, validasi param (zod), `_layout` yang menyusun provider. Tidak ada logika bisnis/fetch/akses SQLite.
- Satu library navigasi. React Navigation hanya dependency transitif Expo Router; kode app memakai API `expo-router`.
- Import antar-fitur lewat `features/<domain>/index.ts`; yang dipakai bersama naik ke `components/ui`, `hooks`, `stores`, `platform`, atau paket shared.
- Aturan kode yang mengikat: [`.claude/rules/code-quality.md`](.claude/rules/code-quality.md) (Struktur folder & Navigasi).
