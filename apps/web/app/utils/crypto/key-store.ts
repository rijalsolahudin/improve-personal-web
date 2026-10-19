import { openDB, type IDBPDatabase, type IDBPTransaction } from 'idb'

import { TECH_IDENTITY } from '#shared/tech-identity'

import type { KeySlotLocal, SecureKeyMaterial, SecureKeyStore } from '@improve-personal/core'

/**
 * `SecureKeyStore` web (ARCHITECTURE §5).
 *
 * Aturan yang menentukan bentuk modul ini:
 * - **Bahan kunci tidak pernah keluar sebagai byte** kecuali lewat operasi kripto yang memang butuh.
 *   Web menyimpan `CryptoKey` non-extractable: objeknya bisa dipakai untuk `wrapKey`/`unwrapKey`, tapi
 *   isinya tidak bisa diekspor - penyerang yang bisa membaca IndexedDB pun hanya dapat *handle* yang
 *   tidak berguna tanpa izin kripto browser.
 * - **Database SENDIRI, terpisah dari penyimpanan record.** `StorageAdapter.wipe()` dipakai untuk
 *   import "replace-all" - kalau kunci ikut terhapus, user yang baru saja mengimpor backup justru
 *   kehilangan akses ke datanya sendiri. Kunci hidup lebih lama daripada record.
 * - **Hanya slot yang dikenal** (`device`/`passkey`/`recovery`). Tidak ada slot OTP dan tidak akan
 *   ada: OTP dibuat server, jadi server tahu pembukanya (ADR 10).
 *
 * Yang TIDAK dilakukan modul ini: menafsirkan isi handle. Bentuk handle adalah urusan modul pembuka
 * (`device-slot.ts`, dan nanti passkey/recovery) - di sini nilainya hanya disimpan dan dikembalikan
 * apa adanya, supaya tidak ada dua tempat yang bisa berbeda pendapat soal artinya.
 *
 * PERINGATAN untuk pemanggil: `handle` disimpan apa adanya ke IndexedDB, jadi ia WAJIB
 * structured-cloneable. Nilai yang dibaca dari `ref` Vue adalah **Proxy**, dan IndexedDB menolak Proxy
 * dengan `DataCloneError` - kegagalan yang hanya muncul di browser (test node memakai objek biasa), dan
 * gejalanya cuma "gagal menyimpan". Kirim salinan data biasa dulu (mis. `JSON.parse(JSON.stringify(v))`).
 */

/** Nama database kunci. Terpisah dari database record (lihat catatan di atas). */
export const KEY_DATABASE_NAME = TECH_IDENTITY.keyDatabasePrefix

/** Versi skema database kunci. */
const KEY_DATABASE_VERSION = 1

const MATERIAL_STORE = 'key_material'

/**
 * Baris material kunci.
 *
 * `handle` sengaja `unknown`: isinya bisa `CryptoKey` (non-extractable) atau objek berisi handle +
 * envelope, tergantung slotnya. Modul pembuka yang memvalidasi bentuknya saat membaca.
 */
type MaterialRow = {
  readonly slot: KeySlotLocal
  readonly kind: string
  readonly handle: unknown
}

/**
 * Baris pembatas percobaan recovery (`recovery-guard.ts`).
 *
 * Ditaruh di database kunci - bukan database record - karena isinya bertahan lintas reload dan harus
 * selamat dari import "replace-all" (`StorageAdapter.wipe`). Kalau batas percobaan ikut terhapus,
 * menyerang frasa recovery cuma perlu satu kali import untuk mengulang jatah 5 percobaan.
 */
export type RecoveryGuardRow = {
  readonly id: string
  readonly failedAttempts: number
  readonly lockedUntilMs: number | null
}

export type KeyDbSchema = {
  key_material: { key: KeySlotLocal; value: MaterialRow }
  recovery_guard: { key: string; value: RecoveryGuardRow }
}

export type WebKeyStoreOptions = {
  /** Nama database. Test memakai nama unik supaya tiap kasus mulai dari kondisi kosong. */
  readonly databaseName?: string
}

/** Nama object store pembatas percobaan recovery. */
export const GUARD_STORE = 'recovery_guard'

/**
 * Buka database kunci.
 *
 * Diekspor supaya `recovery-guard.ts` bisa memakai database yang SAMA tanpa mendefinisikan skema kedua.
 * Dua definisi skema untuk satu nama database adalah cara paling halus membuat object store hilang:
 * yang membuka lebih dulu menang, dan yang kalah gagal saat dipakai.
 */
export function openKeyDatabase(databaseName: string): Promise<IDBPDatabase<KeyDbSchema>> {
  return openDB<KeyDbSchema>(databaseName, KEY_DATABASE_VERSION, {
    upgrade(database) {
      database.createObjectStore(MATERIAL_STORE, { keyPath: 'slot' })
      database.createObjectStore(GUARD_STORE, { keyPath: 'id' })
    },
  })
}

/**
 * Penyimpan bahan kunci berbasis IndexedDB.
 *
 * Transaksi tulis memakai durability `strict` dengan alasan yang sama seperti penyimpanan record: kunci
 * yang hilang karena commit terakhir tidak tersimpan berarti user kehilangan akses ke datanya.
 * Perhatikan: `put`/`remove` TIDAK memakai Web Locks - yang dikunci di §5 adalah penulis RECORD
 * (`ip-writer`). Kunci per slot ditulis oleh satu alur (onboarding/rotate), bukan dua tab bersamaan.
 */
export function createWebKeyStore(options: WebKeyStoreOptions = {}): SecureKeyStore {
  const databaseName = options.databaseName ?? KEY_DATABASE_NAME

  let databasePromise: Promise<IDBPDatabase<KeyDbSchema>> | null = null

  function database(): Promise<IDBPDatabase<KeyDbSchema>> {
    // Dibuka malas: modul ini aman di-import di jalur SSR (indexedDB tidak ada di server).
    databasePromise ??= openKeyDatabase(databaseName)
    return databasePromise
  }

  async function write<T>(
    work: (tx: IDBPTransaction<KeyDbSchema, ['key_material'], 'readwrite'>) => Promise<T>,
  ): Promise<T> {
    const db = await database()
    const tx = db.transaction(MATERIAL_STORE, 'readwrite', { durability: 'strict' })
    try {
      const result = await work(tx)
      await tx.done
      return result
    } catch (error) {
      tx.abort()
      await tx.done.catch(() => undefined)
      throw error
    }
  }

  return {
    async has(slot: KeySlotLocal): Promise<boolean> {
      const db = await database()
      const key = await db.getKey(MATERIAL_STORE, slot)
      return key !== undefined
    },

    async put(slot: KeySlotLocal, material: SecureKeyMaterial): Promise<void> {
      await write(async (tx) => {
        await tx
          .objectStore(MATERIAL_STORE)
          .put({ slot, kind: material.kind, handle: material.handle })
      })
    },

    async get(slot: KeySlotLocal): Promise<SecureKeyMaterial | null> {
      const db = await database()
      const row = await db.get(MATERIAL_STORE, slot)
      if (row === undefined) return null

      return { kind: row.kind, handle: row.handle }
    },

    async remove(slot: KeySlotLocal): Promise<void> {
      await write(async (tx) => {
        await tx.objectStore(MATERIAL_STORE).delete(slot)
      })
    },
  }
}
