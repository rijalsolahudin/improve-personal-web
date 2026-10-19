// @vitest-environment node
//
// Kode cadangan tunggal + berkas terenkripsi (format "password manager" & "file encrypted" di PRD).
//
// Dua janji yang diuji di sini:
// 1. Yang disimpan user benar-benar bisa dipakai memulihkan (kode didekode -> envelope -> kunci utama).
// 2. Yang tersimpan TIDAK membocorkan rahasia dalam bentuk terbaca: berkas terenkripsi tidak memuat 24
//    kata, dan kata sandi salah / berkas diubah = gagal, bukan terbuka setengah isi.
import { describe, expect, it } from 'vitest'

import { createMasterKey } from '../crypto/master-key'
import {
  createRecoveryEnvelope,
  createRecoveryWords,
  unwrapMasterKeyWithRecovery,
} from '../crypto/recovery'
import { loadSodium } from '../crypto/sodium'
import { BACKUP_CODE_PREFIX, buildBackupCode, parseBackupCode } from './backup-code'
import {
  ENCRYPTED_BACKUP_FORMAT,
  MIN_PASSPHRASE_LENGTH,
  decryptRecoveryBackup,
  encryptRecoveryBackup,
  encryptedBackupFileName,
  parseEncryptedBackup,
  serializeEncryptedBackup,
} from './encrypted-backup'

const PASSPHRASE = 'kata-sandi-yang-cukup-panjang'

async function freshPair() {
  const sodium = await loadSodium()
  const masterKey = createMasterKey(sodium)
  const words = createRecoveryWords()
  const envelope = await createRecoveryEnvelope(masterKey, words)

  return { masterKey, words, envelope }
}

describe('kode cadangan tunggal', () => {
  it('satu baris, berprefiks, dan membawa kata + envelope', async () => {
    const { words, envelope } = await freshPair()

    const code = await buildBackupCode({ words, envelope })

    expect(code.startsWith(BACKUP_CODE_PREFIX)).toBe(true)
    expect(code).not.toContain(' ')

    const parsed = await parseBackupCode(code)
    expect(parsed.words).toBe(words)
    expect(parsed.envelope).toEqual(envelope)
  })

  it('hasil parsing benar-benar bisa memulihkan kunci utama (bukan cuma bentuk yang mirip)', async () => {
    const { masterKey, words, envelope } = await freshPair()
    const code = await buildBackupCode({ words, envelope })

    const parsed = await parseBackupCode(code)
    const recovered = await unwrapMasterKeyWithRecovery(parsed.words, parsed.envelope)

    expect(Buffer.from(recovered)).toEqual(Buffer.from(masterKey))
  })

  it('spasi/baris baru dari copy-paste tetap diterima', async () => {
    const { words, envelope } = await freshPair()
    const code = await buildBackupCode({ words, envelope })

    await expect(parseBackupCode(`  ${code}\n`)).resolves.toMatchObject({ words })
  })

  it('string asing, versi lain, atau isi rusak ditolak', async () => {
    const sodium = await loadSodium()
    const urlSafe = (value: unknown) =>
      sodium.to_base64(
        sodium.from_string(JSON.stringify(value)),
        sodium.base64_variants.URLSAFE_NO_PADDING,
      )

    await expect(parseBackupCode('bukan-kode')).rejects.toThrow(/prefiks/)

    // Base64 standar (dengan `+`, `/`, padding) bukan bentuk yang kita tulis: ditolak, bukan "hampir jalan".
    await expect(parseBackupCode(`${BACKUP_CODE_PREFIX}${btoa('{"v":1}')}`)).rejects.toThrow(
      /rusak|dikenali/,
    )

    await expect(parseBackupCode(`${BACKUP_CODE_PREFIX}${urlSafe({ v: 2 })}`)).rejects.toThrow(
      /versi atau bentuk/,
    )

    // Versi benar tapi tanpa kata/envelope yang sah.
    await expect(
      parseBackupCode(`${BACKUP_CODE_PREFIX}${urlSafe({ v: 1, words: 'terlalu pendek' })}`),
    ).rejects.toThrow(/24 kata yang sah/)
  })

  it('frasa yang tidak sah MENOLAK dibuatkan kode (salinan yang tidak berguna tidak dibuat)', async () => {
    const { envelope } = await freshPair()

    await expect(buildBackupCode({ words: 'dua kata saja ada di sini', envelope })).rejects.toThrow(
      /tidak valid/,
    )
  })
})

describe('berkas backup terenkripsi', () => {
  it('round-trip: kata sandi yang benar mengembalikan isi yang sama', async () => {
    const { words, envelope } = await freshPair()
    const code = await buildBackupCode({ words, envelope })

    const document = await encryptRecoveryBackup({
      payload: code,
      passphrase: PASSPHRASE,
      createdAtMs: 1_700_000_000_000,
    })

    expect(document.format).toBe(ENCRYPTED_BACKUP_FORMAT)
    expect(encryptedBackupFileName()).toBe('improve-personal-recovery-encrypted.json')

    const text = serializeEncryptedBackup(document)
    const parsed = parseEncryptedBackup(text)
    const opened = await decryptRecoveryBackup(parsed, PASSPHRASE)

    expect(opened).toBe(code)
    // Dan isinya benar-benar masih bisa memulihkan.
    const restored = await parseBackupCode(opened)
    expect(restored.words).toBe(words)
  })

  it('berkas terenkripsi tidak memuat 24 kata maupun potongan envelope dalam bentuk terbaca', async () => {
    const { words, envelope } = await freshPair()
    const code = await buildBackupCode({ words, envelope })

    const text = serializeEncryptedBackup(
      await encryptRecoveryBackup({ payload: code, passphrase: PASSPHRASE, createdAtMs: 1 }),
    )

    expect(text).not.toContain(words)
    expect(text).not.toContain(words.split(' ')[0] ?? 'x')
    expect(text).not.toContain(envelope.wrappedKey)
    expect(text).not.toContain(BACKUP_CODE_PREFIX)
  })

  it('kata sandi salah dan berkas yang diubah sama-sama ditolak', async () => {
    const { words, envelope } = await freshPair()
    const code = await buildBackupCode({ words, envelope })
    const document = await encryptRecoveryBackup({
      payload: code,
      passphrase: PASSPHRASE,
      createdAtMs: 1,
    })

    await expect(decryptRecoveryBackup(document, `${PASSPHRASE}-salah`)).rejects.toThrow(
      /kata sandi salah/,
    )

    const raw = Buffer.from(document.blob, 'base64')
    raw[raw.length - 1] = (raw.at(-1) ?? 0) ^ 0xff
    await expect(
      decryptRecoveryBackup({ ...document, blob: raw.toString('base64') }, PASSPHRASE),
    ).rejects.toThrow(/kata sandi salah/)
  })

  it('huruf besar/kecil dihitung (tidak dinormalkan diam-diam)', async () => {
    const { words, envelope } = await freshPair()
    const document = await encryptRecoveryBackup({
      payload: await buildBackupCode({ words, envelope }),
      passphrase: PASSPHRASE,
      createdAtMs: 1,
    })

    await expect(decryptRecoveryBackup(document, PASSPHRASE.toUpperCase())).rejects.toThrow(
      /kata sandi salah/,
    )
  })

  it('kata sandi terlalu pendek ditolak SEBELUM berkas dibuat', async () => {
    await expect(
      encryptRecoveryBackup({ payload: 'apa saja', passphrase: '1234', createdAtMs: 1 }),
    ).rejects.toThrow(new RegExp(String(MIN_PASSPHRASE_LENGTH)))

    await expect(
      encryptRecoveryBackup({ payload: 'apa saja', passphrase: '            ', createdAtMs: 1 }),
    ).rejects.toThrow(/minimal/)
  })

  it('berkas dengan format/isi asing ditolak sebelum KDF dijalankan', async () => {
    expect(() => parseEncryptedBackup('bukan json')).toThrow(/bukan JSON/)
    expect(() =>
      parseEncryptedBackup(JSON.stringify({ format: 'aplikasi-lain', version: 1 })),
    ).toThrow(/tidak dikenali/)
  })
})
