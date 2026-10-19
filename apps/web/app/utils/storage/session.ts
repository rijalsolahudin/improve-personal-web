import {
  ENTITY_TYPES,
  createHlcGenerator,
  createSystemClock,
  type Clock,
  type CryptoProvider,
  type HlcGenerator,
  type RepositorySet,
  type SecureKeyMaterial,
  type SecureKeyStore,
  type StorageAdapter,
} from '@improve-personal/core'

import { saveDeviceUnlock, unlockMasterKeyWithDevice } from '../crypto/device-slot'
import { createWebKeyStore } from '../crypto/key-store'
import { createMasterKey, deriveDataKey, zeroKey } from '../crypto/master-key'
import { createSodiumCryptoProvider } from '../crypto/provider'
import { loadSodium } from '../crypto/sodium'
import { localDatabaseNameFor } from '#shared/tech-identity'

import { createIndexedDbStorage } from './indexeddb'
import { migrateLegacyLocalDatabases } from './legacy-migration'
import {
  checkLocalDataEnvironment,
  localEnvironmentError,
  readLocalEnvironment,
  type LocalEnvironmentProbe,
} from './environment'
import { createRepositorySet } from './repository'
import { createUuidV7Generator } from './uuid'
import { createRecordWriter, type RecordWriter } from './record-writer'

/**
 * Sesi data lokal: buka kunci perangkat → kunci data → repository siap dipakai (ARCHITECTURE §5 & §7).
 *
 * Ini "shell" yang menyatukan potongan-potongan yang sudah diuji sendiri-sendiri (adaptor, kripto,
 * repository) supaya UI tidak perlu tahu urutannya.
 *
 * Tiga hal yang diputuskan di sini dan perlu diketahui pembaca:
 *
 * 0. **Penyimpanan dipisah PER AKUN, bukan per perangkat.** Nama database memuat `userId`, dan begitu
 *    juga penyimpanan kunci. Sebelum ini, satu browser = satu bak data untuk SEMUA akun: logout lalu
 *    login akun lain akan menampilkan data akun pertama (terdekripsi, di UI), karena adaptor dan pembuka
 *    kuncinya cuma diikat ke perangkat. Itu bug kerahasiaan yang nyata, dan `userId` di sini yang
 *    menutupnya - bukan sesuatu yang boleh dianggap opsional.
 * 1. **Kunci baru dibuat otomatis kalau perangkat belum punya pembuka.** Itu jalan sementara sampai
 *    onboarding T22 ada: kunci utama dibuat, dibungkus kunci perangkat, dan `isFreshKey` = true supaya
 *    UI bisa memperingatkan bahwa recovery key BELUM diatur. Selama peringatan itu ada, jangan pakai
 *    untuk data sungguhan: kalau perangkat ini hilang sebelum envelope recovery dibuat, datanya hilang
 *    - dan itu memang konsekuensi jujur dari E2EE, bukan bug.
 * 2. **`deviceId` disiapkan di `sync_state`** (dibuat sekali, lalu dipakai terus). HLC butuh id
 *    perangkat sebagai tie-break; kalau id berubah tiap sesi, urutan tulisan jadi tidak stabil antar
 *    perangkat.
 *
 * Kunci utama yang sudah diturunkan jadi kunci data langsung dikosongkan dari memori (`zeroKey`) -
 * yang hidup terus hanya kunci data, dan itu pun hanya di memori.
 */

export type LocalDataSession = {
  /** Pemilik penyimpanan ini. Ikut di sesi supaya pemanggil bisa memastikan tidak salah akun. */
  readonly userId: string
  readonly repos: RepositorySet
  readonly writer: RecordWriter
  /** True = kunci utama baru dibuat di sesi ini (recovery key belum diatur). */
  readonly isFreshKey: boolean
  /** Id perangkat yang dipakai HLC & sync. */
  readonly deviceId: string
  readonly dataKey: SecureKeyMaterial
  /**
   * Penyimpanan kunci MILIK AKUN ini (nama database memuat `userId`).
   *
   * Diberikan lewat sesi supaya tidak ada pemanggil yang membuat penyimpanan kunci sendiri dengan nama
   * default - itulah yang bikin akun B melihat passkey milik akun A.
   */
  readonly keyStore: SecureKeyStore
  readonly hlc: HlcGenerator
  readonly storage: StorageAdapter
  /** Operasi kripto (seal/open) - dipakai fitur yang butuh repository tipe tambahan. */
  readonly provider: CryptoProvider
  readonly clock: Clock
  /** Id record baru (UUIDv7). Fitur memakainya supaya id payload = id record, selalu. */
  readonly newId: () => string
  /**
   * Jalankan operasi yang MEMBUTUHKAN kunci utama (mis. membuat envelope recovery/passkey baru).
   *
   * Kunci utama sengaja tidak disimpan di sesi: yang hidup selama sesi hanya kunci data. Kunci utama
   * dibuka dari pembuka perangkat saat benar-benar dipakai, lalu langsung dikosongkan (`zeroKey`) -
   * jadi jendela waktu kunci polos ada di memori sekecil mungkin.
   */
  readonly withMasterKey: <T>(work: (masterKey: Uint8Array) => Promise<T>) => Promise<T>
}

/**
 * Slot pembuka perangkat kosong, tapi penyimpanan sudah berisi data.
 *
 * Ini kondisi yang HARUS berhenti di sini: membuat kunci utama baru berarti kunci data baru, dan data
 * lama (yang terenkripsi kunci lama) tidak akan pernah bisa dibuka lagi - user melihat aplikasi kosong
 * dan kehilangan datanya tanpa satu error pun. Pemulihannya harus lewat passkey, recovery key, atau QR
 * dari perangkat lain.
 */
export class LocalKeyMissingError extends Error {
  constructor() {
    super(
      'pembuka perangkat tidak ada sementara data sudah tersimpan: pulihkan lewat passkey, recovery key, atau QR dari perangkat lain',
    )
    this.name = 'LocalKeyMissingError'
  }
}

export type OpenSessionOptions = {
  /** Pemilik data lokal ini (`user.id` dari sesi server). Wajib - lihat catatan 0 di atas. */
  readonly userId: string
  readonly clock?: Clock
  /** Nama database record & nama database kunci; dipisah supaya test bisa mengisolasinya. */
  readonly databaseName?: string
  readonly keysDatabaseName?: string
  /**
   * Syarat lingkungan. Default: dibaca dari global.
   *
   * Disuntik di test karena runtime test (node) memang tidak punya `isSecureContext`/`navigator.locks` -
   * dan yang diuji di sana adalah perilaku penyimpanan, bukan kelengkapan browser.
   */
  readonly environment?: LocalEnvironmentProbe
}

const USER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * `userId` WAJIB UUID dari sesi server.
 *
 * Nilainya masuk ke nama database, jadi nilai bebas di situ adalah cara paling halus membuat dua akun
 * berbagi satu bak data - atau satu akun punya beberapa bak - tanpa ada yang sadar. Ditolak dengan pesan
 * jelas, bukan dibersihkan diam-diam.
 */
export function assertUserId(userId: string): string {
  if (!USER_ID_PATTERN.test(userId)) {
    throw new Error(
      'userId harus UUID dari sesi server: penyimpanan lokal tidak boleh dibuka tanpa akun yang jelas',
    )
  }

  return userId.toLowerCase()
}

/** Nama database record milik satu akun (prefix netral: lihat `shared/tech-identity.ts`). */
export function localDatabaseName(userId: string): string {
  return localDatabaseNameFor(assertUserId(userId))
}

/** Nama database kunci milik satu akun (pembuka perangkat juga dipisah per akun). */
export function keyDatabaseName(userId: string): string {
  return localDatabaseNameFor(assertUserId(userId), 'keys')
}

export async function openLocalDataSession(options: OpenSessionOptions): Promise<LocalDataSession> {
  // Diperiksa LEBIH DULU: kalau syaratnya kurang, kegagalannya nanti muncul sebagai error acak di
  // tengah pembuatan kunci - dan user hanya melihat aplikasi kosong tanpa sebab.
  const environment = checkLocalDataEnvironment(options.environment ?? readLocalEnvironment())
  if (!environment.ok) throw localEnvironmentError(environment.problems)

  const clock = options.clock ?? createSystemClock()
  const sodium = await loadSodium()
  const userId = assertUserId(options.userId)

  // Migrasi nama lama HANYA di jalur nyata: kalau nama database di-override (test/tool), pemanggilnya
  // sengaja ingin menyentuh nama tertentu - termasuk saat mensimulasikan data versi lama.
  if (options.databaseName === undefined && options.keysDatabaseName === undefined) {
    await migrateLegacyLocalDatabases(userId)
  }

  const storage = createIndexedDbStorage({
    clock,
    databaseName: options.databaseName ?? localDatabaseName(userId),
  })
  const keyStore = createWebKeyStore({
    databaseName: options.keysDatabaseName ?? keyDatabaseName(userId),
  })
  const provider = await createSodiumCryptoProvider()

  const isFreshKey = !(await keyStore.has('device'))

  if (isFreshKey && (await hasStoredRecords(storage))) throw new LocalKeyMissingError()

  const masterKey = isFreshKey ? createMasterKey(sodium) : await unlockMasterKeyWithDevice(keyStore)

  if (isFreshKey) await saveDeviceUnlock(keyStore, masterKey)

  const dataKey = deriveDataKey(sodium, masterKey)
  // Kunci utama tidak dibutuhkan lagi setelah kunci data diturunkan: yang disimpan di perangkat adalah
  // bungkusnya, dan kunci polos tidak perlu hidup lebih lama dari yang perlu.
  zeroKey(masterKey)

  const deviceId = await ensureDeviceId(storage, clock)
  const hlc = createHlcGenerator({ deviceId, clock })

  return {
    userId,
    keyStore,
    storage,
    provider,
    clock,
    dataKey,
    hlc,
    deviceId,
    isFreshKey,
    newId: createUuidV7Generator({ clock }),
    withMasterKey: async <T>(work: (masterKey: Uint8Array) => Promise<T>): Promise<T> => {
      const masterKey = await unlockMasterKeyWithDevice(keyStore)

      try {
        return await work(masterKey)
      } finally {
        zeroKey(masterKey)
      }
    },
    repos: createRepositorySet({ storage, provider, dataKey }),
    writer: createRecordWriter({ storage, provider, dataKey, hlc, clock }),
  }
}

/**
 * Apakah penyimpanan sudah berisi record - dipakai untuk MENOLAK pembuatan kunci utama baru.
 *
 * Port `StorageAdapter` sengaja tidak punya "hitung semua record" (menambahkannya berarti mengubah
 * kontrak bersama yang juga dipegang adapter mobile). Yang tersedia adalah index per tipe, jadi tipe
 * entitas diperiksa satu per satu: 20 pembacaan index kecil, sekali per sesi, dan hasilnya hanya
 * dipakai saat slot pembuka perangkat kosong.
 */
async function hasStoredRecords(storage: StorageAdapter): Promise<boolean> {
  for (const type of ENTITY_TYPES) {
    if ((await storage.listIndexByType(type)).length > 0) return true
  }

  return false
}

/**
 * Pastikan `sync_state` punya `deviceId`.
 *
 * Cursor/status diisi nilai awal yang jujur: `cursor: 0` (belum pernah pull) dan `offline` (belum ada
 * sync sama sekali) - bukan `synced`, yang akan membuat UI berbohong ke user.
 */
async function ensureDeviceId(storage: StorageAdapter, clock: Clock): Promise<string> {
  const existing = await storage.getSyncState()
  if (existing !== null && existing.deviceId !== '') return existing.deviceId

  const deviceId = createUuidV7Generator({ clock })()

  await storage.putSyncState({
    deviceId,
    cursor: existing?.cursor ?? 0,
    status: existing?.status ?? 'offline',
    lastPullAtMs: existing?.lastPullAtMs ?? null,
    lastPushAtMs: existing?.lastPushAtMs ?? null,
  })

  return deviceId
}
