// @vitest-environment node
//
// Identitas kunci (KID) dan guard push. Level SERVICE terhadap Postgres nyata: atomik-nya klaim
// (unique `user_id` + ON CONFLICT) dan kolom `records.kid` hanya terbukti dengan DB sungguhan.
import { randomUUID } from 'node:crypto'

import { encodeKid, type SealedRecordDto } from '@improve-personal/contracts'
import { and, eq } from 'drizzle-orm'
import { afterAll, afterEach, describe, expect, it } from 'vitest'

import { accountKeys, records } from '../db/schema'
import { claimKeyIdentity, getActiveKeyIdentity } from '../services/keys'
import { pullRecords, pushRecords } from '../services/sync'
import { bytesToBase64, toBytes } from '../utils/crypto'
import {
  claimedUserId,
  closeTestDb,
  OTHER_TEST_KID,
  sealedBlobBase64,
  TEST_KID,
  testDb,
} from './helpers/harness'
import { captureProblem, testScope } from './helpers/scope'

const scope = testScope()

afterEach(async () => {
  await scope.dispose()
})

afterAll(async () => {
  await closeTestDb()
})

function record(id: string, blob: string, hlc = '1000-0-a'): SealedRecordDto {
  return { id, hlc, deleted: false, blob }
}

describe('claimKeyIdentity / getActiveKeyIdentity', () => {
  it('akun baru: identitas kosong; klaim pertama membuat baris (created) dan bisa dibaca', async () => {
    const fixture = scope.fixture({ prefix: 'kid-new' })
    const userId = await fixture.userId()

    await expect(getActiveKeyIdentity(fixture.ctx(), userId)).resolves.toEqual({
      kid: null,
      claimedAt: null,
      claimedByDeviceLabel: null,
    })

    const claim = await claimKeyIdentity(fixture.ctx(), userId, { kid: TEST_KID }, 'Laptop kantor')

    expect(claim.created).toBe(true)
    expect(claim.identity).toEqual({
      kid: TEST_KID,
      claimedAt: fixture.ctx().now.toISOString(),
      claimedByDeviceLabel: 'Laptop kantor',
    })
    await expect(getActiveKeyIdentity(fixture.ctx(), userId)).resolves.toEqual(claim.identity)
  })

  it('klaim ulang KID yang sama idempoten: tidak created, baris tidak berubah', async () => {
    const fixture = scope.fixture({ prefix: 'kid-idem' })
    const userId = await fixture.userId()
    const first = await claimKeyIdentity(fixture.ctx(), userId, { kid: TEST_KID }, 'Perangkat A')

    const again = await claimKeyIdentity(
      fixture.ctxAt(new Date(fixture.ctx().now.getTime() + 60_000)),
      userId,
      { kid: TEST_KID },
      'Perangkat B',
    )

    expect(again.created).toBe(false)
    expect(again.identity).toEqual(first.identity)
  })

  it('KID berbeda -> KEY_IDENTITY_CONFLICT (409) dan identitas lama tetap', async () => {
    const fixture = scope.fixture({ prefix: 'kid-conflict' })
    const userId = await fixture.userId()
    await claimKeyIdentity(fixture.ctx(), userId, { kid: TEST_KID }, 'Perangkat A')

    const problem = await captureProblem(
      claimKeyIdentity(fixture.ctx(), userId, { kid: OTHER_TEST_KID }, 'Perangkat B'),
    )

    expect(problem).toEqual({ code: 'KEY_IDENTITY_CONFLICT', statusCode: 409 })
    expect((await getActiveKeyIdentity(fixture.ctx(), userId)).kid).toBe(TEST_KID)
  })

  it('dua klaim paralel dengan KID berbeda: tepat satu menang (created), satu 409', async () => {
    const fixture = scope.fixture({ prefix: 'kid-race' })
    const userId = await fixture.userId()

    const outcomes = await Promise.allSettled([
      claimKeyIdentity(fixture.ctx(), userId, { kid: TEST_KID }, 'Perangkat A'),
      claimKeyIdentity(fixture.ctx(), userId, { kid: OTHER_TEST_KID }, 'Perangkat B'),
    ])

    const won = outcomes.filter((outcome) => outcome.status === 'fulfilled')
    const lost = outcomes.filter((outcome) => outcome.status === 'rejected')
    expect(won).toHaveLength(1)
    expect(lost).toHaveLength(1)
    expect(lost[0]?.reason).toMatchObject({ code: 'KEY_IDENTITY_CONFLICT' })

    const rows = await testDb().select().from(accountKeys).where(eq(accountKeys.userId, userId))
    expect(rows).toHaveLength(1)
  })

  it('dua klaim paralel dengan KID sama: keduanya sukses, satu baris', async () => {
    const fixture = scope.fixture({ prefix: 'kid-race-same' })
    const userId = await fixture.userId()

    const results = await Promise.all([
      claimKeyIdentity(fixture.ctx(), userId, { kid: TEST_KID }, 'Perangkat A'),
      claimKeyIdentity(fixture.ctx(), userId, { kid: TEST_KID }, 'Perangkat B'),
    ])

    expect(results.filter((result) => result.created)).toHaveLength(1)
    const rows = await testDb().select().from(accountKeys).where(eq(accountKeys.userId, userId))
    expect(rows).toHaveLength(1)
  })

  it('identitas ter-scope per akun: klaim akun lain tidak bentrok', async () => {
    const alice = scope.fixture({ prefix: 'kid-alice' })
    const bob = scope.fixture({ prefix: 'kid-bob' })
    const aliceId = await alice.userId()
    const bobId = await bob.userId()

    await claimKeyIdentity(alice.ctx(), aliceId, { kid: TEST_KID }, 'A')
    const bobClaim = await claimKeyIdentity(bob.ctx(), bobId, { kid: OTHER_TEST_KID }, 'B')

    expect(bobClaim.created).toBe(true)
    expect((await getActiveKeyIdentity(alice.ctx(), aliceId)).kid).toBe(TEST_KID)
  })

  it('CHECK 16 byte: KID salah panjang tidak bisa masuk walau lolos jalur aplikasi', async () => {
    const fixture = scope.fixture({ prefix: 'kid-check' })
    const userId = await fixture.userId()

    await expect(
      testDb()
        .insert(accountKeys)
        .values({ id: randomUUID(), userId, kid: new Uint8Array(15) }),
    ).rejects.toThrow()
  })
})

describe('guard push berdasarkan KID', () => {
  const statuses = (results: readonly { status: string }[]) => results.map((r) => r.status)

  it('akun tanpa KID aktif: semua record rejected dan tidak ada yang tertulis', async () => {
    const fixture = scope.fixture({ prefix: 'push-nokid' })
    const userId = await fixture.userId()
    const ids = [randomUUID(), randomUUID()]

    const { results } = await pushRecords(
      fixture.ctx(),
      userId,
      ids.map((id) => record(id, sealedBlobBase64('x'))),
    )

    expect(statuses(results)).toEqual(['rejected', 'rejected'])
    const pulled = await pullRecords(fixture.ctx(), userId, { cursor: 0, limit: 10 })
    expect(pulled.records).toEqual([])
  })

  it('KID di blob tidak cocok dengan KID aktif: rejected', async () => {
    const fixture = scope.fixture({ prefix: 'push-wrongkid' })
    const userId = await claimedUserId(fixture, TEST_KID)
    const id = randomUUID()

    const { results } = await pushRecords(fixture.ctx(), userId, [
      record(id, sealedBlobBase64('x', OTHER_TEST_KID)),
    ])

    expect(statuses(results)).toEqual(['rejected'])
    const rows = await testDb().select().from(records).where(eq(records.userId, userId))
    expect(rows).toEqual([])
  })

  it('blob tanpa header v2 (versi lain, magic salah, terlalu pendek): rejected', async () => {
    const fixture = scope.fixture({ prefix: 'push-badheader' })
    const userId = await claimedUserId(fixture)
    const valid = Buffer.from(sealedBlobBase64('x'), 'base64')
    const wrongVersion = Uint8Array.from(valid)
    wrongVersion[3] = 0x01
    const wrongMagic = Uint8Array.from(valid)
    wrongMagic[0] = 0x00

    const { results } = await pushRecords(fixture.ctx(), userId, [
      record(randomUUID(), bytesToBase64(wrongVersion)),
      record(randomUUID(), bytesToBase64(wrongMagic)),
      record(randomUUID(), bytesToBase64(valid.subarray(0, 59))),
      record(randomUUID(), bytesToBase64(new TextEncoder().encode('ciphertext-v1-tanpa-header'))),
    ])

    expect(statuses(results)).toEqual(['rejected', 'rejected', 'rejected', 'rejected'])
  })

  it('KID cocok: applied seperti biasa, kolom records.kid tersimpan, LWW tetap jalan', async () => {
    const fixture = scope.fixture({ prefix: 'push-okkid' })
    const userId = await claimedUserId(fixture)
    const id = randomUUID()

    const first = await pushRecords(fixture.ctx(), userId, [
      record(id, sealedBlobBase64('versi-1'), '1000-0-a'),
    ])
    expect(statuses(first.results)).toEqual(['applied'])

    const stale = await pushRecords(fixture.ctx(), userId, [
      record(id, sealedBlobBase64('versi-lama'), '999-0-a'),
    ])
    expect(statuses(stale.results)).toEqual(['stale'])

    const newer = await pushRecords(fixture.ctx(), userId, [
      record(id, sealedBlobBase64('versi-2'), '1001-0-a'),
    ])
    expect(statuses(newer.results)).toEqual(['applied'])

    const [row] = await testDb()
      .select()
      .from(records)
      .where(and(eq(records.userId, userId), eq(records.id, id)))
    expect(row?.kid ? encodeKid(toBytes(row.kid)) : null).toBe(TEST_KID)
    expect(row?.hlc).toBe('1001-0-a')
  })

  it('batch campuran: record ber-KID benar masuk, yang salah ditolak satu-satu', async () => {
    const fixture = scope.fixture({ prefix: 'push-mixed' })
    const userId = await claimedUserId(fixture)

    const { results } = await pushRecords(fixture.ctx(), userId, [
      record(randomUUID(), sealedBlobBase64('a')),
      record(randomUUID(), sealedBlobBase64('b', OTHER_TEST_KID)),
      record(randomUUID(), sealedBlobBase64('c')),
    ])

    expect(statuses(results)).toEqual(['applied', 'rejected', 'applied'])
  })

  it('KID bukan milik akun lain: KID akun A tidak membuka push akun B', async () => {
    const alice = scope.fixture({ prefix: 'push-alice' })
    const bob = scope.fixture({ prefix: 'push-bob' })
    await claimedUserId(alice, TEST_KID)
    const bobId = await claimedUserId(bob, OTHER_TEST_KID)

    const { results } = await pushRecords(bob.ctx(), bobId, [
      record(randomUUID(), sealedBlobBase64('x', TEST_KID)),
    ])

    expect(statuses(results)).toEqual(['rejected'])
  })

  it('pull tidak terpengaruh guard: record yang sudah tersimpan tetap terbaca', async () => {
    const fixture = scope.fixture({ prefix: 'pull-unchanged' })
    const userId = await claimedUserId(fixture)
    const blob = sealedBlobBase64('isi')
    const id = randomUUID()
    await pushRecords(fixture.ctx(), userId, [record(id, blob)])

    const pulled = await pullRecords(fixture.ctx(), userId, { cursor: 0, limit: 10 })

    expect(pulled.records.map((r) => r.blob)).toEqual([blob])
  })
})
