// @vitest-environment node
import { generateKeyPairSync, sign } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import { verifyDeviceSignature } from './device-signature'

function newDevice() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  const jwk = publicKey.export({ format: 'jwk' })
  const publicKeyBase64 = Buffer.from(String(jwk.x), 'base64url').toString('base64')
  return {
    publicKeyBase64,
    sign: (message: string) =>
      sign(null, Buffer.from(message, 'utf8'), privateKey).toString('base64'),
  }
}

describe('verifyDeviceSignature', () => {
  it('menerima tanda tangan sah', () => {
    const device = newDevice()

    expect(verifyDeviceSignature(device.publicKeyBase64, 'pesan', device.sign('pesan'))).toBe(true)
  })

  it('menolak pesan yang berbeda', () => {
    const device = newDevice()

    expect(verifyDeviceSignature(device.publicKeyBase64, 'lain', device.sign('pesan'))).toBe(false)
  })

  it('menolak tanda tangan dari kunci lain', () => {
    const device = newDevice()
    const other = newDevice()

    expect(verifyDeviceSignature(device.publicKeyBase64, 'pesan', other.sign('pesan'))).toBe(false)
  })

  it.each([
    ['public key bukan base64', '***', 'x'],
    ['public key bukan 32 byte', Buffer.alloc(31).toString('base64'), 'x'],
  ])('tidak melempar untuk %s', (_label, publicKey) => {
    const device = newDevice()

    expect(verifyDeviceSignature(publicKey, 'x', device.sign('x'))).toBe(false)
  })

  it.each([
    '',
    'bukan-base64!',
    Buffer.alloc(63).toString('base64'),
    Buffer.alloc(65).toString('base64'),
  ])('menolak tanda tangan rusak %j tanpa melempar', (signature) => {
    const device = newDevice()

    expect(verifyDeviceSignature(device.publicKeyBase64, 'x', signature)).toBe(false)
  })
})
