// @vitest-environment node
//
// QA #112 - celah di luar sync-concurrency.test.ts: kunci lock, urutan lock, lock dilepas saat rollback,
// dan tidak bentrok dengan lock `devices:<userId>`. Postgres nyata.
import { randomUUID } from 'node:crypto'

import type { SealedRecordDto } from '@improve-personal/contracts'
import { eq, sql } from 'drizzle-orm'
import { afterAll, afterEach, describe, expect, it } from 'vitest'

import { records } from '../db/schema'
import { pushRecords } from '../services/sync'
import { claimedUserId, closeTestDb, sealedBlobBase64, testDb } from './helpers/harness'
import { testScope } from './helpers/scope'

const scope = testScope()
const POLL_INTERVAL_MS = 20
const POLL_TIMEOUT_MS = 10_000
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

/** Pegang advisory lock transaksi `key` lewat transaksi mentah sampai `release()`. */
async function holdAdvisoryLock(key: string): Promise<{ pid: number; release(): Promise<void> }> {
  let open: () => void = () => undefined
  const gate = new Promise<void>((resolve) => {
    open = resolve
  })
  let announce: (pid: number) => void = () => undefined
  const pidKnown = new Promise<number>((resolve) => {
    announce = resolve
  })
  const transaction = testDb().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${key}))`)
    const rows = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`)
    announce(rows[0]?.pid ?? 0)
    await gate
  })

  return {
    pid: await pidKnown,
    async release() {
      open()
      await transaction
    },
  }
}

async function waitingForAdvisoryLockBehind(pid: number): Promise<boolean> {
  const rows = await testDb().execute<{ total: number }>(
    sql`select count(*)::int as total from pg_stat_activity a
        join pg_locks l on l.pid = a.pid and l.locktype = 'advisory' and not l.granted
        where ${pid} = any(pg_blocking_pids(a.pid))`,
  )

  return (rows[0]?.total ?? 0) > 0
}

afterEach(async () => {
  await scope.dispose()
})

afterAll(async () => {
  await closeTestDb()
})

describe('kunci advisory push (#112, QA)', () => {
  it('push menunggu di advisory lock `sync-push:<userId>` sebelum menyentuh baris/seq', async () => {
    const fixture = scope.fixture({ prefix: 'qa112-order' })
    const userId = await claimedUserId(fixture)
    const id = randomUUID()
    const lock = await holdAdvisoryLock(`sync-push:${userId}`)

    const push = pushRecords(fixture.ctx(), userId, [sealedRecord(id, '1000-0-a')])
    await waitUntil(() => waitingForAdvisoryLockBehind(lock.pid))

    // Selama menunggu lock: belum ada baris yang dibuat (nextval/insert belum jalan).
    expect(await testDb().select().from(records).where(eq(records.id, id))).toHaveLength(0)

    await lock.release()
    expect((await push).results.map((entry) => entry.status)).toEqual(['applied'])
  })

  it('lock `devices:<userId>` tidak memblokir push (nama lock tidak bentrok)', async () => {
    const fixture = scope.fixture({ prefix: 'qa112-devices' })
    const userId = await claimedUserId(fixture)
    const lock = await holdAdvisoryLock(`devices:${userId}`)

    const outcome = pushRecords(fixture.ctx(), userId, [sealedRecord(randomUUID(), '1000-0-a')])
    const stillPending = await isStillPending(outcome, STILL_BLOCKED_MS)
    await lock.release()
    await outcome

    expect(stillPending).toBe(false)
  })

  it('lock user lain tidak memblokir push user ini', async () => {
    const alice = scope.fixture({ prefix: 'qa112-iso-a' })
    const bob = scope.fixture({ prefix: 'qa112-iso-b' })
    const aliceId = await claimedUserId(alice)
    const bobId = await claimedUserId(bob)
    const lock = await holdAdvisoryLock(`sync-push:${aliceId}`)

    const outcome = pushRecords(bob.ctx(), bobId, [sealedRecord(randomUUID(), '1000-0-b')])
    const stillPending = await isStillPending(outcome, STILL_BLOCKED_MS)
    await lock.release()
    await outcome

    expect(stillPending).toBe(false)
  })

  it('batch gagal di tengah: rollback total dan lock dilepas (push berikutnya tidak menggantung)', async () => {
    const fixture = scope.fixture({ prefix: 'qa112-rollback' })
    const userId = await claimedUserId(fixture)
    const goodId = randomUUID()
    const badId = 'bukan-uuid'

    // Record pertama valid (sudah dapat seq), record kedua melempar error DB -> transaksi rollback.
    await expect(
      pushRecords(fixture.ctx(), userId, [
        sealedRecord(goodId, '1000-0-a'),
        sealedRecord(badId, '1001-0-a'),
      ]),
    ).rejects.toThrow()

    expect(await testDb().select().from(records).where(eq(records.userId, userId))).toHaveLength(0)

    const next = pushRecords(fixture.ctx(), userId, [sealedRecord(goodId, '1002-0-a')])
    expect(await isStillPending(next, STILL_BLOCKED_MS)).toBe(false)
    expect((await next).results.map((entry) => entry.status)).toEqual(['applied'])

    const leftover = await testDb().execute<{ total: number }>(
      sql`select count(*)::int as total from pg_locks where locktype = 'advisory' and granted
          and pid in (select pid from pg_stat_activity where datname = current_database() and state = 'idle')`,
    )
    expect(leftover[0]?.total).toBe(0)
  })
})
