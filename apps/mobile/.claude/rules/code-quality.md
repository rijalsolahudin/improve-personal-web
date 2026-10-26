# Pilar Kerapian - Mobile (React Native)

Target: React Native + TypeScript, function component + hooks. Lint, typecheck, dan test harus hijau.

## Struktur folder

```
apps/mobile/
  app/                  # Expo Router: file = route, tipis (≤ 40 baris)
  src/
    features/<domain>/  # per domain produk, bukan per layar
      screens/          # layar: susun komponen + panggil hook, tanpa logika bisnis
      components/       # komponen khusus domain
      hooks/            # useXxx - logika & data fetching domain
      store/            # opsional: Zustand khusus domain
      index.ts          # public API fitur
    platform/           # adapter: SQLite, SecureStore, biometrik, notifikasi, HTTP, AppState
    providers/          # provider React lintas fitur (theme, session)
    stores/             # Zustand lintas fitur (session, sync, prefs)
    components/ui/      # primitif UI reusable (Button, Text, Card)
    hooks/              # hook lintas domain
    theme/              # token desain (sinkron dengan token bersama web)
    utils/              # fungsi murni
```

- `app/` hanya route: import screen, validasi param, `_layout` yang menyusun provider. DILARANG logika bisnis, fetch, atau akses `core`/SQLite di `app/**`.
- Organisasi per domain produk (`features/<domain>`), bukan per tipe di level atas atau per layar.
- DILARANG import antar-feature ke internal feature lain; lewat `features/<domain>/index.ts`, yang dipakai bersama pindah ke `components/ui/`, `hooks/`, `stores/`, `platform/`, atau paket shared.
- `platform/` satu-satunya tempat import modul native (`expo-sqlite`, `expo-secure-store`, `expo-local-authentication`, `expo-notifications`, `react-native-libsodium`).
- DILARANG folder generik baru (`helpers/`, `misc/`, `common/`).

## Penamaan

- Komponen & screen: PascalCase, file = nama komponen (`ProfileScreen.tsx`, `UserAvatar.tsx`). Screen wajib suffix `Screen`.
- Hook: `useXxx.ts`. Store: `useXxxStore`.
- Route: file lowercase/kebab sesuai URL (`to-do.tsx`, `[id].tsx`); komponen screen tetap PascalCase + suffix `Screen` (`TodoListScreen.tsx`), disimpan di `features/<domain>/screens/`.
- Boolean prefix `is/has/can/should`; handler `handleXxx`, prop callback `onXxx`.
- Test: `Xxx.test.tsx` sejajar dengan sumber.

## TypeScript

- `strict: true` + `noUncheckedIndexedAccess: true`; `tsc --noEmit` WAJIB lulus.
- DILARANG `any`, `@ts-ignore`, non-null `!` tanpa komentar alasan; pakai `unknown` + narrowing.
- Props komponen didefinisikan sebagai `type XxxProps`; DILARANG `React.FC` dengan children implisit.
- Navigasi WAJIB bertipe lewat Expo Router: aktifkan `experiments.typedRoutes`, pakai `Href`/`useRouter`/`useLocalSearchParams`; DILARANG `router.push('X' as never)` atau `as any`.

## Navigasi

- Satu library navigasi: **Expo Router** (file-based). DILARANG memakai React Navigation manual atau mengimpor `@react-navigation/*` langsung; React Navigation hanya dependency transitif Expo Router.
- `app/` hanya route tipis: import screen dari `features/<domain>/screens`, validasi param dengan zod, dan `_layout` yang menyusun provider. DILARANG logika bisnis, fetch, atau akses `core`/SQLite di `app/**`.
- Route group `(auth)`/`(app)` untuk gate; auth gate dan app-lock gate di `app/(app)/_layout.tsx`, bukan di tiap screen.
- Param route hanya id/primitif kecil; DILARANG mengoper objek besar atau fungsi lewat params - ambil data di screen tujuan.
- Deep link didefinisikan terpusat di `app.config.ts` (`scheme`, associated domains, intent filters), bukan tersebar; semua param divalidasi schema sebelum dipakai.
- Screen tidak tahu detail navigator lain; aksi navigasi lintas grup lewat helper bertipe (`Href`), bukan string bebas.

## Pemisahan UI / logic

- Screen & komponen = presentasi. Logika (fetch, transformasi, validasi, side effect) WAJIB di hook (`features/<domain>/hooks`) atau `platform/`.
- Komponen `components/ui` DILARANG memanggil API atau membaca store global.
- Maksimal ~200 baris per file komponen; `useEffect` > 1 per komponen jadi sinyal untuk dipecah ke hook.
- `useEffect` hanya untuk sinkronisasi dengan sistem luar; DILARANG dipakai untuk menurunkan state (pakai nilai turunan langsung).
- Style via `StyleSheet.create` / sistem styling yang dipilih, nilai dari `theme/` token; DILARANG warna/spacing hardcode.
- State: lokal dulu -> store global (hanya session, preferensi, cermin `core`) -> data milik server via query library. DILARANG menyalin data server/domain ke store sebagai sumber kebenaran; store tidak menulis DB atau fetch sendiri.

## Lint & format

- ESLint (config `@react-native` atau `eslint-config-expo`) + `typescript-eslint`, `react-hooks` (rules-of-hooks & exhaustive-deps = error), Prettier.
- `eslint --max-warnings 0` dan `prettier --check` WAJIB hijau di CI.
- DILARANG `eslint-disable` tanpa alasan di baris yang sama; DILARANG men-disable `exhaustive-deps` untuk menutupi bug.

## Testing (Jest + React Native Testing Library)

- Unit/komponen: Jest + `@testing-library/react-native`. Query berdasarkan apa yang dilihat user (`getByRole`, `getByText`, `getByLabelText`); `testID` hanya bila tidak ada alternatif.
- WAJIB test untuk: hook berlogika, `utils/`, `platform/`, dan alur screen utama (render + interaksi + state loading/error/kosong). Prinsip umum di `.claude/rules/shared-code-quality.md`.
- Coverage 80% lines berlaku untuk `hooks/`, `utils/`, `platform/`.
- Native module di-mock terpusat di `jest.setup`.
- DILARANG snapshot test sebagai satu-satunya assertion.
- E2E (Maestro/Detox) untuk alur kritis (login, transaksi utama) bila sudah tersedia di CI.

## Konsistensi dengan web

- Kontrak API (`packages/contracts`) dan glosarium lintas app: lihat `.claude/rules/shared-code-quality.md` (root).
- Format tanggal/angka via `Intl` dengan locale yang sama dengan web.
- Token desain (warna, spacing, tipografi) dari sumber token bersama, bukan disalin manual.

## Checklist review

- [ ] File di `features/<domain>` yang benar; route `app/**` tipis; tidak ada import ke internal feature lain.
- [ ] `tsc --noEmit`, `eslint --max-warnings 0`, `prettier --check`, `jest` hijau.
- [ ] Navigasi bertipe; params hanya id/primitif.
- [ ] Logika di hook/`platform`, komponen UI bersih dari API & store.
- [ ] Tipe API dari kontrak bersama; perubahan kontrak juga diterapkan di web.
- [ ] Test RNTL berbasis perilaku untuk logika baru/bug fix; tidak ada `.only`/`.skip`.
- [ ] Tidak ada dead code, `console.log`, warna/spacing hardcode.
