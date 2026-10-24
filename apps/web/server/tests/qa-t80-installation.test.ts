// @vitest-environment node
//
// QA T80 - "login di perangkat lain mematikan sesi perangkat pertama".
//
// Ditulis QA (Fajar) sebagai verifikasi INDEPENDEN terhadap AC task #80, terpisah dari test yang
// ditulis penulis fitur. Semua test di sini memakai jalur produksi yang sebenarnya:
// `loginDevice` (dipakai route OTP & Google), `findSessionByToken` + `sessionResultFrom` (dipakai
// `requireSession` dan `GET /v1/auth/session`), dan `resolveDeviceForLogin` untuk perangkat.
// Database-nya Postgres nyata, jadi sifat atomik `UPDATE ... WHERE ... RETURNING` benar-benar diuji.
//
// Fokus yang diminta QA:
// 1. AC1 - dua instalasi berbeda (nama + platform identik) sama-sama hidup, dibuktikan lewat token.
// 2. AC2 - instalasi yang sama tetap me-rotate sesi lama.
// 3. AC3 - adopsi baris lama tidak menggandakan, dan tidak mencuri baris milik instalasi lain.
// 4. AC4 - klien lama (tanpa `installationId`) berperilaku persis seperti sebelumnya.
// 5. Fokus tambahan - baris kembar lama, batas 10 perangkat vs baris revoked, dan isolasi antar akun.
import { randomUUID } from 'node:crypto'

import {
  MAX_ACTIVE_DEVICES_PER_USER,
  googleCallbackQuerySchema,
  googleStartQuerySchema,
} from '@improve-personal/contracts'
import { eq } from 'drizzle-orm'
import { afterAll, afterEach, describe, expect, it } from 'vitest'

import { devices } from '../db/schema'
import {
  countActiveDevices,
  listDevices,
  resolveDeviceForLogin,
  revokeDevice,
} from '../services/device'
import {
  findSessionByToken,
  issueSession,
  loginDevice,
  sessionResultFrom,
} from '../services/session'
import type { ServiceContext } from '../services/context'
import { findOrCreateUserByEmail } from '../services/user'
import { uuidv7 } from '../utils/uuid'
import { closeTestDb, FIXED_NOW } from './helpers/harness'
import { captureProblem, testScope } from './helpers/scope'

const scope = testScope()

/** Nama identik untuk semua instalasi: inilah kondisi yang dulu menyatukan dua browser jadi satu. */
const SAME_NAME = 'Chrome di Linux'

afterEach(async () => {
  await scope.dispose()
})

afterAll(async () => {
  await closeTestDb()
})

/**
 * Autentikasi token persis seperti `requireSession` melakukannya, tapi GAGAL KERAS kalau token tidak
 * sah - supaya test tidak bisa lolos karena `null` yang dibandingkan dengan `null`.
 */
async function authenticate(ctx: ServiceContext, token: string) {
  const auth = await findSessionByToken(ctx, token)
  if (!auth) throw new Error('token tidak lolos autentikasi server')

  return auth
}

/** Login lewat jalur produksi (perangkat -> sesi -> DTO), sama seperti route OTP/Google. */
async function login(
  ctx: ServiceContext,
  email: string,
  device: { name: string; platform: 'web'; installationId?: string },
) {
  const user = await findOrCreateUserByEmail(ctx, email)

  return await loginDevice(ctx, {
    userId: user.id,
    email: user.email,
    client: 'web',
    device,
  })
}

async function deviceRow(ctx: ServiceContext, id: string) {
  const rows = await ctx.db
    .select({ installationId: devices.installationId, revokedAt: devices.revokedAt })
    .from(devices)
    .where(eq(devices.id, id))

  return rows.at(0)
}

/** Baris perangkat lama (dibuat sebelum kolom `installation_id` ada) dengan waktu berbeda. */
async function seedLegacyDevice(
  ctx: ServiceContext,
  userId: string,
  createdAt: Date,
): Promise<string> {
  const id = uuidv7(createdAt.getTime())
  await ctx.db.insert(devices).values({
    id,
    userId,
    name: SAME_NAME,
    platform: 'web',
    installationId: null,
    createdAt,
    lastSeenAt: createdAt,
  })

  return id
}

describe('AC1: dua instalasi browser berbeda sama-sama aktif', () => {
  it('nama + platform identik, installationId beda, login berurutan -> KEDUA token lolos autentikasi', async () => {
    const fixture = scope.fixture({ prefix: 'qa80-ac1-split' })
    const ctx = fixture.ctx()

    const first = await login(ctx, fixture.email, {
      name: SAME_NAME,
      platform: 'web',
      installationId: randomUUID(),
    })
    const second = await login(ctx, fixture.email, {
      name: SAME_NAME,
      platform: 'web',
      installationId: randomUUID(),
    })

    // Dua baris perangkat, bukan satu yang dipakai bergantian.
    expect(second.dto.device.id).not.toBe(first.dto.device.id)

    // Inti AC1: yang diuji BUKAN kolom DB, tapi apakah request terautentikasi masih diterima.
    // `sessionResultFrom` adalah DTO yang dikirim `GET /v1/auth/session`.
    const sessionA = sessionResultFrom(await authenticate(ctx, first.token))
    const sessionB = sessionResultFrom(await authenticate(ctx, second.token))

    expect(sessionA.device.id).toBe(first.dto.device.id)
    expect(sessionB.device.id).toBe(second.dto.device.id)
    expect(sessionA.user.id).toBe(sessionB.user.id)

    // Dan daftar perangkat memang berisi dua entri aktif dengan nama yang sama.
    const active = (await listDevices(ctx, sessionA.user.id)).filter(
      (device) => device.revokedAt === null,
    )
    expect(active.map((device) => device.id).sort()).toEqual(
      [first.dto.device.id, second.dto.device.id].sort(),
    )
  })

  it('dua instalasi + nama berbeda juga tidak saling mematikan (bukan kebetulan nama)', async () => {
    const fixture = scope.fixture({ prefix: 'qa80-ac1-different-names' })
    const ctx = fixture.ctx()

    const first = await login(ctx, fixture.email, {
      name: 'Chrome di Linux',
      platform: 'web',
      installationId: randomUUID(),
    })
    const second = await login(ctx, fixture.email, {
      name: 'Firefox di Linux',
      platform: 'web',
      installationId: randomUUID(),
    })

    await expect(authenticate(ctx, first.token)).resolves.toMatchObject({
      deviceId: first.dto.device.id,
    })
    await expect(authenticate(ctx, second.token)).resolves.toMatchObject({
      deviceId: second.dto.device.id,
    })
  })

  it('installationId yang sama dipakai dua AKUN tetap jadi perangkat berbeda (tidak ada IDOR)', async () => {
    const alice = scope.fixture({ prefix: 'qa80-ac1-alice' })
    const bob = scope.fixture({ prefix: 'qa80-ac1-bob' })
    const installationId = randomUUID()

    const aliceLogin = await login(alice.ctx(), alice.email, {
      name: SAME_NAME,
      platform: 'web',
      installationId,
    })
    const bobLogin = await login(bob.ctx(), bob.email, {
      name: SAME_NAME,
      platform: 'web',
      installationId,
    })

    // Query perangkat selalu ter-scope `user_id`: id instalasi bukan kunci lintas akun. Bob tidak
    // boleh melihat perangkat Alice, dan mencabut perangkat Alice tidak boleh mematikan sesi Bob.
    expect(bobLogin.dto.device.id).not.toBe(aliceLogin.dto.device.id)
    const bobDevices = await listDevices(alice.ctx(), bobLogin.dto.user.id)
    expect(bobDevices.map((device) => device.id)).toEqual([bobLogin.dto.device.id])
    expect(bobDevices.map((device) => device.id)).not.toContain(aliceLogin.dto.device.id)

    await revokeDevice(alice.ctx(), aliceLogin.dto.user.id, aliceLogin.dto.device.id)
    await expect(authenticate(alice.ctx(), bobLogin.token)).resolves.toMatchObject({
      deviceId: bobLogin.dto.device.id,
    })
  })
})

describe('AC2: instalasi yang sama tetap me-rotate sesi lama', () => {
  it('login ulang dengan installationId sama -> satu baris, token lama mati', async () => {
    const fixture = scope.fixture({ prefix: 'qa80-ac2-rotate' })
    const ctx = fixture.ctx()
    const installationId = randomUUID()
    const device = { name: SAME_NAME, platform: 'web' as const, installationId }

    const first = await login(ctx, fixture.email, device)
    const second = await login(ctx, fixture.email, device)

    expect(second.dto.device.id).toBe(first.dto.device.id)
    expect(await countActiveDevices(ctx, second.dto.user.id)).toBe(1)
    await expect(authenticate(ctx, first.token)).rejects.toThrow('tidak lolos autentikasi')
    await expect(authenticate(ctx, second.token)).resolves.toMatchObject({
      deviceId: first.dto.device.id,
    })
  })
})

describe('AC3: adopsi perangkat lama tanpa installation_id', () => {
  it('build baru pertama kali login -> baris lama diadopsi (bukan digandakan), sesi lama ter-rotate', async () => {
    const fixture = scope.fixture({ prefix: 'qa80-ac3-adopt' })
    const ctx = fixture.ctx()
    const installationId = randomUUID()

    // Klien lama: baris perangkat tanpa `installation_id`.
    const legacy = await login(ctx, fixture.email, { name: SAME_NAME, platform: 'web' })
    expect((await deviceRow(ctx, legacy.dto.device.id))?.installationId).toBeNull()

    const upgraded = await login(ctx, fixture.email, {
      name: SAME_NAME,
      platform: 'web',
      installationId,
    })

    expect(upgraded.dto.device.id).toBe(legacy.dto.device.id)
    expect(await countActiveDevices(ctx, upgraded.dto.user.id)).toBe(1)
    expect((await deviceRow(ctx, legacy.dto.device.id))?.installationId).toBe(installationId)
    // Rotasi tetap berlaku: login ulang dari instalasi yang sama mematikan sesi sebelumnya.
    await expect(authenticate(ctx, legacy.token)).rejects.toThrow('tidak lolos autentikasi')
    await expect(authenticate(ctx, upgraded.token)).resolves.toMatchObject({
      deviceId: legacy.dto.device.id,
    })
  })

  it('dua instalasi berbeda login ke SATU baris lama -> tepat satu mengadopsi, keduanya tetap hidup', async () => {
    const fixture = scope.fixture({ prefix: 'qa80-ac3-no-steal' })
    const ctx = fixture.ctx()
    const user = await findOrCreateUserByEmail(ctx, fixture.email)

    // Satu baris lama, tanpa id instalasi.
    const legacyId = await resolveDeviceForLogin(ctx, user.id, {
      name: SAME_NAME,
      platform: 'web',
    })

    const installationA = randomUUID()
    const installationB = randomUUID()
    const [deviceA, deviceB] = await Promise.all([
      resolveDeviceForLogin(ctx, user.id, {
        name: SAME_NAME,
        platform: 'web',
        installationId: installationA,
      }),
      resolveDeviceForLogin(ctx, user.id, {
        name: SAME_NAME,
        platform: 'web',
        installationId: installationB,
      }),
    ])

    // `UPDATE ... WHERE installation_id IS NULL ... RETURNING` harus atomik: satu pengadopsi,
    // satu baris baru. Kalau keduanya "mengadopsi" baris yang sama, AC1 kembali rusak.
    expect(new Set([deviceA, deviceB]).size).toBe(2)
    expect([deviceA, deviceB]).toContain(legacyId)
    expect(await countActiveDevices(ctx, user.id)).toBe(2)

    // Konsekuensi yang penting: sesi kedua instalasi hidup setelah login berikutnya (bukan cuma
    // "kolomnya terisi").
    const first = await login(ctx, fixture.email, {
      name: SAME_NAME,
      platform: 'web',
      installationId: installationA,
    })
    const second = await login(ctx, fixture.email, {
      name: SAME_NAME,
      platform: 'web',
      installationId: installationB,
    })

    expect(second.dto.device.id).not.toBe(first.dto.device.id)
    await expect(authenticate(ctx, first.token)).resolves.toMatchObject({
      deviceId: first.dto.device.id,
    })
    await expect(authenticate(ctx, second.token)).resolves.toMatchObject({
      deviceId: second.dto.device.id,
    })
  })

  it('baris kembar lama: adopsi memilih yang terbaru, baris lain tidak dicuri, sesinya tidak ikut mati', async () => {
    const fixture = scope.fixture({ prefix: 'qa80-ac3-twins' })
    const ctx = fixture.ctx()
    const user = await findOrCreateUserByEmail(ctx, fixture.email)

    // Kondisi data warisan bug lama: dua baris `"Chrome di Linux"` tanpa `installation_id`.
    const olderId = await seedLegacyDevice(ctx, user.id, FIXED_NOW)
    const newerId = await seedLegacyDevice(ctx, user.id, new Date(FIXED_NOW.getTime() + 60_000))
    const olderSession = await seedSessionForDevice(ctx, user.id, olderId)
    const newerSession = await seedSessionForDevice(ctx, user.id, newerId)

    const first = await login(ctx, fixture.email, {
      name: SAME_NAME,
      platform: 'web',
      installationId: randomUUID(),
    })

    // Yang diadopsi baris TERBARU; baris lama lainnya tetap milik dirinya sendiri (bukan ditimpa).
    expect(first.dto.device.id).toBe(newerId)
    expect((await deviceRow(ctx, newerId))?.installationId).not.toBeNull()
    expect((await deviceRow(ctx, olderId))?.installationId).toBeNull()

    // Sesi pada baris yang diadopsi mati (rotasi), sesi baris kembar lain TIDAK ikut mati - itu
    // perilaku lama yang memang berbeda perangkat.
    await expect(authenticate(ctx, newerSession)).rejects.toThrow('tidak lolos autentikasi')
    await expect(authenticate(ctx, olderSession)).resolves.toMatchObject({ deviceId: olderId })

    // Instalasi kedua mengadopsi baris kembar yang tersisa, tanpa menambah jatah perangkat.
    const second = await login(ctx, fixture.email, {
      name: SAME_NAME,
      platform: 'web',
      installationId: randomUUID(),
    })
    expect(second.dto.device.id).toBe(olderId)
    expect(await countActiveDevices(ctx, user.id)).toBe(2)
    await expect(authenticate(ctx, first.token)).resolves.toMatchObject({
      deviceId: newerId,
    })
  })
})

describe('AC4: klien lama tanpa installationId tidak berubah perilakunya', () => {
  it('login berulang memakai baris yang sama dan me-rotate sesi (heuristik nama + platform)', async () => {
    const fixture = scope.fixture({ prefix: 'qa80-ac4-legacy' })
    const ctx = fixture.ctx()

    const first = await login(ctx, fixture.email, { name: SAME_NAME, platform: 'web' })
    const second = await login(ctx, fixture.email, { name: SAME_NAME, platform: 'web' })

    expect(second.dto.device.id).toBe(first.dto.device.id)
    expect(await countActiveDevices(ctx, second.dto.user.id)).toBe(1)
    await expect(authenticate(ctx, first.token)).rejects.toThrow('tidak lolos autentikasi')
    await expect(authenticate(ctx, second.token)).resolves.toMatchObject({
      deviceId: first.dto.device.id,
    })
  })

  it('klien lama TIDAK menyentuh `installation_id` milik instalasi baru (tidak saling menimpa)', async () => {
    const fixture = scope.fixture({ prefix: 'qa80-ac4-legacy-after-new' })
    const ctx = fixture.ctx()
    const installationId = randomUUID()

    const modern = await login(ctx, fixture.email, {
      name: SAME_NAME,
      platform: 'web',
      installationId,
    })
    const legacy = await login(ctx, fixture.email, { name: SAME_NAME, platform: 'web' })

    // Perilaku lama: heuristik nama + platform memakai baris yang ada.
    expect(legacy.dto.device.id).toBe(modern.dto.device.id)
    expect((await deviceRow(ctx, modern.dto.device.id))?.installationId).toBe(installationId)
    expect(await countActiveDevices(ctx, modern.dto.user.id)).toBe(1)
  })
})

describe('batas perangkat: per baris aktif, baris revoked tidak dihitung', () => {
  it('instalasi baru ditolak saat 10 baris aktif, dan DITERIMA setelah satu perangkat di-revoke', async () => {
    const fixture = scope.fixture({ prefix: 'qa80-limit' })
    const ctx = fixture.ctx()
    const user = await findOrCreateUserByEmail(ctx, fixture.email)

    const installationIds = Array.from({ length: MAX_ACTIVE_DEVICES_PER_USER }, () => randomUUID())
    const deviceIds: string[] = []
    for (const installationId of installationIds) {
      deviceIds.push(
        await resolveDeviceForLogin(ctx, user.id, {
          name: SAME_NAME,
          platform: 'web',
          installationId,
        }),
      )
    }
    expect(await countActiveDevices(ctx, user.id)).toBe(MAX_ACTIVE_DEVICES_PER_USER)

    const overflow = await captureProblem(
      resolveDeviceForLogin(ctx, user.id, {
        name: SAME_NAME,
        platform: 'web',
        installationId: randomUUID(),
      }),
    )
    expect(overflow).toMatchObject({ code: 'DEVICE_LIMIT_REACHED', statusCode: 409 })

    // Revoke satu perangkat -> slotnya bebas lagi. Kalau baris revoked ikut dihitung, instalasi baru
    // tetap ditolak padahal jatah aktif tinggal 9.
    const revokedId = deviceIds[0]
    if (revokedId === undefined) throw new Error('tidak ada perangkat yang bisa di-revoke')
    await revokeDevice(ctx, user.id, revokedId)

    const replacement = await resolveDeviceForLogin(ctx, user.id, {
      name: SAME_NAME,
      platform: 'web',
      installationId: randomUUID(),
    })
    expect(replacement).not.toBe(revokedId)
    expect(await countActiveDevices(ctx, user.id)).toBe(MAX_ACTIVE_DEVICES_PER_USER)
  })
})

/** Sesi untuk baris perangkat yang sudah ada (dipakai mensimulasikan data warisan). */
async function seedSessionForDevice(
  ctx: ServiceContext,
  userId: string,
  deviceId: string,
): Promise<string> {
  const issued = await issueSession(ctx, { userId, deviceId, client: 'web' })

  return issued.token
}

describe('AC5: jalur Google - installationId hanya dari baris state milik server', () => {
  it('query callback TIDAK menerima installationId (strict), jadi nilainya tidak bisa dipilih penyerang', () => {
    // `code` + `state` saja tetap sah - bentuk ini yang dikirim Google.
    expect(googleCallbackQuerySchema.safeParse({ code: 'kode', state: 'state' }).success).toBe(true)

    // Penyerang yang menguasai URL callback tidak bisa menunjuk baris `devices` mana yang dipakai
    // ulang: satu-satunya sumber nilai itu adalah baris `oauth_states` yang server tulis sendiri.
    expect(
      googleCallbackQuerySchema.safeParse({
        code: 'kode',
        state: 'state',
        installationId: randomUUID(),
      }).success,
    ).toBe(false)
  })

  it('/start menerima installationId yang sah, tapi field asing tetap ditolak', () => {
    const installationId = randomUUID()

    expect(googleStartQuerySchema.safeParse({ client: 'web', installationId }).success).toBe(true)
    expect(googleStartQuerySchema.safeParse({ client: 'web' }).success).toBe(true)
    expect(
      googleStartQuerySchema.safeParse({ client: 'web', installationId: 'bukan-uuid' }).success,
    ).toBe(false)

    for (const extra of [
      { redirectUri: 'https://jahat.example/pwn' },
      { state: 'state-dari-luar' },
      { device: { name: 'Chrome di Linux', platform: 'web' } },
    ]) {
      expect(
        googleStartQuerySchema.safeParse({ client: 'web', ...extra }).success,
        `harus ditolak: ${JSON.stringify(extra)}`,
      ).toBe(false)
    }
  })
})
