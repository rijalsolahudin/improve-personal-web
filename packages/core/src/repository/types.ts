import type { Record as EnvelopeRecord, EntityType, RecordIndexEntry } from '../domain/envelope.ts'
import type { RangeQuery } from '../ports.ts'

/**
 * Interface repository - satu-satunya cara fitur mengakses data (AC T2) + query rentang.
 *
 * Ini cuma INTERFACE. Implementasi web (IndexedDB) dan native (SQLite) hidup di luar `packages/core`
 * (adapter platform) dan keduanya diuji dengan contract test yang sama (AC T23).
 *
 * Kenapa tetap ada interface di atas `StorageAdapter`: `StorageAdapter` bekerja pada baris fisik
 * (`record`, `sync_outbox`), sedangkan fitur berpikir dalam entitas (`Todo`, `Schedule`). Repository
 * -lah tempat kedua bahasa itu bertemu, dan itu juga tempat yang memutuskan kapan sebuah record perlu
 * di-decrypt (jalur panas pakai `record_index`, bukan decrypt semua).
 *
 * Aturan yang berlaku untuk semua implementasi:
 * - Semua operasi asinkron dan tidak pernah menyentuh jaringan (jaringan urusan `sync/`).
 * - Query jalur panas WAJIB lewat index (`listByRange`), bukan memindai seluruh tabel.
 * - `save` menulis record + baris outbox dalam SATU transaksi (aturan §5). Itu sebabnya `save`
 *   menerima `outbox` sebagai bagian dari input, bukan operasi terpisah yang mudah terlupa.
 */

/** Hasil baca entitas: envelope + payload yang sudah didekripsi & tervalidasi. */
export type EntityRecord<T> = EnvelopeRecord<T>

/**
 * Query daftar dengan rentang tanggal.
 *
 * `entityTypes` opsional; kalau kosong, semua tipe di tipe-record yang sama akan dipilih - pemanggil
 * hampir selalu mengisinya, karena halaman selalu tahu tipe apa yang ditampilkan.
 */
export type RangeQuerySpec = {
  readonly entityTypes?: readonly EntityType[]
  readonly fromMs?: number
  readonly toMs?: number
  /** Sertakan tombstone; default `false` karena UI tidak perlu menampilkan yang sudah dihapus. */
  readonly includeDeleted?: boolean
  readonly limit?: number
  /** Urut naik berdasarkan `range_start_ms` (default) atau turun. */
  readonly order?: 'asc' | 'desc'
}

/** Baris outbox yang harus ditulis bersama record (satu transaksi). */
export type OutboxIntent = {
  readonly id: string
  readonly queuedAtMs: number
}

/**
 * Input penyimpanan satu record.
 *
 * `sealed` sudah ciphertext; repository TIDAK mengenkripsi sendiri - itu tugas `CryptoProvider` di
 * lapisan use case, supaya repository tetap bisa diuji tanpa kripto.
 */
export type SaveRecordInput = {
  readonly id: string
  readonly hlc: string
  readonly deleted: boolean
  readonly blob: string
  /** Entri index yang ditulis bersama record; `null` kalau entitas tidak punya dimensi waktu. */
  readonly index: RangeIndexInput | null
  /** Baris outbox yang dibuat dalam transaksi yang sama. */
  readonly outbox: OutboxIntent
}

/** Bagian `record_index` yang diisi repository. */
export type RangeIndexInput = {
  readonly entityType: EntityType
  readonly rangeStartMs: number | null
  readonly rangeEndMs: number | null
  readonly updatedAtMs: number
}

/**
 * Repository generik untuk satu tipe entitas.
 *
 * `T` adalah payload domain (mis. `Todo`, `SchedulePayload`), bukan envelope - pemanggil menerima
 * `EntityRecord<T>` supaya `hlc`/`deleted` ikut terbawa dan tidak perlu query kedua.
 */
export interface Repository<T> {
  /** Tipe entitas yang dipegang repository ini. */
  readonly entityType: EntityType

  /** Baca satu entitas; `null` kalau tidak ada (atau tombstone dan `includeDeleted` tidak diset). */
  getById: (id: string) => Promise<EntityRecord<T> | null>

  /**
   * Baca banyak entitas sekaligus.
   *
   * Lebih murah daripada memanggil `getById` berkali-kali karena implementasi bisa memakai satu
   * query/transaksi baca - dipakai kalender saat butuh jadwal + exception + status sekaligus.
   */
  getManyById: (ids: readonly string[]) => Promise<readonly EntityRecord<T>[]>

  /**
   * Query rentang lewat index - jalur panas kalender/overview/daily (AC T2).
   *
   * Tidak melempar error kalau tidak ada yang cocok; hasil kosong adalah jawaban yang sah.
   */
  listByRange: (query: RangeQuerySpec) => Promise<readonly EntityRecord<T>[]>

  /**
   * Simpan record + antre outbox dalam SATU transaksi.
   *
   * Implementasi WAJIB atomik: kalau penulisan record berhasil tapi outbox gagal, data tersimpan
   * tanpa pernah terkirim - itu kehilangan diam-diam yang dilarang §5.
   */
  save: (input: SaveRecordInput) => Promise<void>

  /**
   * Hapus = tombstone: tulis record dengan `deleted = true` + antre outbox `delete`.
   *
   * Bukan penghapusan fisik, karena hapus harus ikut tersinkron (ARCHITECTURE §9).
   */
  softDelete: (input: {
    readonly id: string
    readonly hlc: string
    readonly blob: string
    readonly index: RangeIndexInput | null
    readonly outbox: OutboxIntent
  }) => Promise<void>

  /** Semua entitas tipe ini, termasuk tombstone (dipakai export F10 & migrasi). */
  listAll: (options?: { readonly includeDeleted?: boolean }) => Promise<readonly EntityRecord<T>[]>
}

/**
 * Kumpulan repository per tipe entitas - yang dipegang use case.
 *
 * Dibuat lewat factory supaya adapter platform cukup mengimplementasikan satu "reader/sealer" dan
 * semua tipe langsung tersedia; tidak ada 20 implementasi repository yang mirip satu sama lain.
 */
export type RepositorySet = {
  schedule: Repository<unknown>
  todo: Repository<unknown>
  countdown: Repository<unknown>
  habit: Repository<unknown>
  journal: Repository<unknown>
  goal: Repository<unknown>
  decoration: Repository<unknown>
  userPrefs: Repository<unknown>
}

/** Opsi umum query; di-re-export supaya adapter tidak perlu impor `ports.ts` untuk hal sepele. */
export type { RangeQuery, RecordIndexEntry }
