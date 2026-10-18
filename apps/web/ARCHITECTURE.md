# Architecture — apps/web (Nuxt 4)

Web desktop + PWA. Dokumen ini **cuma** soal `apps/web`.

| Rujukan | Di mana |
|---|---|
| Hal bersama (port & adapter, model data, kripto, auth, sync, env, kualitas, ADR) | [`../../ARCHITECTURE.md`](../../ARCHITECTURE.md) |
| Aturan kode + tiga pilar | [`CLAUDE.md`](CLAUDE.md) → [`.claude/rules/`](.claude/rules/) |
| Produk | [`docs/PRD.md`](docs/PRD.md) |

`docs/PRD.md` di folder ini **symlink** ke `../../docs/PRD.md`, bukan salinan. Jangan diganti jadi file biasa - dua salinan pasti divergen. Dokumen root lain yang dibutuhin app ini: tambah symlink di `docs/`, jangan copy.

---

## 1. Struktur

```
app/
├── pages/          # halaman (F1–F15), tipis: ambil data + susun komponen
├── layouts/        # dashboard.vue (shell app)
├── components/     # features/<fitur>/ (domain) + ui/<Nama>/index.vue (primitif)
├── stores/         # Pinia: cermin reaktif data core + UI state (bukan pemilik data)
├── composables/    # jembatan Vue ↔ packages/core (useXxx)
├── plugins/        # init runtime, suffix .client.ts
├── utils/          # fungsi murni (lihat "Transisi" di bawah)
└── assets/
i18n/               # locale (default id)
public/             # manifest PWA, icon
docs/               # symlink ke docs/ root
server/             # API v1 (auth + relay ciphertext) - Nitro/H3 di app yang sama
├── routes/api/     # endpoint /v1/** (auth, devices, keys, sync, account)
├── services/       # logika (OTP, sesi, sync upsert)
├── db/             # drizzle schema + migrasi
├── middleware/     # auth, rate limit, request id, error handler
├── utils/          # helper server (validasi env, hmac)
└── tasks/          # job terjadwal (purge tombstone, bersihkan OTP kedaluwarsa)
```

- Nggak ada app server terpisah (ADR 7 direvisi): API tinggal di `server/**` app ini dan dilayani Nitro bersama UI-nya.
- Web **tetap dilarang** punya kemampuan dekripsi dan tetap nggak boleh pegang plaintext data user - server cuma simpan ciphertext + metadata minimal (arsitektur root §6, §8, §9).
- Konvensi penamaan & batas ukuran file: [`.claude/rules/code-quality.md`](.claude/rules/code-quality.md).

## 2. Mode render & output build

- Data user cuma ada di perangkat, jadi halaman app dirender di client (`ssr: false`) dan hanya landing publik yang di-prerender (ADR 6).
- Ditetapkan per route di `routeRules` (`nuxt.config.ts`), bukan global: `/` prerender, `/login` dan `/app/**` `ssr: false`.
- Output: `nitro.preset` **bukan** `static` lagi - ada server route API di app ini, jadi build-nya preset server (Node). Konsekuensi deploy: butuh host Node, `apps/web` nggak bisa lagi disajikan murni sebagai situs statis dari CDN.

## 3. PWA

- `@vite-pwa/nuxt`: manifest + service worker (belum terpasang, masuk T23).
- Service worker cache **aset statis saja**. `NetworkOnly` untuk `/v1/*` - respons berisi data user nggak boleh masuk cache browser. Route `/v1/*` dilayani app ini sendiri (same-origin, Nitro di `server/routes`), jadi aturan `NetworkOnly` tetap berlaku dan nggak ada respons API yang boleh dilayani dari cache.
- Offline: data app udah lokal di IndexedDB, jadi yang perlu ke-cache cuma shell-nya.

## 4. State (Pinia) — ADR 9

Pemilik data tetap `packages/core`, bukan store. Store cuma **cermin reaktif** plaintext di memori setelah unlock.

- Alur baca: composable panggil repository `core` → hasil masuk store → komponen baca store. Nggak ada komponen yang query repo langsung.
- Alur tulis: komponen → use case `core` (validasi + tulis DB + outbox dalam satu transaksi) → core kabari store → store update. Store **dilarang** jadi jalur tulis langsung ke adapter IndexedDB; mutasi lewat store bikin outbox & tombstone (T21) nggak konsisten.
- Store per domain core: `useTodoStore`, `useScheduleStore`, `useHabitStore`, `useMemoStore`, `useGoalStore`, `useCountdownStore`, `useDecoStore`; plus lintas fitur: `useSyncStore`, `useAppearanceStore`, `useUiStore`.
- Derived state jadi `getter` (progress goal F13, agregasi Overview F11, streak F7, sisa waktu F2) - dihitung sekali per perubahan sumber, bukan di-scan ulang tiap komponen (AC T5, T13).
- Perubahan lintas tab: core kirim event via `BroadcastChannel`, store yang subscribe lalu patch dirinya (AC F12).
- Unlock & kunci: store dikosongkan saat app terkunci/logout. Kunci utama nggak pernah masuk store.

## 5. Plugin runtime

| Plugin | Tugas |
|---|---|
| `ticker.client.ts` | Satu ticker global (1 detik) untuk seluruh app + resync saat `visibilitychange` - dipakai sisa waktu F2/F5 (AC T5), bukan interval per item |
| `pomodoro.client.ts` | Satu pengamat fase Pomodoro app-wide (`dependsOn: ticker`) + beep Web Audio; fase selesai tetap ke-deteksi walau halaman Pomodoro nggak dibuka |
| `theme.client.ts` | Restore pilihan tema/gaya dari storage sebelum render pertama route client - biar nggak ada kedip tampilan salah (F16) |

Plugin init `core` (adapter IndexedDB, crypto, sync) menyusul di T2/T21; dia yang mengisi store setelah unlock.

## 6. Tampilan & i18n

- Token desain dari `@improve-personal/tokens` sebagai CSS variable (F16). Tema warna & gaya = dua pilihan terpisah, hasilnya dipasang sebagai `data-theme` / `data-style` di `<html>`.
- Font via `@nuxt/fonts`, self-hosted, subset latin. Font gaya non-default **nggak di-preload** - baru diunduh saat gaya itu aktif.
- String UI lewat `@nuxtjs/i18n` (default `id`, strategy `no_prefix`, satu locale) supaya gampang ditambah bahasa lain.

## 7. Transisi fase sekarang

`packages/core` belum ada (T2). Selama itu logika murni masih di `app/utils/` dan data masih mock di `app/composables/<domain>/mock.ts`. Begitu core mendarat:

1. Logika domain/recurrence/calc pindah ke `packages/core`; `app/utils/` tinggal helper presentasi.
2. Mock diganti adapter IndexedDB lewat port di `core/ports.ts`.
3. Composable yang sekarang pegang `useState` jadi pengisi store (bagian 4).

Sampai itu terjadi, `useState` per key masih dipakai - tapi jangan tambah key baru di luar rencana core.
