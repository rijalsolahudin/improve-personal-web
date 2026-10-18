// @vitest-environment node
//
// Kunci & hapus akun (T19 + T21 bagian kunci). Level SERVICE terhadap Postgres nyata.
//
// Yang tidak bisa dibuktikan lewat HTTP ada di sini: "klaim transfer hanya sekali walau dua request
// paralel" (butuh DB), "ciphertext envelope sama persis dengan yang dikirim" (butuh DB), dan "hapus
// akun membuang SEMUA baris turunan" (butuh hitung baris per tabel).
import { randomUUID } from 'node:crypto'

import {
  KEY_ENVELOPE_MAX_KDF_PARAMS_BYTES,
  KEY_ENVELOPE_MAX_WRAPPED_KEY_BYTES,
  KEY_TRANSFER_ID_PATTERN,
  KEY_TRANSFER_TTL_SECONDS,
  keyEnvelopeListResultSchema,
  keyEnvelopePutInputSchema,
  keyTransferClaimParamsSchema,
  keyTransferCreateInputSchema,
} from '@improve-personal/contracts'
import { and, count, eq } from 'drizzle-orm'
import { afterAll, afterEach, describe, expect, it } from 'vitest'

import { deleteAccount, requestAccountDeletionOtp } from '../services/account'
import { resolveDeviceForLogin, revokeDevice } from '../services/device'
import { claimKeyTransfer, createKeyTransfer, listEnvelopes, putEnvelope } from '../services/keys'
import { issueSession, findSessionByToken } from '../services/session'
import { bytesToBase64, hmacSha256 } from '../utils/crypto'
import {
  devices,
  keyEnvelopes,
  keyTransfers,
  otpChallenges,
  rateLimits,
  records,
  sessions,
  syncWatermarks,
  users,
} from '../db/schema'
import { FIXED_OTP_CODE, requestOtp } from '../services/otp'
import { closeTestDb, FIXED_NOW, testDb } from './helpers/harness'
import { captureProblem, settledOutcomes, testScope } from './helpers/scope'

const scope = testScope()
const encoder = new TextEncoder()

function bytes(text: string): string {
  return bytesToBase64(encoder.encode(text))
}

const VALID_ENVELOPE = {
  slot: 'passkey' as const,
  wrappedKey: bytes('wrapped-master-key-ciphertext'),
  kdfParams: { algorithm: 'argon2id', memoryKiB: 65536, iterations: 3 },
}

afterEach(async () => {
  await scope.dispose()
})

afterAll(async () => {
  await closeTestDb()
})

describe('envelope kunci (`PUT /v1/keys/envelopes`)', () => {
  it.each(['otp', 'recovery'])(
    'slot %s ditolak schema (ADR 10 & 11: server tidak menyimpannya)',
    (slot) => {
      const parsed = keyEnvelopePutInputSchema.safeParse({ ...VALID_ENVELOPE, slot })

      expect(parsed.success).toBe(false)
    },
  )

  it('slot passkey diterima, slot asing/field asing ditolak', () => {
    expect(keyEnvelopePutInputSchema.safeParse(VALID_ENVELOPE).success).toBe(true)
    expect(
      keyEnvelopePutInputSchema.safeParse({ ...VALID_ENVELOPE, userId: randomUUID() }).success,
    ).toBe(false)
    expect(
      keyEnvelopePutInputSchema.safeParse({ ...VALID_ENVELOPE, slot: 'passkey2' }).success,
    ).toBe(false)
  })

  it('wrappedKey kelewat besar ditolak; tepat di batas diterima', () => {
    const atLimit = bytesToBase64(new Uint8Array(KEY_ENVELOPE_MAX_WRAPPED_KEY_BYTES))
    const overLimit = bytesToBase64(new Uint8Array(KEY_ENVELOPE_MAX_WRAPPED_KEY_BYTES + 3))

    expect(
      keyEnvelopePutInputSchema.safeParse({ ...VALID_ENVELOPE, wrappedKey: atLimit }).success,
    ).toBe(true)
    expect(
      keyEnvelopePutInputSchema.safeParse({ ...VALID_ENVELOPE, wrappedKey: overLimit }).success,
    ).toBe(false)
  })

  it('kdfParams kelewat besar atau terlalu banyak field ditolak', () => {
    const manyFields = Object.fromEntries(
      Array.from({ length: 17 }, (_, index) => [`field${index}`, 'x']),
    )
    const hugeValue = { algorithm: 'x'.repeat(KEY_ENVELOPE_MAX_KDF_PARAMS_BYTES + 1) }

    expect(
      keyEnvelopePutInputSchema.safeParse({ ...VALID_ENVELOPE, kdfParams: manyFields }).success,
    ).toBe(false)
    expect(
      keyEnvelopePutInputSchema.safeParse({ ...VALID_ENVELOPE, kdfParams: hugeValue }).success,
    ).toBe(false)
  })

  it('upsert idempoten: envelope yang sama tidak jadi dua baris', async () => {
    const fixture = scope.fixture({ prefix: 'envelope-upsert' })
    const userId = await fixture.userId()

    const first = await putEnvelope(fixture.ctx(), userId, VALID_ENVELOPE)
    const second = await putEnvelope(fixture.ctx(), userId, {
      ...VALID_ENVELOPE,
      wrappedKey: bytes('versi-kedua'),
      kdfParams: { algorithm: 'argon2id', memoryKiB: 32768 },
    })

    expect(second.wrappedKey).toBe(bytes('versi-kedua'))
    expect(second.updatedAt).toBeDefined()
    expect(first.updatedAt).toBeDefined()

    const rows = await fixture
      .ctx()
      .db.select()
      .from(keyEnvelopes)
      .where(eq(keyEnvelopes.userId, userId))
    expect(rows).toHaveLength(1)
  })

  it('server menyimpan ciphertext apa adanya dan tidak pernah mengembalikan plaintext', async () => {
    const fixture = scope.fixture({ prefix: 'envelope-cipher' })
    const userId = await fixture.userId()
    const wrapped = bytes('blob-opak-yang-tidak-bisa-dibaca-server')

    await putEnvelope(fixture.ctx(), userId, { ...VALID_ENVELOPE, wrappedKey: wrapped })

    const stored = await fixture
      .ctx()
      .db.select()
      .from(keyEnvelopes)
      .where(eq(keyEnvelopes.userId, userId))
    expect(bytesToBase64(stored.at(0)?.wrappedKey ?? new Uint8Array())).toBe(wrapped)

    const listed = await listEnvelopes(fixture.ctx(), userId)
    expect(listed.envelopes.at(0)?.wrappedKey).toBe(wrapped)
    expect(keyEnvelopeListResultSchema.safeParse(listed).success).toBe(true)
    expect(JSON.stringify(listed)).not.toContain('userId')
  })

  it('IDOR: envelope user A tidak terlihat oleh user B', async () => {
    const alice = scope.fixture({ prefix: 'envelope-alice' })
    const bob = scope.fixture({ prefix: 'envelope-bob' })
    const aliceId = await alice.userId()
    const bobId = await bob.userId()

    await putEnvelope(alice.ctx(), aliceId, { ...VALID_ENVELOPE, wrappedKey: bytes('milik-alice') })

    const bobList = await listEnvelopes(bob.ctx(), bobId)
    expect(bobList.envelopes).toEqual([])

    const aliceList = await listEnvelopes(alice.ctx(), aliceId)
    expect(aliceList.envelopes.at(0)?.wrappedKey).toBe(bytes('milik-alice'))
  })
})

describe('relay transfer kunci', () => {
  async function seedTwoDevices(prefix: string) {
    const fixture = scope.fixture({ prefix })
    const userId = await fixture.userId()
    const source = await resolveDeviceForLogin(fixture.ctx(), userId, {
      name: `${prefix} sumber`,
      platform: 'web',
    })
    const target = await resolveDeviceForLogin(fixture.ctx(), userId, {
      name: `${prefix} target`,
      platform: 'android',
    })

    return { fixture, userId, source, target }
  }

  it('create: id 128-bit acak (bukan UUID), TTL 120 detik ditentukan server', async () => {
    const { fixture, userId, source, target } = await seedTwoDevices('transfer-create')

    const created = await createKeyTransfer(fixture.ctx(), {
      userId,
      sourceDeviceId: source,
      targetDeviceId: target,
      blob: bytes('mk-terenkripsi'),
    })

    expect(created.id).toMatch(KEY_TRANSFER_ID_PATTERN)
    expect(created.id).toHaveLength(22)
    expect(new Date(created.expiresAt).getTime()).toBe(
      FIXED_NOW.getTime() + KEY_TRANSFER_TTL_SECONDS * 1000,
    )
  })

  it('client tidak bisa mengirim TTL sendiri (nilai dari klien tidak memperpanjang masa berlaku)', () => {
    expect(
      keyTransferCreateInputSchema.safeParse({
        targetDeviceId: randomUUID(),
        blob: bytes('x'),
        ttlSeconds: 86_400,
      }).success,
    ).toBe(false)
  })

  it('transfer ke perangkat sendiri / perangkat user lain / perangkat yang sudah di-revoke -> NOT_FOUND', async () => {
    const owner = await seedTwoDevices('transfer-target-owner')
    const other = await seedTwoDevices('transfer-target-other')
    const revokedDevice = await resolveDeviceForLogin(owner.fixture.ctx(), owner.userId, {
      name: 'transfer perangkat dicabut',
      platform: 'ios',
    })
    await revokeDevice(owner.fixture.ctx(), owner.userId, revokedDevice)

    const toSelf = await captureProblem(
      createKeyTransfer(owner.fixture.ctx(), {
        userId: owner.userId,
        sourceDeviceId: owner.source,
        targetDeviceId: owner.source,
        blob: bytes('x'),
      }),
    )
    const toOtherUser = await captureProblem(
      createKeyTransfer(owner.fixture.ctx(), {
        userId: owner.userId,
        sourceDeviceId: owner.source,
        targetDeviceId: other.target,
        blob: bytes('x'),
      }),
    )
    const toRevoked = await captureProblem(
      createKeyTransfer(owner.fixture.ctx(), {
        userId: owner.userId,
        sourceDeviceId: owner.source,
        targetDeviceId: revokedDevice,
        blob: bytes('x'),
      }),
    )
    const unknownDevice = await captureProblem(
      createKeyTransfer(owner.fixture.ctx(), {
        userId: owner.userId,
        sourceDeviceId: owner.source,
        targetDeviceId: randomUUID(),
        blob: bytes('x'),
      }),
    )

    expect(toSelf).toEqual({ code: 'NOT_FOUND', statusCode: 404 })
    expect(toOtherUser).toEqual(toSelf)
    expect(toRevoked).toEqual(toSelf)
    expect(unknownDevice).toEqual(toSelf)
  })

  it('claim: blob kembali apa adanya, dan hanya SEKALI walau dua request paralel', async () => {
    const { fixture, userId, source, target } = await seedTwoDevices('transfer-claim')
    const blob = bytes('mk-terenkripsi-hanya-untuk-target')
    const created = await createKeyTransfer(fixture.ctx(), {
      userId,
      sourceDeviceId: source,
      targetDeviceId: target,
      blob,
    })

    const results = await Promise.allSettled([
      claimKeyTransfer(fixture.ctx(), { userId, deviceId: target, id: created.id }),
      claimKeyTransfer(fixture.ctx(), { userId, deviceId: target, id: created.id }),
    ])

    const outcomes = settledOutcomes(results)
    expect(outcomes.filter((outcome) => outcome === 'fulfilled')).toHaveLength(1)
    const winner = results.find((result) => result.status === 'fulfilled')
    expect(winner?.status === 'fulfilled' ? winner.value.blob : null).toBe(blob)

    const claimant = await captureProblem(
      claimKeyTransfer(fixture.ctx(), { userId, deviceId: target, id: created.id }),
    )
    expect(claimant?.code).toBe('NOT_FOUND')
  })

  it('claim kadaluwarsa (> 120 s) ditolak dengan kode yang sama seperti id tak dikenal', async () => {
    const { fixture, userId, source, target } = await seedTwoDevices('transfer-expired')
    const created = await createKeyTransfer(fixture.ctx(), {
      userId,
      sourceDeviceId: source,
      targetDeviceId: target,
      blob: bytes('x'),
    })

    const expired = await captureProblem(
      claimKeyTransfer(fixture.ctxAt(new Date(FIXED_NOW.getTime() + 121_000)), {
        userId,
        deviceId: target,
        id: created.id,
      }),
    )
    const unknown = await captureProblem(
      claimKeyTransfer(fixture.ctx(), { userId, deviceId: target, id: 'a'.repeat(22) }),
    )

    expect(expired).toEqual({ code: 'NOT_FOUND', statusCode: 404 })
    expect(unknown).toEqual(expired)

    // Satu detik sebelum TTL masih bisa diklaim.
    const stillValid = await captureProblem(
      claimKeyTransfer(fixture.ctxAt(new Date(FIXED_NOW.getTime() + 119_000)), {
        userId,
        deviceId: target,
        id: created.id,
      }),
    )
    expect(stillValid).toBeNull()
  })

  it('claim dari perangkat lain (bukan target) / user lain -> 404 yang sama', async () => {
    const owner = await seedTwoDevices('transfer-wrong-device')
    const intruder = scope.fixture({ prefix: 'transfer-intruder' })
    const intruderId = await intruder.userId()
    const created = await createKeyTransfer(owner.fixture.ctx(), {
      userId: owner.userId,
      sourceDeviceId: owner.source,
      targetDeviceId: owner.target,
      blob: bytes('rahasia'),
    })

    const wrongDevice = await captureProblem(
      claimKeyTransfer(owner.fixture.ctx(), {
        userId: owner.userId,
        deviceId: owner.source,
        id: created.id,
      }),
    )
    const wrongUser = await captureProblem(
      claimKeyTransfer(intruder.ctx(), {
        userId: intruderId,
        deviceId: owner.target,
        id: created.id,
      }),
    )

    expect(wrongDevice).toEqual({ code: 'NOT_FOUND', statusCode: 404 })
    expect(wrongUser).toEqual(wrongDevice)

    // Transfer yang gagal diklaim tetap bisa diklaim perangkat target yang sah.
    const legitimate = await captureProblem(
      claimKeyTransfer(owner.fixture.ctx(), {
        userId: owner.userId,
        deviceId: owner.target,
        id: created.id,
      }),
    )
    expect(legitimate).toBeNull()
  })

  it('id transfer yang bukan 128-bit acak (mis. UUID) ditolak params schema', () => {
    expect(keyTransferClaimParamsSchema.safeParse({ id: randomUUID() }).success).toBe(false)
    expect(keyTransferClaimParamsSchema.safeParse({ id: 'pendek' }).success).toBe(false)
    expect(keyTransferClaimParamsSchema.safeParse({ id: 'a'.repeat(22) }).success).toBe(true)
  })
})

describe('hapus akun (`DELETE /v1/account`)', () => {
  async function rowCounts(userId: string, emailHash: string) {
    const db = testDb()

    const [
      deviceRows,
      sessionRows,
      envelopeRows,
      transferRows,
      recordRows,
      watermarkRows,
      userRows,
      otpRows,
    ] = await Promise.all([
      db.select({ total: count() }).from(devices).where(eq(devices.userId, userId)),
      db.select({ total: count() }).from(sessions).where(eq(sessions.userId, userId)),
      db.select({ total: count() }).from(keyEnvelopes).where(eq(keyEnvelopes.userId, userId)),
      db.select({ total: count() }).from(keyTransfers).where(eq(keyTransfers.userId, userId)),
      db.select({ total: count() }).from(records).where(eq(records.userId, userId)),
      db.select({ total: count() }).from(syncWatermarks).where(eq(syncWatermarks.userId, userId)),
      db.select({ total: count() }).from(users).where(eq(users.id, userId)),
      db
        .select({ total: count() })
        .from(otpChallenges)
        .where(eq(otpChallenges.emailHash, emailHash)),
    ])

    return {
      devices: deviceRows.at(0)?.total ?? 0,
      sessions: sessionRows.at(0)?.total ?? 0,
      envelopes: envelopeRows.at(0)?.total ?? 0,
      transfers: transferRows.at(0)?.total ?? 0,
      records: recordRows.at(0)?.total ?? 0,
      watermarks: watermarkRows.at(0)?.total ?? 0,
      users: userRows.at(0)?.total ?? 0,
      otpChallenges: otpRows.at(0)?.total ?? 0,
    }
  }

  async function seedOwnedData(prefix: string) {
    const fixture = scope.fixture({ prefix })
    const userId = await fixture.userId()
    const ctx = fixture.ctx()

    const source = await resolveDeviceForLogin(ctx, userId, {
      name: `${prefix} laptop`,
      platform: 'web',
    })
    const target = await resolveDeviceForLogin(ctx, userId, {
      name: `${prefix} hp`,
      platform: 'android',
    })
    const session = await issueSession(ctx, { userId, deviceId: source, client: 'web' })
    await putEnvelope(ctx, userId, VALID_ENVELOPE)
    const transfer = await createKeyTransfer(ctx, {
      userId,
      sourceDeviceId: source,
      targetDeviceId: target,
      blob: bytes('mk'),
    })
    await ctx.db.insert(records).values({
      userId,
      id: randomUUID(),
      hlc: '1000-0-a',
      hlcWallMs: 1000,
      hlcCounter: 0,
      hlcDevice: 'a',
      deleted: false,
      blob: encoder.encode('ciphertext'),
      createdAt: FIXED_NOW,
      updatedAt: FIXED_NOW,
    })
    await ctx.db.insert(syncWatermarks).values({ userId, purgedSeq: 3, updatedAt: FIXED_NOW })

    return { fixture, userId, session, transfer }
  }

  it('menghapus SEMUA baris turunan user, dan user lain tidak tersentuh', async () => {
    const owner = await seedOwnedData('delete-owner')
    const other = await seedOwnedData('delete-other')
    const ownerEmailHash = hmacSha256(owner.fixture.email, owner.fixture.env.otpPepper)

    await requestAccountDeletionOtp(owner.fixture.ctx(), {
      userId: owner.userId,
      email: owner.fixture.email,
      mailer: owner.fixture.mailer.mailer,
    })
    expect(owner.fixture.mailer.mails.at(0)?.code).toBe(FIXED_OTP_CODE)
    expect((await rowCounts(owner.userId, ownerEmailHash)).otpChallenges).toBe(1)

    await expect(
      deleteAccount(owner.fixture.ctx(), {
        userId: owner.userId,
        sessionEmail: owner.fixture.email,
        email: owner.fixture.email,
        code: FIXED_OTP_CODE,
      }),
    ).resolves.toBeUndefined()

    const afterDelete = await rowCounts(owner.userId, ownerEmailHash)
    expect(afterDelete).toEqual({
      devices: 0,
      sessions: 0,
      envelopes: 0,
      transfers: 0,
      records: 0,
      watermarks: 0,
      users: 0,
      otpChallenges: 0,
    })

    // Sesi yang sudah dihapus tidak bisa dipakai lagi.
    await expect(findSessionByToken(owner.fixture.ctx(), owner.session.token)).resolves.toBeNull()

    const otherCounts = await rowCounts(
      other.userId,
      hmacSha256(other.fixture.email, other.fixture.env.otpPepper),
    )
    expect(otherCounts).toMatchObject({
      devices: 2,
      sessions: 1,
      envelopes: 1,
      transfers: 1,
      records: 1,
      watermarks: 1,
      users: 1,
    })
  })

  it('email body yang tidak cocok dengan sesi -> OTP_INVALID, tidak ada yang terhapus', async () => {
    const owner = await seedOwnedData('delete-mismatch')
    await requestAccountDeletionOtp(owner.fixture.ctx(), {
      userId: owner.userId,
      email: owner.fixture.email,
      mailer: owner.fixture.mailer.mailer,
    })

    const problem = await captureProblem(
      deleteAccount(owner.fixture.ctx(), {
        userId: owner.userId,
        sessionEmail: owner.fixture.email,
        email: 'qa-orang-lain@qa.test',
        code: FIXED_OTP_CODE,
      }),
    )

    expect(problem?.code).toBe('OTP_INVALID')
    const counts = await rowCounts(
      owner.userId,
      hmacSha256(owner.fixture.email, owner.fixture.env.otpPepper),
    )
    expect(counts.users).toBe(1)
    expect(counts.devices).toBe(2)
  })

  it('kode salah -> OTP_INVALID dan user masih ada', async () => {
    const owner = await seedOwnedData('delete-code')
    await requestAccountDeletionOtp(owner.fixture.ctx(), {
      userId: owner.userId,
      email: owner.fixture.email,
      mailer: owner.fixture.mailer.mailer,
    })

    const problem = await captureProblem(
      deleteAccount(owner.fixture.ctx(), {
        userId: owner.userId,
        sessionEmail: owner.fixture.email,
        email: owner.fixture.email,
        code: '000000',
      }),
    )

    expect(problem?.code).toBe('OTP_INVALID')
    const counts = await rowCounts(
      owner.userId,
      hmacSha256(owner.fixture.email, owner.fixture.env.otpPepper),
    )
    expect(counts.users).toBe(1)
    expect(counts.records).toBe(1)
  })

  it('kode OTP `login` tidak bisa dipakai menghapus akun (purpose dipisah)', async () => {
    const owner = await seedOwnedData('delete-purpose')

    await requestOtp(owner.fixture.ctx(), {
      email: owner.fixture.email,
      purpose: 'login',
      mailer: owner.fixture.mailer.mailer,
    })

    const problem = await captureProblem(
      deleteAccount(owner.fixture.ctx(), {
        userId: owner.userId,
        sessionEmail: owner.fixture.email,
        email: owner.fixture.email,
        code: FIXED_OTP_CODE,
      }),
    )

    expect(problem?.code).toBe('OTP_INVALID')
    const counts = await rowCounts(
      owner.userId,
      hmacSha256(owner.fixture.email, owner.fixture.env.otpPepper),
    )
    expect(counts.users).toBe(1)
  })

  it('jatah `account:delete` milik AKUN, bukan bucket global (M1)', async () => {
    // Temuan M1: identifier-nya dulu konstanta `'delete-otp'`, jadi bucket-nya
    // `HMAC('delete-otp', pepper)` - SATU penghitung untuk seluruh sistem. Akibatnya 6 permintaan dari
    // satu orang memblokir permintaan hapus akun SEMUA user selama satu jam: hak subjek data yang bisa
    // dilumpuhkan siapa pun yang punya akun.
    const alice = await seedOwnedData('delete-ratelimit-alice')
    const bob = await seedOwnedData('delete-ratelimit-bob')

    const problems: (string | undefined)[] = []
    for (let attempt = 1; attempt <= 6; attempt += 1) {
      const problem = await captureProblem(
        requestAccountDeletionOtp(alice.fixture.ctx(), {
          userId: alice.userId,
          email: alice.fixture.email,
          mailer: alice.fixture.mailer.mailer,
        }),
      )
      problems.push(problem?.code)
    }

    // Lima permintaan pertama lolos, yang keenam kena jatahnya (limit 5 per jam).
    expect(problems.slice(0, 5)).toEqual([undefined, undefined, undefined, undefined, undefined])
    expect(problems.at(5)).toBe('RATE_LIMITED')

    // Inti perbaikannya: user lain TIDAK ikut terblokir.
    const bobProblem = await captureProblem(
      requestAccountDeletionOtp(bob.fixture.ctx(), {
        userId: bob.userId,
        email: bob.fixture.email,
        mailer: bob.fixture.mailer.mailer,
      }),
    )
    expect(bobProblem, 'jatah user lain ikut habis - bucket-nya masih global').toBeNull()
    expect(bob.fixture.mailer.mails).toHaveLength(1)

    // Bucket-nya tetap turunan identifier yang di-HMAC dengan pepper: tidak ada id user atau email
    // polos yang bisa dibaca dari tabel `rate_limits`.
    const buckets = await fixtureBucketsFor(alice.fixture.env, 'account:delete', alice.userId)
    expect(buckets).toBeGreaterThanOrEqual(1)
    expect(await plaintextLeakOf(alice.userId, alice.fixture.email)).toBe(false)
  })
})

/** Jumlah baris `rate_limits` scope ini yang bucket-nya milik identifier tersebut. */
async function fixtureBucketsFor(
  env: { readonly rateLimitPepper: string },
  scope: 'account:delete',
  identifier: string,
): Promise<number> {
  const rows = await testDb()
    .select({ bucket: rateLimits.bucket })
    .from(rateLimits)
    .where(
      and(
        eq(rateLimits.scope, scope),
        eq(rateLimits.bucket, hmacSha256(identifier, env.rateLimitPepper)),
      ),
    )

  return rows.length
}

/** Apakah ada nilai polos (id user / email) yang bocor ke tabel `rate_limits`. */
async function plaintextLeakOf(...values: readonly string[]): Promise<boolean> {
  const rows = await testDb().select().from(rateLimits)

  return rows.some((row) => values.some((value) => JSON.stringify(row).includes(value)))
}
