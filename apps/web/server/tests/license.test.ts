// @vitest-environment node
import { createPublicKey, randomUUID, verify } from 'node:crypto'

import { licenseTokenPayloadSchema, splitLicenseToken } from '@improve-personal/contracts'
import { eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'

import { licenseActivations, licenses } from '../db/schema'
import { grantLicense, issueLicenseToken } from '../services/license'
import { closeTestDb, seedSession, testDb, TEST_LICENSE_PUBLIC_KEY } from './helpers/harness'
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
    })
    const session = await seedSession(fixture.ctx(), { email: fixture.email })

    const token = await issueLicenseToken(fixture.ctx(), {
      email: fixture.email,
      deviceId: session.deviceId,
    })
    const { isValid, payload } = verifyToken(token)

    expect(isValid).toBe(true)
    expect(payload).toMatchObject({ v: 1, lid: license.id, did: session.deviceId, ed: 'standard' })
    expect(token).not.toContain(fixture.email)
    expect(Buffer.from(token.split('.')[0] ?? '', 'base64url').toString()).not.toContain('@')
  })

  it('tanda tangan diubah satu karakter -> tidak lagi valid', async () => {
    const fixture = scope.fixture({ prefix: 'license-tamper' })
    await grantLicense(fixture.ctx(), { email: fixture.email, orderRef: `qa-${randomUUID()}` })
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

describe('grantLicense', () => {
  it('idempoten per orderRef: dikirim ulang tidak membuat lisensi kedua', async () => {
    const fixture = scope.fixture({ prefix: 'license-grant' })
    const orderRef = `qa-${randomUUID()}`

    const first = await grantLicense(fixture.ctx(), { email: fixture.email, orderRef })
    const again = await grantLicense(fixture.ctx(), { email: fixture.email, orderRef })

    expect(again.id).toBe(first.id)
    const rows = await testDb().select().from(licenses).where(eq(licenses.orderRef, orderRef))
    expect(rows).toHaveLength(1)
  })
})
