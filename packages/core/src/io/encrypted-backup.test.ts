import { describe, expect, it } from 'vitest'

import {
  BACKUP_KDF_LIMITS,
  EncryptedBackupError,
  backupPasswordStrength,
  checkBackupPassword,
  encryptedBackupFileName,
  parseEncryptedBackupHeader,
  serializeEncryptedBackupHeader,
  type EncryptedBackupHeader,
} from './encrypted-backup.ts'

const header: EncryptedBackupHeader = {
  format: 'ip-backup-enc',
  version: 1,
  kdf: { alg: 'argon2id13', opslimit: 3, memlimit: 268435456, salt: 'AAAAAAAAAAAAAAAAAAAAAA==' },
  createdAtMs: 1_790_000_000_000,
}

function reasonOf(run: () => unknown): string {
  try {
    run()
  } catch (error) {
    if (error instanceof EncryptedBackupError) return error.reason
    throw error
  }
  throw new Error('tidak melempar')
}

describe('header berkas terenkripsi', () => {
  it('bolak-balik; `format` selalu di depan (dipakai untuk mengenali berkas)', () => {
    const line = serializeEncryptedBackupHeader(header)
    expect(line.startsWith('{"format":"ip-backup-enc"')).toBe(true)
    expect(parseEncryptedBackupHeader(line)).toEqual(header)
  })

  it('JSON backup biasa bukan berkas terenkripsi', () => {
    expect(reasonOf(() => parseEncryptedBackupHeader('{"format":"ip-backup"}'))).toBe(
      'NOT_ENCRYPTED_BACKUP',
    )
  })

  it('versi lebih baru ditolak dengan alasan "perbarui app"', () => {
    const newer = JSON.stringify({ ...header, version: 2 })
    expect(reasonOf(() => parseEncryptedBackupHeader(newer))).toBe('UNSUPPORTED_VERSION')
  })

  it('parameter Argon2id di luar batas (memlimit raksasa) ditolak sebelum menurunkan kunci', () => {
    const greedy = JSON.stringify({
      ...header,
      kdf: { ...header.kdf, memlimit: BACKUP_KDF_LIMITS.memMax * 4 },
    })
    expect(reasonOf(() => parseEncryptedBackupHeader(greedy))).toBe('BAD_HEADER')
  })

  it('JSON rusak atau field asing ditolak', () => {
    expect(reasonOf(() => parseEncryptedBackupHeader('{"format":"ip-backup-enc",'))).toBe(
      'BAD_HEADER',
    )
    expect(
      reasonOf(() => parseEncryptedBackupHeader(JSON.stringify({ ...header, extra: true }))),
    ).toBe('BAD_HEADER')
  })
})

describe('kata sandi backup', () => {
  it('kurang dari 12 karakter atau tidak sama dengan ketikan ulang ditolak', () => {
    expect(checkBackupPassword('pendek', 'pendek')).toEqual(['TOO_SHORT'])
    expect(checkBackupPassword('cukup-panjang-123', 'cukup-panjang-124')).toEqual(['MISMATCH'])
    expect(checkBackupPassword('cukup-panjang-123', 'cukup-panjang-123')).toEqual([])
  })

  it('panjang dihitung per karakter, bukan unit UTF-16', () => {
    expect(checkBackupPassword('🙂'.repeat(6), '🙂'.repeat(6))).toEqual(['TOO_SHORT'])
  })

  it('meter kekuatan naik dengan panjang dan ragam karakter', () => {
    expect(backupPasswordStrength('pendek')).toBe(0)
    expect(backupPasswordStrength('aaaaaaaaaaaaaaaa')).toBe(1)
    expect(backupPasswordStrength('kucingmakanikan')).toBe(1)
    expect(backupPasswordStrength('Kucing-makan-ikan-7')).toBe(4)
  })
})

it('nama berkas memakai tanggal lokal perangkat + .ipbackup', () => {
  expect(encryptedBackupFileName(Date.UTC(2026, 10, 19, 20), 'Asia/Jakarta')).toBe(
    'improve-personal-backup-2026-11-20.ipbackup',
  )
})
