// @vitest-environment node
//
// Sesi & perangkat (T19). Level SERVICE terhadap Postgres nyata.
//
// Yang diuji di sini adalah jaminan yang tidak bisa dibuktikan lewat HTTP: "token mentah tidak ada di
// DB", "perangkat user lain tidak bisa dicabut dan datanya tidak berubah", dan "batas perangkat
// aktif". Test untuk bentuk respons/cookie ada di `http.test.ts`.
import {
  MAX_ACTIVE_DEVICES_PER_USER,
  deviceListResultSchema,
  sessionDtoSchema,
} from '@improve-personal/contracts'
import { eq } from 'drizzle-orm'
import { afterAll, afterEach, describe, expect, it } from 'vitest'

import {
  countActiveDevices,
  listDevices,
  resolveDeviceForLogin,
  revokeDevice,
} from '../services/device'
import { buildSessionDto, findSessionByToken, revokeSession } from '../services/session'
import { findOrCreateUserByEmail } from '../services/user'
import { sha256Hex } from '../utils/crypto'
import { uuidv7 } from '../utils/uuid'
import { devices, sessions } from '../db/schema'
import { closeTestDb, FIXED_NOW, seedSession } from './helpers/harness'
import { captureProblem, testScope } from './helpers/scope'

const scope = testScope()
const DAY_MS = 86_400_000

afterEach(async () => {
  await scope.dispose()
})

afterAll(async () => {
  await closeTestDb()
})

describe('penyimpanan sesi', () => {
  it('DB hanya menyimpan hash token; token mentah tidak ada di kolom mana pun', async () => {
    const fixture = scope.fixture({ prefix: 'session-hash' })
    const session = await seedSession(fixture.ctx(), { email: fixture.email })

    const rows = await fixture
      .ctx()
      .db.select()
      .from(sessions)
      .where(eq(sessions.id, session.sessionId))
    const row = rows.at(0)

    expect(row?.tokenHash).toBe(sha256Hex(session.token))
    expect(row?.tokenHash).toMatch(/^[0-9a-f]{64}$/)
    expect(row?.tokenHash).not.toBe(session.token)
    // Tidak ada kolom (termasuk `id`, `client`, timestamp) yang memuat token mentah.
    expect(JSON.stringify(row)).not.toContain(session.token)

    // Hash-nya yang dicari, bukan token: jadi token mentah memang tidak bisa "ketemu" lewat query.
    await expect(findSessionByToken(fixture.ctx(), session.token)).resolves.toMatchObject({
      sessionId: session.sessionId,
      userId: session.userId,
      deviceId: session.deviceId,
    })
    await expect(findSessionByToken(fixture.ctx(), row?.tokenHash ?? 'x')).resolves.toBeNull()
  })

  it('sesi yang di-revoke langsung tidak bisa dipakai (revoke instan, bukan tunggu kedaluwarsa)', async () => {
    const fixture = scope.fixture({ prefix: 'session-revoke' })
    const session = await seedSession(fixture.ctx(), { email: fixture.email })

    await revokeSession(fixture.ctx(), session.userId, session.sessionId)

    await expect(findSessionByToken(fixture.ctx(), session.token)).resolves.toBeNull()
    // Barisnya tetap ada sebagai jejak (soft revoke), yang hilang cuma keabsahannya.
    const rows = await fixture
      .ctx()
      .db.select({ revokedAt: sessions.revokedAt })
      .from(sessions)
      .where(eq(sessions.id, session.sessionId))
    expect(rows.at(0)?.revokedAt).not.toBeNull()
  })

  it('sesi tidak bisa dicabut lintas akun (revokeSession ter-scope user_id)', async () => {
    const owner = scope.fixture({ prefix: 'session-owner' })
    const attacker = scope.fixture({ prefix: 'session-attacker' })
    const session = await seedSession(owner.ctx(), { email: owner.email })
    const attackerUser = await findOrCreateUserByEmail(attacker.ctx(), attacker.email)

    await revokeSession(owner.ctx(), attackerUser.id, session.sessionId)

    await expect(findSessionByToken(owner.ctx(), session.token)).resolves.toMatchObject({
      sessionId: session.sessionId,
    })
  })

  it('sesi yang tidak dipakai lebih dari 30 hari tidak bisa dipakai lagi', async () => {
    const fixture = scope.fixture({ prefix: 'session-idle-expiry' })
    const session = await seedSession(fixture.ctx(), { email: fixture.email })

    await expect(
      findSessionByToken(fixture.ctxAt(new Date(FIXED_NOW.getTime() + 31 * DAY_MS)), session.token),
    ).resolves.toBeNull()
  })

  it('idle diperpanjang selama sesi dipakai (tidak mati di hari ke-30 walau aktif)', async () => {
    const fixture = scope.fixture({ prefix: 'session-idle-extend' })
    const session = await seedSession(fixture.ctx(), { email: fixture.email })

    await expect(
      findSessionByToken(fixture.ctxAt(new Date(FIXED_NOW.getTime() + 29 * DAY_MS)), session.token),
    ).resolves.toMatchObject({ sessionId: session.sessionId })
    // Dipakai di hari ke-29 -> idle baru berakhir hari ke-59.
    await expect(
      findSessionByToken(fixture.ctxAt(new Date(FIXED_NOW.getTime() + 45 * DAY_MS)), session.token),
    ).resolves.toMatchObject({ sessionId: session.sessionId })
  })

  it('batas absolut 180 hari tidak pernah diperpanjang walau sesi rajin dipakai', async () => {
    const fixture = scope.fixture({ prefix: 'session-absolute' })
    const session = await seedSession(fixture.ctx(), { email: fixture.email })

    // Dipakai tiap 20 hari: idle terus diperpanjang, tapi absolut tetap 180 hari sejak `created_at`.
    for (let day = 20; day <= 160; day += 20) {
      await expect(
        findSessionByToken(
          fixture.ctxAt(new Date(FIXED_NOW.getTime() + day * DAY_MS)),
          session.token,
        ),
        `sesi harus masih hidup di hari ke-${day}`,
      ).resolves.toMatchObject({ sessionId: session.sessionId })
    }

    await expect(
      findSessionByToken(
        fixture.ctxAt(new Date(FIXED_NOW.getTime() + 181 * DAY_MS)),
        session.token,
      ),
    ).resolves.toBeNull()
  })
})

describe('DTO sesi (kontrak bersama web/mobile)', () => {
  const expiresAt = new Date(FIXED_NOW.getTime() + DAY_MS)
  const token = 'qa-session-token-0123456789abcdefghijklmnopqrstuv'

  it('client web: TIDAK ada token di body (token di cookie HttpOnly)', () => {
    const dto = buildSessionDto({
      userId: uuidv7(FIXED_NOW.getTime()),
      email: 'qa@qa.test',
      deviceId: uuidv7(FIXED_NOW.getTime()),
      deviceName: 'QA Laptop',
      client: 'web',
      expiresAt,
      token,
    })

    expect('token' in dto).toBe(false)
    expect(sessionDtoSchema.safeParse(dto).success).toBe(true)
    // Token di DTO web bukan "tidak diisi" tapi dilarang: kontraknya menolak, bukan mengabaikan.
    expect(sessionDtoSchema.safeParse({ ...dto, token }).success).toBe(false)
  })

  it('client mobile: token di body, dan token wajib (bukan opsional)', () => {
    const dto = buildSessionDto({
      userId: uuidv7(FIXED_NOW.getTime()),
      email: 'qa@qa.test',
      deviceId: uuidv7(FIXED_NOW.getTime()),
      deviceName: 'QA HP',
      client: 'mobile',
      expiresAt,
      token,
    })

    expect(dto).toMatchObject({ client: 'mobile', token })
    expect(sessionDtoSchema.safeParse(dto).success).toBe(true)

    const withoutToken: Record<string, unknown> = { ...dto }
    delete withoutToken.token
    expect(sessionDtoSchema.safeParse(withoutToken).success).toBe(false)
  })
})

describe('perangkat', () => {
  it('batas perangkat aktif per user ditegakkan, dan login dari perangkat yang sama tidak makan jatah', async () => {
    const fixture = scope.fixture({ prefix: 'device-limit' })
    const ctx = fixture.ctx()
    const user = await findOrCreateUserByEmail(ctx, fixture.email)

    const ids: string[] = []
    for (let index = 0; index < MAX_ACTIVE_DEVICES_PER_USER; index += 1) {
      ids.push(
        await resolveDeviceForLogin(ctx, user.id, { name: `QA Device ${index}`, platform: 'web' }),
      )
    }
    expect(await countActiveDevices(ctx, user.id)).toBe(MAX_ACTIVE_DEVICES_PER_USER)

    const overflow = await captureProblem(
      resolveDeviceForLogin(ctx, user.id, { name: 'QA Device kelebihan', platform: 'web' }),
    )
    // Kode khusus `DEVICE_LIMIT_REACHED` (409), bukan FORBIDDEN: user tetap berhak, cuma kehabisan
    // jatah slot perangkat aktif - client perlu tahu bedanya untuk bisa menyuruh hapus perangkat.
    expect(overflow).toMatchObject({ code: 'DEVICE_LIMIT_REACHED', statusCode: 409 })
    expect(await countActiveDevices(ctx, user.id)).toBe(MAX_ACTIVE_DEVICES_PER_USER)

    // Nama + platform yang sama = perangkat yang sama: dipakai ulang, bukan baris baru.
    const reused = await resolveDeviceForLogin(ctx, user.id, {
      name: 'QA Device 0',
      platform: 'web',
    })
    expect(reused).toBe(ids.at(0))
    expect(await countActiveDevices(ctx, user.id)).toBe(MAX_ACTIVE_DEVICES_PER_USER)
  })

  it('logout jarak jauh mematikan sesi perangkat itu, sesi perangkat lain tetap hidup', async () => {
    const fixture = scope.fixture({ prefix: 'device-revoke' })
    const laptop = await seedSession(fixture.ctx(), {
      email: fixture.email,
      deviceName: 'QA Laptop Remote',
    })
    const phone = await seedSession(fixture.ctx(), {
      email: fixture.email,
      client: 'mobile',
      deviceName: 'QA HP Remote',
    })

    await revokeDevice(fixture.ctx(), laptop.userId, laptop.deviceId)

    await expect(findSessionByToken(fixture.ctx(), laptop.token)).resolves.toBeNull()
    await expect(findSessionByToken(fixture.ctx(), phone.token)).resolves.toMatchObject({
      deviceId: phone.deviceId,
    })

    const rows = await fixture
      .ctx()
      .db.select({ revokedAt: devices.revokedAt })
      .from(devices)
      .where(eq(devices.id, laptop.deviceId))
    expect(rows.at(0)?.revokedAt).not.toBeNull()
  })

  it('login ulang dari perangkat + client yang sama me-rotate sesi lama (sesi bocor tidak hidup terus)', async () => {
    const fixture = scope.fixture({ prefix: 'device-rotate' })
    const first = await seedSession(fixture.ctx(), {
      email: fixture.email,
      deviceName: 'QA Laptop Rotate',
    })
    const second = await seedSession(fixture.ctx(), {
      email: fixture.email,
      deviceName: 'QA Laptop Rotate',
    })

    expect(second.deviceId).toBe(first.deviceId)
    await expect(findSessionByToken(fixture.ctx(), first.token)).resolves.toBeNull()
    await expect(findSessionByToken(fixture.ctx(), second.token)).resolves.toMatchObject({
      sessionId: second.sessionId,
    })
  })

  it('IDOR perangkat: user A tidak bisa membaca atau mencabut perangkat user B', async () => {
    const alice = scope.fixture({ prefix: 'idor-alice' })
    const bob = scope.fixture({ prefix: 'idor-bob' })
    const aliceSession = await seedSession(alice.ctx(), {
      email: alice.email,
      deviceName: 'Alice Laptop',
    })
    const bobSession = await seedSession(bob.ctx(), { email: bob.email, deviceName: 'Bob Laptop' })
    // Kedua user punya perangkat kedua supaya daftarnya tidak kosong.
    await seedSession(bob.ctx(), { email: bob.email, deviceName: 'Bob HP', client: 'mobile' })

    const aliceDevices = await listDevices(alice.ctx(), aliceSession.userId)
    expect(aliceDevices.map((device) => device.id)).toContain(aliceSession.deviceId)
    expect(aliceDevices.map((device) => device.id)).not.toContain(bobSession.deviceId)
    // DTO-nya juga harus lolos kontrak (tidak ada `user_id`, waktu ISO, city nullable).
    expect(deviceListResultSchema.safeParse({ devices: aliceDevices }).success).toBe(true)
    expect(JSON.stringify(aliceDevices)).not.toContain(bob.email)

    const problem = await captureProblem(
      revokeDevice(alice.ctx(), aliceSession.userId, bobSession.deviceId),
    )
    expect(problem).toMatchObject({ code: 'NOT_FOUND', statusCode: 404 })

    // Perangkat & sesi Bob tidak berubah sama sekali.
    const bobDevices = await listDevices(bob.ctx(), bobSession.userId)
    expect(bobDevices.find((device) => device.id === bobSession.deviceId)?.revokedAt).toBeNull()
    await expect(findSessionByToken(bob.ctx(), bobSession.token)).resolves.toMatchObject({
      userId: bobSession.userId,
    })
  })

  it('perangkat yang tidak ada dan perangkat user lain memberi respons yang sama (bukan oracle)', async () => {
    const alice = scope.fixture({ prefix: 'idor-oracle-a' })
    const bob = scope.fixture({ prefix: 'idor-oracle-b' })
    const aliceSession = await seedSession(alice.ctx(), { email: alice.email })
    const bobSession = await seedSession(bob.ctx(), { email: bob.email })

    const foreign = await captureProblem(
      revokeDevice(alice.ctx(), aliceSession.userId, bobSession.deviceId),
    )
    const missing = await captureProblem(
      revokeDevice(alice.ctx(), aliceSession.userId, uuidv7(FIXED_NOW.getTime())),
    )

    expect(foreign).toEqual(missing)
    expect(foreign?.code).toBe('NOT_FOUND')
  })
})
