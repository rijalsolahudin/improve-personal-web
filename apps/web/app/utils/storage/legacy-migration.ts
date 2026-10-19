import { openDB, type IDBPDatabase } from 'idb'

import { LEGACY_DATABASE_NAMES, localDatabaseNameFor } from '#shared/tech-identity'

/**
 * Migrasi sekali jalan: penyimpanan lokal dari versi yang masih memakai nama ber-brand → nama netral.
 *
 * Kenapa ini ada: nama database tidak boleh ikut nama aplikasi (lihat `shared/tech-identity.ts`), tapi
 * versi sebelumnya sudah menulis nama ber-brand. Tanpa migrasi, data lokal yang sudah ada jadi yatim -
 * aplikasi membuka nama baru yang kosong dan user menyimpulkan datanya hilang.
 *
 * Yang SENGAJA tidak dimigrasikan: database **tanpa akun** (`improve-personal`, `improve-personal-keys`).
 * Isinya dari sebelum penyimpanan dipisah per akun, jadi tidak ada cara mengetahui akun pemiliknya - dan
 * menebaknya berarti menyerahkan data satu orang ke akun lain. Itu justru melanggar hal yang baru saja
 * kita perbaiki.
 *
 * Sifatnya idempoten & aman: hanya berjalan kalau nama LAMA ada DAN nama BARU belum ada. Kalau targetnya
 * sudah ada, tidak ada yang disentuh (data yang sudah ada di sana tidak boleh ditimpa).
 */

type StoreDefinition = {
  readonly name: string
  readonly keyPath: string | readonly string[] | null
  readonly autoIncrement: boolean
  readonly indexes: readonly {
    readonly name: string
    readonly keyPath: string | readonly string[]
    readonly unique: boolean
    readonly multiEntry: boolean
  }[]
}

/** Baca definisi store + index dari database lama, supaya skema baru tidak perlu ditulis ulang di sini. */
function readStoreDefinitions(database: IDBPDatabase<unknown>): StoreDefinition[] {
  const definitions: StoreDefinition[] = []

  for (const name of database.objectStoreNames) {
    const store = database.transaction(name, 'readonly').store
    const indexes: StoreDefinition['indexes'][number][] = []

    for (const indexName of store.indexNames) {
      const index = store.index(indexName)
      indexes.push({
        name: indexName,
        keyPath: index.keyPath as string | readonly string[],
        unique: index.unique,
        multiEntry: index.multiEntry,
      })
    }

    definitions.push({
      name,
      keyPath: store.keyPath as string | readonly string[] | null,
      autoIncrement: store.autoIncrement,
      indexes,
    })
  }

  return definitions
}

async function databaseExists(name: string): Promise<boolean> {
  // `indexedDB.databases()` tidak ada di semua browser. Kalau tidak ada, migrasi dilewati dengan aman -
  // lebih baik daripada membuka nama lama yang belum tentu ada (membukanya akan MEMBUAT database kosong).
  if (typeof indexedDB.databases !== 'function') return false

  const databases = await indexedDB.databases()
  return databases.some((entry) => entry.name === name)
}

async function copyDatabase(from: string, to: string): Promise<boolean> {
  if (!(await databaseExists(from))) return false
  if (await databaseExists(to)) return false

  const source = await openDB<unknown>(from)
  const definitions = readStoreDefinitions(source)
  const version = source.version

  const target = await openDB<unknown>(to, version, {
    upgrade(database) {
      for (const definition of definitions) {
        const store = database.createObjectStore(definition.name, {
          keyPath: definition.keyPath as string,
          autoIncrement: definition.autoIncrement,
        })

        for (const index of definition.indexes) {
          store.createIndex(index.name, index.keyPath as string, {
            unique: index.unique,
            multiEntry: index.multiEntry,
          })
        }
      }
    },
  })

  for (const definition of definitions) {
    const rows = (await source.getAll(definition.name)) as unknown[]
    if (rows.length === 0) continue

    const transaction = target.transaction(definition.name, 'readwrite')
    for (const row of rows) await transaction.store.put(row)
    await transaction.done
  }

  source.close()
  target.close()

  // Sumber dibuang SETELAH salinan selesai: kalau dibiarkan, migrasi akan mengulang tiap sesi, dan dua
  // salinan data yang sama hanya membingungkan siapa pun yang memeriksa penyimpanan nanti.
  // Best-effort, dan SENGAJA tidak ditunggu: kebenaran migrasi tidak boleh bergantung pada penghapusan
  // (idempotensinya sudah dijamin oleh pemeriksaan "database tujuan belum ada"). Kalau event `blocked`
  // tertahan - mis. tab lain masih memegang database lama - menunggunya berarti sesi lokal menggantung.
  void deleteDatabase(from).catch(() => undefined)

  return true
}

/** Hapus database setelah isinya disalin (best-effort; lihat catatan di `copyDatabase`). */
function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name)
    request.onsuccess = () => resolve()
    request.onblocked = () => reject(new Error(`database lama masih dipakai tab lain: ${name}`))
    request.onerror = () =>
      reject(new Error(`gagal menghapus database lama setelah migrasi: ${name}`))
  })
}

/**
 * Migrasikan penyimpanan milik satu akun dari nama ber-brand ke nama netral.
 *
 * Dipanggil saat sesi lokal dibuka, sebelum database-nya diakses.
 */
export async function migrateLegacyLocalDatabases(userId: string): Promise<void> {
  await copyDatabase(
    `${LEGACY_DATABASE_NAMES.scopedRecordPrefix}-${userId}`,
    localDatabaseNameFor(userId),
  )

  await copyDatabase(
    `${LEGACY_DATABASE_NAMES.scopedKeysPrefix}-${userId}`,
    localDatabaseNameFor(userId, 'keys'),
  )
}

/** Dipakai test/diagnostik: apakah nama lama (ber-brand, tanpa akun) masih ada di perangkat ini. */
export async function hasUnscopedLegacyDatabases(): Promise<boolean> {
  const [record, keys] = await Promise.all([
    databaseExists(LEGACY_DATABASE_NAMES.unscopedRecord),
    databaseExists(LEGACY_DATABASE_NAMES.unscopedKeys),
  ])

  return record || keys
}
