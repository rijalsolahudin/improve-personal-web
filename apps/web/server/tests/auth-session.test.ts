// @vitest-environment node
//
// Test HTTP untuk `GET /v1/auth/session`.
//
// Kenapa harus lewat HTTP sungguhan (server Nitro, `setup({ server: true })`):
// - `GET /v1/auth/session` adalah endpoint yang dibaca klien web SETELAH reload, dan yang menentukan
//   perilakunya justru cookie `HttpOnly` yang di-set jalur login - sesuatu yang cuma ada di HTTP.
//   Yang diuji di sini bukan cuma body-nya, tapi juga janji "body TIDAK memuat token": satu-satunya
//   cara membuktikannya adalah melihat byte yang benar-benar terkirim.
//
// Bentuk kegagalan callback Google (302 untuk alur web vs JSON untuk klien mobile) ada di
// `http-hardening.test.ts`, BUKAN di sini. Alasannya isolasi, bukan cakupan: endpoint callback memakai
// rate limit per IP yang bucket-nya dihitung dari alamat SOCKET (`NUXT_TRUSTED_PROXY_HOPS=0` di test,
// jadi selalu `127.0.0.1`), artinya SATU bucket dipakai bersama SELURUH berkas test. Test yang sengaja
// men-SATURASI bucket itu ada di `http-hardening.test.ts`, dan berkas test berjalan PARALEL (worker
// terpisah, Postgres yang sama) - selama bucket itu jenuh, request callback yang SAH dari berkas lain
// ikut dijawab `429`. Memindahkannya ke berkas yang sama membuat urutannya berurutan, jadi tabrakan
// itu hilang tanpa melemahkan satu assertion pun. `GET /v1/auth/session` TIDAK memakai rate limit,
// jadi seluruh cakupannya tetap di berkas ini.
import {
  apiDataEnvelopeSchema,
  apiErrorBodySchema,
  currentSessionResultSchema,
  GENERIC_ERROR_MESSAGES,
  type ApiErrorBody,
} from '@improve-personal/contracts'
import { and, eq } from 'drizzle-orm'
import { afterAll, afterEach, describe, expect, it } from 'vitest'

import { setup, url } from '@nuxt/test-utils/e2e'

import { findSessionByToken } from '../services/session'
import { sha256Hex } from '../utils/crypto'
import { sessions as sessionsTable } from '../db/schema'
import { closeTestDb, seedSession, testDb, type Fixture } from './helpers/harness'
import { testScope } from './helpers/scope'

await setup({ server: true })

const scope = testScope()

type ApiResponse = {
  readonly status: number
  readonly headers: Headers
  readonly body: unknown
  readonly setCookie: readonly string[]
}

/** Request HTTP biasa. `redirect: 'manual'` supaya 302 tidak diikuti ke Google/jaringan luar. */
async function api(
  path: string,
  request: {
    readonly cookie?: string
    readonly token?: string
    readonly headers?: Record<string, string>
  } = {},
): Promise<ApiResponse> {
  const response = await fetch(url(path), {
    redirect: 'manual',
    headers: {
      ...(request.cookie === undefined ? {} : { cookie: request.cookie }),
      ...(request.token === undefined ? {} : { authorization: `Bearer ${request.token}` }),
      ...request.headers,
    },
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

function problemOf(response: ApiResponse): ApiErrorBody {
  const parsed = apiErrorBodySchema.safeParse(response.body)
  expect(parsed.success, `bukan ApiErrorBody: ${JSON.stringify(response.body)}`).toBe(true)
  if (!parsed.success) throw new Error('respons bukan ApiErrorBody')

  return parsed.data
}

/** Cookie sesi untuk request HTTP. */
function cookieFor(token: string): string {
  return `ip_session=${token}`
}

/**
 * Konteks WAKTU NYATA: sesi yang dipakai lewat HTTP harus diterbitkan dengan jam asli, karena server
 * test berjalan dengan waktu nyata (bukan `FIXED_NOW`).
 */
function liveCtx(fixture: Fixture) {
  return fixture.ctx({ now: new Date() })
}

afterEach(async () => {
  await scope.dispose()
})

afterAll(async () => {
  await closeTestDb()
})

describe('GET /v1/auth/session', () => {
  it('tanpa sesi -> 401 UNAUTHENTICATED (ApiErrorBody, tanpa data)', async () => {
    const response = await api('/v1/auth/session')

    expect(response.status).toBe(401)
    expect(problemOf(response).error.code).toBe('UNAUTHENTICATED')
    expect(problemOf(response).error.message).toBe(GENERIC_ERROR_MESSAGES.UNAUTHENTICATED)
    expect(response.body).not.toHaveProperty('data')

    // Cookie/token yang tidak dikenal sama-sama 401: klien tidak perlu tahu bedanya.
    const unknown = await api('/v1/auth/session', {
      cookie: cookieFor('qa-token-palsu-0123456789abcdefghijklmnop'),
    })
    expect(unknown.status).toBe(401)
    expect(problemOf(unknown).error.code).toBe('UNAUTHENTICATED')
  })

  it('dengan sesi sah (cookie) -> 200 berisi user/device/expiresAt, TANPA token', async () => {
    const fixture = scope.fixture({ prefix: 'http-session-web' })
    const session = await seedSession(liveCtx(fixture), {
      email: fixture.email,
      deviceName: 'QA Laptop Sesi',
    })

    const response = await api('/v1/auth/session', { cookie: cookieFor(session.token) })

    expect(response.status).toBe(200)
    // Sesuai kontrak: TANPA `client`, TANPA `token` - dan schema strict menolak field asing.
    const dto = apiDataEnvelopeSchema(currentSessionResultSchema).parse(response.body).data
    expect(dto.user).toEqual({ id: session.userId, email: fixture.email })
    expect(dto.device).toEqual({ id: session.deviceId, name: 'QA Laptop Sesi' })
    expect(dto.expiresAt).toBe(new Date(dto.expiresAt).toISOString())

    // Amplop sukses HANYA punya `data`, dan isinya HANYA tiga field kontrak - jadi tidak ada
    // `sessionId`/`userId`/`client`/field internal yang bisa nyasar ke klien.
    expect(Object.keys(response.body as object)).toEqual(['data'])
    expect(Object.keys(dto).sort()).toEqual(['device', 'expiresAt', 'user'])
    expect(Object.keys(dto.user).sort()).toEqual(['email', 'id'])
    expect(Object.keys(dto.device).sort()).toEqual(['id', 'name'])

    // Token mentah TIDAK BOLEH ada di body: itulah seluruh alasan endpoint ini ada (web pegang token
    // di cookie `HttpOnly`, jadi token yang ikut ke sini justru token yang bisa dibaca JavaScript).
    expect(JSON.stringify(response.body)).not.toContain(session.token)
    expect(JSON.stringify(response.body)).not.toContain('"token"')
    // `sessionId` juga bukan bagian kontrak: sesi boleh dilihat, id internalnya tidak perlu.
    expect(JSON.stringify(response.body)).not.toContain(session.sessionId)

    // Data per-user tidak boleh di-cache: cache bersama bisa menampilkan sesi user lain.
    expect(response.headers.get('cache-control')).toContain('no-store')
  })

  it('token disimpan sebagai HASH di DB walau endpoint ini membacanya (regresi keamanan)', async () => {
    const fixture = scope.fixture({ prefix: 'http-session-hash' })
    const session = await seedSession(liveCtx(fixture), { email: fixture.email })

    await api('/v1/auth/session', { cookie: cookieFor(session.token) })

    const rows = await testDb()
      .select({ tokenHash: sessionsTable.tokenHash })
      .from(sessionsTable)
      .where(and(eq(sessionsTable.id, session.sessionId)))
    expect(rows.at(0)?.tokenHash).toBe(sha256Hex(session.token))
    expect(rows.at(0)?.tokenHash).not.toBe(session.token)
  })

  it('mobile: bearer token diterima, dan jawabannya bentuk yang SAMA (tanpa token, tanpa client)', async () => {
    const fixture = scope.fixture({ prefix: 'http-session-mobile' })
    const session = await seedSession(liveCtx(fixture), {
      email: fixture.email,
      client: 'mobile',
      deviceName: 'QA HP Sesi',
    })

    const response = await api('/v1/auth/session', { token: session.token })

    expect(response.status).toBe(200)
    const dto = apiDataEnvelopeSchema(currentSessionResultSchema).parse(response.body).data
    expect(dto.user).toEqual({ id: session.userId, email: fixture.email })
    expect(dto.device).toEqual({ id: session.deviceId, name: 'QA HP Sesi' })
    // Pembacaan sesi tidak menerbitkan apa pun, jadi `client`/`token` tidak ikut - untuk SEMUA klien.
    expect(response.body).not.toHaveProperty('data.client')
    expect(response.body).not.toHaveProperty('data.token')
    expect(JSON.stringify(response.body)).not.toContain(session.token)
  })

  it('sesi yang di-revoke langsung ditolak 401 (endpoint ini yang membuat revoke terlihat klien)', async () => {
    const fixture = scope.fixture({ prefix: 'http-session-revoked' })
    const session = await seedSession(liveCtx(fixture), { email: fixture.email })
    const cookie = cookieFor(session.token)

    expect((await api('/v1/auth/session', { cookie })).status).toBe(200)

    // Logout lewat jalur produksi: sesi dicabut di server.
    const logout = await fetch(url('/v1/auth/logout'), {
      method: 'POST',
      headers: { cookie, 'sec-fetch-site': 'same-origin' },
    })
    expect(logout.status).toBe(204)

    const afterLogout = await api('/v1/auth/session', { cookie })
    expect(afterLogout.status).toBe(401)
    expect(problemOf(afterLogout).error.code).toBe('UNAUTHENTICATED')
    await expect(findSessionByToken(liveCtx(fixture), session.token)).resolves.toBeNull()
  })

  it('sesi user lain tidak pernah terlihat: hanya sesi dari token request ini yang dibaca', async () => {
    const alice = scope.fixture({ prefix: 'http-session-alice' })
    const bob = scope.fixture({ prefix: 'http-session-bob' })
    const aliceSession = await seedSession(liveCtx(alice), { email: alice.email })
    const bobSession = await seedSession(liveCtx(bob), { email: bob.email })

    const response = await api('/v1/auth/session', { cookie: cookieFor(aliceSession.token) })

    const dto = apiDataEnvelopeSchema(currentSessionResultSchema).parse(response.body).data
    expect(dto.user.id).toBe(aliceSession.userId)
    expect(dto.user.email).toBe(alice.email)
    expect(dto.device.id).toBe(aliceSession.deviceId)

    // Query/param tidak bisa mengalihkan endpoint ini: `user_id` selalu dari sesi.
    const spoofed = await api(
      `/v1/auth/session?userId=${bobSession.userId}&deviceId=${bobSession.deviceId}`,
      { cookie: cookieFor(aliceSession.token) },
    )
    expect(spoofed.status).toBe(200)
    const spoofedDto = apiDataEnvelopeSchema(currentSessionResultSchema).parse(spoofed.body).data
    expect(spoofedDto.user.id).toBe(aliceSession.userId)
    expect(JSON.stringify(spoofed.body)).not.toContain(bobSession.userId)
    expect(JSON.stringify(spoofed.body)).not.toContain(bob.email)
  })
})
