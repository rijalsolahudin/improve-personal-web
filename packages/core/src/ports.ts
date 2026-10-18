import type { EntityType } from './domain/envelope.ts'
import type { RecordIndexEntry, SyncOp, SyncStatus } from './domain/storage.ts'

/**
 * Port & adapter (ARCHITECTURE.md §5).
 *
 * Satu-satunya tempat di `packages/core` yang menyentuh batas platform. Tidak ada satu pun
 * implementasi di sini - web memakai IndexedDB, mobile memakai SQLite, dan test memakai adapter
 * memori (`adapters/memory.ts`). Karena interface-nya harus muat di dua backend yang sangat berbeda,
 * semua operasi asinkron dan semua nilai yang dilewatkan sudah menjadi bentuk primitif (`string`,
 * `number`, `boolean`, array) - dilarang melewatkan objek backend (transaction handle, statement,
 * cursor) lewat batas ini.
 *
 * Aturan yang WAJIB dipenuhi tiap implementasi `StorageAdapter` (ARCHITECTURE.md §5 "Aturan
 * penyimpanan lokal"):
 *
 * 1. **Record + outbox dalam SATU transaksi.** `commitRecords` harus menulis record DAN baris outbox
 *    secara atomik. Kalau tidak, crash di antara keduanya bikin data tersimpan tapi tidak pernah
 *    terkirim - hilang diam-diam.
 * 2. **Satu penulis per origin di web** (`navigator.locks`, mis. lock `ip-writer`). IndexedDB tidak
 *    punya lock antar tab; dua tab bisa saling menimpa. `BroadcastChannel` cuma memberi tahu, bukan
 *    mengunci. Adapter web harus mengambil lock tulis di level aplikasi sebelum memulai transaksi.
 * 3. **Dilarang `await` non-storage di dalam transaksi** (fetch, timer, crypto, apa pun). Transaksi
 *    IndexedDB auto-commit begitu tidak ada request pending, jadi sisa tulisan hilang tanpa error.
 *    Callback transaksi di sini menerima `TransactionContext` yang operasinya sinkron-per-panggilan
 *    (`putRecord`, `putIndex`, `enqueueOutbox`) dan mengembalikan promise - adapter yang menjaga agar
 *    tidak ada pekerjaan lain diselipkan di antaranya.
 * 4. **Durability transaksi tulis: `strict`** (web). Default Chrome sekarang `relaxed`; commit
 *    terakhir bisa hilang saat mati listrik, OS crash, atau disk penuh.
 * 5. **Mobile: `synchronous = FULL`** untuk transaksi record + outbox. WAL dengan `NORMAL` masih bisa
 *    kehilangan transaksi terakhir saat mati listrik.
 * 6. **`navigator.storage.persist()` wajib dipanggil** di web dan PWA didorong untuk di-install.
 *    Tanpa itu browser bisa menghapus storage (Safari membersihkan situs yang tidak dibuka ~7 hari
 *    kalau tidak di-install). Ini tugas shell platform, bukan core - core cuma mengandalkan storage
 *    yang awet.
 * 7. **Tulis per record.** Dilarang pola hapus-semua-lalu-tulis-ulang.
 * 8. **Query jalur panas lewat index** (`queryByRange`), bukan scan + decrypt semua record
 *    (ARCHITECTURE.md §6). Kalau implementasi tidak bisa memakai index, itu bug performa - bukan
 *    alasan mengganti interface.
 *
 * Semua operasi di `StorageAdapter` harus aman dipanggil konkuren dari sisi pemanggil (mis. dua
 * `commitRecords` berurutan tanpa menunggu): urutan commit yang dipakai untuk LWW, jadi adapter wajib
 * menyelesaikannya secara serial.
 */

/** Satu baris `record` + `record_index` yang ditulis atomik bersama outbox. */
export type RecordWrite = {
  /** Envelope ter-seal (`ARCHITECTURE.md` §6) - ciphertext + metadata plaintext. */
  readonly sealed: {
    readonly id: string
    readonly hlc: string
    readonly deleted: boolean
    readonly blob: string
  }
  /** Entri index untuk query rentang (boleh `null` kalau entitas tidak punya dimensi waktu). */
  readonly index: RecordIndexEntry | null
  /** Operasi yang diantre untuk dikirim ke server (`put` = upsert, `delete` = tombstone). */
  readonly op: SyncOp
  /** Baris outbox baru; `id` dan `queuedAt` diisi core supaya adapter tidak perlu jam sendiri. */
  readonly outbox: {
    readonly id: string
    readonly queuedAtMs: number
  }
}

/**
 * Konteks transaksi - primitif saja, tidak ada objek backend.
 *
 * Semua metode di sini mengembalikan `Promise`, tapi pemanggilnya DILARANG menyelipkan
 * `await` non-storage di antaranya (aturan butir 3). Operasi harus dipanggil berurutan tanpa
 * `await` di luar context ini; adapter boleh (dan sebaiknya) menolak transaksi yang "menggantung"
 * karena ada pekerjaan lain diselipkan.
 */
export type TransactionContext = {
  /** Nama transaksi untuk debugging/log. Bukan data user. */
  readonly label: string
  /**
   * Tulis satu record + index-nya + baris outbox-nya. Ketiganya harus ikut transaksi yang sama.
   * `op: 'delete'` menandai record sebagai tombstone (tetap ditulis, bukan dihapus fisik).
   */
  putRecord: (write: RecordWrite) => Promise<void>
  /**
   * Buang baris outbox setelah server membalas `applied`/`stale` untuk record itu.
   *
   * Ini operasi terpisah dari `putRecord` karena ack datang dari jaringan (di luar transaksi tulis).
   * Kalau crash setelah ack tapi sebelum baris terbuang, record dikirim ulang - dan itu aman:
   * server idempoten terhadap `hlc` yang sama (LWW, upsert hanya kalau `hlc` masuk lebih besar).
   */
  deleteOutboxRows: (outboxIds: readonly string[]) => Promise<void>
  /**
   * Perbarui `sync_state` (cursor, status, waktu sync terakhir).
   *
   * Bagian dari transaksi karena cursor dan baris outbox yang dibuang harus konsisten: cursor naik
   * tanpa baris terbuang = record terkirim ulang selamanya; baris terbuang tanpa cursor naik =
   * perubahan perangkat lain terlewat.
   */
  patchSyncState: (patch: SyncStatePatch) => Promise<void>
}

/** Patch parsial `sync_state` - hanya field yang benar-benar berubah. */
export type SyncStatePatch = {
  readonly deviceId?: string
  readonly cursor?: number
  readonly status?: SyncStatus
  readonly lastPullAtMs?: number | null
  readonly lastPushAtMs?: number | null
}

/**
 * Penyimpanan lokal (web: IndexedDB, mobile: SQLite + SQLCipher).
 *
 * Semua operasi berbicara dalam istilah tabel fisik Bagian A `database.dbml`:
 * `record`, `record_index`, `sync_outbox`, `sync_state`, `local_key_meta`, `sticker_recent`.
 * Tabel domain (Bagian B) tidak pernah muncul di sini - isinya ada di dalam `blob`.
 */
export interface StorageAdapter {
  /**
   * Jalankan `fn` dalam satu transaksi dengan durability `strict` (web) / `FULL` (mobile).
   *
   * Adapter wajib membatalkan transaksi (rollback) kalau `fn` melempar error, sehingga tidak ada
   * tulisan setengah jalan. `fn` boleh dipanggil ulang oleh adapter bila transaksi harus di-retry -
   * jadi `fn` harus bebas efek samping di luar `TransactionContext`.
   */
  runTransaction: <T>(label: string, fn: (tx: TransactionContext) => Promise<T>) => Promise<T>

  /** Baca satu baris `record`; `null` kalau tidak ada. */
  getRecord: (id: string) => Promise<StoredRecord | null>

  /**
   * Baca banyak record sekaligus (batch kecil, mis. isi satu hari kalender).
   *
   * Hasilnya TIDAK dijamin urut dan id yang tidak ada cukup dihilangkan.
   */
  getRecords: (ids: readonly string[]) => Promise<readonly StoredRecord[]>

  /**
   * Query rentang lewat `record_index` - jalur panas kalender/overview/daily (ARCHITECTURE.md §6).
   *
   * Wajib memakai index `(entity_type, range_start_ms)` / `(range_start_ms, range_end_ms)`, bukan
   * memindai seluruh tabel `record` lalu mendekripsi. Record dengan rentang yang **beririsan**
   * dengan `[fromMs, toMs]` ikut terpilih.
   */
  queryByRange: (query: RangeQuery) => Promise<readonly StoredRecord[]>

  /** Semua isi `record_index` untuk satu tipe entitas; dipakai saat membangun ulang index di memori. */
  listIndexByType: (entityType: EntityType) => Promise<readonly RecordIndexEntry[]>

  /** Ambil `limit` baris outbox tertua (urut `queued_at` naik). */
  listOutbox: (limit: number) => Promise<readonly OutboxRow[]>

  /** Perbarui `attempts` + `last_error` satu baris outbox (dipakai saat push gagal). */
  markOutboxFailure: (id: string, failure: OutboxFailure) => Promise<void>

  /** Buang baris outbox berdasarkan id. */
  deleteOutboxRows: (ids: readonly string[]) => Promise<void>

  /** Hitung sisa baris outbox (indikator badge "menunggu" di UI). */
  countOutbox: () => Promise<number>

  /** Baca `sync_state` (singleton). `null` sebelum inisialisasi pertama. */
  getSyncState: () => Promise<StoredSyncState | null>

  /** Tulis penuh `sync_state` (singleton). Dipakai saat inisialisasi maupun reset cursor. */
  putSyncState: (state: StoredSyncState) => Promise<void>

  /** Metadata `local_key_meta` - CUMA metadata, bahan kunci ada di Keychain/Keystore/WebCrypto. */
  getKeyMeta: (slot: KeySlotLocal) => Promise<LocalKeyMeta | null>
  putKeyMeta: (meta: LocalKeyMeta) => Promise<void>
  deleteKeyMeta: (slot: KeySlotLocal) => Promise<void>

  /** Tab "Terakhir dipakai" sticker picker (PRD F14). State UI lokal, tidak ikut sync. */
  listRecentStickers: (limit: number) => Promise<readonly StickerRecentEntry[]>
  putRecentSticker: (entry: StickerRecentEntry) => Promise<void>

  /**
   * Hapus isi penyimpanan (import `replace-all`, wipe, dan drill restore).
   *
   * Dipakai HANYA setelah validasi import selesai; kalau import gagal validasi, data lama harus utuh
   * (PRD F10 "Data lama tetap aman").
   */
  wipe: () => Promise<void>
}

/**
 * Query rentang untuk `record_index`.
 *
 * `entityTypes` kosong/undefined berarti semua tipe. Query tanpa rentang tanggal dan tanpa tipe
 * sengaja TIDAK didukung - itu sama dengan scan penuh, dan jalur panas dilarang begitu.
 */
export type RangeQuery = {
  readonly entityTypes?: readonly EntityType[]
  /** Batas bawah (inklusif). Record dengan `range_end_ms` null dianggap titik waktu `range_start_ms`. */
  readonly fromMs?: number
  /** Batas atas (inklusif). */
  readonly toMs?: number
  readonly includeDeleted?: boolean
  readonly limit?: number
}

/** Bentuk baris `record` apa adanya dari disk. `blob` masih ciphertext. */
export type StoredRecord = {
  readonly id: string
  readonly hlc: string
  readonly deleted: boolean
  readonly blob: string
  /** Pembukuan lokal, tidak disync. */
  readonly createdAtMs: number
  readonly updatedAtMs: number
}

/** Baris `sync_outbox`. */
export type OutboxRow = {
  readonly id: string
  readonly recordId: string
  readonly op: SyncOp
  readonly queuedAtMs: number
  readonly attempts: number
  /**
   * Pesan error terakhir. DILARANG memuat isi blob, token, atau apa pun dari dalam record -
   * hanya kode/keterangan generik (mis. `'HTTP 401'`, `'VALIDATION_FAILED'`).
   */
  readonly lastError: string | null
}

/** Kegagalan satu baris outbox. `attempts` diinkremen adapter, bukan dipassing pemanggil. */
export type OutboxFailure = {
  readonly lastError: string
}

/** Baris `sync_state` (singleton). */
export type StoredSyncState = {
  readonly deviceId: string
  /** `server_seq` terakhir yang sudah ditarik. Reset ke 0 saat `SYNC_RESET_REQUIRED`. */
  readonly cursor: number
  readonly status: SyncStatus
  readonly lastPullAtMs: number | null
  readonly lastPushAtMs: number | null
}

/** Kunci `sync_state.id`; nilai tetap seperti di `database.dbml`. */
export const CURRENT_STATE_KEY = 'current'

/** Slot kunci lokal (`database.dbml` enum `key_slot_lokal`). TIDAK ADA slot OTP - lihat ADR 10. */
export const KEY_SLOTS_LOCAL = ['device', 'passkey', 'recovery'] as const

export type KeySlotLocal = (typeof KEY_SLOTS_LOCAL)[number]

/** Baris `local_key_meta`. Cuma metadata; bahan kunci tidak pernah masuk sini. */
export type LocalKeyMeta = {
  readonly id: string
  readonly slot: KeySlotLocal
  /** Info non-rahasia untuk UI (mis. jenis KDF). JANGAN memuat bahan kunci. */
  readonly kdfHint: string | null
  readonly createdAtMs: number
  readonly lastUsedAtMs: number | null
}

/** Baris `sticker_recent`. */
export type StickerRecentEntry = {
  readonly stickerId: string
  readonly usedAtMs: number
}

/**
 * Penyimpanan bahan kunci di perangkat (web: WebCrypto non-extractable + WebAuthn; mobile:
 * Keychain/Keystore + biometrik).
 *
 * Kontrak: bahan kunci (master key, device key) TIDAK PERNAH keluar dalam bentuk plaintext ke core,
 * log, atau jaringan. Implementasi mengembalikan handle/opaque id, bukan byte kunci. Pembuatan dan
 * pembungkusan kunci milik `packages/crypto` - di sini cuma batas penyimpanannya.
 */
export interface SecureKeyStore {
  /** Apakah ada bahan kunci tersimpan untuk slot ini. */
  has: (slot: KeySlotLocal) => Promise<boolean>
  /**
   * Simpan bahan kunci. `material` sudah dalam bentuk yang aman untuk backend (mis. `CryptoKey`
   * non-extractable), bukan byte mentah yang bisa di-log.
   */
  put: (slot: KeySlotLocal, material: SecureKeyMaterial) => Promise<void>
  /** Ambil handle bahan kunci. `null` kalau slot kosong. */
  get: (slot: KeySlotLocal) => Promise<SecureKeyMaterial | null>
  /** Hapus permanen (mis. saat user mencabut akses perangkat). */
  remove: (slot: KeySlotLocal) => Promise<void>
}

/**
 * Opaque handle bahan kunci.
 *
 * Sengaja `unknown` + `kind`, bukan `Uint8Array`: WebCrypto `CryptoKey` dan native keychain handle
 * bukan byte, dan memaksa keduanya jadi byte akan menurunkan jaminan non-extractable. Core hanya
 * memindahkan handle ini ke `CryptoProvider`.
 */
export type SecureKeyMaterial = {
  readonly kind: string
  readonly handle: unknown
}

/**
 * Operasi kripto (web: libsodium-wrappers; mobile: react-native-libsodium).
 *
 * Interface-nya saja - implementasi milik `packages/crypto` (di luar scope paket ini). Semua argumen
 * dan hasil berbentuk byte/string, bukan handle backend, supaya adapter di dua platform bisa
 * ditukar. DILARANG mengirim kunci polos ke jaringan (ARCHITECTURE.md §7).
 */
export interface CryptoProvider {
  /** Enkripsi plaintext JSON jadi `blob` ciphertext (XChaCha20-Poly1305, AAD = `recordId`). */
  sealRecord: (input: SealRecordInput) => Promise<string>
  /** Buka `blob`; mengembalikan plaintext JSON. Melempar bila AAD/kunci tidak cocok. */
  openRecord: (input: OpenRecordInput) => Promise<string>
}

export type SealRecordInput = {
  readonly recordId: string
  /** Kunci data yang sudah ada di memori (hasil unlock). */
  readonly dataKey: SecureKeyMaterial
  /** Plaintext JSON dari `{ type, schemaVersion, data }`. */
  readonly plaintext: string
}

export type OpenRecordInput = {
  readonly recordId: string
  readonly dataKey: SecureKeyMaterial
  /** Ciphertext base64 dari `record.blob`. */
  readonly blob: string
}

/**
 * Sumber waktu. Di-inject supaya `domain/`, `recurrence/`, dan `calc/` bisa murni dan test
 * deterministik (ARCHITECTURE.md §4: dilarang `Date.now()` langsung).
 *
 * Web dan mobile sama-sama `Date.now`, tapi pemisahan ini yang bikin core testable - bukan soal
 * backend-nya berbeda.
 */
export interface Clock {
  /**
   * Waktu wall-clock saat ini (epoch ms UTC).
   *
   * Jam perangkat boleh ngaco; itu tidak masalah karena perbandingan record memakai HLC, bukan
   * `nowMs` mentah (ARCHITECTURE.md §9).
   */
  nowMs: () => number
  /**
   * Jam monotonik (epoch ms) untuk HLC dan pengukuran durasi.
   *
   * Harus tidak mundur walau user mengubah jam perangkat; `performance.now()` di web dan
   * `performance.now()` di native keduanya naik monoton. Kalau platform tidak punya sumber
   * monotonik, implementasi boleh memakai nilai terbesar yang pernah dilihat (seperti HLC sendiri).
   */
  monotonicMs: () => number
}

/** Aksi yang dijadwalkan shell platform (web: `setTimeout` + `visibilitychange`; native: `AppState`). */
export type ScheduledAction = {
  readonly id: string
  readonly callback: () => void
}

/**
 * Penjadwal untuk sync & ticker global (ARCHITECTURE.md §11: SATU ticker per app, bukan per item).
 *
 * Core hanya memutuskan KAPAN sesuatu harus terjadi (fungsi murni yang bisa dipanggil, lihat
 * `sync/schedule.ts`); timer platform-nya milik adapter. Ini yang bikin jadwal sync bisa diuji tanpa
 * menunggu waktu nyata.
 */
export interface Scheduler {
  /** Jadwalkan `callback` sekali setelah `delayMs`. */
  setTimeout: (callback: () => void, delayMs: number) => ScheduledAction
  /** Batalkan aksi yang sudah dijadwalkan. Aman dipanggil dua kali. */
  clearTimeout: (action: ScheduledAction) => void
  /** Jadwalkan `callback` tiap `intervalMs`; dipakai untuk ticker global. */
  setInterval: (callback: () => void, intervalMs: number) => ScheduledAction
  clearInterval: (action: ScheduledAction) => void
}

/**
 * HTTP client (web: `$fetch`/`fetch`; mobile: `fetch`).
 *
 * Sengaja TIDAK menyimpan base URL atau token: core menerima URL absolut + header dari shell
 * platform, supaya tidak ada kredensial yang ikut hidup di dalam engine sync.
 */
export interface HttpClient {
  /**
   * `POST` JSON. Melempar `HttpError` untuk status non-2xx supaya `code` error kontrak
   * (`ERROR_CODES`) bisa dibaca engine sync.
   */
  postJson: <TResponse>(url: string, body: unknown, init?: HttpRequestInit) => Promise<TResponse>
  /** `GET` JSON, dengan query string yang sudah disusun pemanggil. */
  getJson: <TResponse>(url: string, init?: HttpRequestInit) => Promise<TResponse>
}

export type HttpRequestInit = {
  readonly headers?: Readonly<globalThis.Record<string, string>>
  /** `AbortSignal` milik platform - dipakai untuk membatalkan sync saat app ditutup. */
  readonly signal?: unknown
  readonly timeoutMs?: number
}

/**
 * Error HTTP yang membawa kode kontrak (`ERROR_CODES` di `packages/contracts`).
 *
 * `code` sengaja opsional: kegagalan jaringan/timeout tidak punya kode server, dan engine sync harus
 * membedakan "server bilang X" dari "tidak sampai server".
 */
export class HttpError extends Error {
  readonly status: number
  readonly code: string | null

  constructor(status: number, code: string | null, message: string) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.code = code
  }
}
