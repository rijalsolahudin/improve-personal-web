import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

/**
 * Fake `expo-sqlite` untuk Jest: SQLite asli (`node:sqlite`, Node 24) + emulasi perilaku SQLCipher
 * yang dipakai adapter. Yang diuji tetap SQL dan alur buka adapter, bukan fake ini.
 *
 * Emulasi SQLCipher (sengaja minimal):
 * - `PRAGMA key = "x'<hex>'"` mengikat koneksi ke kunci; kunci pertama yang dipakai menjadi kunci
 *   "file". Koneksi dengan kunci lain gagal `file is not a database`, seperti SQLCipher.
 * - `PRAGMA cipher_version` mengembalikan versi; `setCipherAvailable(false)` meniru build Android
 *   tanpa SQLCipher: `PRAGMA key` diabaikan dan `cipher_version` tidak mengembalikan baris.
 *
 * Satu nama DB = satu file di direktori temp (bukan `:memory:`, yang tidak mendukung WAL), dengan satu
 * objek DatabaseSync bersama. Direktori dibuang saat `reset()`.
 */

type SqlValue = string | number | null | Uint8Array

type FakeFile = {
  readonly sqlite: DatabaseSync
  key: string | null
}

const CIPHER_VERSION = '4.17.0 community'
const KEY_PRAGMA = /^\s*PRAGMA\s+key\s*=\s*"x'([0-9a-f]*)'"\s*;?\s*$/i
const READ_PRAGMA = /^\s*PRAGMA\s+(\w+)\s*;?\s*$/i

const files = new Map<string, FakeFile>()
let directory: string | null = null
const pragmaOverrides = new Map<string, SqlValue>()
let isCipherAvailable = true
let isOpenFailing = false

function toParams(params: unknown): SqlValue[] {
  if (params === undefined) return []
  if (!Array.isArray(params)) throw new Error('fake expo-sqlite: hanya parameter array')
  return params as SqlValue[]
}

class FakeConnection {
  private key: string | null = null
  private isClosed = false

  constructor(private readonly file: FakeFile) {}

  /** Jalankan satu perintah; `null` berarti sudah ditangani emulasi (tanpa ke SQLite asli). */
  private intercept(source: string): Record<string, SqlValue>[] | null {
    if (this.isClosed) throw new Error('database is closed')

    const keyMatch = KEY_PRAGMA.exec(source)
    if (keyMatch !== null) {
      if (isCipherAvailable) this.key = keyMatch[1] ?? ''
      return []
    }

    const pragma = READ_PRAGMA.exec(source)?.[1]?.toLowerCase()
    if (pragma === 'cipher_version') {
      return isCipherAvailable ? [{ cipher_version: CIPHER_VERSION }] : []
    }
    if (pragma !== undefined && pragmaOverrides.has(pragma)) {
      return [{ [pragma]: pragmaOverrides.get(pragma) ?? null }]
    }

    if (isCipherAvailable) {
      if (this.file.key === null) this.file.key = this.key
      if (this.file.key !== this.key) throw new Error('file is not a database')
    }
    return null
  }

  async execAsync(source: string): Promise<void> {
    if (this.intercept(source) === null) this.file.sqlite.exec(source)
  }

  async runAsync(source: string, params?: unknown) {
    if (this.intercept(source) !== null) return { lastInsertRowId: 0, changes: 0 }
    const result = this.file.sqlite.prepare(source).run(...toParams(params))
    return { lastInsertRowId: Number(result.lastInsertRowid), changes: result.changes }
  }

  async getFirstAsync(source: string, params?: unknown) {
    const intercepted = this.intercept(source)
    if (intercepted !== null) return intercepted[0] ?? null
    return this.file.sqlite.prepare(source).get(...toParams(params)) ?? null
  }

  async getAllAsync(source: string, params?: unknown) {
    const intercepted = this.intercept(source)
    if (intercepted !== null) return intercepted
    return this.file.sqlite.prepare(source).all(...toParams(params))
  }

  async closeAsync(): Promise<void> {
    this.isClosed = true
  }
}

export async function openDatabaseAsync(name: string): Promise<FakeConnection> {
  if (isOpenFailing) throw new Error(`unable to open database file: ${name}`)
  let file = files.get(name)
  if (file === undefined) {
    directory ??= mkdtempSync(join(tmpdir(), 'ip-fake-sqlite-'))
    file = { sqlite: new DatabaseSync(join(directory, name)), key: null }
    files.set(name, file)
  }
  return new FakeConnection(file)
}

/** Kendali test - hanya dipakai dari `*.test.ts`. */
export const fakeSqlite = {
  setCipherAvailable(value: boolean): void {
    isCipherAvailable = value
  },
  setOpenFailing(value: boolean): void {
    isOpenFailing = value
  },
  /** Paksa hasil baca `PRAGMA <name>` (mis. driver mengabaikan `synchronous = FULL`). */
  overridePragma(name: string, value: SqlValue): void {
    pragmaOverrides.set(name.toLowerCase(), value)
  },
  /** Akses SQLite mentah tanpa emulasi kunci, untuk menyiapkan kondisi file di test. */
  raw(name: string): DatabaseSync | undefined {
    return files.get(name)?.sqlite
  },
  reset(): void {
    for (const file of files.values()) file.sqlite.close()
    files.clear()
    if (directory !== null) rmSync(directory, { recursive: true, force: true })
    directory = null
    pragmaOverrides.clear()
    isCipherAvailable = true
    isOpenFailing = false
  },
}
