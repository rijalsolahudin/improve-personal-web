import type { EntityType, StorageAdapter } from '@improve-personal/core'

import { TECH_IDENTITY } from '#shared/tech-identity'

/**
 * Pengingat backup di Daily (PRD F15 "Pengingat", AC T28).
 *
 * - Belum pernah backup, atau backup terakhir > 7 hari -> pengingat tampil.
 * - Bisa DITUNDA (sehari), tapi tidak bisa dimatikan permanen: data hanya ada di perangkat ini,
 *   jadi diam selamanya sama dengan membiarkan user kehilangan data tanpa peringatan.
 * - Browser menolak `persist()` -> pengingat versi tegas (data bisa dihapus browser).
 *
 * - Perangkat kosong yang belum memilih jalur -> layar awal "Mulai baru / Pulihkan dari backup".
 *
 * Yang disimpan di localStorage hanya timestamp (bukan data user, bukan rahasia).
 */

export const BACKUP_STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000
export const BACKUP_SNOOZE_MS = 24 * 60 * 60 * 1000

export const BACKUP_LAST_AT_KEY = `${TECH_IDENTITY.storagePrefix}backup-last-at`
export const BACKUP_SNOOZE_UNTIL_KEY = `${TECH_IDENTITY.storagePrefix}backup-snooze-until`
/** Diisi saat user memilih jalur di layar awal ("Mulai baru" / "Pulihkan"). */
export const ONBOARDED_AT_KEY = `${TECH_IDENTITY.storagePrefix}onboarded-at`

/**
 * Tipe yang dibuat user sendiri. Preferensi, kategori bawaan, dsb. tidak dihitung: semuanya bisa
 * terisi otomatis di perangkat baru, padahal user belum menulis apa pun.
 */
const OWN_CONTENT_TYPES: readonly EntityType[] = [
  'schedule',
  'todo',
  'countdown',
  'habit',
  'journal_entry',
  'goal',
]

/**
 * Apakah perangkat ini sudah berisi tulisan user. Cukup membaca index (tanpa dekripsi) dan berhenti
 * di tipe pertama yang berisi - murah walau datanya banyak.
 */
export async function hasOwnContent(storage: StorageAdapter): Promise<boolean> {
  for (const type of OWN_CONTENT_TYPES) {
    const entries = await storage.listIndexByType(type)
    if (entries.length > 0) return true
  }
  return false
}

/**
 * `welcome` = layar awal perangkat kosong: pilih "Mulai baru" atau "Pulihkan dari backup".
 * `drive`   = backup Google Drive terjadwal sudah lewat (token Google tidak disimpan, jadi butuh
 *             satu ketukan user).
 */
export type BackupReminderLevel = 'none' | 'welcome' | 'drive' | 'gentle' | 'urgent'

export type BackupReminderInput = {
  readonly lastBackupAtMs: number | null
  readonly snoozedUntilMs: number | null
  readonly nowMs: number
  /** `false` = browser menolak penyimpanan permanen; `null` = belum diketahui/tidak didukung. */
  readonly isPersisted: boolean | null
  /** Perangkat kosong yang belum memilih jalur di layar awal. */
  readonly needsOnboarding: boolean
  /** Google Drive tersambung dan jadwalnya sudah lewat. */
  readonly isDriveDue: boolean
}

export function backupReminderLevel(input: BackupReminderInput): BackupReminderLevel {
  if (input.needsOnboarding) return 'welcome'
  if (input.snoozedUntilMs !== null && input.nowMs < input.snoozedUntilMs) return 'none'
  if (input.isDriveDue) return 'drive'
  const isStale =
    input.lastBackupAtMs === null || input.nowMs - input.lastBackupAtMs > BACKUP_STALE_AFTER_MS
  if (!isStale) return 'none'
  return input.isPersisted === false ? 'urgent' : 'gentle'
}

/** Hari utuh sejak backup terakhir; `null` = belum pernah. */
export function daysSinceBackup(lastBackupAtMs: number | null, nowMs: number): number | null {
  if (lastBackupAtMs === null) return null
  return Math.max(0, Math.floor((nowMs - lastBackupAtMs) / (24 * 60 * 60 * 1000)))
}

/** Baca timestamp; nilai rusak/asing dianggap tidak ada, bukan dilempar. */
export function readTimestamp(key: string, storage: Storage = localStorage): number | null {
  try {
    const raw = storage.getItem(key)
    if (raw === null) return null
    const value = Number(raw)
    return Number.isSafeInteger(value) && value > 0 ? value : null
  } catch {
    return null
  }
}

/** Tulis timestamp. Storage penuh/diblokir hanya membuat pengingat muncul lagi - tidak fatal. */
export function writeTimestamp(key: string, value: number, storage: Storage = localStorage): void {
  try {
    storage.setItem(key, String(value))
  } catch {
    // Mode privat / kuota habis: pengingat akan muncul lagi, itu sisi yang aman.
  }
}
