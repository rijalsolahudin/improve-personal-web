# Pilar Kerapian - Mobile (React Native)

Target: React Native + TypeScript, function component + hooks. Lint, typecheck, dan test harus hijau.

## Struktur folder

```
apps/mobile/src/
  app/            # entry, providers, root navigator
  navigation/     # definisi navigator & tipe param (RootStackParamList)
  features/<domain>/
    screens/      # layar: susun komponen + panggil hook, tanpa logika bisnis
    components/   # komponen khusus domain
    hooks/        # useXxx - logika & data fetching domain
    api.ts        # pemanggilan endpoint domain (pakai kontrak bersama)
  components/ui/  # primitif UI reusable (Button, Text, Card)
  hooks/          # hook lintas domain
  services/       # http client, storage, analytics - adaptor ke dunia luar
  theme/          # token desain (sinkron dengan token bersama web)
  utils/          # fungsi murni
```

- Organisasi per fitur (`features/<domain>`), bukan per tipe di level atas.
- DILARANG import antar-feature ke internal feature lain; yang dipakai bersama pindah ke `components/`, `hooks/`, atau paket shared.
- DILARANG folder generik baru (`helpers/`, `misc/`).

## Penamaan

- Komponen & screen: PascalCase, file = nama komponen (`ProfileScreen.tsx`, `UserAvatar.tsx`). Screen wajib suffix `Screen`.
- Hook: `useXxx.ts`. Store: `useXxxStore`.
- Route name: PascalCase konsisten dengan screen (`Profile`), terdaftar di `ParamList`.
- Boolean prefix `is/has/can/should`; handler `handleXxx`, prop callback `onXxx`.
- Test: `Xxx.test.tsx` sejajar dengan sumber.

## TypeScript

- `strict: true` + `noUncheckedIndexedAccess: true`; `tsc --noEmit` WAJIB lulus.
- DILARANG `any`, `@ts-ignore`, non-null `!` tanpa komentar alasan; pakai `unknown` + narrowing.
- Props komponen didefinisikan sebagai `type XxxProps`; DILARANG `React.FC` dengan children implisit.
- Navigasi WAJIB bertipe: `ParamList` per navigator + deklarasi global `RootParamList`; DILARANG `navigation.navigate('X' as never)`.

## Navigasi

- Satu library navigasi untuk seluruh app (React Navigation native-stack atau Expo Router - pilih satu, jangan campur).
- Param route hanya id/primitif kecil; DILARANG mengoper objek besar atau fungsi lewat params - ambil data di screen tujuan.
- Deep link didefinisikan terpusat di konfigurasi linking, bukan tersebar.
- Screen tidak tahu detail navigator lain; aksi navigasi lintas stack lewat helper bertipe.

## Pemisahan UI / logic

- Screen & komponen = presentasi. Logika (fetch, transformasi, validasi, side effect) WAJIB di hook (`features/<domain>/hooks`) atau `services/`.
- Komponen `components/ui` DILARANG memanggil API atau membaca store global.
- Maksimal ~200 baris per file komponen; `useEffect` > 1 per komponen jadi sinyal untuk dipecah ke hook.
- `useEffect` hanya untuk sinkronisasi dengan sistem luar; DILARANG dipakai untuk menurunkan state (pakai nilai turunan langsung).
- Style via `StyleSheet.create` / sistem styling yang dipilih, nilai dari `theme/` token; DILARANG warna/spacing hardcode.
- State: lokal dulu -> store global (hanya session, preferensi) -> data server via query library. DILARANG menyalin data server ke store global.

## Lint & format

- ESLint (config `@react-native` atau `eslint-config-expo`) + `typescript-eslint`, `react-hooks` (rules-of-hooks & exhaustive-deps = error), Prettier.
- `eslint --max-warnings 0` dan `prettier --check` WAJIB hijau di CI.
- DILARANG `eslint-disable` tanpa alasan di baris yang sama; DILARANG men-disable `exhaustive-deps` untuk menutupi bug.
- DILARANG `console.log` di kode yang di-merge (pakai logger).

## Testing (Jest + React Native Testing Library)

- Unit/komponen: Jest + `@testing-library/react-native`. Query berdasarkan apa yang dilihat user (`getByRole`, `getByText`, `getByLabelText`); `testID` hanya bila tidak ada alternatif.
- WAJIB test untuk: hook berlogika, `utils/`, `services/`, alur screen utama (render + interaksi + state loading/error/kosong), dan bug fix (test regresi).
- Coverage minimal 80% lines untuk `hooks/`, `utils/`, `services/`.
- Mock jaringan di batas (MSW / mock http client), bukan mock hook internal. Native module di-mock terpusat di `jest.setup`.
- DILARANG snapshot test sebagai satu-satunya assertion; DILARANG `it.only`, `.skip`, atau test di-comment.
- E2E (Maestro/Detox) untuk alur kritis (login, transaksi utama) bila sudah tersedia di CI.

## Konsistensi dengan web

- DTO request/response, enum, dan skema validasi diambil dari paket kontrak bersama monorepo; DILARANG mendefinisikan ulang tipe API di mobile.
- Perubahan kontrak WAJIB update web + mobile di PR yang sama, atau lewat versi API baru; mobile harus toleran terhadap field tambahan (app lama masih beredar).
- Nama domain, field, dan pesan error konsisten dengan web (satu glosarium). Format tanggal/angka via `Intl` dengan locale yang sama.
- Token desain (warna, spacing, tipografi) dari sumber token bersama, bukan disalin manual.

## Dead code & kebersihan

- DILARANG kode di-comment, export/screen/asset tidak dipakai, feature flag mati, `TODO` tanpa nomor issue.
- Hapus dependency & native module yang tidak dipakai (cek `knip`/`depcheck` bila tersedia).
- Magic number/string jadi konstanta bernama; komentar menjelaskan "kenapa".

## Checklist review

- [ ] File di `features/<domain>` yang benar; tidak ada import ke internal feature lain.
- [ ] `tsc --noEmit`, `eslint --max-warnings 0`, `prettier --check`, `jest` hijau.
- [ ] Navigasi bertipe; params hanya id/primitif.
- [ ] Logika di hook/service, komponen UI bersih dari API & store.
- [ ] Tipe API dari kontrak bersama; perubahan kontrak juga diterapkan di web.
- [ ] Test RNTL berbasis perilaku untuk logika baru/bug fix; tidak ada `.only`/`.skip`.
- [ ] Tidak ada dead code, `console.log`, warna/spacing hardcode.
