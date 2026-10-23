import { describe, expect, it } from 'vitest'

import { createTransferRequest, parseTransferQrPayload, sealTransferResponse } from './transfer'

/**
 * Bukti kripto untuk AC "tambah perangkat via QR" (T22): kunci utama dibungkus sealed box X25519
 * (`crypto_box_seal`) ke public key ephemeral perangkat baru.
 *
 * Yang dibuktikan, bukan diklaim:
 * - QR permintaan hanya membawa public key + nonce + versi;
 * - blob yang dikirim ke server BUKAN kunci utama (server tidak bisa membukanya);
 * - hanya keypair yang membuat QR itu yang bisa membuka blob;
 * - nonce mengikat jawaban ke permintaan yang sedang tampil (blob permintaan lain tidak bisa dipakai);
 * - QR asing ditolak sebelum apa pun dibungkus.
 */

const MASTER_KEY = new Uint8Array(32).fill(7)

describe('transfer kunci utama lewat QR', () => {
  it('QR permintaan hanya berisi publik: versi, publicKey ephemeral, dan nonce', async () => {
    const request = await createTransferRequest()
    const payload = parseTransferQrPayload(request.qrPayload)

    expect(payload.v).toBe(1)
    expect(payload.publicKey.length).toBeGreaterThan(32)
    expect(payload.nonce.length).toBeGreaterThan(8)
    // Tidak ada kunci utama di QR yang ditampilkan ke perangkat lain.
    expect(request.qrPayload).not.toContain(Buffer.from(MASTER_KEY).toString('base64'))
    expect(request.qrPayload).not.toContain('masterKey')
  })

  it('blob di server adalah sealed box: hanya pembuat QR yang bisa membukanya', async () => {
    const request = await createTransferRequest()
    const blob = await sealTransferResponse(request.qrPayload, MASTER_KEY)

    // Bukan kunci utama polos (base64 32 byte) - server hanya menyimpan amplop terenkripsi.
    expect(blob).not.toBe(Buffer.from(MASTER_KEY).toString('base64'))
    expect(blob.length).toBeGreaterThan(48)

    const opened = await request.openSealed(blob)
    expect(Array.from(opened)).toEqual(Array.from(MASTER_KEY))

    // Perangkat baru lain (keypair lain) tidak bisa membuka amplop yang bukan untuknya.
    const other = await createTransferRequest()
    await expect(other.openSealed(blob)).rejects.toThrow()
  })

  it('jawaban tidak bisa dipakai untuk permintaan lain (nonce terikat di dalam amplop)', async () => {
    const first = await createTransferRequest()
    const second = await createTransferRequest()

    // Blob dibuat untuk permintaan PERTAMA, lalu diberikan ke perangkat yang menampilkan QR KEDUA.
    const blob = await sealTransferResponse(first.qrPayload, MASTER_KEY)
    await expect(second.openSealed(blob)).rejects.toThrow(/bukan untuk permintaan ini/)
  })

  it('QR asing ditolak sebelum kunci utama dibungkus', async () => {
    for (const junk of ['bukan qr', '{"v":2,"publicKey":"x","nonce":"y"}', '{"v":1}']) {
      await expect(sealTransferResponse(junk, MASTER_KEY)).rejects.toThrow(
        /bukan JSON|tidak dikenal|tidak lengkap/,
      )
    }
  })
})
