// @vitest-environment node
//
// `CryptoProvider` web. Yang diuji di sini bukan "libsodium jalan" (itu urusan library), tapi janji
// yang kita pegang sendiri (ARCHITECTURE §6, ADR 4):
// - round-trip plaintext utuh, termasuk teks non-ASCII,
// - `blob` benar-benar ciphertext base64, bukan plaintext yang dibungkus,
// - AAD = `recordId` mengikat blob ke record-nya,
// - kunci/AAD salah dan blob rusak = GAGAL, bukan terbuka dengan isi yang salah atau kosong.
import { beforeEach, describe, expect, it } from 'vitest'

import type { CryptoProvider } from '@improve-personal/core'

import { createSodiumCryptoProvider, rawDataKeyMaterial } from './provider'

const RECORD_ID = '018f2c4e-0000-7000-8000-000000000001'

function keyOf(fill: number): Uint8Array {
  return new Uint8Array(32).fill(fill)
}

let provider: CryptoProvider
let dataKey: ReturnType<typeof rawDataKeyMaterial>

beforeEach(async () => {
  provider = await createSodiumCryptoProvider()
  dataKey = rawDataKeyMaterial(keyOf(7))
})

describe('sealRecord / openRecord', () => {
  it('round-trip: plaintext keluar persis seperti masuk, termasuk teks non-ASCII', async () => {
    const plaintext = JSON.stringify({
      type: 'todo',
      schemaVersion: 1,
      data: { title: 'Ngopi dulu — jangan lupa 🙂', done: false },
    })

    const blob = await provider.sealRecord({ recordId: RECORD_ID, dataKey, plaintext })
    const opened = await provider.openRecord({ recordId: RECORD_ID, dataKey, blob })

    expect(opened).toBe(plaintext)
  })

  it('hasilnya ciphertext base64: tidak memuat plaintext, dan bisa di-decode', async () => {
    const plaintext = 'RAHASIA-jangan-sampai-terbaca'
    const blob = await provider.sealRecord({ recordId: RECORD_ID, dataKey, plaintext })

    expect(blob).not.toContain('RAHASIA')
    expect(Buffer.from(blob, 'base64').toString('latin1')).not.toContain('RAHASIA')

    const raw = Buffer.from(blob, 'base64')
    // nonce (24 byte) + ciphertext + tag (16 byte) - selalu lebih panjang dari plaintext.
    expect(raw.length).toBe(24 + plaintext.length + 16)
  })

  it('dua kali seal untuk input yang sama menghasilkan blob berbeda, dua-duanya bisa dibuka', async () => {
    const plaintext = 'isi yang sama'

    const first = await provider.sealRecord({ recordId: RECORD_ID, dataKey, plaintext })
    const second = await provider.sealRecord({ recordId: RECORD_ID, dataKey, plaintext })

    // Nonce acak per record: kalau sama, dua record dengan isi sama akan terlihat sama di server.
    expect(first).not.toBe(second)
    expect(await provider.openRecord({ recordId: RECORD_ID, dataKey, blob: first })).toBe(plaintext)
    expect(await provider.openRecord({ recordId: RECORD_ID, dataKey, blob: second })).toBe(
      plaintext,
    )
  })

  it('blob terikat ke record id-nya (AAD): id berbeda = gagal dibuka', async () => {
    const blob = await provider.sealRecord({
      recordId: RECORD_ID,
      dataKey,
      plaintext: 'punya saya',
    })

    // Inilah janji ADR 4: blob tidak bisa dipindah ke record lain. Dipindah = gagal, bukan terbuka
    // dengan isi milik record lain.
    await expect(
      provider.openRecord({
        recordId: '018f2c4e-0000-7000-8000-000000000002',
        dataKey,
        blob,
      }),
    ).rejects.toThrow(/tidak cocok/)
  })

  it('kunci lain tidak bisa membuka blob', async () => {
    const blob = await provider.sealRecord({ recordId: RECORD_ID, dataKey, plaintext: 'rahasia' })

    await expect(
      provider.openRecord({ recordId: RECORD_ID, dataKey: rawDataKeyMaterial(keyOf(8)), blob }),
    ).rejects.toThrow(/tidak cocok/)
  })

  it('blob yang diubah atau terpotong ditolak, bukan dibuka setengah isi', async () => {
    const blob = await provider.sealRecord({ recordId: RECORD_ID, dataKey, plaintext: 'rahasia' })
    const raw = Buffer.from(blob, 'base64')

    const tampered = Buffer.from(raw)
    const lastByte = tampered.at(-1) ?? 0
    tampered[tampered.length - 1] = lastByte ^ 0xff

    await expect(
      provider.openRecord({
        recordId: RECORD_ID,
        dataKey,
        blob: tampered.toString('base64'),
      }),
    ).rejects.toThrow(/tidak cocok/)

    await expect(
      provider.openRecord({
        recordId: RECORD_ID,
        dataKey,
        blob: raw.subarray(0, 10).toString('base64'),
      }),
    ).rejects.toThrow(/terlalu pendek/)
  })
})

describe('bahan kunci', () => {
  it('menolak bahan kunci yang bukan byte kunci 32', () => {
    expect(() => rawDataKeyMaterial(new Uint8Array(31))).toThrow(/32 byte/)
    expect(() => rawDataKeyMaterial(new Uint8Array(0))).toThrow(/32 byte/)
  })

  it('menolak jenis bahan kunci yang belum didukung, bukan menebaknya jadi byte', async () => {
    // Slot passkey/recovery belum ada implementasinya. Menganggap handle asing sebagai byte kunci
    // adalah cara paling halus untuk merusak data user - jadi harus gagal, dan pesannya menyebutkan
    // jalan keluarnya.
    await expect(
      provider.sealRecord({
        recordId: RECORD_ID,
        dataKey: { kind: 'webauthn-prf', handle: keyOf(1) },
        plaintext: '{}',
      }),
    ).rejects.toThrow(/belum didukung/)

    await expect(
      provider.sealRecord({
        recordId: RECORD_ID,
        dataKey: { kind: 'raw-32', handle: 'bukan-byte' },
        plaintext: '{}',
      }),
    ).rejects.toThrow(/rusak/)
  })
})
