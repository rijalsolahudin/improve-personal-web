// @vitest-environment node
//
// Kunci utama & turunan kunci data (ARCHITECTURE §7).
//
// Yang diuji: sifat yang membuat hierarki kunci bisa dipercaya - kunci acak (bukan turunan kata sandi),
// turunan yang deterministik untuk kunci yang sama, dan yang paling penting: hasil turunannya benar-benar
// bisa dipakai membuka record yang sudah disegel `CryptoProvider`.
import { describe, expect, it } from 'vitest'

import { createSodiumCryptoProvider } from './provider'
import { assertMasterKey, createMasterKey, deriveDataKey, zeroKey } from './master-key'
import { loadSodium } from './sodium'

const RECORD_ID = '018f2c4e-0000-7000-8000-00000000000a'

describe('kunci utama', () => {
  it('32 byte acak - dua pembuatan tidak pernah sama', async () => {
    const sodium = await loadSodium()

    const first = createMasterKey(sodium)
    const second = createMasterKey(sodium)

    expect(first).toHaveLength(32)
    expect(Buffer.from(first)).not.toEqual(Buffer.from(second))
  })

  it('panjang yang salah ditolak sebelum dipakai', () => {
    expect(() => assertMasterKey(new Uint8Array(16))).toThrow(/32 byte/)
    expect(() => assertMasterKey(new Uint8Array(33))).toThrow(/32 byte/)
    expect(() => assertMasterKey(new Uint8Array(0))).toThrow(/32 byte/)
  })

  it('zeroKey benar-benar mengosongkan isi', () => {
    const bytes = new Uint8Array(32).fill(9)

    zeroKey(bytes)

    expect([...bytes]).toEqual(new Array(32).fill(0))
  })
})

describe('turunan kunci data', () => {
  it('deterministik: kunci utama yang sama selalu menghasilkan kunci data yang sama', async () => {
    const sodium = await loadSodium()
    const masterKey = createMasterKey(sodium)

    const first = deriveDataKey(sodium, masterKey)
    const second = deriveDataKey(sodium, masterKey)

    expect(first.kind).toBe('raw-32')
    expect(Buffer.from(first.handle as Uint8Array)).toEqual(
      Buffer.from(second.handle as Uint8Array),
    )
    expect((first.handle as Uint8Array).length).toBe(32)
  })

  it('kunci utama berbeda -> kunci data berbeda (tidak ada tabrakan yang diasumsikan)', async () => {
    const sodium = await loadSodium()

    const a = deriveDataKey(sodium, createMasterKey(sodium))
    const b = deriveDataKey(sodium, createMasterKey(sodium))

    expect(Buffer.from(a.handle as Uint8Array)).not.toEqual(Buffer.from(b.handle as Uint8Array))
  })

  it('kunci utama dengan panjang salah ditolak, bukan diturunkan diam-diam', async () => {
    const sodium = await loadSodium()

    expect(() => deriveDataKey(sodium, new Uint8Array(31))).toThrow(/32 byte/)
  })

  it('rantai MK -> kunci data -> record: blob yang disegel bisa dibuka lagi', async () => {
    // Inilah janji yang sebenarnya: bukan "kunci terlihat benar", tapi data yang disegel dengan kunci
    // turunan bisa dibuka lagi dari kunci utama yang sama - dan TIDAK bisa dibuka oleh kunci lain.
    const sodium = await loadSodium()
    const provider = await createSodiumCryptoProvider()
    const masterKey = createMasterKey(sodium)
    const dataKey = deriveDataKey(sodium, masterKey)

    const plaintext = JSON.stringify({ type: 'todo', schemaVersion: 1, data: { title: 'belajar' } })
    const blob = await provider.sealRecord({ recordId: RECORD_ID, dataKey, plaintext })

    // Sesi berikutnya: yang tersedia hanya kunci utama (kunci data diturunkan ulang).
    const reopened = await provider.openRecord({
      recordId: RECORD_ID,
      dataKey: deriveDataKey(sodium, masterKey),
      blob,
    })
    expect(reopened).toBe(plaintext)

    const otherKey = deriveDataKey(sodium, createMasterKey(sodium))
    await expect(
      provider.openRecord({ recordId: RECORD_ID, dataKey: otherKey, blob }),
    ).rejects.toThrow(/tidak cocok/)
  })
})
