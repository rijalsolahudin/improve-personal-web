// @vitest-environment node
//
// Test HTTP: cookie, CSRF, status code, bentuk `ApiErrorBody`, dan DTO kontrak (AC T19 + T21).
//
// Konsekuensi pilihan harness: server Nitro dibangun SEKALI per berkas ini lewat
// `setup({ server: true })` dan dijalankan sebagai proses terpisah, dengan env `NUXT_*` yang
// ditentukan `helpers/harness.ts`. Jadi yang diuji di sini benar-benar jalur HTTP penuh: middleware
// CSRF, router Nitro, plugin error, dan atribut cookie - hal yang tidak bisa dibuktikan dengan
// memanggil handler langsung. Harganya: tidak bisa menyuntik waktu (`ctx.now`) seperti test service,
// jadi AC yang butuh waktu tetap ada di `otp.test.ts`/`sync.test.ts`.
import { randomUUID } from 'node:crypto'

import {
  apiDataEnvelopeSchema,
  apiErrorBodySchema,
  currentSessionResultSchema,
  deviceListResultSchema,
  GENERIC_ERROR_MESSAGES,
  keyEnvelopeListResultSchema,
  sessionDtoSchema,
  SYNC_MAX_BATCH,
  syncPullResultSchema,
  syncPushResultSchema,
  type ApiErrorBody,
} from '@improve-personal/contracts'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { setup, url } from '@nuxt/test-utils/e2e'

import { FIXED_OTP_CODE } from '../services/otp'
import { findSessionByToken } from '../services/session'
import { bytesToBase64, hmacSha256, sha256Hex } from '../utils/crypto'
import { rateLimits, sessions as sessionsTable, syncWatermarks } from '../db/schema'
import { closeTestDb, rateLimitCount, seedSession, testDb, type Fixture } from './helpers/harness'
import { testScope } from './helpers/scope'

await setup({ server: true })

const scope = testScope()
const encoder = new TextEncoder()

/** Origin server test. Dibaca lazily: `url()` baru tersedia setelah `setup()` menjalankan beforeAll. */
function serverOrigin(): string {
  return new URL(url('/')).origin
}

/** Blob base64 "ciphertext" yang dipakai test sync. */
function blobOf(text: string): string {
  return bytesToBase64(encoder.encode(text))
}

type ApiRequest = {
  readonly method?: string
  readonly body?: unknown
  readonly cookie?: string
  readonly token?: string
  readonly headers?: Record<string, string>
  /**
   * `false` = JANGAN kirim bukti same-origin. Dipakai HANYA oleh test CSRF, karena request browser
   * yang sah selalu membawa `Sec-Fetch-Site`/`Origin`.
   */
  readonly sameOriginProof?: boolean
}

type ApiResponse = {
  readonly status: number
  readonly headers: Headers
  readonly body: unknown
  readonly setCookie: readonly string[]
}

const MUTATING_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE']

async function api(path: string, request: ApiRequest = {}): Promise<ApiResponse> {
  const method = request.method ?? 'GET'
  const needsProof =
    request.cookie !== undefined &&
    MUTATING_METHODS.includes(method) &&
    request.sameOriginProof !== false

  const response = await fetch(url(path), {
    method,
    headers: {
      ...(request.body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(request.cookie === undefined ? {} : { cookie: request.cookie }),
      ...(request.token === undefined ? {} : { authorization: `Bearer ${request.token}` }),
      // Middleware CSRF menolak mutasi ber-cookie tanpa bukti same-origin (fail-closed), jadi test
      // non-CSRF harus mengirim bukti itu seperti browser asli.
      ...(needsProof ? { 'sec-fetch-site': 'same-origin' } : {}),
      ...request.headers,
    },
    body: request.body === undefined ? undefined : JSON.stringify(request.body),
  })

  const text = await response.text()
  let body: unknown = null
  if (text.length > 0) {
    try {
      body = JSON.parse(text)
    } catch {
      body = text
    }
  }

  return {
    status: response.status,
    headers: response.headers,
    body,
    setCookie: response.headers.getSetCookie(),
  }
}

/**
 * Respons error harus SELALU amplop `{ error: { ... } }` (`ApiErrorBody`) - bukan `{ code, message }`
 * datar. Kalau bukan, test ini yang memberi tahu lebih dulu (dan seluruh berkas gagal, bukan satu
 * assertion).
 */
function problemOf(response: ApiResponse): ApiErrorBody {
  const parsed = apiErrorBodySchema.safeParse(response.body)
  expect(parsed.success, `bukan ApiErrorBody: ${JSON.stringify(response.body)}`).toBe(true)
  if (!parsed.success) throw new Error('respons bukan ApiErrorBody')

  return parsed.data
}

/**
 * AC BUG-1: kegagalan validasi input adalah kegagalan KLIEN.
 *
 * Assertion-nya sengaja ketat, bukan sekadar "bukan 200": 400 + `VALIDATION_FAILED` + pesan PERSIS dari
 * kontrak + tidak ada satu pun jejak internal di body (security.md §3, §4).
 *
 * `forbidden` untuk membuktikan nilai yang dikirim klien tidak dipantulkan balik. Ini bukan kekhawatiran
 * teoretis: `H3Error` yang dilempar h3 `validateData` membawa `message` ZodError apa adanya, dan pesan
 * zod memuat nilai input yang ditolak - satu request gagal cukup untuk mengembalikan isi body user.
 */
function expectValidationFailure(
  response: ApiResponse,
  label: string,
  forbidden: readonly string[] = [],
): void {
  expect(response.status, label).toBe(400)

  const problem = problemOf(response)
  expect(problem.error.code, label).toBe('VALIDATION_FAILED')
  expect(problem.error.message, label).toBe(GENERIC_ERROR_MESSAGES.VALIDATION_FAILED)

  // Sengaja SELURUH body respons (amplop + isinya), bukan cuma `error.code`: kebocoran justru paling
  // gampang menyelinap lewat field lain, dan `apiErrorBodySchema` bersifat strict sehingga field asing
  // sudah ditolak `problemOf` sebelum sampai sini.
  const serialized = JSON.stringify(response.body)
  expect(serialized, label).not.toMatch(
    /select |insert |update |delete from|drizzle|postgres|ZodError|\.ts:\d/,
  )
  expect(serialized, label).not.toMatch(
    /\b(users|sessions|devices|records|otp_challenges|rate_limits|oauth_states)\b/,
  )

  for (const value of forbidden) {
    expect(serialized, `${label}: "${value}" ikut terkirim di body error`).not.toContain(value)
  }
}

function sessionCookie(response: ApiResponse): string {
  const raw = response.setCookie.find((entry) => entry.startsWith('ip_session='))
  expect(
    raw,
    `cookie sesi tidak ada di Set-Cookie: ${response.setCookie.join(' | ')}`,
  ).toBeDefined()

  return (raw ?? '').split(';')[0] ?? ''
}

/** Cookie sesi untuk request HTTP. */
function cookieFor(token: string): string {
  return `ip_session=${token}`
}

/**
 * Konteks WAKTU NYATA untuk sesi yang akan dipakai lewat HTTP.
 *
 * `fixture.ctx()` memakai waktu tetap `FIXED_NOW` (Mei 2026) supaya TTL bisa diuji tanpa
 * `setTimeout`. Sesi dengan `expiresAt` di masa lalu itu sudah kedaluwarsa bagi server yang berjalan
 * dengan jam asli, jadi sesi untuk test HTTP harus diterbitkan dengan `now` yang nyata.
 */
function liveCtx(fixture: Fixture) {
  return fixture.ctx({ now: new Date() })
}

/** Login lewat jalur produksi (OTP) dan kembalikan token mentah + cookie-nya. */
async function loginOverHttp(
  fixture: Fixture,
  client: 'web' | 'mobile',
): Promise<{ token: string; cookie: string }> {
  const device = { name: `QA ${client} ${randomUUID().slice(0, 6)}`, platform: 'web' }

  const requested = await api('/v1/auth/otp/request', {
    method: 'POST',
    body: { email: fixture.email, client, device },
  })
  expect(requested.status).toBe(204)

  const verified = await api('/v1/auth/otp/verify', {
    method: 'POST',
    body: { email: fixture.email, code: FIXED_OTP_CODE, client, device },
  })
  expect(verified.status).toBe(200)

  const parsed = apiDataEnvelopeSchema(sessionDtoSchema).parse(verified.body).data
  const token = parsed.client === 'mobile' ? parsed.token : sessionCookie(verified).split('=')[1]

  return { token: token ?? '', cookie: cookieFor(token ?? '') }
}

beforeAll(async () => {
  // Scope per IP (`otp:ip`) dan `account:delete` memakai bucket yang SAMA untuk semua request dari
  // mesin ini, jadi penghitungnya akan menumpuk antar-run dan membuat run kedua RATE_LIMITED padahal
  // kodenya benar. Dihapus di awal berkas supaya test ini idempoten (bisa dijalankan berulang).
  await testDb().delete(rateLimits).where(eq(rateLimits.scope, 'otp:ip'))
  await testDb().delete(rateLimits).where(eq(rateLimits.scope, 'account:delete'))
})

afterAll(async () => {
  await scope.dispose()
  await closeTestDb()
})

describe('/health', () => {
  it('publik, tanpa sesi, dan tidak membocorkan data internal', async () => {
    const response = await api('/health')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ data: { status: 'ok', apiVersion: 'v1' } })
    expect(response.headers.get('cache-control')).toContain('no-store')
    const flat = JSON.stringify(response.body)
    expect(flat).not.toMatch(/database|postgres|version|host|uptime|commit/)
  })
})

describe('authz: tanpa sesi => 401 untuk semua endpoint non-publik', () => {
  const protectedEndpoints: readonly (readonly [string, string, unknown?])[] = [
    ['GET', '/v1/auth/session'],
    ['GET', '/v1/devices'],
    ['DELETE', `/v1/devices/${randomUUID()}`],
    ['GET', '/v1/keys/envelopes'],
    ['PUT', '/v1/keys/envelopes', { slot: 'passkey', wrappedKey: 'AAAA', kdfParams: {} }],
    ['POST', '/v1/keys/transfer', { targetDeviceId: randomUUID(), blob: 'AAAA' }],
    ['POST', `/v1/keys/transfer/${'a'.repeat(22)}`],
    ['GET', '/v1/sync/pull?cursor=0&limit=10'],
    ['POST', '/v1/sync/push', { records: [] }],
    ['DELETE', '/v1/account', { email: 'qa@qa.test', code: FIXED_OTP_CODE }],
    ['POST', '/v1/account/deletion-otp'],
    ['POST', '/v1/auth/logout'],
  ]

  it.each(protectedEndpoints)('%s %s -> 401 ApiErrorBody', async (method, path, body) => {
    const response = await api(String(path), { method: String(method), body })

    expect(response.status).toBe(401)
    expect(problemOf(response).error.code).toBe('UNAUTHENTICATED')
  })

  it('token yang tidak dikenal sama-sama 401 (bukan 403 - klien tidak perlu tahu bedanya)', async () => {
    const unknown = await api('/v1/devices', {
      cookie: cookieFor('qa-token-palsu-0123456789abcdefghijklmn'),
    })

    expect(unknown.status).toBe(401)
    expect(problemOf(unknown).error.code).toBe('UNAUTHENTICATED')
  })
})

describe('login OTP lewat HTTP', () => {
  it('respons minta kode selalu sama untuk email terdaftar maupun tidak (tanpa oracle)', async () => {
    const registered = scope.fixture({ prefix: 'http-generic-registered' })
    const stranger = scope.fixture({ prefix: 'http-generic-stranger' })
    const device = { name: 'QA Generic Browser', platform: 'web' }

    await api('/v1/auth/otp/request', {
      method: 'POST',
      body: { email: registered.email, client: 'web', device },
    })
    await api('/v1/auth/otp/verify', {
      method: 'POST',
      body: { email: registered.email, code: FIXED_OTP_CODE, client: 'web', device },
    })

    const known = await api('/v1/auth/otp/request', {
      method: 'POST',
      body: { email: registered.email, client: 'web', device },
    })
    const unknown = await api('/v1/auth/otp/request', {
      method: 'POST',
      body: { email: stranger.email, client: 'web', device },
    })

    expect(known.status).toBe(204)
    expect(unknown.status).toBe(204)
    expect(known.body).toBeNull()
    expect(unknown.body).toBeNull()
    expect(known.headers.get('content-type')).toBe(unknown.headers.get('content-type'))
  })

  it('client web: cookie HttpOnly/Secure/SameSite=Lax, TANPA token di body', async () => {
    const fixture = scope.fixture({ prefix: 'http-web' })
    const device = { name: 'QA Browser Web', platform: 'web' }

    // Kode harus diminta lebih dulu: verify tanpa challenge = 400 (memang begitu kontraknya).
    const requested = await api('/v1/auth/otp/request', {
      method: 'POST',
      body: { email: fixture.email, client: 'web', device },
    })
    expect(requested.status).toBe(204)

    const response = await api('/v1/auth/otp/verify', {
      method: 'POST',
      body: { email: fixture.email, code: FIXED_OTP_CODE, client: 'web', device },
    })

    expect(response.status).toBe(200)
    expect(apiDataEnvelopeSchema(sessionDtoSchema).parse(response.body).data).toMatchObject({
      client: 'web',
    })
    expect(JSON.stringify(response.body)).not.toContain('"token"')

    const raw = response.setCookie.find((entry) => entry.startsWith('ip_session='))
    expect(raw).toMatch(/HttpOnly/i)
    expect(raw).toMatch(/Secure/i)
    expect(raw).toMatch(/SameSite=Lax/i)
    expect(raw).toMatch(/Path=\//i)

    // Cookie membawa token yang di DB disimpan sebagai HASH, bukan token polos.
    const token = sessionCookie(response).split('=')[1] ?? ''
    expect(token.length).toBeGreaterThanOrEqual(32)
    const rows = await testDb()
      .select()
      .from(sessionsTable)
      .where(eq(sessionsTable.tokenHash, sha256Hex(token)))
    expect(rows).toHaveLength(1)

    const deviceList = await api('/v1/devices', { cookie: sessionCookie(response) })
    expect(deviceList.status).toBe(200)
    expect(apiDataEnvelopeSchema(deviceListResultSchema).safeParse(deviceList.body).success).toBe(
      true,
    )
    expect(deviceList.headers.get('cache-control')).toContain('no-store')
  })

  it('client mobile: token di body (sesuai `sessionDtoSchema`), tanpa cookie sesi', async () => {
    const fixture = scope.fixture({ prefix: 'http-mobile' })
    const device = { name: 'QA HP Mobile', platform: 'android' }

    const requested = await api('/v1/auth/otp/request', {
      method: 'POST',
      body: { email: fixture.email, client: 'mobile', device },
    })
    expect(requested.status).toBe(204)

    const response = await api('/v1/auth/otp/verify', {
      method: 'POST',
      body: { email: fixture.email, code: FIXED_OTP_CODE, client: 'mobile', device },
    })

    expect(response.status).toBe(200)
    const dto = apiDataEnvelopeSchema(sessionDtoSchema).parse(response.body).data
    expect(dto.client).toBe('mobile')
    expect(dto.client === 'mobile' ? dto.token.length : 0).toBeGreaterThanOrEqual(32)
    expect(response.setCookie.filter((entry) => entry.startsWith('ip_session='))).toEqual([])

    const bearer = dto.client === 'mobile' ? dto.token : ''
    const withBearer = await api('/v1/devices', { token: bearer })
    expect(withBearer.status).toBe(200)
    expect(apiDataEnvelopeSchema(deviceListResultSchema).safeParse(withBearer.body).success).toBe(
      true,
    )
  })

  it('OTP yang sudah dipakai tidak bisa ditukar lagi', async () => {
    const fixture = scope.fixture({ prefix: 'http-otp-reuse' })
    const body = {
      email: fixture.email,
      code: FIXED_OTP_CODE,
      client: 'web',
      device: { name: 'QA Reuse Browser', platform: 'web' },
    }

    const requested = await api('/v1/auth/otp/request', {
      method: 'POST',
      body: { email: fixture.email, client: 'web', device: body.device },
    })
    expect(requested.status).toBe(204)

    const first = await api('/v1/auth/otp/verify', { method: 'POST', body })
    expect(first.status).toBe(200)

    const second = await api('/v1/auth/otp/verify', { method: 'POST', body })
    expect(second.status).toBe(400)
    expect(problemOf(second).error.code).toBe('OTP_INVALID')
  })

  it('kode demo (`FIXED_OTP_CODE`) tetap menerbitkan sesi NYATA yang dibaca `/v1/auth/session`', async () => {
    // Mode demo cuma soal KODE yang diterima saat `APP_ENV` non-production. Ia TIDAK melewati satu
    // langkah pun dari jalur sesi: challenge tetap dibuat, rate limit tetap dihitung, dan sesi tetap
    // lahir dari `loginDevice`. Test ini mengunci konsekuensinya - klien web (siapa pun, termasuk
    // email yang belum pernah ada) benar-benar memegang cookie sesi yang SAH di server, bukan cuma
    // "lolos" di UI. Tanpa assertion ini, login demo bisa tampak berhasil padahal tidak ada satu pun
    // baris `sessions` yang bisa dipakai request berikutnya.
    const fixture = scope.fixture({ prefix: 'http-demo-session' })
    const { cookie } = await loginOverHttp(fixture, 'web')

    const session = await api('/v1/auth/session', { cookie })
    expect(session.status).toBe(200)

    const dto = apiDataEnvelopeSchema(currentSessionResultSchema).parse(session.body).data
    expect(dto.user.email).toBe(fixture.email)
    // Endpoint ini cuma MEMBACA sesi: token tidak pernah ikut, karena cookie `HttpOnly` yang membawanya.
    expect(JSON.stringify(session.body)).not.toContain('"token"')

    // Sesi demo dicabut seperti sesi lain - satu jalur, tidak ada perlakuan khusus.
    const logout = await fetch(url('/v1/auth/logout'), {
      method: 'POST',
      headers: { cookie, 'sec-fetch-site': 'same-origin' },
    })
    expect(logout.status).toBe(204)

    expect((await api('/v1/auth/session', { cookie })).status).toBe(401)
  })

  it('tidak ada header/query/field client yang bisa menyalakan mode OTP fix', async () => {
    const stranger = scope.fixture({ prefix: 'http-fixed-stranger' })
    const noChallenge = scope.fixture({ prefix: 'http-fixed-no-challenge' })

    // Header `X-Fixed-Otp` tidak membuat challenge: TANPA permintaan kode, verify tetap ditolak.
    const verifyWithoutChallenge = await api('/v1/auth/otp/verify', {
      method: 'POST',
      headers: { 'x-fixed-otp': FIXED_OTP_CODE, 'x-otp-fix': 'true' },
      body: {
        email: noChallenge.email,
        code: FIXED_OTP_CODE,
        client: 'web',
        device: { name: 'QA Fixed Browser', platform: 'web' },
      },
    })
    expect(verifyWithoutChallenge.status).toBe(400)
    expect(problemOf(verifyWithoutChallenge).error.code).toBe('OTP_INVALID')

    // Query & header "bujukan" pada permintaan kode tidak mengubah bentuk jawabannya.
    const requested = await api('/v1/auth/otp/request?otp=777777&fixedOtp=true', {
      method: 'POST',
      headers: { 'x-fixed-otp': FIXED_OTP_CODE, 'x-otp-fix': 'true' },
      body: {
        email: stranger.email,
        client: 'web',
        device: { name: 'QA Fixed Browser', platform: 'web' },
      },
    })
    expect(requested.status).toBe(204)

    // Field asing di body ditolak schema strict - jadi tidak ada jalur `otpFixed: true`.
    const extraField = await api('/v1/auth/otp/verify', {
      method: 'POST',
      body: {
        email: stranger.email,
        code: FIXED_OTP_CODE,
        client: 'web',
        device: { name: 'QA Fixed Browser', platform: 'web' },
        otpFixed: true,
      },
    })
    expect(extraField.status).not.toBe(200)
    expect(apiErrorBodySchema.safeParse(extraField.body).success).toBe(true)
  })
})

describe('CSRF (security.md §8)', () => {
  it('mutasi /v1 dengan cookie sesi tanpa bukti same-origin -> 403, sesi tidak dicabut', async () => {
    const fixture = scope.fixture({ prefix: 'http-csrf' })
    const session = await seedSession(liveCtx(fixture), { email: fixture.email })

    const foreignOrigin = await api('/v1/auth/logout', {
      method: 'POST',
      cookie: cookieFor(session.token),
      sameOriginProof: false,
      headers: { origin: 'https://evil.test' },
    })
    expect(foreignOrigin.status).toBe(403)
    expect(problemOf(foreignOrigin).error.code).toBe('FORBIDDEN')

    const crossSite = await api('/v1/auth/logout', {
      method: 'POST',
      cookie: cookieFor(session.token),
      sameOriginProof: false,
      headers: { 'sec-fetch-site': 'cross-site' },
    })
    expect(crossSite.status).toBe(403)

    // Tanpa header bukti sama sekali = ditolak (fail-closed).
    const noProof = await api('/v1/auth/logout', {
      method: 'POST',
      cookie: cookieFor(session.token),
      sameOriginProof: false,
    })
    expect(noProof.status).toBe(403)

    // Sesi masih hidup setelah semua percobaan di atas.
    await expect(findSessionByToken(fixture.ctx(), session.token)).resolves.toMatchObject({
      sessionId: session.sessionId,
    })
  })

  it('request same-origin (Sec-Fetch-Site atau Origin cocok) lolos', async () => {
    const fixture = scope.fixture({ prefix: 'http-csrf-ok' })
    const first = await seedSession(liveCtx(fixture), { email: fixture.email })
    const second = await seedSession(liveCtx(fixture), {
      email: fixture.email,
      deviceName: 'QA CSRF Kedua',
    })

    const sameSite = await api('/v1/auth/logout', {
      method: 'POST',
      cookie: cookieFor(first.token),
      headers: { 'sec-fetch-site': 'same-origin' },
    })
    expect(sameSite.status).toBe(204)
    await expect(findSessionByToken(fixture.ctx(), first.token)).resolves.toBeNull()

    const byOrigin = await api('/v1/auth/logout', {
      method: 'POST',
      cookie: cookieFor(second.token),
      headers: { origin: serverOrigin() },
    })
    expect(byOrigin.status).toBe(204)
    await expect(findSessionByToken(fixture.ctx(), second.token)).resolves.toBeNull()
  })

  it('mobile bearer tanpa cookie tidak terkena pemeriksaan CSRF', async () => {
    const fixture = scope.fixture({ prefix: 'http-csrf-mobile' })
    const mobile = await loginOverHttp(fixture, 'mobile')

    const logout = await api('/v1/auth/logout', {
      method: 'POST',
      token: mobile.token,
      headers: { origin: 'https://evil.test' },
    })

    expect(logout.status).toBe(204)
  })
})

describe('authz per-resource (IDOR) lewat HTTP', () => {
  it('user A hanya melihat data user A, dan tidak bisa mengubah data user B', async () => {
    const alice = scope.fixture({ prefix: 'http-idor-alice' })
    const bob = scope.fixture({ prefix: 'http-idor-bob' })
    const aliceSession = await seedSession(liveCtx(alice), {
      email: alice.email,
      deviceName: 'Alice Laptop',
    })
    const bobSession = await seedSession(liveCtx(bob), {
      email: bob.email,
      deviceName: 'Bob Laptop',
    })
    const aliceCookie = cookieFor(aliceSession.token)
    const bobCookie = cookieFor(bobSession.token)

    const aliceDevices = apiDataEnvelopeSchema(deviceListResultSchema).parse(
      (await api('/v1/devices', { cookie: aliceCookie })).body,
    ).data
    expect(aliceDevices.devices.map((device) => device.id)).toContain(aliceSession.deviceId)
    expect(aliceDevices.devices.map((device) => device.id)).not.toContain(bobSession.deviceId)

    // `user_id` dari query diabaikan: yang dipakai selalu sesi.
    const spoofedQuery = apiDataEnvelopeSchema(deviceListResultSchema).parse(
      (
        await api(`/v1/devices?userId=${bobSession.userId}&id=${bobSession.deviceId}`, {
          cookie: aliceCookie,
        })
      ).body,
    ).data
    expect(spoofedQuery.devices.map((device) => device.id)).not.toContain(bobSession.deviceId)

    // `user_id` di body tidak diteruskan (cegah mass assignment): request ditolak dan `bob` tidak
    // menerima envelope apa pun. Status/kode pastinya diperiksa test khusus validasi di bawah - request
    // INI sendiri sudah ditolak, bukan diteruskan.
    const spoofedPut = await api('/v1/keys/envelopes', {
      method: 'PUT',
      cookie: aliceCookie,
      body: {
        slot: 'passkey',
        wrappedKey: blobOf('envelope-alice'),
        kdfParams: { algorithm: 'argon2id' },
        userId: bobSession.userId,
      },
    })
    expect(spoofedPut.status).not.toBe(200)

    const bobEnvelopes = apiDataEnvelopeSchema(keyEnvelopeListResultSchema).parse(
      (await api('/v1/keys/envelopes', { cookie: bobCookie })).body,
    ).data
    expect(bobEnvelopes.envelopes).toEqual([])

    const aliceEnvelopes = apiDataEnvelopeSchema(keyEnvelopeListResultSchema).parse(
      (await api(`/v1/keys/envelopes?userId=${bobSession.userId}`, { cookie: aliceCookie })).body,
    ).data
    expect(aliceEnvelopes.envelopes).toEqual([])

    // Cabut perangkat milik user lain: 404 (bukan 403) dan data user itu tidak berubah.
    const revoke = await api(`/v1/devices/${bobSession.deviceId}`, {
      method: 'DELETE',
      cookie: aliceCookie,
    })
    expect(revoke.status).toBe(404)
    expect(problemOf(revoke).error.code).toBe('NOT_FOUND')

    const bobDevices = apiDataEnvelopeSchema(deviceListResultSchema).parse(
      (await api('/v1/devices', { cookie: bobCookie })).body,
    ).data
    expect(
      bobDevices.devices.find((device) => device.id === bobSession.deviceId)?.revokedAt,
    ).toBeNull()
    await expect(findSessionByToken(bob.ctx(), bobSession.token)).resolves.toMatchObject({
      sessionId: bobSession.sessionId,
    })

    // Pull user A tidak memuat record user B.
    const bobRecordId = randomUUID()
    const bobPush = await api('/v1/sync/push', {
      method: 'POST',
      cookie: bobCookie,
      body: {
        records: [{ id: bobRecordId, hlc: '1000-0-b', deleted: false, blob: blobOf('milik-bob') }],
      },
    })
    expect(bobPush.status).toBe(200)

    const alicePull = apiDataEnvelopeSchema(syncPullResultSchema).parse(
      (await api('/v1/sync/pull?cursor=0&limit=50', { cookie: aliceCookie })).body,
    ).data
    expect(alicePull.records).toEqual([])
    expect(JSON.stringify(alicePull)).not.toContain(bobRecordId)
  })
})

describe('sync lewat HTTP (T21)', () => {
  it('push -> pull: ciphertext & tombstone kembali apa adanya, nextCursor benar', async () => {
    const fixture = scope.fixture({ prefix: 'http-sync' })
    const session = await seedSession(liveCtx(fixture), { email: fixture.email })
    const cookie = cookieFor(session.token)
    const liveId = randomUUID()
    const deletedId = randomUUID()
    const liveBlob = blobOf('ciphertext-memo')
    const deletedBlob = blobOf('ciphertext-tombstone')

    const pushed = await api('/v1/sync/push', {
      method: 'POST',
      cookie,
      body: {
        records: [
          { id: liveId, hlc: '1000-0-a', deleted: false, blob: liveBlob },
          { id: deletedId, hlc: '1001-0-a', deleted: true, blob: deletedBlob },
        ],
      },
    })

    expect(pushed.status).toBe(200)
    const pushResult = apiDataEnvelopeSchema(syncPushResultSchema).parse(pushed.body).data
    expect(pushResult.results.map((entry) => entry.status)).toEqual(['applied', 'applied'])

    const pulled = await api('/v1/sync/pull?cursor=0&limit=10', { cookie })
    expect(pulled.status).toBe(200)
    const page = apiDataEnvelopeSchema(syncPullResultSchema).parse(pulled.body).data

    expect(page.records.map((record) => record.id)).toEqual([liveId, deletedId])
    expect(page.records.map((record) => record.blob)).toEqual([liveBlob, deletedBlob])
    expect(page.records.find((record) => record.id === deletedId)?.deleted).toBe(true)
    expect(page.nextCursor).toBe(page.records.at(-1)?.serverSeq)

    // Halaman kosong tidak mereset cursor ke 0.
    const empty = apiDataEnvelopeSchema(syncPullResultSchema).parse(
      (await api(`/v1/sync/pull?cursor=${page.nextCursor}&limit=10`, { cookie })).body,
    ).data
    expect(empty.records).toEqual([])
    expect(empty.nextCursor).toBe(page.nextCursor)
  })

  it('batch di atas 500 record TIDAK ditulis ke DB (ditolak, bukan sebagian masuk)', async () => {
    const fixture = scope.fixture({ prefix: 'http-sync-batch' })
    const session = await seedSession(liveCtx(fixture), { email: fixture.email })
    const cookie = cookieFor(session.token)
    const records = Array.from({ length: SYNC_MAX_BATCH + 1 }, (_, index) => ({
      id: randomUUID(),
      hlc: `1000-${index}-a`,
      deleted: false,
      blob: blobOf('x'),
    }))

    const response = await api('/v1/sync/push', { method: 'POST', cookie, body: { records } })

    expect(response.status).not.toBe(200)
    const pulled = apiDataEnvelopeSchema(syncPullResultSchema).parse(
      (await api('/v1/sync/pull?cursor=0&limit=10', { cookie })).body,
    ).data
    expect(pulled.records).toEqual([])
  })

  it('batch di atas 500 record ditolak 400 VALIDATION_FAILED (BUG-1)', async () => {
    const fixture = scope.fixture({ prefix: 'http-sync-batch-status' })
    const session = await seedSession(liveCtx(fixture), { email: fixture.email })
    const records = Array.from({ length: SYNC_MAX_BATCH + 1 }, (_, index) => ({
      id: randomUUID(),
      hlc: `1000-${index}-a`,
      deleted: false,
      blob: blobOf('x'),
    }))

    const response = await api('/v1/sync/push', {
      method: 'POST',
      cookie: cookieFor(session.token),
      body: { records },
    })

    // Kegagalan validasi = kesalahan KLIEN. `500 INTERNAL` memberi sinyal "coba lagi" padahal
    // batch-nya tidak akan pernah diterima - lihat laporan QA (BUG-1).
    expectValidationFailure(response, 'batch 501 record')
  })

  it('field terlarang di body push (userId) ditolak dan recordnya tidak tertulis', async () => {
    const fixture = scope.fixture({ prefix: 'http-sync-spoof' })
    const session = await seedSession(liveCtx(fixture), { email: fixture.email })
    const cookie = cookieFor(session.token)
    const recordId = randomUUID()

    const response = await api('/v1/sync/push', {
      method: 'POST',
      cookie,
      body: {
        userId: randomUUID(),
        records: [{ id: recordId, hlc: '1000-0-a', deleted: false, blob: blobOf('x') }],
      },
    })

    expect(response.status).not.toBe(200)
    const pulled = apiDataEnvelopeSchema(syncPullResultSchema).parse(
      (await api('/v1/sync/pull?cursor=0&limit=10', { cookie })).body,
    ).data
    expect(pulled.records.map((record) => record.id)).not.toContain(recordId)
  })

  it('field terlarang (userId) di body push ditolak 400 VALIDATION_FAILED (BUG-1)', async () => {
    const fixture = scope.fixture({ prefix: 'http-sync-spoof-status' })
    const session = await seedSession(liveCtx(fixture), { email: fixture.email })

    const response = await api('/v1/sync/push', {
      method: 'POST',
      cookie: cookieFor(session.token),
      body: {
        userId: session.userId,
        records: [{ id: randomUUID(), hlc: '1000-0-a', deleted: false, blob: blobOf('x') }],
      },
    })

    // Field asing ditolak schema strict (cegah mass assignment) - dan itu kegagalan klien, bukan bug
    // server. `userId` yang dikirim juga tidak boleh ikut terpantul di body error.
    expectValidationFailure(response, 'field asing userId', [session.userId])
  })

  it('cursor di bawah purged_seq -> 409 SYNC_RESET_REQUIRED', async () => {
    const fixture = scope.fixture({ prefix: 'http-sync-reset' })
    const session = await seedSession(liveCtx(fixture), { email: fixture.email })

    await testDb()
      .insert(syncWatermarks)
      .values({ userId: session.userId, purgedSeq: 500, updatedAt: new Date() })

    const response = await api('/v1/sync/pull?cursor=0&limit=10', {
      cookie: cookieFor(session.token),
    })

    expect(response.status).toBe(409)
    expect(problemOf(response).error.code).toBe('SYNC_RESET_REQUIRED')
    expect(problemOf(response).error.message).toBe(GENERIC_ERROR_MESSAGES.SYNC_RESET_REQUIRED)

    const atWatermark = await api('/v1/sync/pull?cursor=500&limit=10', {
      cookie: cookieFor(session.token),
    })
    expect(atWatermark.status).toBe(200)
  })

  it('query pull yang tidak sah tidak pernah diabaikan (bukan 200, tetap ApiErrorBody)', async () => {
    const fixture = scope.fixture({ prefix: 'http-sync-query' })
    const session = await seedSession(liveCtx(fixture), { email: fixture.email })

    for (const query of [
      'cursor=abc',
      'cursor=-1',
      'limit=0',
      'limit=99999',
      'cursor=0&takDikenal=1',
    ]) {
      const response = await api(`/v1/sync/pull?${query}`, { cookie: cookieFor(session.token) })

      expect(response.status, `query "${query}" seharusnya ditolak`).not.toBe(200)
      expect(apiErrorBodySchema.safeParse(response.body).success, `query "${query}"`).toBe(true)
    }
  })

  it('query pull yang tidak sah ditolak 400 VALIDATION_FAILED, bukan 500 (BUG-1)', async () => {
    const fixture = scope.fixture({ prefix: 'http-sync-query-status' })
    const session = await seedSession(liveCtx(fixture), { email: fixture.email })

    for (const query of ['cursor=abc', 'cursor=-1', 'limit=0', 'limit=99999']) {
      const response = await api(`/v1/sync/pull?${query}`, { cookie: cookieFor(session.token) })

      expectValidationFailure(response, `query "${query}"`)
    }
  })
})

describe('sync: penanda pemilik request `x-expected-user-id` (H1)', () => {
  const HEADER = 'x-expected-user-id'

  /** Sesi milik user fixture ini, siap dipakai lewat cookie (HTTP nyata). */
  async function sessionOf(fixture: Fixture) {
    return await seedSession(liveCtx(fixture), { email: fixture.email })
  }

  it('header cocok -> push & pull diproses seperti biasa', async () => {
    const fixture = scope.fixture({ prefix: 'http-sync-owner' })
    const session = await sessionOf(fixture)
    const cookie = cookieFor(session.token)
    const id = randomUUID()

    const pushed = await api('/v1/sync/push', {
      method: 'POST',
      cookie,
      headers: { [HEADER]: session.userId },
      body: { records: [{ id, hlc: '1000-0-a', deleted: false, blob: blobOf('milik-sendiri') }] },
    })
    expect(pushed.status).toBe(200)

    const pulled = await api('/v1/sync/pull?cursor=0&limit=10', {
      cookie,
      headers: { [HEADER]: session.userId },
    })
    expect(pulled.status).toBe(200)
    expect(
      apiDataEnvelopeSchema(syncPullResultSchema)
        .parse(pulled.body)
        .data.records.map((record) => record.id),
    ).toEqual([id])
  })

  it('tanpa header -> tetap dilayani (kompatibilitas klien lama)', async () => {
    const fixture = scope.fixture({ prefix: 'http-sync-legacy' })
    const session = await sessionOf(fixture)
    const cookie = cookieFor(session.token)
    const id = randomUUID()

    const pushed = await api('/v1/sync/push', {
      method: 'POST',
      cookie,
      body: { records: [{ id, hlc: '1000-0-a', deleted: false, blob: blobOf('x') }] },
    })
    expect(pushed.status).toBe(200)

    const pulled = await api('/v1/sync/pull?cursor=0&limit=10', { cookie })
    expect(pulled.status).toBe(200)
  })

  it('header user lain -> 403 FORBIDDEN sebelum menyentuh data/jatah, nilai header tidak dipantulkan', async () => {
    const alice = scope.fixture({ prefix: 'http-sync-owner-alice' })
    const bob = scope.fixture({ prefix: 'http-sync-owner-bob' })
    const session = await sessionOf(alice)
    const bobUserId = await bob.userId()
    const cookie = cookieFor(session.token)
    const id = randomUUID()

    const push = await api('/v1/sync/push', {
      method: 'POST',
      cookie,
      headers: { [HEADER]: bobUserId },
      body: { records: [{ id, hlc: '1000-0-a', deleted: false, blob: blobOf('bukan-miliknya') }] },
    })
    expect(push.status).toBe(403)
    expect(problemOf(push).error.code).toBe('FORBIDDEN')
    expect(JSON.stringify(push.body)).not.toContain(bobUserId)

    const pull = await api('/v1/sync/pull?cursor=0&limit=10', {
      cookie,
      headers: { [HEADER]: bobUserId },
    })
    expect(pull.status).toBe(403)
    expect(problemOf(pull).error.code).toBe('FORBIDDEN')
    expect(JSON.stringify(pull.body)).not.toContain(id)

    // Ditolak SEBELUM rate limit: jatah `sync:*` milik user sesi masih utuh.
    expect(await rateLimitCount(alice.env, session.userId)).toBe(0)

    // Dan tidak ada yang tertulis: pull yang sah tidak memuat record dari request yang ditolak.
    const legit = await api('/v1/sync/pull?cursor=0&limit=10', { cookie })
    expect(legit.status).toBe(200)
    expect(
      apiDataEnvelopeSchema(syncPullResultSchema)
        .parse(legit.body)
        .data.records.map((record) => record.id),
    ).not.toContain(id)
  })

  it('header kosong -> 403 (fail-closed), bukan dianggap "tanpa header"', async () => {
    const fixture = scope.fixture({ prefix: 'http-sync-owner-empty' })
    const session = await sessionOf(fixture)

    const response = await api('/v1/sync/pull?cursor=0&limit=10', {
      cookie: cookieFor(session.token),
      headers: { [HEADER]: '' },
    })

    expect(response.status).toBe(403)
    expect(problemOf(response).error.code).toBe('FORBIDDEN')
  })
})

describe('hapus akun lewat HTTP', () => {
  it('kode salah -> 400 dan akun masih ada; kode benar -> 204 dan cookie dibersihkan', async () => {
    const fixture = scope.fixture({ prefix: 'http-delete' })
    const login = await loginOverHttp(fixture, 'web')

    const requested = await api('/v1/account/deletion-otp', {
      method: 'POST',
      cookie: login.cookie,
    })
    expect(requested.status).toBe(204)

    const wrongCode = await api('/v1/account', {
      method: 'DELETE',
      cookie: login.cookie,
      body: { email: fixture.email, code: '000000' },
    })
    expect(wrongCode.status).toBe(400)
    expect(problemOf(wrongCode).error.code).toBe('OTP_INVALID')

    // Akun masih hidup: daftar perangkat tetap bisa dibaca.
    expect((await api('/v1/devices', { cookie: login.cookie })).status).toBe(200)

    const deleted = await api('/v1/account', {
      method: 'DELETE',
      cookie: login.cookie,
      body: { email: fixture.email, code: FIXED_OTP_CODE },
    })
    expect(deleted.status).toBe(204)

    const clearedCookie = deleted.setCookie.find((entry) => entry.startsWith('ip_session='))
    expect(clearedCookie).toMatch(/Max-Age=0/i)

    const afterDelete = await api('/v1/devices', { cookie: login.cookie })
    expect(afterDelete.status).toBe(401)
  })
})

describe('bentuk error (security.md §11)', () => {
  it('setiap error berbentuk ApiErrorBody dengan pesan generik dan tanpa bocoran internal', async () => {
    const notFound = await api('/v1/tidak-ada-endpoint-ini')

    expect(notFound.status).toBe(404)
    expect(problemOf(notFound).error.code).toBe('NOT_FOUND')
    expect(problemOf(notFound).error.message).toBe(GENERIC_ERROR_MESSAGES.NOT_FOUND)

    const invalid = await api('/v1/auth/otp/request', {
      method: 'POST',
      body: { email: 'bukan-email', client: 'web', device: { name: 'QA', platform: 'web' } },
    })
    // Pesan & bentuknya tetap benar sebagai `ApiErrorBody`; kode/status pastinya diperiksa test
    // khusus validasi di bawah.
    expect(invalid.status).not.toBe(200)
    expect(apiErrorBodySchema.safeParse(invalid.body).success).toBe(true)
    const invalidProblem = problemOf(invalid)
    expect(invalidProblem.error.message).toBe(GENERIC_ERROR_MESSAGES[invalidProblem.error.code])
    expect(JSON.stringify(invalid.body)).not.toContain('bukan-email')
    expect(JSON.stringify(invalid.body)).not.toMatch(
      /select |insert |from |drizzle|postgres|\.ts:\d/,
    )
  })

  it('body yang gagal validasi schema ditolak 400 VALIDATION_FAILED (BUG-1)', async () => {
    const invalid = await api('/v1/auth/otp/request', {
      method: 'POST',
      body: { email: 'bukan-email', client: 'web', device: { name: 'QA', platform: 'web' } },
    })

    // `emailSchema` menormalkan lowercase + trim; nilai yang ditolak TIDAK boleh ikut di body error.
    expectValidationFailure(invalid, 'body: email bukan email', ['bukan-email'])
  })

  it('body bukan JSON valid -> 4xx ApiErrorBody, bukan 500 dengan stack', async () => {
    const response = await fetch(url('/v1/auth/otp/request'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{bukan json}',
    })
    const body: unknown = await response.json()

    expect(response.status).toBe(400)
    const parsed = apiErrorBodySchema.safeParse(body)
    expect(parsed.success).toBe(true)
    expect(
      problemOf({ status: response.status, headers: response.headers, body, setCookie: [] }).error
        .code,
    ).toBe('VALIDATION_FAILED')
  })

  it('method yang tidak dilayani -> 4xx/405, bukan 500', async () => {
    const getOnPostRoute = await api('/v1/auth/otp/request')
    expect(getOnPostRoute.status).not.toBe(500)
    expect([404, 405]).toContain(getOnPostRoute.status)
    expect(apiErrorBodySchema.safeParse(getOnPostRoute.body).success).toBe(true)

    const putOnCollection = await api('/v1/devices', { method: 'PUT', body: {} })
    expect(putOnCollection.status).not.toBe(500)
    expect([404, 405]).toContain(putOnCollection.status)
  })
})

describe('rate limit tetap jalan di jalur HTTP', () => {
  it('permintaan OTP berulang menulis penghitung di tabel `rate_limits` (per email & per IP)', async () => {
    const fixture = scope.fixture({ prefix: 'http-rate-limit' })
    const device = { name: 'QA Rate Limit Browser', platform: 'web' }

    await api('/v1/auth/otp/request', {
      method: 'POST',
      body: { email: fixture.email, client: 'web', device },
    })

    const emailHash = hmacSha256(fixture.email, fixture.env.otpPepper)
    expect(await rateLimitCount(fixture.env, `email:${emailHash}`)).toBeGreaterThanOrEqual(1)

    const rows = await testDb().select().from(rateLimits).where(eq(rateLimits.scope, 'otp:ip'))
    expect(rows.length).toBeGreaterThan(0)
    expect(JSON.stringify(rows)).not.toContain(fixture.email)
  })

  it('DELETE /v1/account memakai jatah `account:delete` milik user dari sesi, lalu berhenti di 429', async () => {
    const fixture = scope.fixture({ prefix: 'http-delete-rate-limit' })
    const session = await seedSession(liveCtx(fixture), { email: fixture.email })
    const cookie = cookieFor(session.token)
    const body = { email: fixture.email, code: '000000' }

    // Endpoint ini satu-satunya tempat kode 6 digit ditebak terhadap aksi destruktif. Sebelum diperbaiki
    // hanya `POST /v1/account/deletion-otp` yang menghitung, jadi tebakan kode di sini tidak terbatas.
    const attempts: ApiResponse[] = []
    for (
      let attempt = 0;
      attempt < 6 && !attempts.some((entry) => entry.status === 429);
      attempt += 1
    ) {
      attempts.push(await api('/v1/account', { method: 'DELETE', cookie, body }))
    }

    const limited = attempts.find((entry) => entry.status === 429)
    expect(limited, 'jatah `account:delete` habis tanpa pernah dijawab 429').toBeDefined()
    if (!limited) throw new Error('rate limit hapus akun tidak menahan apa pun')

    // Sebelum jatah habis: kode salah tetap `OTP_INVALID` (bukan 500, bukan 200).
    for (const response of attempts.filter((entry) => entry.status !== 429)) {
      expect(response.status).toBe(400)
      expect(problemOf(response).error.code).toBe('OTP_INVALID')
    }

    expect(problemOf(limited).error.code).toBe('RATE_LIMITED')
    expect(limited.headers.get('retry-after')).toMatch(/^[1-9][0-9]*$/)

    // Penghitungnya milik USER dari sesi, bukan email di body - dan akunnya masih utuh: jatah habis
    // bukan alasan menghapus apa pun.
    expect(await rateLimitCount(fixture.env, session.userId)).toBeGreaterThanOrEqual(5)
    expect((await api('/v1/devices', { cookie })).status).toBe(200)
  })
})

describe('regresi BUG-1: kegagalan validasi input seragam 400 VALIDATION_FAILED', () => {
  it('berlaku untuk body, query, param, field asing, batch kebesaran, dan 400 yang bukan zod', async () => {
    const fixture = scope.fixture({ prefix: 'http-validation-table' })
    const session = await seedSession(liveCtx(fixture), { email: fixture.email })
    const cookie = cookieFor(session.token)
    const unknownId = 'bukan-uuid-sama-sekali'

    // Semua bentuk input yang bisa ditolak schema, lewat jalur HTTP yang sebenarnya - bukan dengan
    // memanggil handler langsung. Yang diuji: status + kode kontrak yang SAMA untuk semuanya.
    const cases: ReadonlyArray<{
      readonly label: string
      readonly run: () => Promise<ApiResponse>
      readonly forbidden?: readonly string[]
    }> = [
      {
        label: 'body: email bukan email',
        run: () =>
          api('/v1/auth/otp/request', {
            method: 'POST',
            body: { email: 'bukan-email', client: 'web', device: { name: 'QA', platform: 'web' } },
          }),
        forbidden: ['bukan-email'],
      },
      {
        label: 'body: field asing di DELETE /v1/account',
        run: () =>
          api('/v1/account', {
            method: 'DELETE',
            cookie,
            body: { email: fixture.email, code: FIXED_OTP_CODE, userId: session.userId },
          }),
        forbidden: [session.userId],
      },
      {
        label: 'query: cursor bukan angka',
        run: () => api('/v1/sync/pull?cursor=abc', { cookie }),
      },
      {
        label: 'query: limit di luar rentang',
        run: () => api('/v1/sync/pull?limit=99999', { cookie }),
      },
      {
        label: 'query: parameter tak dikenal',
        run: () => api('/v1/sync/pull?cursor=0&takDikenal=1', { cookie }),
      },
      {
        label: 'param: id perangkat bukan UUID',
        run: () => api(`/v1/devices/${unknownId}`, { method: 'DELETE', cookie }),
        forbidden: [unknownId],
      },
      {
        label: 'body: field asing userId di sync push',
        run: () =>
          api('/v1/sync/push', {
            method: 'POST',
            cookie,
            body: {
              userId: session.userId,
              records: [{ id: randomUUID(), hlc: '1000-0-a', deleted: false, blob: blobOf('x') }],
            },
          }),
        forbidden: [session.userId],
      },
      {
        label: 'body: batch di atas SYNC_MAX_BATCH',
        run: () =>
          api('/v1/sync/push', {
            method: 'POST',
            cookie,
            body: {
              records: Array.from({ length: SYNC_MAX_BATCH + 1 }, (_, index) => ({
                id: randomUUID(),
                hlc: `1000-${index}-a`,
                deleted: false,
                blob: blobOf('x'),
              })),
            },
          }),
      },
    ]

    for (const testCase of cases) {
      expectValidationFailure(await testCase.run(), testCase.label, testCase.forbidden ?? [])
    }

    // 400 yang BUKAN dari zod: body JSON rusak. Tetap kegagalan klien - dan justru inilah kasus yang
    // dulu membuktikan pemetaannya tidak boleh bergantung pada `error.name === 'ZodError'`.
    const malformed = await fetch(url('/v1/auth/otp/request'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{bukan json}',
    })
    expectValidationFailure(
      {
        status: malformed.status,
        headers: malformed.headers,
        body: await malformed.json(),
        setCookie: malformed.headers.getSetCookie(),
      },
      'body JSON rusak (400 non-zod)',
    )
  })
})
