import { RECORD_PAYLOAD_MAX_BYTES } from '@improve-personal/contracts'
import { describe, expect, it } from 'vitest'

import {
  RECORD_CIPHER_HEADER_BYTES,
  RECORD_CIPHER_MAGIC,
  RECORD_KEY_BYTES,
  RecordCipherError,
  createRecordCipher,
  parseRecordEncryptionKeyring,
} from './record-crypto'

const KEY_A = Buffer.alloc(RECORD_KEY_BYTES, 1).toString('base64')
const KEY_B = Buffer.alloc(RECORD_KEY_BYTES, 2).toString('base64')

const ROW = {
  userId: '018f2c4e-0000-7000-8000-000000000001',
  recordId: '018f2c4e-0000-7000-8000-000000000002',
  hlc: '1700000000000-0-devicea',
  deleted: false,
  payload: { type: 'todo', schemaVersion: 1, data: { title: 'rahasia' } },
}

function cipherOf(keys = `1:${KEY_A}`, activeVersion = 1) {
  return createRecordCipher({
    keys: parseRecordEncryptionKeyring(keys),
    activeVersion,
  })
}

describe('parseRecordEncryptionKeyring', () => {
  it('menerima satu atau beberapa versi kunci', () => {
    expect([...parseRecordEncryptionKeyring(`1:${KEY_A}`).keys()]).toEqual([1])
    expect([...parseRecordEncryptionKeyring(`1:${KEY_A}, 2:${KEY_B}`).keys()]).toEqual([1, 2])
  })

  it('menolak keyring kosong, format salah, versi duplikat, dan kunci bukan 32 byte', () => {
    for (const invalid of ['', ' ', 'satu', '1', '0:' + KEY_A, '1:' + KEY_A + ',1:' + KEY_B]) {
      expect(() => parseRecordEncryptionKeyring(invalid), invalid).toThrow(RecordCipherError)
    }

    const pendek = Buffer.alloc(16, 1).toString('base64')
    expect(() => parseRecordEncryptionKeyring(`1:${pendek}`)).toThrow(RecordCipherError)
  })
})

describe('createRecordCipher', () => {
  it('seal -> open mengembalikan payload yang sama persis', () => {
    const cipher = cipherOf()
    const sealed = cipher.seal(ROW)

    expect(sealed.keyVersion).toBe(1)
    expect(sealed.blob.subarray(0, 4).toString('ascii')).toBe(RECORD_CIPHER_MAGIC)
    expect(sealed.blob.length).toBeGreaterThan(RECORD_CIPHER_HEADER_BYTES + 10)
    // Ciphertext tidak boleh memuat teks payload.
    expect(sealed.blob.toString('utf8')).not.toContain('rahasia')

    expect(
      cipher.open({
        userId: ROW.userId,
        recordId: ROW.recordId,
        hlc: ROW.hlc,
        deleted: ROW.deleted,
        blob: sealed.blob,
      }),
    ).toEqual(ROW.payload)
  })

  it('AAD mengikat user, record, hlc, dan deleted - semua perubahan membuat dekripsi gagal', () => {
    const cipher = cipherOf()
    const sealed = cipher.seal(ROW)
    const base = {
      userId: ROW.userId,
      recordId: ROW.recordId,
      hlc: ROW.hlc,
      deleted: ROW.deleted,
      blob: sealed.blob,
    }

    for (const changed of [
      { ...base, userId: '018f2c4e-0000-7000-8000-000000000009' },
      { ...base, recordId: '018f2c4e-0000-7000-8000-000000000009' },
      { ...base, hlc: '1700000000001-0-devicea' },
      { ...base, deleted: true },
    ]) {
      expect(() => cipher.open(changed)).toThrow(RecordCipherError)
    }
  })

  it('ciphertext yang diubah atau bukan format ips1 ditolak', () => {
    const cipher = cipherOf()
    const sealed = cipher.seal(ROW)

    const corrupted = Buffer.from(sealed.blob)
    corrupted[corrupted.length - 1] = (corrupted[corrupted.length - 1] ?? 0) ^ 0xff

    expect(() => cipher.open({ ...ROW, blob: corrupted })).toThrow(RecordCipherError)
    expect(() => cipher.open({ ...ROW, blob: Buffer.from('bukan-ciphertext') })).toThrow(
      RecordCipherError,
    )
  })

  it('keyring berversi: record lama tetap terbaca setelah versi aktif naik', () => {
    const lama = cipherOf(`1:${KEY_A}`, 1).seal(ROW)

    const baru = cipherOf(`1:${KEY_A},2:${KEY_B}`, 2)
    const segar = baru.seal({ ...ROW, recordId: '018f2c4e-0000-7000-8000-000000000003' })

    expect(segar.keyVersion).toBe(2)
    expect(baru.open({ ...ROW, blob: lama.blob })).toEqual(ROW.payload)
    expect(
      baru.open({
        ...ROW,
        recordId: '018f2c4e-0000-7000-8000-000000000003',
        blob: segar.blob,
      }),
    ).toEqual(ROW.payload)
  })

  it('versi kunci yang tidak ada di keyring ditolak, bukan ditebak', () => {
    const sealed = cipherOf().seal(ROW)
    const hanyaVersiDua = cipherOf(`2:${KEY_B}`, 2)

    expect(() => hanyaVersiDua.open({ ...ROW, blob: sealed.blob })).toThrow(RecordCipherError)
  })

  it('menolak payload di atas batas kontrak', () => {
    const cipher = cipherOf()

    expect(() => cipher.seal({ ...ROW, payload: 'A'.repeat(RECORD_PAYLOAD_MAX_BYTES) })).toThrow(
      RecordCipherError,
    )
  })

  it('kunci aktif wajib ada di keyring', () => {
    expect(() => cipherOf(`1:${KEY_A}`, 2)).toThrow(RecordCipherError)
  })
})
