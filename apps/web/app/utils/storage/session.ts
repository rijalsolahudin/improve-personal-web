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
  type StoredRecord,
  type StorageAdapter,
} from '@improve-personal/core'

import {
  DeviceSlotOccupiedError,
  saveDeviceUnlock,
  unlockMasterKeyWithDevice,
} from '../crypto/device-slot'
import { createWebKeyStore } from '../crypto/key-store'
import { createMasterKey, deriveDataKey, zeroKey } from '../crypto/master-key'
import { createSodiumCryptoProvider } from '../crypto/provider'
import { loadSodium, type SodiumModule } from '../crypto/sodium'

import {
  assertUserId,
  hasStoredRecords,
  keyDatabaseName,
  localDatabaseName,
} from './database-names'
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
 * Sesi data lokal: buka kunci PERANGKAT → kunci data → repository siap dipakai.
 *
 * Kunci di sini hanya melindungi salinan lokal (IndexedDB). Data yang disinkronkan disegel server
 * dengan kunci milik server dari env, jadi:
 *
 * - Tidak ada passkey/recovery/QR: login = akses data. Perangkat baru cukup pull.
 * - Kunci perangkat hilang (data situs dihapus) BUKAN kehilangan data: salinan lokal yang tidak bisa
 *   dibuka dibuang, kunci baru dibuat, lalu sync menarik ulang semuanya dari server.
 * - Penyimpanan tetap dipisah PER AKUN (`userId` di nama database). Tanpa itu, satu browser = satu bak
 *   data untuk semua akun.
 *
 * Modul ini dimuat lewat `import()` dari `useLocalData`: isinya adaptor IndexedDB + kripto +
 * repository, dan rute yang tidak menyentuh data lokal tidak perlu membayarnya.
 */

export type LocalDataSession = {
  /** Pemilik penyimpanan ini. Ikut di sesi supaya pemanggil bisa memastikan tidak salah akun. */
  readonly userId: string
  readonly repos: RepositorySet
  readonly writer: RecordWriter
  /** Id perangkat yang dipakai HLC & sync. */
  readonly deviceId: string
  readonly dataKey: SecureKeyMaterial
  readonly hlc: HlcGenerator
  readonly storage: StorageAdapter
  /** Operasi kripto lokal (seal/open blob di IndexedDB). */
  readonly provider: CryptoProvider
  readonly clock: Clock
  /** Id record baru (UUIDv7). Fitur memakainya supaya id payload = id record, selalu. */
  readonly newId: () => string
}

export type OpenSessionOptions = {
  /** Pemilik data lokal ini (`user.id` dari sesi server). Wajib. */
  readonly userId: string
  readonly clock?: Clock
  /** Nama database record & nama database kunci; dipisah supaya test bisa mengisolasinya. */
  readonly databaseName?: string
  readonly keysDatabaseName?: string
  /** Syarat lingkungan. Disuntik di test karena runtime test tidak punya `isSecureContext`. */
  readonly environment?: LocalEnvironmentProbe
}

export async function openLocalDataSession(options: OpenSessionOptions): Promise<LocalDataSession> {
  // Diperiksa LEBIH DULU: kalau syaratnya kurang, kegagalannya nanti muncul sebagai error acak di
  // tengah pembuatan kunci.
  const environment = checkLocalDataEnvironment(options.environment ?? readLocalEnvironment())
  if (!environment.ok) throw localEnvironmentError(environment.problems)

  const clock = options.clock ?? createSystemClock()
  const sodium = await loadSodium()
  const userId = assertUserId(options.userId)

  // Migrasi nama lama HANYA di jalur nyata: kalau nama database di-override (test/tool), pemanggilnya
  // sengaja ingin menyentuh nama tertentu.
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

  const hasDeviceKey = await keyStore.has('device')

  if (!hasDeviceKey) {
    // Salinan lokal tanpa kunci pembukanya tidak akan pernah bisa dibaca. Server adalah sumber
    // kebenaran, jadi dibuang lalu dibuat kunci baru - jauh lebih baik daripada menampilkan layar
    // "terkunci" yang tidak punya jalan keluar.
    if (await hasStoredRecords(storage)) await storage.wipe()
  }

  const masterKey = hasDeviceKey
    ? await unlockMasterKeyWithDevice(keyStore)
    : await createOrAdoptMasterKey(sodium, keyStore)

  const dataKey = deriveDataKey(sodium, masterKey, userId)
  // Kunci utama tidak dibutuhkan lagi setelah kunci data diturunkan: yang disimpan di perangkat adalah
  // bungkusnya, dan kunci polos tidak perlu hidup lebih lama dari yang perlu.
  zeroKey(masterKey)

  // Salinan lokal bisa dibuat kunci/format lama (mis. setelah upgrade). Kalau satu record saja tidak
  // bisa dibuka, seluruh salinan lokal tidak bisa dipercaya: server sumber kebenaran, jadi dibuang
  // lalu full pull. Tanpa ini repository melempar `RecordKeyError` dan halaman tampak kosong.
  await discardUnreadableLocalCopy({ storage, provider, dataKey })

  const deviceId = await ensureDeviceId(storage, clock)
  const hlc = createHlcGenerator({ deviceId, clock })

  return {
    userId,
    storage,
    provider,
    clock,
    dataKey,
    hlc,
    deviceId,
    newId: createUuidV7Generator({ clock }),
    repos: createRepositorySet({ storage, provider, dataKey }),
    writer: createRecordWriter({ storage, provider, dataKey, hlc, clock }),
  }
}

/**
 * Buat kunci perangkat baru - atau pakai kunci yang baru saja disimpan tab lain.
 *
 * Pemeriksaan slot di atas hanya petunjuk: di antara pemeriksaan itu dan penyimpanan, tab lain bisa
 * lebih dulu menyimpan kuncinya. Yang menentukan adalah `saveDeviceUnlock`, yang memeriksa ulang di
 * bawah lock. Kandidat yang kalah belum pernah dipakai menyegel apa pun (sesi belum dikembalikan),
 * jadi aman dibuang.
 */
async function createOrAdoptMasterKey(
  sodium: SodiumModule,
  keyStore: SecureKeyStore,
): Promise<Uint8Array> {
  const candidate = createMasterKey(sodium)

  try {
    await saveDeviceUnlock(keyStore, candidate)
    return candidate
  } catch (error) {
    zeroKey(candidate)
    if (!(error instanceof DeviceSlotOccupiedError)) throw error

    return unlockMasterKeyWithDevice(keyStore)
  }
}

/**
 * Buang salinan lokal kalau ada satu record yang tidak bisa dibuka dengan kunci sesi ini.
 *
 * Kenapa di sini, bukan di setiap repository: satu blob yang tidak terbaca membuat `listAll` melempar,
 * dan halaman yang memuatnya tampak kosong/rusak - padahal data di server utuh. Server adalah sumber
 * kebenaran, jadi salinan lokal yang tidak konsisten dengan kuncinya dibuang, cursor kembali 0, lalu
 * pull mengisi ulang.
 *
 * Sampel diambil dari `record_index` per tipe entitas: semua tulisan lewat `RecordWriter` selalu
 * menulis baris index, jadi satu record yang ada pasti bisa ditemukan tanpa memindai seluruh tabel.
 * Hanya `openRecord` yang dibungkus `try`: ia murni kripto, jadi kegagalannya berarti blob/kunci tidak
 * cocok. Kegagalan storage (membaca index/record) dibiarkan melempar - bukan alasan menghapus data.
 */
async function discardUnreadableLocalCopy(deps: {
  readonly storage: StorageAdapter
  readonly provider: CryptoProvider
  readonly dataKey: SecureKeyMaterial
}): Promise<void> {
  const sample = await findSampleRecord(deps.storage)
  if (sample === null) return

  try {
    await deps.provider.openRecord({
      recordId: sample.id,
      hlc: sample.hlc,
      deleted: sample.deleted,
      dataKey: deps.dataKey,
      blob: sample.blob,
    })
  } catch {
    await deps.storage.wipe()
  }
}

async function findSampleRecord(storage: StorageAdapter): Promise<StoredRecord | null> {
  for (const type of ENTITY_TYPES) {
    const entries = await storage.listIndexByType(type)
    const recordId = entries[0]?.recordId
    if (recordId === undefined) continue

    const rows = await storage.getRecords([recordId])
    if (rows[0] !== undefined) return rows[0]
  }

  return null
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
