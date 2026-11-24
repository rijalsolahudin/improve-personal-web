import { openDB, type IDBPDatabase } from 'idb'

import { TECH_IDENTITY } from '#shared/tech-identity'

/**
 * Device Sign Key (ADR 17, ARCHITECTURE.md §7): keypair Ed25519 per perangkat untuk challenge-auth
 * relay sync. Public key dikirim ke server saat aktivasi lisensi; private key TIDAK PERNAH keluar.
 *
 * - Private key dibuat **non-extractable** (WebCrypto): `CryptoKey` disimpan apa adanya di IndexedDB,
 *   byte-nya tidak bisa dibaca bahkan oleh skrip yang punya akses ke database - hanya bisa dipakai
 *   `sign`. Sama seperti kunci pembuka perangkat (`device-slot.ts`).
 * - Database SENDIRI, terpisah dari database kunci data dan penyimpanan record (alasannya sama dengan
 *   `key-store.ts`): import "ganti semua" atau reset kunci data tidak boleh ikut menghapus identitas
 *   perangkat di server.
 * - Verifikasi/tanda tangan memakai WebCrypto Ed25519, bukan libsodium: gerbang lisensi sudah memakai
 *   WebCrypto Ed25519 (`utils/license/token.ts`), dan libsodium (~190 KB gzip) tidak boleh ikut ke jalur
 *   aktivasi.
 */

const DATABASE_VERSION = 1
const STORE = 'sign_key'
const RECORD_ID = 'device'

/** Panjang public key Ed25519 mentah (byte) - sama dengan `DEVICE_SIGN_PUBLIC_KEY_BYTES` di kontrak. */
const PUBLIC_KEY_BYTES = 32

type SignKeyRow = {
  readonly id: typeof RECORD_ID
  readonly privateKey: CryptoKey
  /** Public key mentah, base64 standar - bentuk yang dikirim ke server. */
  readonly publicKey: string
}

type SignKeyDb = { sign_key: { key: string; value: SignKeyRow } }

export type DeviceSignKeyOptions = {
  /** Test memakai nama unik supaya tiap kasus mulai dari kondisi kosong. */
  readonly databaseName?: string
}

function openSignKeyDatabase(databaseName: string): Promise<IDBPDatabase<SignKeyDb>> {
  return openDB<SignKeyDb>(databaseName, DATABASE_VERSION, {
    upgrade(database) {
      database.createObjectStore(STORE, { keyPath: 'id' })
    },
  })
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function isValidRow(row: SignKeyRow | undefined): row is SignKeyRow {
  return row !== undefined && row.privateKey.extractable === false && row.publicKey.length > 0
}

/**
 * Public key Device Sign Key perangkat ini (base64), membuat keypair bila belum ada.
 *
 * Melempar kalau browser tidak mendukung Ed25519 non-extractable atau IndexedDB tidak tersedia -
 * pemanggil memutuskan apakah itu fatal (aktivasi lisensi: tidak). Cek-lalu-tulis dilakukan di dalam
 * SATU transaksi `readwrite`, jadi dua tab yang membuka bersamaan tidak saling menimpa kunci: yang
 * kedua melihat kunci tab pertama dan membuang keypair-nya sendiri.
 */
export async function ensureDeviceSignPublicKey(
  options: DeviceSignKeyOptions = {},
): Promise<string> {
  const db = await openSignKeyDatabase(options.databaseName ?? TECH_IDENTITY.deviceSignDatabaseName)

  try {
    const existing = await db.get(STORE, RECORD_ID)
    if (isValidRow(existing)) return existing.publicKey

    const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, false, ['sign', 'verify'])
    const publicKeyBytes = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))
    if (publicKeyBytes.length !== PUBLIC_KEY_BYTES) {
      throw new Error('public key Ed25519 tidak 32 byte')
    }
    const created: SignKeyRow = {
      id: RECORD_ID,
      privateKey: pair.privateKey,
      publicKey: bytesToBase64(publicKeyBytes),
    }

    const tx = db.transaction(STORE, 'readwrite', { durability: 'strict' })
    const winner = await tx.store.get(RECORD_ID)
    const stored = isValidRow(winner) ? winner : created
    if (stored === created) await tx.store.put(created)
    await tx.done

    return stored.publicKey
  } finally {
    db.close()
  }
}
