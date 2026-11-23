// @vitest-environment node
//
// Berkas backup terenkripsi `ip-backup-enc` (AC T27). Yang diuji: isi kembali utuh hanya dengan kata
// sandi yang benar, dan SETIAP perubahan pada berkas (header, chunk, urutan, potongan) ditolak.
// Biaya Argon2id diturunkan di test (`FAST`) supaya suite tetap cepat; parameter produksi dikunci
// lewat test `BACKUP_KDF_DEFAULT` di bawah.
import { EncryptedBackupError, ENCRYPTED_BACKUP_CHUNK_BYTES } from '@improve-personal/core'
import { describe, expect, it } from 'vitest'

import {
  BACKUP_KDF_DEFAULT,
  decryptBackupText,
  deriveBackupKey,
  encryptBackupText,
  gunzipBytes,
  gzipBytes,
  looksLikeEncryptedBackup,
  splitEncryptedBackup,
} from './backup-cipher'
import { loadSodium } from './sodium'

const FAST = { opslimit: 1, memlimit: 8 * 1024 * 1024 }
const PASSWORD = 'kucing-oranye-tidur-7'
const CREATED_AT = 1_790_000_000_000

async function seal(text: string, password = PASSWORD): Promise<Uint8Array> {
  return encryptBackupText(await loadSodium(), text, { password, cost: FAST }, CREATED_AT)
}

async function reasonOf(work: Promise<unknown>): Promise<string> {
  try {
    await work
  } catch (error) {
    if (error instanceof EncryptedBackupError) return error.reason
    throw error
  }
  throw new Error('tidak melempar')
}

/** Isi acak (tidak terkompresi) supaya berkasnya benar-benar punya beberapa chunk. */
async function multiChunkText(sodium: Awaited<ReturnType<typeof loadSodium>>): Promise<string> {
  return sodium.to_hex(sodium.randombytes_buf(ENCRYPTED_BACKUP_CHUNK_BYTES * 3))
}

describe('round-trip', () => {
  it('kata sandi benar membuka isi yang sama persis (termasuk berkas multi-chunk)', async () => {
    const sodium = await loadSodium()
    const small = '{"format":"ip-backup","isi":"jurnal pagi ☀️"}'
    const large = await multiChunkText(sodium)

    expect(await decryptBackupText(sodium, await seal(small), PASSWORD)).toBe(small)
    expect(await decryptBackupText(sodium, await seal(large), PASSWORD)).toBe(large)
  })

  it('berkas tidak memuat plaintext; header hanya berisi format, kdf, salt, waktu', async () => {
    const file = await seal('RAHASIA-JURNAL-123')
    const text = new TextDecoder().decode(file)

    expect(text).not.toContain('RAHASIA-JURNAL-123')
    expect(JSON.parse(text.slice(0, text.indexOf('\n')))).toMatchObject({
      format: 'ip-backup-enc',
      version: 1,
      kdf: { alg: 'argon2id13', opslimit: FAST.opslimit, memlimit: FAST.memlimit },
      createdAtMs: CREATED_AT,
    })
  })

  it('kunci tersimpan (Drive terjadwal) menghasilkan berkas yang dibuka dengan kata sandi', async () => {
    const sodium = await loadSodium()
    const backupKey = deriveBackupKey(sodium, PASSWORD, FAST)
    const file = await encryptBackupText(sodium, 'isi', { backupKey }, CREATED_AT)

    expect(await decryptBackupText(sodium, file, PASSWORD)).toBe('isi')
  })

  it('kata sandi dinormalisasi NFC (é tersusun vs terurai)', async () => {
    const sodium = await loadSodium()
    const file = await seal('isi', 'café-kopi-susu')
    expect(await decryptBackupText(sodium, file, 'café-kopi-susu')).toBe('isi')
  })

  it('produksi memakai Argon2id MODERATE', () => {
    expect(BACKUP_KDF_DEFAULT).toEqual({ opslimit: 3, memlimit: 256 * 1024 * 1024 })
  })
})

describe('penolakan', () => {
  it('kata sandi salah', async () => {
    const sodium = await loadSodium()
    expect(
      await reasonOf(decryptBackupText(sodium, await seal('isi'), 'bukan-kata-sandinya')),
    ).toBe('WRONG_PASSWORD_OR_TAMPERED')
  })

  it('header diubah (biaya Argon2id diturunkan) ditolak lewat AAD', async () => {
    const sodium = await loadSodium()
    const file = await seal('isi')
    const text = new TextDecoder().decode(file)
    const newline = text.indexOf('\n')
    const header = JSON.parse(text.slice(0, newline))
    // Panjang header tetap sama supaya hanya isinya yang berubah.
    const forged = new TextEncoder().encode(
      JSON.stringify({ ...header, createdAtMs: CREATED_AT + 1 }),
    )
    const tampered = new Uint8Array(forged.length + file.length - newline)
    tampered.set(forged)
    tampered.set(file.subarray(newline), forged.length)

    expect(await reasonOf(decryptBackupText(sodium, tampered, PASSWORD))).toBe(
      'WRONG_PASSWORD_OR_TAMPERED',
    )
  })

  it('satu byte chunk diubah', async () => {
    const sodium = await loadSodium()
    const file = await seal('isi')
    const index = file.length - 5
    file.set([(file[index] ?? 0) ^ 0x01], index)
    expect(await reasonOf(decryptBackupText(sodium, file, PASSWORD))).toBe(
      'WRONG_PASSWORD_OR_TAMPERED',
    )
  })

  it('urutan chunk ditukar', async () => {
    const sodium = await loadSodium()
    const file = await seal(await multiChunkText(sodium))
    const text = new TextDecoder('latin1').decode(file)
    const bodyStart = text.indexOf('\n') + 1 + 24
    const size = ENCRYPTED_BACKUP_CHUNK_BYTES + 17
    const first = file.slice(bodyStart, bodyStart + size)
    const second = file.slice(bodyStart + size, bodyStart + size * 2)
    const swapped = file.slice()
    swapped.set(second, bodyStart)
    swapped.set(first, bodyStart + size)

    expect(await reasonOf(decryptBackupText(sodium, swapped, PASSWORD))).toBe(
      'WRONG_PASSWORD_OR_TAMPERED',
    )
  })

  it('dipotong di batas chunk -> TRUNCATED; dipotong di tengah -> ditolak', async () => {
    const sodium = await loadSodium()
    const file = await seal(await multiChunkText(sodium))
    const text = new TextDecoder('latin1').decode(file)
    const bodyStart = text.indexOf('\n') + 1 + 24
    const atBoundary = file.subarray(0, bodyStart + ENCRYPTED_BACKUP_CHUNK_BYTES + 17)

    expect(await reasonOf(decryptBackupText(sodium, atBoundary, PASSWORD))).toBe('TRUNCATED')
    expect(
      await reasonOf(decryptBackupText(sodium, file.subarray(0, file.length - 3), PASSWORD)),
    ).toBe('WRONG_PASSWORD_OR_TAMPERED')
    expect(
      await reasonOf(decryptBackupText(sodium, file.subarray(0, bodyStart - 4), PASSWORD)),
    ).toBe('TRUNCATED')
  })

  it('data disambung setelah chunk terakhir', async () => {
    const sodium = await loadSodium()
    const file = await seal('isi')
    const extended = new Uint8Array(file.length + 40)
    extended.set(file)
    expect(await reasonOf(decryptBackupText(sodium, extended, PASSWORD))).toBe(
      'WRONG_PASSWORD_OR_TAMPERED',
    )
  })
})

describe('splitEncryptedBackup', () => {
  it('JSON backup biasa dikenali sebagai bukan berkas terenkripsi', () => {
    const plain = new TextEncoder().encode('{"format":"ip-backup","version":"1.0.0"}')
    expect(looksLikeEncryptedBackup(plain)).toBe(false)
    expect(() => splitEncryptedBackup(plain)).toThrow(EncryptedBackupError)
  })

  it('header tanpa akhir baris (berkas acak berawalan sama) ditolak tanpa dibaca utuh', () => {
    const noNewline = new TextEncoder().encode(`{"format":"ip-backup-enc"${' '.repeat(5000)}`)
    expect(() => splitEncryptedBackup(noNewline)).toThrow(/Kepala berkas backup rusak/)
  })
})

describe('gzip', () => {
  it('gunzip berhenti begitu melewati batas (zip bomb)', async () => {
    const bomb = await gzipBytes(new Uint8Array(2 * 1024 * 1024))
    expect(bomb.length).toBeLessThan(10_000)
    expect(await reasonOf(gunzipBytes(bomb, 1024 * 1024))).toBe('TOO_LARGE')
    expect((await gunzipBytes(bomb)).length).toBe(2 * 1024 * 1024)
  })
})
