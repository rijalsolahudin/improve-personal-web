import { openDB, type IDBPDatabase } from 'idb'

import type { BackupKdfParams } from '@improve-personal/core'

import { TECH_IDENTITY } from '#shared/tech-identity'

import type { BackupKey } from '../crypto/backup-cipher'
import {
  createDeviceWrappingKey,
  unwrapMasterKeyWithDevice,
  wrapMasterKeyWithDevice,
} from '../crypto/device-slot'

/**
 * Konfigurasi backup Google Drive di perangkat ini (T29).
 *
 * Kata sandi backup TIDAK disimpan. Yang disimpan adalah kunci backup hasil Argon2id, dibungkus
 * kunci perangkat AES-KW yang non-extractable (pola yang sama dengan kunci utama, `device-slot.ts`;
 * kunci backup juga 32 byte). Penyerang yang menyalin IndexedDB hanya mendapat handle `CryptoKey`
 * yang tidak bisa diekspor. Parameter KDF + salt ikut disimpan supaya berkas yang dibuat dengan kunci
 * ini tetap dibuka dengan kata sandi yang sama di perangkat lain.
 *
 * Database sendiri (bukan database record): import "ganti semua" mengosongkan record, tapi tidak
 * boleh memutus backup Drive.
 */

export type DriveSchedule = 'daily' | 'weekly'

export const DRIVE_SCHEDULE_MS: Record<DriveSchedule, number> = {
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
}

type DriveConfigRow = {
  readonly id: 'drive'
  readonly wrappingKey: CryptoKey
  readonly wrappedKey: Uint8Array
  readonly kdf: BackupKdfParams
  readonly schedule: DriveSchedule
  readonly lastBackupAtMs: number | null
}

/** Bagian konfigurasi yang aman ditampilkan UI (tanpa bahan kunci). */
export type DriveConfigSummary = {
  readonly schedule: DriveSchedule
  readonly lastBackupAtMs: number | null
}

type DriveDbSchema = { config: { key: 'drive'; value: DriveConfigRow } }

const STORE = 'config'
const ROW_ID = 'drive'

let databasePromise: Promise<IDBPDatabase<DriveDbSchema>> | null = null

function database(): Promise<IDBPDatabase<DriveDbSchema>> {
  databasePromise ??= openDB<DriveDbSchema>(TECH_IDENTITY.driveDatabaseName, 1, {
    upgrade(db) {
      db.createObjectStore(STORE, { keyPath: 'id' })
    },
  })
  return databasePromise
}

async function readRow(): Promise<DriveConfigRow | null> {
  return (await (await database()).get(STORE, ROW_ID)) ?? null
}

export async function loadDriveConfig(): Promise<DriveConfigSummary | null> {
  const row = await readRow()
  return row === null ? null : { schedule: row.schedule, lastBackupAtMs: row.lastBackupAtMs }
}

/** Simpan sambungan baru (menimpa yang lama - sambung ulang = kata sandi/kunci baru). */
export async function saveDriveConfig(
  backupKey: BackupKey,
  schedule: DriveSchedule,
): Promise<void> {
  const wrappingKey = await createDeviceWrappingKey()
  const wrappedKey = await wrapMasterKeyWithDevice(backupKey.key, wrappingKey)
  await (
    await database()
  ).put(STORE, {
    id: ROW_ID,
    wrappingKey,
    wrappedKey,
    kdf: { ...backupKey.kdf },
    schedule,
    lastBackupAtMs: null,
  })
}

export async function updateDriveConfig(
  patch: Partial<Pick<DriveConfigRow, 'schedule' | 'lastBackupAtMs'>>,
): Promise<void> {
  const row = await readRow()
  if (row === null) return
  await (await database()).put(STORE, { ...row, ...patch })
}

/** Buka kunci backup untuk satu unggahan. Pemanggil wajib `memzero` hasilnya setelah dipakai. */
export async function unlockDriveBackupKey(): Promise<BackupKey | null> {
  const row = await readRow()
  if (row === null) return null
  const key = await unwrapMasterKeyWithDevice(row.wrappedKey, row.wrappingKey)
  return { key, kdf: row.kdf }
}

export async function clearDriveConfig(): Promise<void> {
  await (await database()).delete(STORE, ROW_ID)
}
