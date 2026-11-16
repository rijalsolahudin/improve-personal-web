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
import { request as nodeHttpRequest } from 'node:http'

import {
  apiDataEnvelopeSchema,
  apiErrorBodySchema,
  currentSessionResultSchema,
  GENERIC_ERROR_MESSAGES,
  licenseTokenResultSchema,
  sessionDtoSchema,
  type ApiErrorBody,
} from '@improve-personal/contracts'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { setup, url } from '@nuxt/test-utils/e2e'

import { grantLicense } from '../services/license'
import { FIXED_OTP_CODE } from '../services/otp'
import { findSessionByToken } from '../services/session'
import { hmacSha256, sha256Hex } from '../utils/crypto'
import { rateLimits, sessions as sessionsTable } from '../db/schema'
import { closeTestDb, rateLimitCount, seedSession, testDb, type Fixture } from './helpers/harness'
import { testScope } from './helpers/scope'

await setup({ server: true })

const scope = testScope()

/** Origin server test. Dibaca lazily: `url()` baru tersedia setelah `setup()` menjalankan beforeAll. */
function serverOrigin(): string {
  return new URL(url('/')).origin
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
  /**
   * Transport yang dipakai.
   *
   * `fetch` Node SELALU menambahkan `Sec-Fetch-Mode: cors`, jadi lewat `fetch` semua request terlihat
   * seperti request browser. Untuk request yang benar-benar tanpa satu pun Fetch Metadata - klien
   * bearer tanpa cookie, atau browser lama yang tidak mengirim `Origin`/`Sec-Fetch-*` (temuan L1) -
   * pakai `'node'`: `node:http` hanya mengirim header yang kita minta.
   */
  readonly transport?: 'fetch' | 'node'
}

type RawResponse = {
  readonly status: number
  readonly headers: Headers
  readonly text: string
}

type ApiResponse = {
  readonly status: number
  readonly headers: Headers
  readonly body: unknown
  readonly setCookie: readonly string[]
}

const MUTATING_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE']

/**
 * Request lewat `node:http` - TANPA header tambahan dari runtime.
 *
 * Ini satu-satunya cara menguji jalur "request tanpa Fetch Metadata sama sekali": `fetch` Node
 * menyisipkan `Sec-Fetch-Mode` sendiri, dan header itu tidak bisa dihapus lewat `HeadersInit`.
 */
async function nodeRequest(
  target: string,
  method: string,
  headers: Record<string, string>,
  body: string | undefined,
): Promise<RawResponse> {
  return await new Promise((resolve, reject) => {
    const request = nodeHttpRequest(
      target,
      {
        method,
        headers: {
          ...headers,
          ...(body === undefined ? {} : { 'content-length': String(Buffer.byteLength(body)) }),
        },
      },
      (response) => {
        const chunks: Buffer[] = []
        response.on('data', (chunk: Buffer) => chunks.push(chunk))
        response.on('end', () => {
          const responseHeaders = new Headers()
          for (let index = 0; index < response.rawHeaders.length; index += 2) {
            responseHeaders.append(
              response.rawHeaders[index] ?? '',
              response.rawHeaders[index + 1] ?? '',
            )
          }

          resolve({
            status: response.statusCode ?? 0,
            headers: responseHeaders,
            text: Buffer.concat(chunks).toString('utf8'),
          })
        })
      },
    )

    request.on('error', reject)
    request.end(body)
  })
}

async function api(path: string, request: ApiRequest = {}): Promise<ApiResponse> {
  const method = request.method ?? 'GET'
  const needsProof =
    request.cookie !== undefined &&
    MUTATING_METHODS.includes(method) &&
    request.sameOriginProof !== false

  const headers: Record<string, string> = {
    ...(request.body === undefined ? {} : { 'content-type': 'application/json' }),
    ...(request.cookie === undefined ? {} : { cookie: request.cookie }),
    ...(request.token === undefined ? {} : { authorization: `Bearer ${request.token}` }),
    // Middleware CSRF menolak mutasi ber-cookie tanpa bukti same-origin (fail-closed), jadi test
    // non-CSRF harus mengirim bukti itu seperti browser asli.
    ...(needsProof ? { 'sec-fetch-site': 'same-origin' } : {}),
    ...request.headers,
  }
  const body = request.body === undefined ? undefined : JSON.stringify(request.body)
  const target = url(path)

  let raw: RawResponse
  if (request.transport === 'node') {
    raw = await nodeRequest(target, method, headers, body)
  } else {
    const response = await fetch(target, { method, headers, body })
    raw = { status: response.status, headers: response.headers, text: await response.text() }
  }

  let parsed: unknown = null
  if (raw.text.length > 0) {
    try {
      parsed = JSON.parse(raw.text)
    } catch {
      parsed = raw.text
    }
  }

  return {
    status: raw.status,
    headers: raw.headers,
    body: parsed,
    setCookie: raw.headers.getSetCookie(),
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
    ['POST', '/v1/auth/logout'],
    ['POST', '/v1/license/token'],
  ]

  it.each(protectedEndpoints)('%s %s -> 401 ApiErrorBody', async (method, path, body) => {
    const response = await api(String(path), { method: String(method), body })

    expect(response.status).toBe(401)
    expect(problemOf(response).error.code).toBe('UNAUTHENTICATED')
  })

  it('token yang tidak dikenal sama-sama 401 (bukan 403 - klien tidak perlu tahu bedanya)', async () => {
    const unknown = await api('/v1/auth/session', {
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

    const current = await api('/v1/auth/session', { cookie: sessionCookie(response) })
    expect(current.status).toBe(200)
    expect(current.headers.get('cache-control')).toContain('no-store')
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
    const withBearer = await api('/v1/auth/session', { token: bearer })
    expect(withBearer.status).toBe(200)
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

describe('lisensi lewat HTTP (ADR 15)', () => {
  it('sesi tanpa pembelian -> 403 LICENSE_REQUIRED; setelah membeli -> token', async () => {
    const fixture = scope.fixture({ prefix: 'http-license' })
    const session = await seedSession(liveCtx(fixture), { email: fixture.email })
    const cookie = cookieFor(session.token)

    const before = await api('/v1/license/token', { method: 'POST', cookie })
    expect(before.status).toBe(403)
    expect(problemOf(before).error.code).toBe('LICENSE_REQUIRED')

    await grantLicense(liveCtx(fixture), {
      email: fixture.email,
      orderRef: `qa-${randomUUID()}`,
      plan: 'yearly',
    })

    const after = await api('/v1/license/token', { method: 'POST', cookie })
    expect(after.status).toBe(200)
    const issued = apiDataEnvelopeSchema(licenseTokenResultSchema).safeParse(after.body)
    expect(issued.success).toBe(true)
    expect(after.headers.get('cache-control')).toContain('no-store')

    // Refresh publik (ADR 16): token lama = bukti, tanpa cookie sesi.
    const refreshed = await api('/v1/license/refresh', {
      method: 'POST',
      body: { token: issued.data?.data.token },
    })
    expect(refreshed.status).toBe(200)
    expect(apiDataEnvelopeSchema(licenseTokenResultSchema).safeParse(refreshed.body).success).toBe(
      true,
    )
  })

  it('refresh dengan token palsu -> 401; body asing -> 400', async () => {
    const forged = await api('/v1/license/refresh', {
      method: 'POST',
      body: { token: 'YWJj.ZGVm' },
    })
    expect(forged.status).toBe(401)
    expect(problemOf(forged).error.code).toBe('UNAUTHENTICATED')

    expectValidationFailure(
      await api('/v1/license/refresh', { method: 'POST', body: { token: 'YWJj.ZGVm', lid: 'x' } }),
      'refresh dengan field asing',
    )
  })
})

describe('pembelian & webhook Mayar lewat HTTP (ADR 15)', () => {
  it('checkout: input tidak valid -> 400 VALIDATION_FAILED, harga dari klien ditolak', async () => {
    const fixture = scope.fixture({ prefix: 'http-checkout' })
    const body = {
      name: 'QA',
      email: fixture.email,
      mobile: '081234567890',
      plan: 'yearly',
      amount: 1,
    }

    expectValidationFailure(
      await api('/v1/purchase/checkout', { method: 'POST', body }),
      'checkout dengan field asing amount',
    )
  })

  it('webhook tanpa token -> 401, dan tidak ada data yang tersentuh', async () => {
    const response = await api('/v1/payments/webhook/mayar', {
      method: 'POST',
      body: { event: 'testing' },
    })

    expect(response.status).toBe(401)
    expect(problemOf(response).error.code).toBe('UNAUTHENTICATED')
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

    const putOnSession = await api('/v1/auth/session', { method: 'PUT', body: {} })
    expect(putOnSession.status).not.toBe(500)
    expect([404, 405]).toContain(putOnSession.status)
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
})

describe('regresi BUG-1: kegagalan validasi input seragam 400 VALIDATION_FAILED', () => {
  it('berlaku untuk body, field asing, dan 400 yang bukan zod', async () => {
    const fixture = scope.fixture({ prefix: 'http-validation-table' })
    const device = { name: 'QA', platform: 'web' }

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
            body: { email: 'bukan-email', client: 'web', device },
          }),
        forbidden: ['bukan-email'],
      },
      {
        label: 'body: field asing userId di otp/verify',
        run: () =>
          api('/v1/auth/otp/verify', {
            method: 'POST',
            body: {
              email: fixture.email,
              code: FIXED_OTP_CODE,
              client: 'web',
              device,
              userId: 'qa-field-asing',
            },
          }),
        forbidden: ['qa-field-asing'],
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
