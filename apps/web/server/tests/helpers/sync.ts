import { generateKeyPairSync, randomUUID, sign, type KeyObject } from 'node:crypto'

import {
  SYNC_PROTOCOL_VERSION,
  encodeSyncAuthMessage,
  type SyncClientMessage,
  type SyncServerMessage,
} from '@improve-personal/contracts'
import { inArray } from 'drizzle-orm'

import { rateLimits } from '../../db/schema'
import { grantLicense, issueLicenseToken } from '../../services/license'
import { createSyncSession, type SyncConnection, type SyncHub } from '../../services/sync-session'
import { hmacSha256 } from '../../utils/crypto'
import type { Fixture } from './harness'
import { FIXED_NOW, seedSession, testDb } from './harness'

/** Koneksi palsu: mencatat semua pesan server dan close code (batas WebSocket, tanpa jaringan). */
export class FakeConnection implements SyncConnection {
  readonly messages: SyncServerMessage[] = []
  closed: { readonly code: number; readonly reason: string } | null = null

  send(message: SyncServerMessage): void {
    this.messages.push(message)
  }

  close(code: number, reason: string): void {
    this.closed = { code, reason }
  }

  /** Pesan server bertipe `t` (urutan kedatangan). */
  of<T extends SyncServerMessage['t']>(type: T): Extract<SyncServerMessage, { t: T }>[] {
    return this.messages.filter(
      (message): message is Extract<SyncServerMessage, { t: T }> => message.t === type,
    )
  }
}

export type TestDevice = {
  readonly licenseId: string
  readonly deviceId: string
  readonly token: string
  /** Tanda tangan base64 atas string, dengan Device Sign Key milik perangkat ini. */
  readonly sign: (message: string) => string
}

function rawPublicKeyBase64(publicKey: KeyObject): string {
  const jwk = publicKey.export({ format: 'jwk' })
  if (typeof jwk.x !== 'string') throw new Error('jwk tanpa x')
  return Buffer.from(jwk.x, 'base64url').toString('base64')
}

/** Lisensi lifetime untuk email fixture ini. Panggil sekali sebelum `activateDevice`. */
export async function grantTestLicense(
  fixture: Fixture,
  plan: 'lifetime' | 'monthly' = 'lifetime',
): Promise<void> {
  await grantLicense(fixture.ctx(), { email: fixture.email, orderRef: `qa-${randomUUID()}`, plan })
}

/** Perangkat baru yang diaktivasi lewat jalur produksi (`issueLicenseToken`) dengan Device Sign Key. */
export async function activateDevice(
  fixture: Fixture,
  options: { readonly withSignKey?: boolean } = {},
): Promise<TestDevice> {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  const session = await seedSession(fixture.ctx(), {
    email: fixture.email,
    installationId: randomUUID(),
  })
  const token = await issueLicenseToken(fixture.ctx(), {
    email: fixture.email,
    deviceId: session.deviceId,
    ...(options.withSignKey === false ? {} : { deviceSignPk: rawPublicKeyBase64(publicKey) }),
  })
  const payload: { lid: string } = JSON.parse(
    Buffer.from(token.split('.')[0] ?? '', 'base64url').toString('utf8'),
  )

  return {
    licenseId: payload.lid,
    deviceId: session.deviceId,
    token,
    sign: (message) => sign(null, Buffer.from(message, 'utf8'), privateKey).toString('base64'),
  }
}

export type Clock = { now: Date }

export type ConnectedDevice = {
  readonly device: TestDevice
  readonly connection: FakeConnection
  readonly session: ReturnType<typeof createSyncSession>
  /** Kirim pesan client ke sesi dan tunggu selesai diproses. */
  readonly say: (message: SyncClientMessage | string) => Promise<void>
}

/** Buka sesi, jawab challenge dengan tanda tangan sah, dan tunggu `ready`. */
export async function connectDevice(
  fixture: Fixture,
  hub: SyncHub,
  device: TestDevice,
  clock: Clock = { now: FIXED_NOW },
  options: { readonly revalidateIntervalMs?: number; readonly authTimeoutMs?: number } = {},
): Promise<ConnectedDevice> {
  const connected = openSession(fixture, hub, device, clock, options)
  await connected.session.open()

  const nonce = connected.connection.of('challenge')[0]?.nonce
  if (nonce === undefined) throw new Error('server tidak mengirim challenge')

  const sig = device.sign(encodeSyncAuthMessage(nonce, device.licenseId, device.deviceId))
  await connected.say({ t: 'auth', v: SYNC_PROTOCOL_VERSION, token: device.token, sig })
  return connected
}

/** Sesi yang belum dibuka (`open()` belum dipanggil) - untuk test auth yang sengaja gagal. */
export function openSession(
  fixture: Fixture,
  hub: SyncHub,
  device: TestDevice,
  clock: Clock = { now: FIXED_NOW },
  options: { readonly revalidateIntervalMs?: number; readonly authTimeoutMs?: number } = {},
): ConnectedDevice {
  const connection = new FakeConnection()
  const session = createSyncSession({
    connection,
    hub,
    context: () => fixture.ctx({ now: clock.now }),
    ...options,
  })

  return {
    device,
    connection,
    session,
    say: (message) =>
      session.receive(typeof message === 'string' ? message : JSON.stringify(message)),
  }
}

/** Hapus bucket rate limit `sync:send` milik perangkat-perangkat ini (identifier = id perangkat). */
export async function clearSendRateLimits(
  fixture: Fixture,
  devices: readonly TestDevice[],
): Promise<void> {
  if (devices.length === 0) return
  const buckets = devices.map((device) => hmacSha256(device.deviceId, fixture.env.rateLimitPepper))
  await testDb().delete(rateLimits).where(inArray(rateLimits.bucket, buckets))
}

/** `bytes` frame contoh: ciphertext palsu, cukup untuk uji routing (server tidak membukanya). */
export function frameBytes(label: string): string {
  return Buffer.from(`ciphertext:${label}`).toString('base64')
}
