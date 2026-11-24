// Syarat arif (reports/security-181-native.md §2): fail-closed tanpa SQLCipher, kunci raw, durability
// dibaca ulang, dan error generik tanpa kunci/SQL. Driver: SQLite asli + emulasi SQLCipher (jest.setup).
import { bytesToHex } from '../hex'
import { fakeSqlite } from '../../../jest/fakeExpoSqlite'
import { DatabaseOpenError, openEncryptedDatabase, type DatabaseOpenFailure } from './open'
import { SCHEMA_VERSION } from './schema'

const NAME = 'open-test.db'
const KEY = Uint8Array.from({ length: 32 }, (_, i) => i + 1)
const OTHER_KEY = new Uint8Array(32).fill(0xab)

async function openFailure(key: Uint8Array = KEY): Promise<DatabaseOpenError> {
  const error: unknown = await openEncryptedDatabase({ name: NAME, key }).then(
    () => null,
    (caught: unknown) => caught,
  )
  if (!(error instanceof DatabaseOpenError)) throw new Error('openEncryptedDatabase tidak gagal')
  return error
}

function tableNames(): string[] {
  const raw = fakeSqlite.raw(NAME)
  if (raw === undefined) return []
  return raw
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
    .all()
    .map((row) => String(row.name))
}

function expectGeneric(error: DatabaseOpenError, reason: DatabaseOpenFailure): void {
  expect(error.reason).toBe(reason)
  expect(error.message).not.toContain(bytesToHex(KEY))
  expect(error.message).not.toMatch(/PRAGMA|SELECT|sqlite/i)
  expect(error.cause).toBeUndefined()
}

describe('openEncryptedDatabase', () => {
  it('berhasil: cipher aktif, WAL + synchronous FULL terverifikasi, skema terpasang', async () => {
    const db = await openEncryptedDatabase({ name: NAME, key: KEY })

    expect(await db.getFirstAsync('PRAGMA synchronous')).toEqual({ synchronous: 2 })
    expect(await db.getFirstAsync('PRAGMA journal_mode')).toEqual({ journal_mode: 'wal' })
    expect(await db.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: SCHEMA_VERSION })
    expect(tableNames()).toEqual(
      expect.arrayContaining(['record', 'record_index', 'sync_outbox', 'sync_state']),
    )
  })

  it('fail-closed: build tanpa SQLCipher (cipher_version kosong) ditolak sebelum skema ditulis', async () => {
    fakeSqlite.setCipherAvailable(false)

    expectGeneric(await openFailure(), 'cipher-unavailable')
    expect(tableNames()).toEqual([])
  })

  it('kunci lain untuk file yang sama ditolak (tidak membuka DB dan tidak menimpa)', async () => {
    const db = await openEncryptedDatabase({ name: NAME, key: KEY })
    await db.closeAsync()

    expectGeneric(await openFailure(OTHER_KEY), 'key-rejected')
  })

  it('synchronous yang tidak menjadi FULL saat dibaca ulang = gagal, bukan diabaikan', async () => {
    fakeSqlite.overridePragma('synchronous', 1)

    expectGeneric(await openFailure(), 'durability-unverified')
    expect(tableNames()).toEqual([])
  })

  it('journal_mode yang tidak menjadi WAL saat dibaca ulang = gagal', async () => {
    fakeSqlite.overridePragma('journal_mode', 'delete')

    expectGeneric(await openFailure(), 'durability-unverified')
  })

  it('kunci yang bukan 32 byte ditolak tanpa membuka file', async () => {
    expectGeneric(await openFailure(new Uint8Array(16)), 'invalid-key')
    expect(fakeSqlite.raw(NAME)).toBeUndefined()
  })

  it('error native saat membuka dibungkus pesan generik (nama file tidak ikut)', async () => {
    fakeSqlite.setOpenFailing(true)

    const error = await openFailure()
    expectGeneric(error, 'open-failed')
    expect(error.message).not.toContain(NAME)
  })

  it('DB dari versi app yang lebih baru tidak di-downgrade', async () => {
    const db = await openEncryptedDatabase({ name: NAME, key: KEY })
    await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION + 1}`)
    await db.closeAsync()

    expectGeneric(await openFailure(), 'schema-newer')
  })

  it('migrasi yang gagal di tengah di-rollback utuh', async () => {
    // `record` dibuat ulang oleh DDL v1, lalu `CREATE TABLE record_index` bentrok: gagal di tengah.
    const db = await openEncryptedDatabase({ name: NAME, key: KEY })
    await db.execAsync('DROP TABLE record; PRAGMA user_version = 0;')
    await db.closeAsync()

    expectGeneric(await openFailure(), 'migration-failed')
    expect(tableNames()).not.toContain('record')
  })
})
