/**
 * `@improve-personal/core` - seluruh logika yang dipakai web (Nuxt) DAN mobile (React Native).
 *
 * Isi paket ini (ARCHITECTURE.md §4):
 * - `domain/`     : entitas + aturan murni (envelope, enums, payload F1-F16)
 * - `recurrence/` : engine schedule berulang (F1)
 * - `calc/`       : sisa waktu, countdown, streak (F2/F5/F7)
 * - `repository/` : interface repository + helper index rentang (T2)
 * - `sync/`       : HLC, outbox, push/pull delta, LWW, status (F15, T21)
 * - `io/`         : export/import JSON + migrasi versi skema (F10, T12)
 * - `adapters/`   : implementasi `Clock` + `StorageAdapter` in-memory untuk test & kontrak (T23)
 * - `ports.ts`    : port yang diimplementasi tiap platform (IndexedDB/SQLite, Keychain/WebCrypto,
 *                   libsodium, `Date.now`, `setTimeout`, `fetch`)
 *
 * Barrel ini sengaja `export *` dari barrel sub-modul yang sudah eksplisit. Konsekuensinya nama yang
 * TIDAK muncul di sini tidak bisa diimpor dari `@improve-personal/core` - jadi kalau ada modul baru,
 * dia wajib masuk salah satu daftar di bawah. `src/index.test.ts` menjaga hal itu: beberapa nama
 * perwakilan diimpor lewat barrel ini, sehingga `export *` yang diam-diam ambigu (nama yang sama
 * keluar dari dua sub-barrel -> dibuang ESM tanpa error) langsung ketahuan sebagai test gagal.
 *
 * Port sengaja di-export satu per satu, bukan `export * from './ports.ts'`: tipe baris fisik
 * (`RangeQuery`, `RecordWrite`, `StoredRecord`, `SyncStatePatch`, ...) sudah keluar lewat
 * `domain/storage.ts`, dan mengekspor dua kali akan membuat nama-nama itu ambigu - yaitu justru
 * nama yang paling sering dipakai adapter.
 */

// -----------------------------------------------------------------------------
// Port & adapter platform (bentuk aslinya di `ports.ts`)
// -----------------------------------------------------------------------------

export type {
  Clock,
  CryptoProvider,
  HttpClient,
  HttpRequestInit,
  OpenRecordInput,
  ScheduledAction,
  Scheduler,
  SealRecordInput,
  SecureKeyMaterial,
  SecureKeyStore,
  StorageAdapter,
} from './ports.ts'

export { HttpError, RECORD_INDEX_KEEP, RECORD_PULL_FOREIGN, RECORD_PULL_REJECT } from './ports.ts'

// -----------------------------------------------------------------------------
// Domain, recurrence, calc, repository, io, sync, adapters
// -----------------------------------------------------------------------------

export * from './domain/index.ts'
export * from './recurrence/index.ts'
export * from './calc/index.ts'
export * from './repository/index.ts'
export * from './io/index.ts'
export * from './sync/index.ts'
export * from './adapters/index.ts'
