# Architecture — apps/mobile (Expo / React Native)

Android (APK) + iOS. Dokumen ini **cuma** soal `apps/mobile`.

| Rujukan | Di mana |
|---|---|
| Hal bersama (port & adapter, model data, kripto, auth, sync, env, kualitas, ADR) | [`../../ARCHITECTURE.md`](../../ARCHITECTURE.md) |
| Aturan kode + tiga pilar | [`CLAUDE.md`](CLAUDE.md) → [`.claude/rules/`](.claude/rules/) |
| Produk | [`docs/PRD.md`](docs/PRD.md) |

`docs/PRD.md` di folder ini **symlink** ke `../../docs/PRD.md`, bukan salinan. Jangan diganti jadi file biasa - dua salinan pasti divergen.

> **Status: belum ada kode.** `apps/mobile` baru berisi aturan (`.claude/rules/`) + dokumen ini. Isinya target, bukan deskripsi kode yang jalan. Bagian "Keputusan tertunda" di bawah wajib diberesin sebelum baris pertama ditulis.

---

## 1. Stack

| Hal | Keputusan | Sumber |
|---|---|---|
| Framework | Expo (dev build, bukan Expo Go buat rilis) | ADR Q4 |
| Routing | Expo Router | ADR Q4 |
| Runtime | New Architecture (Fabric + TurboModules) + Hermes | `.claude/rules/performance.md` |
| Bahasa | TypeScript strict, tanpa `any` | `.claude/rules/code-quality.md` |
| Storage | SQLite + SQLCipher | §5 / §6 |
| Kunci | `expo-secure-store` (Keychain / Keystore) | §5 / §7 |
| OTA | EAS Update, channel per env + code signing | §12 |

## 2. Struktur

```
app/                    # Expo Router: file = route, tipis (susun komponen + hook)
src/
├── features/<domain>/  # screens, components, hooks per fitur
├── platform/           # adapter: SQLite, SecureStore, biometrik, AppState
├── components/ui/      # primitif UI reusable
├── theme/              # dari packages/tokens
└── utils/              # fungsi murni
docs/                   # symlink ke docs/ root
```

- Organisasi per fitur, bukan per tipe. Import antar-feature ke internal feature lain dilarang - yang dipakai bareng naik ke `components/ui/` atau paket shared.
- Arah dependensi ikut root §3: `apps/mobile` → `packages/core` + `packages/tokens`; nggak boleh import `apps/web`.
- Konvensi nama & ukuran file: [`.claude/rules/code-quality.md`](.claude/rules/code-quality.md).

## 3. Adapter native

`packages/core` murni (tanpa React Native, tanpa Node API); yang platform-spesifik masuk lewat port di `core/ports.ts`.

| Port | Implementasi mobile |
|---|---|
| `StorageAdapter` | SQLite via `expo-sqlite` + SQLCipher (isi = ciphertext, sama seperti IndexedDB di web) |
| `SecureKeyStore` | `expo-secure-store` (Keychain / Keystore), kunci non-extractable, aksesibilitas `WHEN_UNLOCKED_THIS_DEVICE_ONLY` |
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

## 7. Keputusan tertunda

Belum diputusin, dan salah satu ini harus diberesin sebelum implementasi:

1. **Library state mobile.** Prinsipnya sama dengan web (ADR 9): store = cermin reaktif `core`, bukan pemilik data - `core` tetap satu-satunya jalur tulis. Yang belum ada: lib-nya apa. Kandidat `Zustand` (selector sempit, sesuai aturan re-render), tapi ini belum diputusin dan belum ada ADR-nya.
2. **Bentuk navigasi.** ADR Q4 milih Expo Router (`app/` = route), tapi `.claude/rules/code-quality.md` bagian Navigasi masih berbentuk React Navigation (`src/navigation/`, `RootStackParamList`, `ParamList` per navigator). Pilih satu bentuk, lalu samain aturannya.
3. **Posisi file fitur.** Aturan menyebut `src/features/<domain>/`, sedangkan root §10 sebelumnya nulis `src/features/<fitur>/` + `app/` untuk route. Struktur di §2 di atas udah gabungan keduanya - konfirmasi kalau maksudnya beda.
