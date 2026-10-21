# Pilar Kerapian - Web (Nuxt)

Target: Nuxt 4 + Vue 3 `<script setup lang="ts">`. Aturan ini dicek di code review; lint & typecheck harus hijau.

## Struktur folder

```
apps/web/
  app/
    pages/         # routing saja: ambil data, susun komponen. Tanpa logika bisnis.
    layouts/
    components/    # features/<domain>/<Nama>.vue untuk komponen domain; ui/<Nama>/index.vue untuk primitif
    composables/   # useXxx.ts - logika reusable & data fetching
    stores/        # Pinia, hanya state global lintas halaman
    utils/         # fungsi murni tanpa state Vue
    middleware/  plugins/  assets/
  server/
    api/           # handler tipis: parse -> panggil service -> return
    services/      # logika bisnis server
    utils/
  shared/          # tipe & util yang dipakai app + server
  tests/
```

- DILARANG folder generik baru (`helpers/`, `misc/`, `common/`) di luar struktur di atas.
- Tipe/model data yang juga dipakai mobile WAJIB diambil dari `packages/contracts` (lihat `.claude/rules/kerapian-bersama.md` di root), bukan didefinisikan ulang.

## Penamaan

- Komponen domain: PascalCase, minimal 2 kata (`TodoRow.vue`, bukan `Row.vue`), di `components/features/<domain>/`.
- Primitif UI: satu folder per komponen - `components/ui/<Nama>/index.vue` - nama polos tanpa prefix (`Button`, `Card`, `Chip`). Dipakai tanpa prefix karena `components` di `nuxt.config.ts` mematikan `pathPrefix` untuk folder `ui`.
- Composable: `useXxx.ts`, satu composable utama per file, nama file = nama fungsi.
- Store Pinia: `useXxxStore` di `stores/xxx.ts`.
- Pages & route: kebab-case (`pages/user-settings.vue`).
- Server API: `server/api/<resource>/<action>.<method>.ts` (mis. `users/[id].get.ts`).
- Boolean: prefix `is/has/can/should`. Event emit: kebab-case, kata kerja (`update:model-value`, `submit`).
- Konstanta modul: `UPPER_SNAKE_CASE`.

## TypeScript

- `strict: true` + `noUncheckedIndexedAccess: true`. `nuxi typecheck` WAJIB lulus.
- DILARANG `any`, `@ts-ignore`, non-null `!` tanpa komentar alasan; pakai `unknown` + narrowing. `@ts-expect-error` hanya dengan alasan.
- Props & emits WAJIB bertipe: `defineProps<Props>()`, `defineEmits<{ ... }>()`; default lewat destructure props.
- Response API WAJIB bertipe (`useFetch<UserDto>`), tidak boleh jatuh ke `unknown`/`any` di template.

## Komponen

- Maksimal ~200 baris per SFC dan ~10 props; lebih dari itu pecah.
- Satu tanggung jawab per komponen. Komponen presentasional tidak memanggil API langsung - data masuk lewat props / composable di parent.
- Logika > ~20 baris di `<script setup>` atau dipakai >1 komponen: pindah ke composable.
- DILARANG mutasi props; pakai `defineModel()` atau emit.
- DILARANG logika kompleks di template (ternary bersarang, pemanggilan fungsi berat); pakai `computed`.
- `v-for` WAJIB `:key` stabil (id), bukan index. DILARANG `v-if` + `v-for` di elemen yang sama.

## Composables & state

- Composable mengembalikan objek bernama (`{ data, pending, error, refresh }`), bukan array.
- Mulai dari state lokal (`ref`) -> `useState` (shared SSR-safe) -> Pinia. Naik level hanya kalau perlu.
- Pinia hanya untuk state global lintas halaman (session user, preferensi). DILARANG menaruh cache data server di Pinia - itu tugas `useFetch`/`useAsyncData`.
- Store pakai setup syntax; tiap store < ~150 baris; tanpa side effect di level modul.

## Lint & format

- ESLint via `@nuxt/eslint` (flat config) + Prettier (atau `@stylistic`, pilih satu, jangan dua-duanya untuk format).
- `eslint --max-warnings 0` dan `prettier --check` WAJIB hijau di CI.
- DILARANG `eslint-disable` tanpa komentar alasan di baris yang sama; DILARANG disable per-file.
- Import diurutkan otomatis; tidak ada import yang tidak dipakai.

## Testing (Vitest)

- Unit: Vitest + `@nuxt/test-utils` (env `nuxt`) + `@vue/test-utils`. File `*.test.ts` sejajar dengan sumber atau di `tests/`.
- WAJIB test untuk: composable dengan logika, `utils/`, `server/services/` (prinsip umum di `.claude/rules/kerapian-bersama.md`).
- Coverage 80% lines berlaku untuk `composables/`, `utils/`, `server/services/`; komponen murni-presentasi boleh tanpa test.
- Mock jaringan di batas pakai `registerEndpoint` / MSW.

## Checklist review

- [ ] File di folder yang benar, penamaan sesuai konvensi.
- [ ] `nuxi typecheck`, `eslint --max-warnings 0`, `prettier --check`, `vitest run` hijau.
- [ ] Tidak ada `any`/`@ts-ignore`/`eslint-disable` tanpa alasan.
- [ ] Komponen <= ~200 baris, logika ada di composable, tidak ada mutasi props.
- [ ] Pinia hanya untuk state global yang memang perlu.
- [ ] Ada test untuk logika baru/bug fix; tidak ada `.only`/`.skip`.
- [ ] Tidak ada dead code, `console.log`, atau dependency nganggur.
