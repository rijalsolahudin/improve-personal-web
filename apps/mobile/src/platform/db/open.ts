import { openDatabaseAsync } from 'expo-sqlite'

import { bytesToHex } from '../hex'
import { migrateSchema, type SqlConnection } from './schema'

/**
 * Buka DB SQLCipher secara fail-closed (reports/security-181-native.md §2).
 *
 * Urutan wajib, dan tiap langkah yang gagal menutup koneksi lalu melempar `DatabaseOpenError`:
 * 1. `PRAGMA key` dengan kunci raw 32 byte (`x'<hex>'`, melewati PBKDF2 SQLCipher).
 * 2. `PRAGMA cipher_version` harus non-kosong. Build Android tanpa properti `useSQLCipher` memakai
 *    SQLite biasa: `PRAGMA key` diabaikan diam-diam dan DB tertulis plaintext. Ini satu-satunya
 *    pemeriksaan runtime yang menangkap kesalahan konfigurasi itu.
 * 3. `SELECT count(*) FROM sqlite_master` - membuktikan kunci cocok dengan file.
 * 4. `journal_mode = WAL` dan `synchronous = FULL` di-set lalu DIBACA ULANG (ports.ts butir 5).
 * 5. Migrasi skema.
 *
 * Error native tidak diteruskan (tidak ada `cause`): pesannya generik supaya kunci/SQL tidak bisa
 * bocor ke log atau crash report lewat objek error mentah.
 */

export const DB_KEY_BYTES = 32

/** `PRAGMA synchronous` mengembalikan angka: 0 OFF, 1 NORMAL, 2 FULL, 3 EXTRA. */
const SYNCHRONOUS_FULL = 2
const JOURNAL_MODE_WAL = 'wal'

export type DatabaseOpenFailure =
  | 'invalid-key'
  | 'open-failed'
  | 'cipher-unavailable'
  | 'key-rejected'
  | 'durability-unverified'
  | 'schema-newer'
  | 'migration-failed'

const FAILURE_MESSAGES: Record<DatabaseOpenFailure, string> = {
  'invalid-key': 'Kunci database tidak valid.',
  'open-failed': 'Database tidak bisa dibuka.',
  'cipher-unavailable': 'Enkripsi database tidak tersedia di build ini.',
  'key-rejected': 'Database tidak bisa dibuka dengan kunci perangkat.',
  'durability-unverified': 'Pengaturan ketahanan database tidak bisa dipastikan.',
  'schema-newer': 'Database dibuat oleh versi app yang lebih baru.',
  'migration-failed': 'Struktur database tidak bisa diperbarui.',
}

/**
 * Gagal membuka DB. `reason` untuk alur UI: `key-rejected` -> pemulihan backup/QR,
 * `cipher-unavailable` -> bug build (jangan pernah lanjut tanpa enkripsi).
 */
export class DatabaseOpenError extends Error {
  override readonly name = 'DatabaseOpenError'
  readonly reason: DatabaseOpenFailure

  constructor(reason: DatabaseOpenFailure) {
    super(FAILURE_MESSAGES[reason])
    this.reason = reason
  }
}

export type OpenEncryptedDatabaseOptions = {
  readonly name: string
  /** 32 byte acak dari luar (SecureKeyStore). Adapter tidak membuat/menurunkan kunci. */
  readonly key: Uint8Array
}

export async function openEncryptedDatabase(
  options: OpenEncryptedDatabaseOptions,
): Promise<SqlConnection> {
  if (options.key.length !== DB_KEY_BYTES) throw new DatabaseOpenError('invalid-key')

  let db: SqlConnection
  try {
    // Koneksi baru: koneksi cache yang dibuka tanpa kunci tidak boleh dipakai ulang.
    db = await openDatabaseAsync(options.name, { useNewConnection: true })
  } catch {
    throw new DatabaseOpenError('open-failed')
  }

  try {
    await prepareConnection(db, options.key)
    return db
  } catch (error) {
    await db.closeAsync().catch(() => undefined)
    throw error instanceof DatabaseOpenError ? error : new DatabaseOpenError('open-failed')
  }
}

async function prepareConnection(db: SqlConnection, key: Uint8Array): Promise<void> {
  await step('open-failed', () => db.execAsync(`PRAGMA key = "x'${bytesToHex(key)}'"`))

  const cipher = await step('cipher-unavailable', () =>
    db.getFirstAsync<{ cipher_version?: unknown }>('PRAGMA cipher_version'),
  )
  if (typeof cipher?.cipher_version !== 'string' || cipher.cipher_version.length === 0) {
    throw new DatabaseOpenError('cipher-unavailable')
  }

  await step('key-rejected', () => db.getFirstAsync('SELECT count(*) AS n FROM sqlite_master'))

  await step('durability-unverified', () => db.execAsync('PRAGMA journal_mode = WAL'))
  const journal = await step('durability-unverified', () =>
    db.getFirstAsync<{ journal_mode?: unknown }>('PRAGMA journal_mode'),
  )
  await step('durability-unverified', () => db.execAsync('PRAGMA synchronous = FULL'))
  const synchronous = await step('durability-unverified', () =>
    db.getFirstAsync<{ synchronous?: unknown }>('PRAGMA synchronous'),
  )
  if (journal?.journal_mode !== JOURNAL_MODE_WAL || synchronous?.synchronous !== SYNCHRONOUS_FULL) {
    throw new DatabaseOpenError('durability-unverified')
  }

  const migration = await step('migration-failed', () => migrateSchema(db))
  if (migration === 'newer') throw new DatabaseOpenError('schema-newer')
}

/** Jalankan satu langkah; error apa pun diganti `DatabaseOpenError` generik. */
async function step<T>(reason: DatabaseOpenFailure, run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch {
    throw new DatabaseOpenError(reason)
  }
}
