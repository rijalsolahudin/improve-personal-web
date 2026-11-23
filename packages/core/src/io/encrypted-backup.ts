import { z } from 'zod'

import { epochMsSchema } from '../domain/entities/primitives.ts'
import { localDateOf } from '../recurrence/timezone.ts'

/**
 * Berkas backup terenkripsi `ip-backup-enc` (PRD F15 "Backup", AC T27).
 *
 * Bentuk berkas (byte):
 *
 *   {"format":"ip-backup-enc",...}\n   <- header polos, satu baris JSON
 *   [24 byte header secretstream]
 *   [chunk terenkripsi]...               <- gzip(dokumen `ip-backup`), dipotong per 64 KiB
 *
 * Modul ini MURNI dan bekerja di atas STRING (core tidak memakai `TextEncoder`/`Buffer`): bentuk
 * header, aturan kata sandi, nama berkas. Pemecahan byte dan kriptonya (Argon2id +
 * `crypto_secretstream_xchacha20poly1305`) ada di shell tiap platform, karena core tidak memuat
 * libsodium. Isi yang sudah dibuka tetap divalidasi `validateBackupText` - berkas terenkripsi
 * hanya membungkus dokumen yang sama, jadi batas & migrasi import berlaku apa adanya.
 *
 * Kenapa header polos: parameter Argon2id + salt dibutuhkan SEBELUM kunci ada, dan header itu jadi
 * AAD chunk pertama - mengubah satu byte header (mis. menurunkan `opslimit`) membuat berkas ditolak.
 */

export const ENCRYPTED_BACKUP_FORMAT = 'ip-backup-enc'

/** Versi FORMAT berkas terenkripsi. Naikkan kalau susunan byte-nya berubah. */
export const ENCRYPTED_BACKUP_VERSION = 1

/** Ekstensi berkas (PRD F15): `improve-personal-backup-YYYY-MM-DD.ipbackup`. */
export const ENCRYPTED_BACKUP_EXTENSION = '.ipbackup'

/** Kata sandi backup minimal (PRD F15). Dihitung per code point, bukan per unit UTF-16. */
export const BACKUP_PASSWORD_MIN_LENGTH = 12

/** Ukuran potongan plaintext per chunk secretstream. */
export const ENCRYPTED_BACKUP_CHUNK_BYTES = 64 * 1024

/** Panjang salt Argon2id (`crypto_pwhash_SALTBYTES`). */
export const BACKUP_SALT_BYTES = 16

/**
 * Batas parameter Argon2id yang mau DIBUKA. Header berasal dari berkas, jadi berkas buatan orang lain
 * bisa meminta `memlimit` 4 GB dan membuat tab crash. Batas atas = parameter yang dipakai build ini
 * untuk menulis (MODERATE), batas bawah = minimum libsodium.
 */
export const BACKUP_KDF_LIMITS = {
  opsMin: 1,
  opsMax: 4,
  memMin: 8 * 1024,
  memMax: 256 * 1024 * 1024,
} as const

/** Batas panjang baris header: header sah ~200 byte; berkas acak ditolak tanpa dibaca utuh. */
export const ENCRYPTED_BACKUP_HEADER_MAX_BYTES = 4096

/**
 * Awal setiap berkas terenkripsi. `format` selalu kunci pertama (urutan skema), jadi awalan ini cukup
 * untuk membedakannya dari JSON backup biasa tanpa mem-parse apa pun.
 */
export const ENCRYPTED_BACKUP_PREFIX = `{"format":"${ENCRYPTED_BACKUP_FORMAT}"`

const base64Schema = z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/)

export const encryptedBackupHeaderSchema = z
  .object({
    format: z.literal(ENCRYPTED_BACKUP_FORMAT),
    version: z.literal(ENCRYPTED_BACKUP_VERSION),
    kdf: z
      .object({
        alg: z.literal('argon2id13'),
        opslimit: z.int().min(BACKUP_KDF_LIMITS.opsMin).max(BACKUP_KDF_LIMITS.opsMax),
        memlimit: z.int().min(BACKUP_KDF_LIMITS.memMin).max(BACKUP_KDF_LIMITS.memMax),
        salt: base64Schema,
      })
      .strict(),
    createdAtMs: epochMsSchema,
  })
  .strict()

export type EncryptedBackupHeader = z.infer<typeof encryptedBackupHeaderSchema>
export type BackupKdfParams = EncryptedBackupHeader['kdf']

/**
 * Alasan berkas terenkripsi ditolak. Satu kode untuk "kata sandi salah ATAU berkas diubah": dari luar
 * keduanya memang tidak bisa dibedakan (MAC gagal), dan menebak salah satunya hanya menyesatkan user.
 */
export const ENCRYPTED_BACKUP_REJECTIONS = [
  'NOT_ENCRYPTED_BACKUP',
  'UNSUPPORTED_VERSION',
  'BAD_HEADER',
  'WRONG_PASSWORD_OR_TAMPERED',
  'TRUNCATED',
  'TOO_LARGE',
] as const

export type EncryptedBackupRejection = (typeof ENCRYPTED_BACKUP_REJECTIONS)[number]

export class EncryptedBackupError extends Error {
  readonly reason: EncryptedBackupRejection

  constructor(reason: EncryptedBackupRejection) {
    super(describeEncryptedBackupRejection(reason))
    this.name = 'EncryptedBackupError'
    this.reason = reason
  }
}

/** Pesan siap tampil per alasan penolakan. */
export function describeEncryptedBackupRejection(reason: EncryptedBackupRejection): string {
  switch (reason) {
    case 'NOT_ENCRYPTED_BACKUP':
      return 'Ini bukan berkas backup terenkripsi Improve Personal.'
    case 'UNSUPPORTED_VERSION':
      return 'Berkas backup ini dibuat versi app yang lebih baru. Perbarui app lalu coba lagi.'
    case 'BAD_HEADER':
      return 'Kepala berkas backup rusak, jadi berkasnya tidak bisa dibuka.'
    case 'WRONG_PASSWORD_OR_TAMPERED':
      return 'Kata sandi salah, atau berkasnya rusak/diubah. Tidak ada data yang diubah.'
    case 'TRUNCATED':
      return 'Berkas backup terpotong (tidak lengkap). Unduh atau salin ulang berkasnya.'
    case 'TOO_LARGE':
      return 'Isi berkas backup melebihi batas ukuran import.'
  }
}

export type BackupPasswordIssue = 'TOO_SHORT' | 'MISMATCH'

/**
 * Cek kata sandi backup baru. `confirmation` wajib sama - kata sandi yang salah ketik saat dibuat
 * berarti backup yang tidak bisa dibuka siapa pun.
 */
export function checkBackupPassword(password: string, confirmation: string): BackupPasswordIssue[] {
  const issues: BackupPasswordIssue[] = []
  if ([...password].length < BACKUP_PASSWORD_MIN_LENGTH) issues.push('TOO_SHORT')
  if (password !== confirmation) issues.push('MISMATCH')
  return issues
}

/** 0 (lemah) - 4 (kuat). Heuristik ringan: panjang + ragam jenis karakter, tanpa kamus besar. */
export type BackupPasswordStrength = 0 | 1 | 2 | 3 | 4

export function backupPasswordStrength(password: string): BackupPasswordStrength {
  const length = [...password].length
  if (length < BACKUP_PASSWORD_MIN_LENGTH) return 0

  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((pattern) =>
    pattern.test(password),
  ).length
  // Satu karakter diulang ("aaaaaaaaaaaa") panjang tapi tidak menambah apa pun.
  const distinct = new Set(password).size
  if (distinct < 5) return 1

  const score = (length >= 16 ? 2 : 1) + (classes >= 3 ? 2 : classes >= 2 ? 1 : 0)
  return Math.min(4, score) as BackupPasswordStrength
}

/** Nama berkas terenkripsi: `improve-personal-backup-YYYY-MM-DD.ipbackup` (tanggal lokal). */
export function encryptedBackupFileName(createdAtMs: number, tz: string): string {
  return `improve-personal-backup-${localDateOf(createdAtMs, tz)}${ENCRYPTED_BACKUP_EXTENSION}`
}

/** Baris header persis seperti yang ditulis ke berkas DAN dipakai sebagai AAD (tanpa `\n`). */
export function serializeEncryptedBackupHeader(header: EncryptedBackupHeader): string {
  return JSON.stringify(encryptedBackupHeaderSchema.parse(header))
}

/** Baca baris header. Melempar `EncryptedBackupError` dengan alasan yang tepat. */
export function parseEncryptedBackupHeader(line: string): EncryptedBackupHeader {
  if (!line.startsWith(ENCRYPTED_BACKUP_PREFIX)) {
    throw new EncryptedBackupError('NOT_ENCRYPTED_BACKUP')
  }

  let raw: unknown
  try {
    raw = JSON.parse(line)
  } catch {
    throw new EncryptedBackupError('BAD_HEADER')
  }

  const version = (raw as { version?: unknown }).version
  if (typeof version === 'number' && version > ENCRYPTED_BACKUP_VERSION) {
    throw new EncryptedBackupError('UNSUPPORTED_VERSION')
  }

  const parsed = encryptedBackupHeaderSchema.safeParse(raw)
  if (!parsed.success) throw new EncryptedBackupError('BAD_HEADER')
  return parsed.data
}
