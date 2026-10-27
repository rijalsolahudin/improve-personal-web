// @vitest-environment node
//
// Kunci utama & turunan kunci data (ARCHITECTURE §7).
//
// Yang diuji: sifat yang membuat hierarki kunci bisa dipercaya - kunci acak (bukan turunan kata sandi),
// turunan yang deterministik untuk kunci yang sama, dan yang paling penting: hasil turunannya benar-benar
// bisa dipakai membuka record yang sudah disegel `CryptoProvider`.
import { describe, expect, it } from 'vitest'

import { createSodiumCryptoProvider } from './provider'
import {
  assertMasterKey,
  createMasterKey,
  deriveDataKey,
  deriveKid,
  deriveKidWire,
  zeroKey,
} from './master-key'
import { loadSodium } from './sodium'
import { TEST_HLC, TEST_USER_ID } from '../../../tests/nuxt/record-key'

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

    const first = deriveDataKey(sodium, masterKey, TEST_USER_ID)
    const second = deriveDataKey(sodium, masterKey, TEST_USER_ID)

    expect(first.kind).toBe('raw-32')
    expect(Buffer.from(first.handle as Uint8Array)).toEqual(
      Buffer.from(second.handle as Uint8Array),
    )
    expect((first.handle as Uint8Array).length).toBe(32)
  })

  it('kunci utama berbeda -> kunci data berbeda (tidak ada tabrakan yang diasumsikan)', async () => {
    const sodium = await loadSodium()

    const a = deriveDataKey(sodium, createMasterKey(sodium), TEST_USER_ID)
    const b = deriveDataKey(sodium, createMasterKey(sodium), TEST_USER_ID)

    expect(Buffer.from(a.handle as Uint8Array)).not.toEqual(Buffer.from(b.handle as Uint8Array))
  })

  it('kunci utama dengan panjang salah ditolak, bukan diturunkan diam-diam', async () => {
    const sodium = await loadSodium()

    expect(() => deriveDataKey(sodium, new Uint8Array(31), TEST_USER_ID)).toThrow(/32 byte/)
  })

  it('rantai MK -> kunci data -> record: blob yang disegel bisa dibuka lagi', async () => {
    // Inilah janji yang sebenarnya: bukan "kunci terlihat benar", tapi data yang disegel dengan kunci
    // turunan bisa dibuka lagi dari kunci utama yang sama - dan TIDAK bisa dibuka oleh kunci lain.
    const sodium = await loadSodium()
    const provider = await createSodiumCryptoProvider()
    const masterKey = createMasterKey(sodium)
    const dataKey = deriveDataKey(sodium, masterKey, TEST_USER_ID)

    const plaintext = JSON.stringify({ type: 'todo', schemaVersion: 1, data: { title: 'belajar' } })
    const blob = await provider.sealRecord({
      recordId: RECORD_ID,
      hlc: TEST_HLC,
      deleted: false,
      dataKey,
      plaintext,
    })

    // Sesi berikutnya: yang tersedia hanya kunci utama (kunci data diturunkan ulang).
    const reopened = await provider.openRecord({
      recordId: RECORD_ID,
      hlc: TEST_HLC,
      deleted: false,
      dataKey: deriveDataKey(sodium, masterKey, TEST_USER_ID),
      blob,
    })
    expect(reopened).toBe(plaintext)

    const otherKey = deriveDataKey(sodium, createMasterKey(sodium), TEST_USER_ID)
    await expect(
      provider.openRecord({
        recordId: RECORD_ID,
        hlc: TEST_HLC,
        deleted: false,
        dataKey: otherKey,
        blob,
      }),
    ).rejects.toThrow(/tidak cocok/)
  })
})

describe('KID (identitas kunci)', () => {
  // Vektor emas dari contracts (`record-format.test.ts`): MK = byte 0..31 -> KID ini, di web DAN mobile.
  const GOLDEN_MASTER_KEY = Uint8Array.from({ length: 32 }, (_, index) => index)
  const GOLDEN_KID_HEX = '2c169354669729f5bbd7434e0885e9b4'
  const GOLDEN_KID_WIRE = 'LBaTVGaXKfW710NOCIXptA'

  it('cocok dengan vektor emas contracts', async () => {
    const sodium = await loadSodium()

    expect(sodium.to_hex(deriveKid(sodium, GOLDEN_MASTER_KEY))).toBe(GOLDEN_KID_HEX)
    expect(deriveKidWire(sodium, GOLDEN_MASTER_KEY)).toBe(GOLDEN_KID_WIRE)
  })

  it('deterministik per kunci utama, beda antar kunci, dan tidak sama dengan kunci data', async () => {
    const sodium = await loadSodium()
    const masterKey = createMasterKey(sodium)

    expect(deriveKid(sodium, masterKey)).toEqual(deriveKid(sodium, masterKey))
    expect(deriveKid(sodium, masterKey)).not.toEqual(deriveKid(sodium, createMasterKey(sodium)))
    expect(deriveKid(sodium, masterKey)).toHaveLength(16)
  })

  it('menolak kunci utama dengan panjang salah', async () => {
    const sodium = await loadSodium()

    expect(() => deriveKid(sodium, new Uint8Array(31))).toThrow(/32 byte/)
  })

  it('kunci data memuat KID & akun, jadi KID di blob = KID turunan kunci utama', async () => {
    const sodium = await loadSodium()
    const dataKey = deriveDataKey(sodium, GOLDEN_MASTER_KEY, TEST_USER_ID)

    expect(sodium.to_hex(dataKey.identity.kid)).toBe(GOLDEN_KID_HEX)
    expect(dataKey.identity.userId).toBe(TEST_USER_ID)
  })
})
