// @vitest-environment node
//
// Relay sync (ADR 17, ARCHITECTURE.md §13.4): auth tanda tangan perangkat, aktivasi dicabut, TTL +
// `expired`, kuota harian/antrean, lisensi baca-saja, saklar mati, frame terhapus setelah semua ack,
// unicast snapshot hanya ke `to`. Sesi diuji dengan koneksi palsu terhadap Postgres nyata (batas
// WebSocket di-fake; DB tidak).
import { randomUUID } from 'node:crypto'

import {
  SYNC_CLOSE_CODES,
  SYNC_DAILY_SEND_MAX_BYTES,
  SYNC_FRAME_MAX_BYTES,
  SYNC_QUEUE_MAX_BYTES,
  SYNC_RELAY_TTL_DAYS,
  type SyncClientMessage,
} from '@improve-personal/contracts'
import { eq } from 'drizzle-orm'
import { afterAll, afterEach, describe, expect, it } from 'vitest'

import {
  licenseActivations,
  licenses,
  syncExpired,
  syncFrames,
  syncPending,
  syncUsage,
} from '../db/schema'
import { purgeSyncRelay } from '../services/sync-relay'
import { createSyncHub, SYNC_MESSAGE_MAX_CHARS } from '../services/sync-session'
import { closeTestDb, FIXED_NOW, makeEnv, testDb } from './helpers/harness'
import { testScope } from './helpers/scope'
import {
  activateDevice,
  clearSendRateLimits,
  connectDevice,
  frameBytes,
  grantTestLicense,
  openSession,
  type TestDevice,
} from './helpers/sync'

const scope = testScope()
const devicesToClean: { fixture: ReturnType<typeof scope.fixture>; devices: TestDevice[] }[] = []

afterEach(async () => {
  for (const entry of devicesToClean.splice(0)) {
    await clearSendRateLimits(entry.fixture, entry.devices)
  }
  await scope.dispose()
})

afterAll(closeTestDb)

const MS_PER_DAY = 24 * 60 * 60 * 1_000

type Fixture = ReturnType<typeof scope.fixture>

/** Fixture + lisensi + `count` perangkat beraktivasi (semua punya Device Sign Key). */
async function setup(
  count: number,
  options: {
    readonly env?: ReturnType<typeof makeEnv>
    readonly plan?: 'lifetime' | 'monthly'
  } = {},
): Promise<{ fixture: Fixture; devices: TestDevice[] }> {
  const fixture = scope.fixture({ prefix: 'sync', ...(options.env ? { env: options.env } : {}) })
  await grantTestLicense(fixture, options.plan)

  const devices: TestDevice[] = []
  for (let index = 0; index < count; index += 1) devices.push(await activateDevice(fixture))
  devicesToClean.push({ fixture, devices })

  return { fixture, devices }
}

function delta(seq: number, label = `d${seq}`, clientRef = `ref-${seq}`): SyncClientMessage {
  return {
    t: 'send',
    clientRef,
    epoch: 1,
    kind: 'delta',
    seq,
    to: null,
    bytes: frameBytes(label),
  }
}

function snapshot(to: string, label = 'snap'): SyncClientMessage {
  return {
    t: 'send',
    clientRef: `ref-${label}`,
    epoch: 1,
    kind: 'snapshot',
    seq: null,
    to,
    bytes: frameBytes(label),
  }
}

async function framesOf(licenseId: string) {
  return testDb().select().from(syncFrames).where(eq(syncFrames.licenseId, licenseId))
}

async function pendingCount(): Promise<number> {
  return (await testDb().select().from(syncPending)).length
}

describe('auth relay', () => {
  it('tanda tangan benar -> ready (epoch, readOnly, expired kosong)', async () => {
    const { fixture, devices } = await setup(1)
    const [a] = devices
    if (a === undefined) throw new Error('perangkat tidak dibuat')

    const conn = await connectDevice(fixture, createSyncHub(), a)

    expect(conn.connection.of('ready')).toEqual([
      { t: 'ready', epoch: 1, readOnly: false, expired: [] },
    ])
    expect(conn.connection.closed).toBeNull()
  })

  it('tanda tangan oleh kunci lain -> unauthenticated + close 4003', async () => {
    const { fixture, devices } = await setup(2)
    const [a, b] = devices
    if (a === undefined || b === undefined) throw new Error('perangkat tidak dibuat')

    // Token A (sah) tapi tanda tangan challenge dari perangkat B.
    const forged = { ...a, sign: b.sign }
    const conn = await connectDevice(fixture, createSyncHub(), forged)

    expect(conn.connection.of('ready')).toHaveLength(0)
    expect(conn.connection.of('error')).toEqual([
      { t: 'error', code: 'unauthenticated', clientRef: null },
    ])
    expect(conn.connection.closed?.code).toBe(SYNC_CLOSE_CODES.unauthenticated)
  })

  it('token palsu / diubah -> unauthenticated + close 4003', async () => {
    const { fixture, devices } = await setup(1)
    const [a] = devices
    if (a === undefined) throw new Error('perangkat tidak dibuat')

    const [payload = '', signature = ''] = a.token.split('.')
    const tamperedPayload = Buffer.from(
      JSON.stringify({
        ...JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')),
        did: randomUUID(),
      }),
    ).toString('base64url')

    for (const token of [`${tamperedPayload}.${signature}`, 'abc.def']) {
      const conn = await connectDevice(fixture, createSyncHub(), { ...a, token })
      expect(conn.connection.closed?.code).toBe(SYNC_CLOSE_CODES.unauthenticated)
      expect(conn.connection.of('ready')).toHaveLength(0)
    }
  })

  it('perangkat tanpa Device Sign Key (aktivasi lama) -> unauthenticated', async () => {
    const { fixture } = await setup(0)
    const legacy = await activateDevice(fixture, { withSignKey: false })

    const conn = await connectDevice(fixture, createSyncHub(), legacy)

    expect(conn.connection.closed?.code).toBe(SYNC_CLOSE_CODES.unauthenticated)
  })

  it('aktivasi dicabut sebelum connect -> unauthenticated', async () => {
    const { fixture, devices } = await setup(1)
    const [a] = devices
    if (a === undefined) throw new Error('perangkat tidak dibuat')
    await testDb().delete(licenseActivations).where(eq(licenseActivations.deviceId, a.deviceId))

    const conn = await connectDevice(fixture, createSyncHub(), a)

    expect(conn.connection.closed?.code).toBe(SYNC_CLOSE_CODES.unauthenticated)
  })

  it('aktivasi dicabut saat terhubung -> putus saat kirim', async () => {
    const { fixture, devices } = await setup(2)
    const [a, b] = devices
    if (a === undefined || b === undefined) throw new Error('perangkat tidak dibuat')
    const conn = await connectDevice(fixture, createSyncHub(), a)
    await testDb().delete(licenseActivations).where(eq(licenseActivations.deviceId, a.deviceId))

    await conn.say(delta(1))

    expect(conn.connection.closed?.code).toBe(SYNC_CLOSE_CODES.unauthenticated)
    expect(conn.connection.of('accepted')).toHaveLength(0)
    expect(await framesOf(a.licenseId)).toHaveLength(0)
  })

  it('aktivasi dicabut saat idle -> revalidasi berkala memutus koneksi', async () => {
    const { fixture, devices } = await setup(1)
    const [a] = devices
    if (a === undefined) throw new Error('perangkat tidak dibuat')
    const conn = await connectDevice(
      fixture,
      createSyncHub(),
      a,
      { now: FIXED_NOW },
      {
        revalidateIntervalMs: 25,
      },
    )
    await testDb().delete(licenseActivations).where(eq(licenseActivations.deviceId, a.deviceId))

    await new Promise((resolve) => setTimeout(resolve, 300))

    expect(conn.connection.closed?.code).toBe(SYNC_CLOSE_CODES.unauthenticated)
    conn.session.dispose()
  })

  it('lisensi dicabut -> unauthenticated', async () => {
    const { fixture, devices } = await setup(1)
    const [a] = devices
    if (a === undefined) throw new Error('perangkat tidak dibuat')
    await testDb()
      .update(licenses)
      .set({ revokedAt: FIXED_NOW })
      .where(eq(licenses.id, a.licenseId))

    const conn = await connectDevice(fixture, createSyncHub(), a)

    expect(conn.connection.closed?.code).toBe(SYNC_CLOSE_CODES.unauthenticated)
  })

  it('pesan selain auth sebelum auth -> close 4003; JSON rusak -> 4400', async () => {
    const { fixture, devices } = await setup(1)
    const [a] = devices
    if (a === undefined) throw new Error('perangkat tidak dibuat')

    const early = openSession(fixture, createSyncHub(), a)
    await early.session.open()
    await early.say(delta(1))
    expect(early.connection.closed?.code).toBe(SYNC_CLOSE_CODES.unauthenticated)

    const broken = openSession(fixture, createSyncHub(), a)
    await broken.session.open()
    await broken.say('{bukan json')
    expect(broken.connection.closed?.code).toBe(SYNC_CLOSE_CODES.invalid_message)
  })

  it('tidak membalas challenge -> ditutup setelah batas waktu', async () => {
    const { fixture, devices } = await setup(1)
    const [a] = devices
    if (a === undefined) throw new Error('perangkat tidak dibuat')

    const idle = openSession(fixture, createSyncHub(), a, { now: FIXED_NOW }, { authTimeoutMs: 20 })
    await idle.session.open()
    await new Promise((resolve) => setTimeout(resolve, 150))

    expect(idle.connection.closed?.code).toBe(SYNC_CLOSE_CODES.unauthenticated)
  })

  it('pesan auth kebesaran sebelum auth ditolak tanpa di-parse', async () => {
    const { fixture, devices } = await setup(1)
    const [a] = devices
    if (a === undefined) throw new Error('perangkat tidak dibuat')

    const conn = openSession(fixture, createSyncHub(), a)
    await conn.session.open()
    await conn.say(`{"t":"auth","pad":"${'x'.repeat(5_000)}"}`)

    expect(conn.connection.closed?.code).toBe(SYNC_CLOSE_CODES.invalid_message)
  })
})

describe('saklar relay', () => {
  it('NUXT_SYNC_RELAY_ENABLED=false -> close relay_disabled (4001) tanpa challenge', async () => {
    const { fixture, devices } = await setup(1, { env: makeEnv({ syncRelayEnabled: false }) })
    const [a] = devices
    if (a === undefined) throw new Error('perangkat tidak dibuat')

    const conn = openSession(fixture, createSyncHub(), a)
    await conn.session.open()

    expect(conn.connection.closed).toEqual({
      code: SYNC_CLOSE_CODES.relay_disabled,
      reason: 'relay_disabled',
    })
    expect(conn.connection.of('error')[0]?.code).toBe('relay_disabled')
    expect(conn.connection.of('challenge')).toHaveLength(0)
  })
})

describe('routing + ack', () => {
  it('delta broadcast ke semua perangkat lain yang online; pengirim tidak menerima salinan', async () => {
    const { fixture, devices } = await setup(3)
    const [a, b, c] = devices
    if (a === undefined || b === undefined || c === undefined) throw new Error('perangkat')
    const hub = createSyncHub()
    const connA = await connectDevice(fixture, hub, a)
    const connB = await connectDevice(fixture, hub, b)
    const connC = await connectDevice(fixture, hub, c)

    await connA.say(delta(1, 'hello'))

    const accepted = connA.connection.of('accepted')
    expect(accepted).toHaveLength(1)
    expect(accepted[0]?.clientRef).toBe('ref-1')
    for (const peer of [connB, connC]) {
      expect(peer.connection.of('frame')).toEqual([
        {
          t: 'frame',
          id: accepted[0]?.id,
          from: a.deviceId,
          epoch: 1,
          kind: 'delta',
          seq: 1,
          bytes: frameBytes('hello'),
        },
      ])
    }
    expect(connA.connection.of('frame')).toHaveLength(0)
  })

  it('frame dihapus hanya setelah SEMUA penerima ack (termasuk ack bersamaan)', async () => {
    const { fixture, devices } = await setup(3)
    const [a, b, c] = devices
    if (a === undefined || b === undefined || c === undefined) throw new Error('perangkat')
    const hub = createSyncHub()
    const connA = await connectDevice(fixture, hub, a)
    const connB = await connectDevice(fixture, hub, b)
    const connC = await connectDevice(fixture, hub, c)
    await connA.say(delta(1))
    const id = connA.connection.of('accepted')[0]?.id ?? 0

    expect(await framesOf(a.licenseId)).toHaveLength(1)
    await connB.say({ t: 'ack', ids: [id] })
    expect(await framesOf(a.licenseId)).toHaveLength(1)

    // C ack dua kali + B ack ulang: idempoten dan tidak menghapus lebih awal.
    await connB.say({ t: 'ack', ids: [id] })
    expect(await framesOf(a.licenseId)).toHaveLength(1)
    await connC.say({ t: 'ack', ids: [id] })

    expect(await framesOf(a.licenseId)).toHaveLength(0)
    expect(await pendingCount()).toBe(0)
  })

  it('dua penerima ack bersamaan tidak meninggalkan frame yatim', async () => {
    const { fixture, devices } = await setup(3)
    const [a, b, c] = devices
    if (a === undefined || b === undefined || c === undefined) throw new Error('perangkat')
    const hub = createSyncHub()
    const connA = await connectDevice(fixture, hub, a)
    const connB = await connectDevice(fixture, hub, b)
    const connC = await connectDevice(fixture, hub, c)
    await connA.say(delta(1))
    const id = connA.connection.of('accepted')[0]?.id ?? 0

    await Promise.all([connB.say({ t: 'ack', ids: [id] }), connC.say({ t: 'ack', ids: [id] })])

    expect(await framesOf(a.licenseId)).toHaveLength(0)
  })

  it('penerima offline: frame menunggu, dikirim berurutan setelah ready saat connect', async () => {
    const { fixture, devices } = await setup(2)
    const [a, b] = devices
    if (a === undefined || b === undefined) throw new Error('perangkat')
    const hub = createSyncHub()
    const connA = await connectDevice(fixture, hub, a)
    await connA.say(delta(1))
    await connA.say(delta(2))

    expect(await framesOf(a.licenseId)).toHaveLength(2)

    const connB = await connectDevice(fixture, hub, b)

    expect(connB.connection.messages.map((message) => message.t).slice(-3)).toEqual([
      'ready',
      'frame',
      'frame',
    ])
    expect(connB.connection.of('frame').map((frame) => frame.seq)).toEqual([1, 2])
  })

  it('tanpa penerima lain: accepted tetapi tidak ada ciphertext yang disimpan', async () => {
    const { fixture, devices } = await setup(1)
    const [a] = devices
    if (a === undefined) throw new Error('perangkat')
    const connA = await connectDevice(fixture, createSyncHub(), a)

    await connA.say(delta(1))

    expect(connA.connection.of('accepted')).toHaveLength(1)
    expect(await framesOf(a.licenseId)).toHaveLength(0)
  })

  it('ack id milik perangkat/lisensi lain tidak menghapus apa pun', async () => {
    const { fixture, devices } = await setup(3)
    const [a, b, c] = devices
    if (a === undefined || b === undefined || c === undefined) throw new Error('perangkat')
    const outsider = await setup(2)
    const [x] = outsider.devices
    if (x === undefined) throw new Error('perangkat')
    const hub = createSyncHub()
    const connA = await connectDevice(fixture, hub, a)
    await connA.say(snapshot(b.deviceId))
    const id = connA.connection.of('accepted')[0]?.id ?? 0

    const connC = await connectDevice(fixture, hub, c)
    const connX = await connectDevice(outsider.fixture, hub, x)
    await connC.say({ t: 'ack', ids: [id] })
    await connX.say({ t: 'ack', ids: [id] })

    expect(await framesOf(a.licenseId)).toHaveLength(1)
    expect(await pendingCount()).toBeGreaterThanOrEqual(1)
  })

  it('unicast snapshot hanya sampai ke `to`', async () => {
    const { fixture, devices } = await setup(3)
    const [a, b, c] = devices
    if (a === undefined || b === undefined || c === undefined) throw new Error('perangkat')
    const hub = createSyncHub()
    const connA = await connectDevice(fixture, hub, a)
    const connB = await connectDevice(fixture, hub, b)
    const connC = await connectDevice(fixture, hub, c)

    await connA.say(snapshot(b.deviceId))

    expect(connB.connection.of('frame')).toHaveLength(1)
    expect(connB.connection.of('frame')[0]).toMatchObject({ kind: 'snapshot', seq: null })
    expect(connC.connection.of('frame')).toHaveLength(0)
    const pending = await testDb().select().from(syncPending)
    expect(pending.map((row) => row.deviceId)).toEqual([b.deviceId])
  })

  it('snapshot ke `to` yang bukan perangkat lisensi ini: accepted, tidak ada yang disimpan', async () => {
    const { fixture, devices } = await setup(2)
    const [a] = devices
    if (a === undefined) throw new Error('perangkat')
    const connA = await connectDevice(fixture, createSyncHub(), a)

    await connA.say(snapshot(randomUUID()))

    expect(connA.connection.of('accepted')).toHaveLength(1)
    expect(await framesOf(a.licenseId)).toHaveLength(0)
  })

  it('snapshot-request hanya diteruskan ke perangkat online di lisensi yang sama', async () => {
    const { fixture, devices } = await setup(2)
    const [a, b] = devices
    if (a === undefined || b === undefined) throw new Error('perangkat')
    const outsider = await setup(1)
    const [x] = outsider.devices
    if (x === undefined) throw new Error('perangkat')
    const hub = createSyncHub()
    const connA = await connectDevice(fixture, hub, a)
    const connB = await connectDevice(fixture, hub, b)
    const connX = await connectDevice(outsider.fixture, hub, x)
    const requestId = randomUUID()

    await connA.say({ t: 'snapshot-request', to: b.deviceId, requestId })
    await connA.say({ t: 'snapshot-request', to: x.deviceId, requestId })

    expect(connB.connection.of('snapshot-request')).toEqual([
      { t: 'snapshot-request', from: a.deviceId, requestId },
    ])
    expect(connX.connection.of('snapshot-request')).toHaveLength(0)
  })

  it('metrik: byte masuk/keluar tercatat per lisensi per hari, tanpa isi', async () => {
    const { fixture, devices } = await setup(2)
    const [a, b] = devices
    if (a === undefined || b === undefined) throw new Error('perangkat')
    const hub = createSyncHub()
    const connA = await connectDevice(fixture, hub, a)
    await connectDevice(fixture, hub, b)
    const size = Buffer.from(frameBytes('x'), 'base64').length

    await connA.say(delta(1, 'x'))

    const [usage] = await testDb()
      .select()
      .from(syncUsage)
      .where(eq(syncUsage.licenseId, a.licenseId))
    expect(usage).toMatchObject({ day: '2026-05-01', bytesIn: size, bytesOut: size })
  })
})

describe('TTL + expired', () => {
  it('frame lewat 7 hari dibuang; penerima diberi tahu pengirim + seq tertinggi saat connect', async () => {
    const { fixture, devices } = await setup(2)
    const [a, b] = devices
    if (a === undefined || b === undefined) throw new Error('perangkat')
    const hub = createSyncHub()
    const connA = await connectDevice(fixture, hub, a)
    await connA.say(delta(1))
    await connA.say(delta(2))
    await connA.say(delta(3))
    await connA.say(snapshot(b.deviceId))

    const later = new Date(FIXED_NOW.getTime() + (SYNC_RELAY_TTL_DAYS + 1) * MS_PER_DAY)
    const summary = await purgeSyncRelay(fixture.ctxAt(later))

    expect(summary.frames).toBe(4)
    expect(await framesOf(a.licenseId)).toHaveLength(0)
    expect(await pendingCount()).toBe(0)

    const connB = await connectDevice(fixture, hub, b, { now: later })
    expect(connB.connection.of('ready')[0]?.expired).toEqual([{ from: a.deviceId, upToSeq: 3 }])
    expect(connB.connection.of('frame')).toHaveLength(0)

    const connBAgain = await connectDevice(fixture, hub, b, { now: later })
    expect(connBAgain.connection.of('ready')[0]?.expired).toEqual([])
  })

  it('frame yang belum lewat TTL tidak disentuh', async () => {
    const { fixture, devices } = await setup(2)
    const [a] = devices
    if (a === undefined) throw new Error('perangkat')
    const connA = await connectDevice(fixture, createSyncHub(), a)
    await connA.say(delta(1))

    const justInside = new Date(FIXED_NOW.getTime() + (SYNC_RELAY_TTL_DAYS - 1) * MS_PER_DAY)
    const summary = await purgeSyncRelay(fixture.ctxAt(justInside))

    expect(summary.frames).toBe(0)
    expect(await framesOf(a.licenseId)).toHaveLength(1)
    expect(await testDb().select().from(syncExpired)).toHaveLength(0)
  })

  it('catatan expired dari beberapa putaran purge digabung ke seq tertinggi', async () => {
    const { fixture, devices } = await setup(2)
    const [a, b] = devices
    if (a === undefined || b === undefined) throw new Error('perangkat')
    const hub = createSyncHub()
    const connA = await connectDevice(fixture, hub, a)
    await connA.say(delta(5))
    const later = new Date(FIXED_NOW.getTime() + 8 * MS_PER_DAY)
    await purgeSyncRelay(fixture.ctxAt(later))
    const clock = { now: later }
    const connA2 = await connectDevice(fixture, hub, a, clock)
    await connA2.say(delta(9))
    await purgeSyncRelay(fixture.ctxAt(new Date(later.getTime() + 8 * MS_PER_DAY)))

    const connB = await connectDevice(fixture, hub, b, { now: later })
    expect(connB.connection.of('ready')[0]?.expired).toEqual([{ from: a.deviceId, upToSeq: 9 }])
  })
})

describe('kuota', () => {
  it('kuota kirim harian: frame ditolak quota_daily, pulih di hari UTC berikutnya', async () => {
    const { fixture, devices } = await setup(2)
    const [a] = devices
    if (a === undefined) throw new Error('perangkat')
    await testDb()
      .insert(syncUsage)
      .values({ licenseId: a.licenseId, day: '2026-05-01', bytesIn: SYNC_DAILY_SEND_MAX_BYTES - 5 })
    const clock = { now: FIXED_NOW }
    const connA = await connectDevice(fixture, createSyncHub(), a, clock)

    await connA.say(delta(1, 'melebihi-sisa-kuota'))
    expect(connA.connection.of('error')).toEqual([
      { t: 'error', code: 'quota_daily', clientRef: 'ref-1' },
    ])
    expect(connA.connection.closed).toBeNull()
    expect(await framesOf(a.licenseId)).toHaveLength(0)

    clock.now = new Date(FIXED_NOW.getTime() + MS_PER_DAY)
    await connA.say(delta(2))
    expect(connA.connection.of('accepted')).toHaveLength(1)
  })

  it('kuota antrean: quota_queue sampai ada ack yang mengosongkan antrean', async () => {
    const { fixture, devices } = await setup(2)
    const [a, b] = devices
    if (a === undefined || b === undefined) throw new Error('perangkat')
    const [filler] = await testDb()
      .insert(syncFrames)
      .values({
        licenseId: a.licenseId,
        senderDeviceId: a.deviceId,
        epoch: 1,
        seq: 1,
        bytes: Buffer.from('x'),
        size: SYNC_QUEUE_MAX_BYTES - 5,
        createdAt: FIXED_NOW,
      })
      .returning({ id: syncFrames.id })
    if (filler === undefined) throw new Error('baris pengisi tidak dibuat')
    await testDb().insert(syncPending).values({ deviceId: b.deviceId, frameId: filler.id })
    const hub = createSyncHub()
    const connA = await connectDevice(fixture, hub, a)

    await connA.say(delta(2, 'melebihi-sisa-antrean'))
    expect(connA.connection.of('error')).toEqual([
      { t: 'error', code: 'quota_queue', clientRef: 'ref-2' },
    ])

    const connB = await connectDevice(fixture, hub, b)
    await connB.say({ t: 'ack', ids: [filler.id] })
    await connA.say(delta(3, 'sekarang-muat', 'ref-3'))
    expect(connA.connection.of('accepted')).toHaveLength(1)
  })

  it('frame lebih besar dari 256 KB -> frame_too_large per pesan, koneksi tetap hidup', async () => {
    const { fixture, devices } = await setup(2)
    const [a] = devices
    if (a === undefined) throw new Error('perangkat')
    const connA = await connectDevice(fixture, createSyncHub(), a)

    // Lolos batas panjang string schema (base64 padding), tapi decode melewati 256 KB.
    const barelyTooBig = Buffer.alloc(SYNC_FRAME_MAX_BYTES + 1, 1).toString('base64')
    await connA.say({ ...delta(1), bytes: barelyTooBig } as SyncClientMessage)
    // Kebesaran tapi masih di bawah batas pesan mentah: dikenali dari JSON, bukan jadi invalid_message.
    const wayTooBig = Buffer.alloc(SYNC_FRAME_MAX_BYTES + 300, 1).toString('base64')
    await connA.say(JSON.stringify({ ...delta(2), bytes: wayTooBig }))
    // Melewati batas pesan mentah: dibuang tanpa di-parse.
    await connA.say('x'.repeat(SYNC_MESSAGE_MAX_CHARS + 1))

    expect(connA.connection.of('error')).toEqual([
      { t: 'error', code: 'frame_too_large', clientRef: 'ref-1' },
      { t: 'error', code: 'frame_too_large', clientRef: 'ref-2' },
      { t: 'error', code: 'frame_too_large', clientRef: null },
    ])
    expect(connA.connection.closed).toBeNull()
    expect(await framesOf(a.licenseId)).toHaveLength(0)
  })

  it('rate limit per perangkat: rate_limited per pesan, koneksi tetap hidup', async () => {
    const { fixture, devices } = await setup(2)
    const [a, b] = devices
    if (a === undefined || b === undefined) throw new Error('perangkat')
    const connA = await connectDevice(fixture, createSyncHub(), a)

    for (let index = 0; index < 121; index += 1) {
      await connA.say({ t: 'snapshot-request', to: b.deviceId, requestId: randomUUID() })
    }

    expect(connA.connection.of('error')).toEqual([
      { t: 'error', code: 'rate_limited', clientRef: null },
    ])
    expect(connA.connection.closed).toBeNull()
  })
})

describe('lisensi baca-saja (ADR 16)', () => {
  it('ready.readOnly = true: kirim ditolak, menerima + ack tetap jalan', async () => {
    const { fixture, devices } = await setup(2, { plan: 'monthly' })
    const [a, b] = devices
    if (a === undefined || b === undefined) throw new Error('perangkat')
    const hub = createSyncHub()
    const connA = await connectDevice(fixture, hub, a)
    await connA.say(delta(1))
    const id = connA.connection.of('accepted')[0]?.id ?? 0
    await testDb()
      .update(licenses)
      .set({ expiresAt: new Date(FIXED_NOW.getTime() - 1_000) })
      .where(eq(licenses.id, a.licenseId))

    const connB = await connectDevice(fixture, hub, b)
    expect(connB.connection.of('ready')[0]?.readOnly).toBe(true)
    expect(connB.connection.of('frame')).toHaveLength(1)
    await connB.say({ t: 'ack', ids: [id] })
    expect(await framesOf(a.licenseId)).toHaveLength(0)

    await connB.say(delta(1, 'dari-b', 'ref-b'))
    expect(connB.connection.of('error')).toEqual([
      { t: 'error', code: 'license_read_only', clientRef: 'ref-b' },
    ])
    expect(connB.connection.closed).toBeNull()
  })
})

describe('epoch', () => {
  it('epoch naik tercatat; frame dengan epoch lebih tua ditolak epoch_stale', async () => {
    const { fixture, devices } = await setup(2)
    const [a, b] = devices
    if (a === undefined || b === undefined) throw new Error('perangkat')
    const hub = createSyncHub()
    const connA = await connectDevice(fixture, hub, a)
    const connB = await connectDevice(fixture, hub, b)

    await connA.say({ ...delta(1), epoch: 2 } as SyncClientMessage)
    expect(connA.connection.of('accepted')).toHaveLength(1)

    await connB.say({ ...delta(1, 'lama', 'ref-lama'), epoch: 1 } as SyncClientMessage)
    expect(connB.connection.of('error')).toEqual([
      { t: 'error', code: 'epoch_stale', clientRef: 'ref-lama' },
    ])

    const again = await connectDevice(fixture, hub, b)
    expect(again.connection.of('ready')[0]?.epoch).toBe(2)
  })
})

describe('validasi pesan', () => {
  it('pesan di luar schema (field asing, tipe salah) -> close 4400', async () => {
    const { fixture, devices } = await setup(1)
    const [a] = devices
    if (a === undefined) throw new Error('perangkat')

    for (const bad of [
      { t: 'ack', ids: [] },
      { t: 'send', clientRef: 'x', epoch: 1, kind: 'delta', seq: null, to: null, bytes: 'AAAA' },
      { t: 'ack', ids: [1], extra: true },
      { t: 'tidak-dikenal' },
    ]) {
      const conn = await connectDevice(fixture, createSyncHub(), a)
      await conn.say(JSON.stringify(bad))
      expect(conn.connection.closed?.code).toBe(SYNC_CLOSE_CODES.invalid_message)
    }
  })

  it('auth kedua setelah ready -> close 4400', async () => {
    const { fixture, devices } = await setup(1)
    const [a] = devices
    if (a === undefined) throw new Error('perangkat')
    const conn = await connectDevice(fixture, createSyncHub(), a)

    await conn.say({ t: 'auth', v: 1, token: a.token, sig: Buffer.alloc(64).toString('base64') })

    expect(conn.connection.closed?.code).toBe(SYNC_CLOSE_CODES.invalid_message)
  })
})
