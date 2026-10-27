// @vitest-environment node
//
// Sync (#112) - push paralel untuk user yang sama vs cursor pull. Postgres nyata.
//
// Bug yang dikunci: `nextval('records_seq')` dialokasikan SEBELUM commit. Tanpa serialisasi, T1 dapat
// seq 100, T2 dapat 101, T2 commit duluan, perangkat lain pull dan cursor-nya jadi 101, lalu T1
// commit -> record seq 100 tidak pernah ditarik. Interleaving itu dibuat DETERMINISTIK di sini
// (bukan mengandalkan balapan): sebuah transaksi mentah menahan baris record X, sehingga push P1
// berhenti di tengah batch SETELAH record pertamanya mendapat seq tapi SEBELUM commit.
import { randomUUID } from 'node:crypto'

import type { SealedRecordDto } from '@improve-personal/contracts'
import { and, eq, sql } from 'drizzle-orm'
import { afterAll, afterEach, describe, expect, it } from 'vitest'

import { records } from '../db/schema'
import { pullRecords, pushRecords } from '../services/sync'
import { claimedUserId, closeTestDb, sealedBlobBase64, testDb } from './helpers/harness'
import { testScope } from './helpers/scope'

const scope = testScope()

/** Selang polling kondisi DB dan batas tunggunya; cukup longgar untuk CI yang lambat. */
const POLL_INTERVAL_MS = 20
const POLL_TIMEOUT_MS = 10_000
/** Waktu tunggu untuk membuktikan sebuah push TIDAK selesai selama lock dipegang (bukti negatif). */
const STILL_BLOCKED_MS = 400

function sealedRecord(id: string, hlc: string): SealedRecordDto {
  return { id, hlc, deleted: false, blob: sealedBlobBase64(`ciphertext-${id}`) }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitUntil(condition: () => Promise<boolean>): Promise<void> {
  const deadline = Date.now() + POLL_TIMEOUT_MS
  while (!(await condition())) {
    if (Date.now() > deadline) throw new Error('kondisi DB tidak tercapai tepat waktu')
    await delay(POLL_INTERVAL_MS)
  }
}

/** `true` kalau promise belum selesai setelah `ms`; tidak pernah melempar. */
async function isStillPending(promise: Promise<unknown>, ms: number): Promise<boolean> {
  const pending = Symbol('pending')
  const outcome = await Promise.race([
    promise.then(
      () => 'settled',
      () => 'settled',
    ),
    delay(ms).then(() => pending),
  ])

  return outcome === pending
}

type RowLock = {
  readonly backendPid: number
  release(): Promise<void>
}

/**
 * Tahan baris `records` (user, id) lewat transaksi mentah yang tetap terbuka. Push yang menyentuh
 * baris itu akan menunggu di `SELECT ... FOR UPDATE` sampai `release()`.
 */
async function holdRecordRow(userId: string, id: string): Promise<RowLock> {
  let releaseGate: () => void = () => undefined
  const gate = new Promise<void>((resolve) => {
    releaseGate = resolve
  })
  let announcePid: (pid: number) => void = () => undefined
  const pidKnown = new Promise<number>((resolve) => {
    announcePid = resolve
  })

  const transaction = testDb().transaction(async (tx) => {
    await tx
      .select({ id: records.id })
      .from(records)
      .where(and(eq(records.userId, userId), eq(records.id, id)))
      .for('update')
    const rows = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`)
    announcePid(rows[0]?.pid ?? 0)
    await gate
  })

  return {
    backendPid: await pidKnown,
    async release() {
      releaseGate()
      await transaction
    },
  }
}

/** Ada backend lain yang sedang menunggu transaksi `pid` (artinya push sudah sampai di baris X). */
async function isSomeoneBlockedBy(pid: number): Promise<boolean> {
  const rows = await testDb().execute<{ total: number }>(
    sql`select count(*)::int as total from pg_stat_activity where ${pid} = any(pg_blocking_pids(pid))`,
  )

  return (rows[0]?.total ?? 0) > 0
}

afterEach(async () => {
  await scope.dispose()
})

afterAll(async () => {
  await closeTestDb()
})

describe('push paralel user yang sama diserialkan (#112)', () => {
  it('pull di tengah dua push paralel tidak melompati record (seq lebih kecil commit lebih dulu)', async () => {
    const fixture = scope.fixture({ prefix: 'sync-concurrent' })
    const userId = await claimedUserId(fixture)
    const heldId = randomUUID()
    const slowId = randomUUID()
    const fastId = randomUUID()

    await pushRecords(fixture.ctx(), userId, [sealedRecord(heldId, '1000-0-a')])
    const rowLock = await holdRecordRow(userId, heldId)

    // P1 (perangkat A): `slowId` baru -> dapat seq, lalu `heldId` menunggu baris yang ditahan.
    // Di titik ini P1 punya seq tapi belum commit.
    const firstPush = pushRecords(fixture.ctx(), userId, [
      sealedRecord(slowId, '1001-0-a'),
      sealedRecord(heldId, '2000-0-a'),
    ])
    await waitUntil(() => isSomeoneBlockedBy(rowLock.backendPid))

    // P2 (perangkat B) mulai SETELAH P1 memegang seq-nya. Tanpa serialisasi P2 langsung selesai
    // dengan seq yang lebih besar dari P1 - itulah yang melompatkan cursor perangkat C.
    const secondPush = pushRecords(fixture.ctx(), userId, [sealedRecord(fastId, '1002-0-b')])
    const secondWaited = await isStillPending(secondPush, STILL_BLOCKED_MS)

    // Perangkat C pull di tengah-tengah: hanya yang sudah committed yang terlihat.
    const firstPull = await pullRecords(fixture.ctx(), userId, { cursor: 0, limit: 50 })

    await rowLock.release()
    const [firstResult, secondResult] = await Promise.all([firstPush, secondPush])

    const secondPull = await pullRecords(fixture.ctx(), userId, {
      cursor: firstPull.nextCursor,
      limit: 50,
    })
    const seen = new Set([...firstPull.records, ...secondPull.records].map((record) => record.id))

    expect(secondWaited).toBe(true)
    expect(seen).toEqual(new Set([heldId, slowId, fastId]))

    const slowSeq = firstResult.results.at(0)?.serverSeq ?? 0
    const fastSeq = secondResult.results.at(0)?.serverSeq ?? 0
    expect(fastSeq).toBeGreaterThan(slowSeq)
    expect(firstPull.records.map((record) => record.id)).not.toContain(fastId)
  })

  it('serialisasi hanya per user: push user lain tidak menunggu', async () => {
    const alice = scope.fixture({ prefix: 'sync-lock-alice' })
    const bob = scope.fixture({ prefix: 'sync-lock-bob' })
    const aliceId = await claimedUserId(alice)
    const bobId = await claimedUserId(bob)
    const heldId = randomUUID()

    await pushRecords(alice.ctx(), aliceId, [sealedRecord(heldId, '1000-0-a')])
    const rowLock = await holdRecordRow(aliceId, heldId)

    const alicePush = pushRecords(alice.ctx(), aliceId, [
      sealedRecord(randomUUID(), '1001-0-a'),
      sealedRecord(heldId, '2000-0-a'),
    ])
    await waitUntil(() => isSomeoneBlockedBy(rowLock.backendPid))

    const bobResult = await pushRecords(bob.ctx(), bobId, [sealedRecord(randomUUID(), '1000-0-b')])

    expect(bobResult.results.map((entry) => entry.status)).toEqual(['applied'])
    expect(await isStillPending(alicePush, STILL_BLOCKED_MS)).toBe(true)

    await rowLock.release()
    const aliceResult = await alicePush
    expect(aliceResult.results.map((entry) => entry.status)).toEqual(['applied', 'applied'])
  })

  it('LWW dan atomik per batch tetap berlaku: dua push paralel untuk record yang sama, HLC terbesar menang', async () => {
    const fixture = scope.fixture({ prefix: 'sync-concurrent-lww' })
    const userId = await claimedUserId(fixture)
    const id = randomUUID()

    const results = await Promise.all([
      pushRecords(fixture.ctx(), userId, [sealedRecord(id, '3000-0-a')]),
      pushRecords(fixture.ctx(), userId, [sealedRecord(id, '2000-0-b')]),
      pushRecords(fixture.ctx(), userId, [sealedRecord(id, '4000-0-c')]),
    ])

    const stored = await testDb()
      .select({ hlc: records.hlc })
      .from(records)
      .where(and(eq(records.userId, userId), eq(records.id, id)))
    expect(stored.at(0)?.hlc).toBe('4000-0-c')

    const statuses = results.flatMap((result) => result.results.map((entry) => entry.status))
    expect(statuses.filter((status) => status === 'applied').length).toBeGreaterThanOrEqual(1)
    expect(statuses.every((status) => status === 'applied' || status === 'stale')).toBe(true)
  })
})
