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
 * Sejak ADR 15 salinan lokal adalah SATU-SATUNYA salinan hidup - tidak ada server untuk menarik ulang.
 * Karena itu:
 *
 * - Kunci perangkat hilang (data situs dihapus) = record lama tidak bisa dibuka siapa pun. Record itu
 *   dibuang dan kunci baru dibuat; pemulihan hanya lewat backup/transfer.
 * - Kunci ADA tapi record tidak terbaca = TIDAK dibuang. Sesi gagal dibuka dengan
 *   `LocalDataUnreadableError` supaya user masih bisa memulihkan dari backup dan bug-nya terlihat,
 *   bukan menghapus seluruh data karena satu blob rusak.
 * - Nama database memuat `LOCAL_PROFILE_ID` (`database-names.ts`).
 *
 * Modul ini dimuat lewat `import()` dari `useLocalData`: isinya adaptor IndexedDB + kripto +
 * repository, dan rute yang tidak menyentuh data lokal tidak perlu membayarnya.
 */

export type LocalDataSession = {
  /** Profil pemilik penyimpanan ini (`LOCAL_PROFILE_ID`). */
  readonly userId: string
  readonly repos: RepositorySet
  readonly writer: RecordWriter
  /** Id perangkat yang dipakai HLC. */
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
  /** Profil pemilik data lokal ini (`LOCAL_PROFILE_ID`). Wajib. */
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
    // Salinan lokal tanpa kunci pembukanya tidak akan pernah bisa dibaca siapa pun. Dibuang lalu
    // dibuat kunci baru - jauh lebih baik daripada layar "terkunci" tanpa jalan keluar. Pemulihan
    // isinya hanya lewat backup/transfer.
    if (await hasStoredRecords(storage)) await storage.wipe()
  }

  const masterKey = hasDeviceKey
    ? await unlockMasterKeyWithDevice(keyStore)
    : await createOrAdoptMasterKey(sodium, keyStore)

  const dataKey = deriveDataKey(sodium, masterKey, userId)
  // Kunci utama tidak dibutuhkan lagi setelah kunci data diturunkan: yang disimpan di perangkat adalah
  // bungkusnya, dan kunci polos tidak perlu hidup lebih lama dari yang perlu.
  zeroKey(masterKey)

  // Record yang tidak terbaca dengan kunci yang ADA berarti korupsi atau bug format - bukan alasan
  // menghapus satu-satunya salinan. Gagal keras di sini, jangan biarkan halaman tampak kosong.
  await assertLocalCopyReadable({ storage, provider, dataKey })

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

/** Sesi ditolak karena record lokal tidak bisa dibuka dengan kunci perangkat yang ada. */
export class LocalDataUnreadableError extends Error {
  constructor() {
    super('data lokal tidak bisa dibuka dengan kunci perangkat ini')
    this.name = 'LocalDataUnreadableError'
  }
}

/**
 * Pastikan satu record sampel bisa dibuka dengan kunci sesi ini.
 *
 * Sampel diambil dari `record_index` per tipe entitas: semua tulisan lewat `RecordWriter` selalu
 * menulis baris index, jadi satu record yang ada pasti bisa ditemukan tanpa memindai seluruh tabel.
 * Hanya `openRecord` yang dibungkus `try`: ia murni kripto, jadi kegagalannya berarti blob/kunci tidak
 * cocok. Kegagalan storage dibiarkan melempar apa adanya.
 */
async function assertLocalCopyReadable(deps: {
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
    throw new LocalDataUnreadableError()
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
 * Pastikan `sync_state` punya `deviceId` (dipakai HLC). Nama tabelnya warisan sync; cursor/status di
 * dalamnya tidak dipakai lagi sejak ADR 15 dan diisi nilai awal saja.
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
