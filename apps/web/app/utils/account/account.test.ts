// @vitest-environment node
//
// Gateway perangkat + berkas recovery key.
//
// Dua hal yang penting di sini: permintaan yang dikirim ke server (path/method) dan janji bahwa berkas
// recovery TIDAK memuat kunci utama polos maupun 24 katanya.
import { describe, expect, it } from 'vitest'

import { createMasterKey } from '../crypto/master-key'
import { createRecoveryEnvelope, createRecoveryWords } from '../crypto/recovery'
import { loadSodium } from '../crypto/sodium'
import { DevicesRequestError, createDevicesGateway } from './devices-gateway'
import {
  RECOVERY_FILE_FORMAT,
  RECOVERY_FILE_VERSION,
  buildRecoveryFileDocument,
  parseRecoveryFile,
  recoveryFileName,
  serializeRecoveryFile,
} from './recovery-file'

const DEVICE_ID = '018f2c4e-0000-7000-8000-0000000000d1'

function deviceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: DEVICE_ID,
    name: 'Laptop kerja',
    platform: 'web',
    createdAt: '2026-10-01T00:00:00.000Z',
    lastSeenAt: '2026-10-19T00:00:00.000Z',
    lastIpCity: 'Bandung',
    revokedAt: null,
    ...overrides,
  }
}

describe('gateway perangkat', () => {
  it('list: minta GET /v1/devices dan mengembalikan DTO yang sudah divalidasi', async () => {
    const calls: string[] = []
    const gateway = createDevicesGateway(async (path, options) => {
      calls.push(`${options.method} ${path}`)
      return { data: { devices: [deviceRow()] } }
    })

    const devices = await gateway.list()

    expect(calls).toEqual(['GET /v1/devices'])
    expect(devices).toHaveLength(1)
    expect(devices[0]?.lastIpCity).toBe('Bandung')
  })

  it('revoke: DELETE ke id perangkat, tanpa membaca body (server membalas 204)', async () => {
    const calls: string[] = []
    const gateway = createDevicesGateway(async (path, options) => {
      calls.push(`${options.method} ${path}`)
      return undefined
    })

    await expect(gateway.revoke(DEVICE_ID)).resolves.toBeUndefined()
    expect(calls).toEqual([`DELETE /v1/devices/${DEVICE_ID}`])
  })

  it('respons yang menyimpang dari kontrak dilaporkan INTERNAL, bukan lolos ke UI', async () => {
    const gateway = createDevicesGateway(async () => ({
      data: { devices: [{ id: 'bukan-uuid' }] },
    }))

    await expect(gateway.list()).rejects.toMatchObject({ code: 'INTERNAL' })
  })

  it('error server dipetakan ke kode kontrak, dan kegagalan jaringan dibedakan', async () => {
    const notFound = createDevicesGateway(async () => {
      throw { status: 404, data: { error: { code: 'NOT_FOUND', message: 'x' } } }
    })
    await expect(notFound.revoke(DEVICE_ID)).rejects.toBeInstanceOf(DevicesRequestError)
    await expect(notFound.revoke(DEVICE_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
      isNetworkError: false,
    })

    const offline = createDevicesGateway(async () => {
      throw new Error('fetch failed')
    })
    await expect(offline.list()).rejects.toMatchObject({ code: 'INTERNAL', isNetworkError: true })

    const rate = createDevicesGateway(async () => {
      throw { status: 429 }
    })
    await expect(rate.revoke(DEVICE_ID)).rejects.toMatchObject({ code: 'RATE_LIMITED' })
  })
})

describe('berkas recovery key', () => {
  it('round-trip: envelope kembali sama persis', async () => {
    const sodium = await loadSodium()
    const envelope = await createRecoveryEnvelope(createMasterKey(sodium), createRecoveryWords())

    const document = buildRecoveryFileDocument({ envelope, createdAtMs: 1_700_000_000_000 })
    const parsed = parseRecoveryFile(serializeRecoveryFile(document))

    expect(parsed).toEqual(envelope)
    expect(recoveryFileName()).toBe('improve-personal-recovery-key.json')
  })

  it('berkas TIDAK memuat kunci utama polos maupun 24 katanya', async () => {
    const sodium = await loadSodium()
    const masterKey = createMasterKey(sodium)
    const words = createRecoveryWords()

    const text = serializeRecoveryFile(
      buildRecoveryFileDocument({
        envelope: await createRecoveryEnvelope(masterKey, words),
        createdAtMs: 1_700_000_000_000,
      }),
    )

    // Kunci utama: hanya boleh ada dalam bentuk terbungkus.
    expect(text).not.toContain(sodium.to_base64(masterKey, sodium.base64_variants.ORIGINAL))
    // 24 kata: disimpan user di tempat lain, bukan di berkas ini - kalau ikut, berkas bocor = kunci bocor.
    expect(text).not.toContain(words)
    expect(text).not.toContain(words.split(' ')[0] ?? 'x')

    // Dan peringatannya ikut tertulis di berkasnya sendiri, bukan cuma di UI.
    expect(text).toContain('tidak memuat 24 katanya')
  })

  it('berkas dari aplikasi lain, versi lain, atau isi tidak lengkap ditolak', async () => {
    expect(() => parseRecoveryFile('bukan json')).toThrow(/bukan JSON/)
    expect(() =>
      parseRecoveryFile(JSON.stringify({ format: 'aplikasi-lain', version: 1 })),
    ).toThrow(/tidak dikenali/)

    const sodium = await loadSodium()
    const envelope = await createRecoveryEnvelope(createMasterKey(sodium), createRecoveryWords())
    const document = buildRecoveryFileDocument({ envelope, createdAtMs: 1 })
    const text = serializeRecoveryFile(document)

    expect(() => parseRecoveryFile(JSON.stringify({ ...document, version: 99 }))).toThrow(
      /tidak dikenali/,
    )
    expect(() =>
      parseRecoveryFile(JSON.stringify({ ...document, format: `${RECOVERY_FILE_FORMAT}-lama` })),
    ).toThrow(/tidak dikenali/)

    // Algoritma yang belum didukung ditolak dengan menyebut namanya, bukan ditebak.
    expect(() =>
      parseRecoveryFile(
        JSON.stringify({
          ...document,
          version: RECOVERY_FILE_VERSION,
          envelope: { ...document.envelope, alg: 'aes-gcm' },
        }),
      ),
    ).toThrow(/belum didukung/)
    expect(text.length).toBeGreaterThan(0)
  })
})
