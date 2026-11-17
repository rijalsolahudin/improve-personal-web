// @vitest-environment node
import { createPublicKey, randomUUID, verify } from 'node:crypto'

import { licenseTokenPayloadSchema, splitLicenseToken } from '@improve-personal/contracts'
import { eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'

import { licenseActivations, licenseGrants, licenses, users } from '../db/schema'
import {
  extendLicenseTerm,
  grantLicense,
  issueLicenseToken,
  refreshLicenseToken,
} from '../services/license'
import {
  closeTestDb,
  makeEnv,
  seedSession,
  testDb,
  TEST_LICENSE_PUBLIC_KEY,
} from './helpers/harness'
import { captureProblem, testScope } from './helpers/scope'

const scope = testScope()

afterAll(async () => {
  await scope.dispose()
  await closeTestDb()
})

/** Verifikasi token seperti app: tanda tangan Ed25519 atas `<payload>` dengan public key build. */
function verifyToken(token: string) {
  const parts = splitLicenseToken(token)
  if (parts === null) throw new Error('bentuk token salah')

  // SPKI DER Ed25519 = prefix tetap + 32 byte public key mentah.
  const publicKey = createPublicKey({
    key: Buffer.concat([
      Buffer.from('302a300506032b6570032100', 'hex'),
      Buffer.from(TEST_LICENSE_PUBLIC_KEY, 'base64'),
    ]),
    format: 'der',
    type: 'spki',
  })
  const isValid = verify(
    null,
    Buffer.from(parts.signed, 'utf8'),
    publicKey,
    Buffer.from(parts.signature, 'base64url'),
  )
  const payload: unknown = JSON.parse(Buffer.from(parts.signed, 'base64url').toString('utf8'))

  return { isValid, payload: licenseTokenPayloadSchema.parse(payload) }
}

async function activationCount(licenseId: string): Promise<number> {
  const rows = await testDb()
    .select()
    .from(licenseActivations)
    .where(eq(licenseActivations.licenseId, licenseId))
  return rows.length
}

describe('issueLicenseToken', () => {
  it('email yang belum membeli -> LICENSE_REQUIRED', async () => {
    const fixture = scope.fixture({ prefix: 'license-none' })
    const session = await seedSession(fixture.ctx(), { email: fixture.email })

    const problem = await captureProblem(
      issueLicenseToken(fixture.ctx(), { email: fixture.email, deviceId: session.deviceId }),
    )

    expect(problem).toEqual({ code: 'LICENSE_REQUIRED', statusCode: 403 })
  })

  it('pembeli: token bertanda tangan sah, mengikat lisensi + perangkat, tanpa email', async () => {
    const fixture = scope.fixture({ prefix: 'license-ok' })
    const license = await grantLicense(fixture.ctx(), {
      email: fixture.email,
      orderRef: `qa-${randomUUID()}`,
      plan: 'lifetime',
    })
    const session = await seedSession(fixture.ctx(), { email: fixture.email })

    const token = await issueLicenseToken(fixture.ctx(), {
      email: fixture.email,
      deviceId: session.deviceId,
    })
    const { isValid, payload } = verifyToken(token)

    expect(isValid).toBe(true)
    expect(payload).toMatchObject({
      v: 2,
      lid: license.id,
      did: session.deviceId,
      ed: 'standard',
      plan: 'lifetime',
      exp: null,
    })
    expect(token).not.toContain(fixture.email)
    expect(Buffer.from(token.split('.')[0] ?? '', 'base64url').toString()).not.toContain('@')
  })

  it('tanda tangan diubah satu karakter -> tidak lagi valid', async () => {
    const fixture = scope.fixture({ prefix: 'license-tamper' })
    await grantLicense(fixture.ctx(), {
      email: fixture.email,
      orderRef: `qa-${randomUUID()}`,
      plan: 'lifetime',
    })
    const session = await seedSession(fixture.ctx(), { email: fixture.email })
    const token = await issueLicenseToken(fixture.ctx(), {
      email: fixture.email,
      deviceId: session.deviceId,
    })

    const [signed, signature = ''] = token.split('.')
    const flipped = `${signature.startsWith('A') ? 'B' : 'A'}${signature.slice(1)}`

    expect(verifyToken(`${signed}.${flipped}`).isValid).toBe(false)
  })

  it('perangkat yang sama minta ulang -> tidak memakai jatah lagi', async () => {
    const fixture = scope.fixture({ prefix: 'license-same-device' })
    const license = await grantLicense(fixture.ctx(), {
      email: fixture.email,
      orderRef: `qa-${randomUUID()}`,
      plan: 'lifetime',
    })
    const session = await seedSession(fixture.ctx(), { email: fixture.email })
    const input = { email: fixture.email, deviceId: session.deviceId }

    await issueLicenseToken(fixture.ctx(), input)
    await issueLicenseToken(fixture.ctx(), input)

    expect(await activationCount(license.id)).toBe(1)
  })

  it('jatah perangkat habis -> perangkat baru ditolak, perangkat lama tetap dilayani', async () => {
    const fixture = scope.fixture({ prefix: 'license-limit' })
    const license = await grantLicense(fixture.ctx(), {
      email: fixture.email,
      orderRef: `qa-${randomUUID()}`,
      plan: 'lifetime',
    })
    await testDb().update(licenses).set({ maxActivations: 1 }).where(eq(licenses.id, license.id))

    const first = await seedSession(fixture.ctx(), {
      email: fixture.email,
      installationId: randomUUID(),
    })
    const second = await seedSession(fixture.ctx(), {
      email: fixture.email,
      installationId: randomUUID(),
    })

    await issueLicenseToken(fixture.ctx(), { email: fixture.email, deviceId: first.deviceId })
    const problem = await captureProblem(
      issueLicenseToken(fixture.ctx(), { email: fixture.email, deviceId: second.deviceId }),
    )

    expect(problem).toEqual({ code: 'LICENSE_LIMIT_REACHED', statusCode: 409 })
    await expect(
      issueLicenseToken(fixture.ctx(), { email: fixture.email, deviceId: first.deviceId }),
    ).resolves.toEqual(expect.any(String))
  })

  it('lisensi dicabut (refund) -> LICENSE_REQUIRED', async () => {
    const fixture = scope.fixture({ prefix: 'license-revoked' })
    const license = await grantLicense(fixture.ctx(), {
      email: fixture.email,
      orderRef: `qa-${randomUUID()}`,
      plan: 'lifetime',
    })
    await testDb()
      .update(licenses)
      .set({ revokedAt: fixture.ctx().now })
      .where(eq(licenses.id, license.id))
    const session = await seedSession(fixture.ctx(), { email: fixture.email })

    const problem = await captureProblem(
      issueLicenseToken(fixture.ctx(), { email: fixture.email, deviceId: session.deviceId }),
    )

    expect(problem?.code).toBe('LICENSE_REQUIRED')
  })
})

describe('super admin', () => {
  /** Fixture yang email-nya terdaftar di `NUXT_SUPER_ADMIN_EMAILS`. */
  function superAdmin(prefix: string) {
    const fixture = scope.fixture({ prefix })
    const ctx = fixture.ctx({ env: makeEnv({ superAdminEmails: fixture.email.toUpperCase() }) })
    return { fixture, ctx }
  }

  async function roleOf(email: string) {
    const [row] = await testDb()
      .select({ role: users.role })
      .from(users)
      .where(eq(users.email, email))
    return row?.role
  }

  it('tanpa pembelian -> token lifetime sah', async () => {
    const { fixture, ctx } = superAdmin('license-super')
    const session = await seedSession(ctx, { email: fixture.email })

    const token = await issueLicenseToken(ctx, { email: fixture.email, deviceId: session.deviceId })

    const { isValid, payload } = verifyToken(token)
    expect(isValid).toBe(true)
    expect(payload).toMatchObject({ plan: 'lifetime', exp: null, did: session.deviceId })
    expect(await roleOf(fixture.email)).toBe('super_admin')
  })

  it('lisensi yang dicabut/berjangka dipulihkan jadi lifetime', async () => {
    const { fixture, ctx } = superAdmin('license-super-revoked')
    const license = await grantLicense(ctx, {
      email: fixture.email,
      orderRef: `qa-${randomUUID()}`,
      plan: 'monthly',
    })
    await testDb().update(licenses).set({ revokedAt: ctx.now }).where(eq(licenses.id, license.id))
    const session = await seedSession(ctx, { email: fixture.email })

    const token = await issueLicenseToken(ctx, { email: fixture.email, deviceId: session.deviceId })

    expect(verifyToken(token).payload).toMatchObject({
      lid: license.id,
      plan: 'lifetime',
      exp: null,
    })
  })

  it('email dihapus dari env -> turun jadi member di login berikutnya', async () => {
    const { fixture, ctx } = superAdmin('license-super-demoted')
    await seedSession(ctx, { email: fixture.email })
    expect(await roleOf(fixture.email)).toBe('super_admin')

    await seedSession(fixture.ctx(), { email: fixture.email })

    expect(await roleOf(fixture.email)).toBe('member')
  })

  it('member tanpa pembelian tetap LICENSE_REQUIRED', async () => {
    const fixture = scope.fixture({ prefix: 'license-member' })
    const ctx = fixture.ctx({ env: makeEnv({ superAdminEmails: 'orang-lain@example.com' }) })
    const session = await seedSession(ctx, { email: fixture.email })

    const problem = await captureProblem(
      issueLicenseToken(ctx, { email: fixture.email, deviceId: session.deviceId }),
    )

    expect(problem?.code).toBe('LICENSE_REQUIRED')
    expect(await roleOf(fixture.email)).toBe('member')
  })
})

const DAY_MS = 24 * 60 * 60 * 1000
const NOW = new Date('2026-11-17T00:00:00.000Z')

describe('extendLicenseTerm', () => {
  it('lisensi baru/habis: dihitung dari sekarang', () => {
    const expired = { plan: 'monthly' as const, expiresAt: new Date(NOW.getTime() - 5 * DAY_MS) }
    expect(extendLicenseTerm(expired, 'yearly', NOW)).toEqual({
      plan: 'yearly',
      expiresAt: new Date(NOW.getTime() + 365 * DAY_MS),
    })
  })

  it('masih aktif: menumpuk dari sisa, hari tidak hangus', () => {
    const active = { plan: 'monthly' as const, expiresAt: new Date(NOW.getTime() + 10 * DAY_MS) }
    expect(extendLicenseTerm(active, 'monthly', NOW).expiresAt).toEqual(
      new Date(NOW.getTime() + 40 * DAY_MS),
    )
  })

  it('beli lifetime -> tanpa batas; lifetime tidak pernah turun', () => {
    const active = { plan: 'yearly' as const, expiresAt: new Date(NOW.getTime() + DAY_MS) }
    const lifetime = extendLicenseTerm(active, 'lifetime', NOW)

    expect(lifetime).toEqual({ plan: 'lifetime', expiresAt: null })
    expect(extendLicenseTerm(lifetime, 'monthly', NOW)).toEqual(lifetime)
  })
})

describe('grantLicense', () => {
  it('idempoten per orderRef: dikirim ulang tidak memperpanjang lagi', async () => {
    const fixture = scope.fixture({ prefix: 'license-grant' })
    const orderRef = `qa-${randomUUID()}`
    const input = { email: fixture.email, orderRef, plan: 'monthly' as const }

    const first = await grantLicense(fixture.ctx(), input)
    const again = await grantLicense(fixture.ctx(), input)

    expect(again).toEqual(first)
    expect(first.expiresAt).toEqual(new Date(fixture.ctx().now.getTime() + 30 * DAY_MS))
    const rows = await testDb()
      .select()
      .from(licenseGrants)
      .where(eq(licenseGrants.orderRef, orderRef))
    expect(rows).toHaveLength(1)
  })

  it('pembelian kedua memperpanjang lisensi yang SAMA (satu baris per email)', async () => {
    const fixture = scope.fixture({ prefix: 'license-renew' })
    const email = fixture.email

    const first = await grantLicense(fixture.ctx(), {
      email,
      orderRef: `qa-${randomUUID()}`,
      plan: 'monthly',
    })
    const second = await grantLicense(fixture.ctx(), {
      email,
      orderRef: `qa-${randomUUID()}`,
      plan: 'yearly',
    })

    expect(second.id).toBe(first.id)
    expect(second).toMatchObject({
      plan: 'yearly',
      expiresAt: new Date(fixture.ctx().now.getTime() + (30 + 365) * DAY_MS),
    })
    expect(await testDb().select().from(licenses).where(eq(licenses.email, email))).toHaveLength(1)
  })
})

describe('token berjangka (ADR 16)', () => {
  async function activated(prefix: string, plan: 'monthly' | 'lifetime' = 'monthly') {
    const fixture = scope.fixture({ prefix })
    const license = await grantLicense(fixture.ctx(), {
      email: fixture.email,
      orderRef: `qa-${randomUUID()}`,
      plan,
    })
    const session = await seedSession(fixture.ctx(), { email: fixture.email })
    const token = await issueLicenseToken(fixture.ctx(), {
      email: fixture.email,
      deviceId: session.deviceId,
    })
    return { fixture, license, session, token }
  }

  it('token membawa paket + exp (detik) dari lisensi', async () => {
    const { license, token } = await activated('license-exp')

    expect(verifyToken(token).payload).toMatchObject({
      plan: 'monthly',
      exp: Math.floor((license.expiresAt?.getTime() ?? 0) / 1000),
    })
  })

  it('lisensi sudah habis tetap diberi token (exp lampau) -> app baca-saja, bukan ditolak', async () => {
    const { fixture, license } = await activated('license-expired')
    const later = fixture.ctxAt(new Date(fixture.ctx().now.getTime() + 60 * DAY_MS))
    const session = await seedSession(later, { email: fixture.email, installationId: randomUUID() })

    const token = await issueLicenseToken(later, {
      email: fixture.email,
      deviceId: session.deviceId,
    })

    expect(verifyToken(token).payload.exp).toBe(
      Math.floor((license.expiresAt?.getTime() ?? 0) / 1000),
    )
  })

  it('refresh: perpanjangan dari perangkat lain terbawa tanpa sesi', async () => {
    const { fixture, token } = await activated('license-refresh')
    const renewed = await grantLicense(fixture.ctx(), {
      email: fixture.email,
      orderRef: `qa-${randomUUID()}`,
      plan: 'yearly',
    })

    const fresh = await refreshLicenseToken(fixture.ctx(), token)

    expect(verifyToken(fresh).payload).toMatchObject({
      plan: 'yearly',
      exp: Math.floor((renewed.expiresAt?.getTime() ?? 0) / 1000),
      did: verifyToken(token).payload.did,
    })
  })

  it('refresh: token palsu/rusak -> UNAUTHENTICATED', async () => {
    const { fixture, token } = await activated('license-refresh-forged')
    const [signed, signature = ''] = token.split('.')
    const flipped = `${signed}.${signature.startsWith('A') ? 'B' : 'A'}${signature.slice(1)}`

    for (const bad of [flipped, 'YWJj.ZGVm']) {
      const problem = await captureProblem(refreshLicenseToken(fixture.ctx(), bad))
      expect(problem?.code).toBe('UNAUTHENTICATED')
    }
  })

  it('refresh: lisensi dicabut atau aktivasi dihapus -> LICENSE_REQUIRED', async () => {
    const revoked = await activated('license-refresh-revoked')
    await testDb()
      .update(licenses)
      .set({ revokedAt: revoked.fixture.ctx().now })
      .where(eq(licenses.id, revoked.license.id))

    const removed = await activated('license-refresh-removed')
    await testDb()
      .delete(licenseActivations)
      .where(eq(licenseActivations.licenseId, removed.license.id))

    for (const { fixture, token } of [revoked, removed]) {
      const problem = await captureProblem(refreshLicenseToken(fixture.ctx(), token))
      expect(problem?.code).toBe('LICENSE_REQUIRED')
    }
  })
})
