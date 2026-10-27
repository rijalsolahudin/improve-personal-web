import { TECH_IDENTITY } from '#shared/tech-identity'

import type { SecureKeyMaterial, SecureKeyStore } from '@improve-personal/core'

import { assertMasterKey } from './master-key'

/**
 * Slot `device`: pembuka sehari-hari (ARCHITECTURE §7).
 *
 * Cara kerjanya:
 *
 *   kunci pembuka perangkat (AES-KW, NON-EXTRACTABLE, WebCrypto)
 *     └─ membungkus  ->  envelope kunci utama (disimpan LOKAL, tidak pernah ke server)
 *
 * Kenapa `AES-KW` dan bukan enkripsi biasa: KW itu "key wrapping" - dia tidak mengenkripsi data,
 * hanya membungkus kunci, dan punya pemeriksaan integritas sendiri. Hasilnya juga tanpa nonce, jadi
 * envelope-nya tidak perlu menyimpan IV.
 *
 * Kenapa kunci pembuka harus non-extractable: kalau ia bisa diekspor, seluruh gunanya hilang - siapa
 * pun yang bisa membaca IndexedDB (atau menyuntik skrip) bisa mengambil byte-nya lalu membuka kunci
 * utama kapan saja, di mesin mana saja. Dengan non-extractable, yang bocor hanya *handle* yang tidak
 * berguna tanpa izin kripto di perangkat ini.
 *
 * Envelope perangkat TIDAK dikirim ke server (dbml `key_envelopes`: "Envelope kunci perangkat TIDAK
 * pernah sampai ke sini"), dan tidak boleh dikirimkan: itu sama saja menyerahkan gembok beserta
 * kuncinya.
 */

/** Jenis bahan kunci untuk slot `device`. */
export const DEVICE_MATERIAL_KIND = 'device-aes-kw'

export type DeviceMaterialHandle = {
  readonly wrappingKey: CryptoKey
  readonly wrappedMasterKey: Uint8Array
}

export type DeviceMaterial = SecureKeyMaterial & {
  readonly kind: typeof DEVICE_MATERIAL_KIND
  readonly handle: DeviceMaterialHandle
}

/** Slot kunci pembuka perangkat. */
const DEVICE_SLOT = 'device' as const

const AES_KW = 'AES-KW'

/** Panjang kunci pembuka (bit). 256 adalah maksimum yang didukung AES-KW. */
const DEVICE_KEY_BITS = 256

/**
 * Nama Web Lock untuk "cek slot kosong -> tulis" slot `device`.
 *
 * Sengaja SATU nama untuk semua akun, bukan per akun: port `SecureKeyStore` tidak membuka nama
 * databasenya, sedangkan lock harus bernama sama di semua tab yang menyentuh database yang sama. Yang
 * dikunci hanya dua operasi IndexedDB kecil (tanpa jaringan, tanpa kripto), jadi akun lain yang
 * kebetulan menunggu hanya tertahan beberapa milidetik.
 */
const DEVICE_SLOT_LOCK_NAME = `${TECH_IDENTITY.keyDatabasePrefix}-device-slot`

/**
 * Slot `device` sudah terisi saat hendak ditulis.
 *
 * Dibuat bertipe (bukan `Error` biasa) supaya pemanggil bisa membedakan "tab lain sudah lebih dulu
 * menyimpan pembuka" - yang jalan keluarnya membuka kunci yang tersimpan - dari kegagalan sungguhan.
 */
export class DeviceSlotOccupiedError extends Error {
  constructor() {
    super(
      'slot device sudah terisi: pembuka perangkat tidak boleh ditimpa diam-diam (pakai rotasi eksplisit)',
    )
    this.name = 'DeviceSlotOccupiedError'
  }
}

/**
 * Jalankan `work` sambil memegang lock slot `device` secara eksklusif lintas tab.
 *
 * Tanpa Web Locks fungsi ini MENOLAK bekerja, sama seperti penulis record (`createWebLocksRunner`):
 * fallback "jalan tanpa lock" justru membuka lagi balapan dua tab yang membuat kunci utama berbeda.
 * `openLocalDataSession` sudah memeriksa syarat ini lebih dulu (`checkLocalDataEnvironment`), jadi di
 * jalur normal error ini tidak pernah terlihat user.
 */
async function withDeviceSlotLock<T>(work: () => Promise<T>): Promise<T> {
  // `null` juga dianggap tidak ada: sebagian runtime (mis. happy-dom) mengisi properti ini dengan null.
  const locks = globalThis.navigator?.locks
  if (locks === undefined || locks === null) {
    throw new Error(
      `Web Locks API tidak tersedia: slot device butuh lock "${DEVICE_SLOT_LOCK_NAME}" supaya dua tab tidak menyimpan kunci utama berbeda`,
    )
  }

  // Tanpa opsi: mode default Web Locks sudah `exclusive`, dan bentuk dua argumen ini sama dengan
  // penulis record - jadi stub lock di test komponen berlaku untuk keduanya.
  return locks.request(DEVICE_SLOT_LOCK_NAME, work)
}

/**
 * Salin byte ke `ArrayBuffer` baru untuk WebCrypto.
 *
 * Bukan formalitas tipe: `BufferSource` WebCrypto hanya menerima view di atas `ArrayBuffer`, sedangkan
 * `Uint8Array` bisa saja merupakan view di atas buffer bersama (`SharedArrayBuffer`) yang tidak boleh
 * dioper ke WebCrypto. Salinan kecil (32 byte) ini menghilangkan pertanyaan itu sama sekali, dan
 * membuat kode ini tidak bergantung pada dari mana byte-nya datang.
 */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(copy).set(bytes)
  return copy
}

/** Kunci pembuka baru: non-extractable (`false`), hanya boleh wrap/unwrap. */
export async function createDeviceWrappingKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: AES_KW, length: DEVICE_KEY_BITS }, false, [
    'wrapKey',
    'unwrapKey',
  ])
}

/**
 * Bungkus kunci utama.
 *
 * Kunci utama diimpor sementara sebagai kunci AES-KW yang extractable supaya bisa dibungkus - itu
 * memang syarat `wrapKey`, dan byte aslinya sudah ada di memori pada titik ini. Yang penting: kunci
 * PEMBUKA yang tidak extractable, karena dialah yang tersimpan lama di perangkat.
 */
export async function wrapMasterKeyWithDevice(
  masterKey: Uint8Array,
  wrappingKey: CryptoKey,
): Promise<Uint8Array> {
  assertMasterKey(masterKey)

  const importable = await crypto.subtle.importKey('raw', toArrayBuffer(masterKey), AES_KW, true, [
    'wrapKey',
  ])
  const wrapped = await crypto.subtle.wrapKey('raw', importable, wrappingKey, AES_KW)

  return new Uint8Array(wrapped)
}

/**
 * Buka bungkus kunci utama.
 *
 * Hasilnya byte polos - itu tidak bisa dihindari, karena libsodium butuh byte untuk menurunkan kunci
 * data. Karena itu hasilnya hanya hidup di memori, dan pemanggil bertanggung jawab membersihkannya
 * setelah kunci data diturunkan (`zeroKey`).
 */
export async function unwrapMasterKeyWithDevice(
  wrappedMasterKey: Uint8Array,
  wrappingKey: CryptoKey,
): Promise<Uint8Array> {
  const unwrapped = await crypto.subtle.unwrapKey(
    'raw',
    toArrayBuffer(wrappedMasterKey),
    wrappingKey,
    AES_KW,
    AES_KW,
    true,
    ['wrapKey'],
  )

  const masterKey = new Uint8Array(await crypto.subtle.exportKey('raw', unwrapped))
  assertMasterKey(masterKey)

  return masterKey
}

/**
 * Simpan pembuka perangkat untuk kunci utama ini.
 *
 * MENOLAK menimpa slot yang sudah terisi (`DeviceSlotOccupiedError`): menimpa berarti kunci utama lama
 * kehilangan satu-satunya pembukanya tanpa peringatan apa pun. Rotasi kunci harus jadi tindakan
 * eksplisit, bukan efek samping dari pemanggilan fungsi ini dua kali.
 *
 * Cek "slot kosong" dan penulisannya dijalankan di bawah satu Web Lock eksklusif: tanpa itu, dua tab
 * yang sama-sama melihat slot kosong akan menulis bergantian, dan tulisan terakhir diam-diam membuang
 * kunci tab lain - padahal tab itu mungkin sudah menyegel record dengan kunci tersebut. Pembungkusan
 * kunci dikerjakan SEBELUM lock diambil supaya bagian yang dikunci sependek mungkin.
 */
export async function saveDeviceUnlock(
  keyStore: SecureKeyStore,
  masterKey: Uint8Array,
): Promise<void> {
  assertMasterKey(masterKey)

  const wrappingKey = await createDeviceWrappingKey()
  const wrappedMasterKey = await wrapMasterKeyWithDevice(masterKey, wrappingKey)

  await withDeviceSlotLock(async () => {
    if (await keyStore.has(DEVICE_SLOT)) throw new DeviceSlotOccupiedError()

    await keyStore.put(DEVICE_SLOT, {
      kind: DEVICE_MATERIAL_KIND,
      handle: { wrappingKey, wrappedMasterKey },
    })
  })
}

/** Apakah perangkat ini punya pembuka (mis. untuk memutuskan menampilkan layar kunci biometrik). */
export async function hasDeviceUnlock(keyStore: SecureKeyStore): Promise<boolean> {
  return keyStore.has(DEVICE_SLOT)
}

/** Buka kunci utama lewat pembuka perangkat. Melempar kalau perangkat ini belum punya pembuka. */
export async function unlockMasterKeyWithDevice(keyStore: SecureKeyStore): Promise<Uint8Array> {
  const material = await keyStore.get(DEVICE_SLOT)

  if (material === null) {
    throw new Error(
      'perangkat ini belum punya kunci pembuka: pakai passkey, recovery key, atau QR dari perangkat lama',
    )
  }

  const { wrappingKey, wrappedMasterKey } = readDeviceHandle(material)

  return unwrapMasterKeyWithDevice(wrappedMasterKey, wrappingKey)
}

/**
 * Cabut pembuka perangkat (mis. saat user mencabut akses perangkat ini, atau membuang kunci baru yang
 * ditolak server). Di bawah lock slot yang sama dengan `saveDeviceUnlock`, supaya tidak berpapasan
 * dengan tab lain yang sedang mengisi slot.
 */
export async function removeDeviceUnlock(keyStore: SecureKeyStore): Promise<void> {
  await withDeviceSlotLock(() => keyStore.remove(DEVICE_SLOT))
}

/**
 * Baca handle dengan bentuk yang benar, atau gagal dengan pesan yang menyebut sebabnya.
 *
 * Bentuk handle divalidasi di sini - bukan di `key-store.ts` - karena hanya modul ini yang tahu arti
 * isinya. `wrappingKey` sengaja tidak diperiksa dengan `instanceof CryptoKey`: key yang sudah lewat
 * penyimpanan bisa datang dari realm berbeda, dan pemeriksaan yang salah di sini justru menolak key
 * yang sah. Yang memvalidasi key adalah WebCrypto saat dipakai.
 */
function readDeviceHandle(material: SecureKeyMaterial): DeviceMaterialHandle {
  if (material.kind !== DEVICE_MATERIAL_KIND) {
    throw new Error(`bahan kunci slot device tidak dikenal: "${material.kind}"`)
  }

  const handle = material.handle as Partial<DeviceMaterialHandle> | null

  if (
    typeof handle !== 'object' ||
    handle === null ||
    !(handle.wrappedMasterKey instanceof Uint8Array) ||
    typeof handle.wrappingKey !== 'object' ||
    handle.wrappingKey === null
  ) {
    throw new Error('bahan kunci slot device rusak: handle tidak lengkap')
  }

  return { wrappingKey: handle.wrappingKey, wrappedMasterKey: handle.wrappedMasterKey }
}
