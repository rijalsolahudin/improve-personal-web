// @vitest-environment node
//
// Test HTTP untuk perbaikan audit keamanan backend: batas ukuran body (H1), limiter endpoint mahal
// (M4), binding `state` OAuth (M2), dan bentuk kegagalan callback per jenis klien.
//
// Kenapa harus lewat HTTP sungguhan (server Nitro hasil build, `setup({ server: true })`):
// - H1 hanya terbukti di jalur nyata: middleware, framing body oleh HTTP parser, dan bentuk respons
//   `413 ApiErrorBody`. Memanggil handler langsung tidak menyentuh satu pun dari itu. Body dikirim
//   sebagai potongan TANPA `content-length` (chunked), persis cara lubangnya dieksploitasi.
// - M2 butuh Set-Cookie dari `/start` dan pembacaan cookie itu di `/callback` - perilaku khas HTTP,
//   bukan sesuatu yang bisa disimpulkan dari service.
// - M4 diverifikasi pada jalur yang benar-benar dipanggil klien, termasuk header `retry-after`.
// - Bentuk kegagalan callback Google per jenis klien (302 ke halaman login untuk alur web vs JSON
//   untuk klien mobile) juga diuji di sini, BUKAN di `auth-session.test.ts`. Alasannya isolasi:
//   `google:callback:ip` adalah scope per-IP yang bucket-nya dihitung dari alamat SOCKET
//   (`NUXT_TRUSTED_PROXY_HOPS=0` di test, jadi selalu `127.0.0.1`), artinya SATU bucket dipakai
//   bersama SELURUH berkas test. Berkas test berjalan PARALEL (worker terpisah, Postgres yang sama),
//   sedangkan test dalam satu berkas berjalan berurutan. Test yang sengaja men-SATURASI bucket itu ada
//   di berkas ini, jadi test yang butuh bucket itu TIDAK jenuh harus ikut di sini - kalau dipisah, satu
//   berkas bisa menabrak jendela jenuh milik berkas lain dan request yang sah dijawab `429`.
import http from 'node:http'
import { randomUUID } from 'node:crypto'

import {
  apiDataEnvelopeSchema,
  apiErrorBodySchema,
  GENERIC_ERROR_MESSAGES,
  googleStartResultSchema,
  type ApiErrorBody,
} from '@improve-personal/contracts'
import { and, eq, inArray } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { setup, url } from '@nuxt/test-utils/e2e'

import { RATE_LIMIT_RULES, type RateLimitScope } from '../services/rate-limit'
import { startGoogleLogin } from '../services/google'
import { OAUTH_STATE_COOKIE_NAME } from '../utils/oauth-state-cookie'
import { bytesToBase64, hmacSha256, sha256Hex } from '../utils/crypto'
import { rateLimits } from '../db/schema'
import {
  clearRateLimitScope,
  closeTestDb,
  rateLimitCount,
  seedSession,
  testDb,
  type Fixture,
} from './helpers/harness'
import { testScope } from './helpers/scope'

await setup({ server: true })

const scope = testScope()
const encoder = new TextEncoder()

const MUTATING_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE']

type ApiResponse = {
  readonly status: number
  readonly headers: Headers
  readonly body: unknown
  readonly setCookie: readonly string[]
}

/** Request JSON biasa. `redirect: 'manual'` supaya 302 Google tidak diikuti ke jaringan luar. */
async function api(
  path: string,
  request: {
    readonly method?: string
    readonly body?: unknown
    readonly cookie?: string
    readonly redirect?: RequestRedirect
  } = {},
): Promise<ApiResponse> {
  const method = request.method ?? 'GET'
  const needsProof = request.cookie !== undefined && MUTATING_METHODS.includes(method)
  const response = await fetch(url(path), {
    method,
    redirect: request.redirect ?? 'manual',
    headers: {
      ...(request.body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(request.cookie === undefined ? {} : { cookie: request.cookie }),
      ...(needsProof ? { 'sec-fetch-site': 'same-origin' } : {}),
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

/** Respons error harus SELALU amplop `{ error: { ... } }` (`ApiErrorBody`) - bukan `{ code, ... }` datar. */
function problemOf(response: ApiResponse): ApiErrorBody {
  const parsed = apiErrorBodySchema.safeParse(response.body)
  expect(parsed.success, `bukan ApiErrorBody: ${JSON.stringify(response.body)}`).toBe(true)
  if (!parsed.success) throw new Error('respons bukan ApiErrorBody')

  return parsed.data
}

function liveCtx(fixture: Fixture) {
  return fixture.ctx({ now: new Date() })
}

function cookieFor(token: string): string {
  return `ip_session=${token}`
}

/** Cookie binding web untuk `state` dari `startGoogleLogin` (hash state, seperti `/start` memasangnya). */
function bindingCookieFor(state: string): string {
  return `${OAUTH_STATE_COOKIE_NAME}=${sha256Hex(state)}`
}

/** `true` kalau respons membuang cookie binding (sekali pakai), bukan karena kedaluwarsa. */
function bindingCookieClear(response: ApiResponse): boolean {
  const cleared = response.setCookie.find((entry) =>
    entry.startsWith(`${OAUTH_STATE_COOKIE_NAME}=`),
  )
  return cleared !== undefined && /Max-Age=0/i.test(cleared)
}

/** Blob base64 valid untuk body kecil yang sah. */
function blobOf(text: string): string {
  return bytesToBase64(encoder.encode(text))
}

// ---------------------------------------------------------------------------
// HTTP mentah: body chunked & header `content-length` besar
// ---------------------------------------------------------------------------

type RawResponse = {
  readonly status: number
  readonly body: string
  readonly headers: http.IncomingHttpHeaders
  readonly json: () => unknown
}

function collect(response: http.IncomingMessage): Promise<RawResponse> {
  return new Promise<RawResponse>((resolve, reject) => {
    let body = ''
    response.setEncoding('utf8')
    response.on('data', (chunk: string) => {
      body += chunk
    })
    response.on('end', () =>
      resolve({
        status: response.statusCode ?? 0,
        body,
        headers: response.headers,
        json: () => {
          try {
            return JSON.parse(body)
          } catch {
            return null
          }
        },
      }),
    )
    response.on('error', reject)
  })
}

function target(path: string) {
  const parsed = new URL(url(path))

  return {
    hostname: parsed.hostname,
    port: parsed.port,
    path: `${parsed.pathname}${parsed.search}`,
  }
}

/**
 * Kirim body dalam potongan TANPA `content-length`.
 *
 * Node otomatis memakai `Transfer-Encoding: chunked` untuk request tanpa `content-length` - inilah
 * bentuk request yang dulu melewati `requestSizeLimiter` (yang hanya membaca header `content-length`)
 * dan membuat body dibaca utuh ke memori sebelum validasi apa pun jalan.
 */
function chunkedUpload(
  path: string,
  method: string,
  chunks: readonly Buffer[],
): Promise<RawResponse> {
  return new Promise<RawResponse>((resolve, reject) => {
    const request = http.request({
      ...target(path),
      method,
      headers: { 'content-type': 'application/json' },
    })

    let settled = false

    request.on('response', (response) => {
      void collect(response).then((collected) => {
        settled = true
        resolve(collected)
      }, reject)
    })

    // Server menolak 413 lalu MENUTUP koneksi sebelum seluruh body terkirim, jadi tulisan yang gagal
    // setelah respons diterima bukan kegagalan test - yang diuji responsnya, bukan keberhasilan
    // mengunggah 20 MB.
    request.on('error', (error) => {
      if (!settled) reject(error)
    })

    let index = 0
    const writeNext = (): void => {
      if (settled || index >= chunks.length) {
        if (!settled) request.end()
        return
      }

      const chunk = chunks[index]
      index += 1
      if (!chunk) return

      if (request.write(chunk)) setImmediate(writeNext)
      else request.once('drain', writeNext)
    }

    setImmediate(writeNext)
  })
}

/**
 * Kirim HEADER saja (`content-length` besar, body belum - dan tidak akan - dikirim).
 *
 * Ini menguji jalur "murah": server menolak dari header tanpa membaca satu byte pun body. Method-nya
 * bisa apa saja, termasuk `PATCH` yang TIDAK diperiksa limiter bawaan nuxt-security.
 */
function declaredLengthUpload(
  path: string,
  method: string,
  contentLength: number,
): Promise<RawResponse> {
  return new Promise<RawResponse>((resolve, reject) => {
    const request = http.request({
      ...target(path),
      method,
      headers: {
        'content-type': 'application/json',
        'content-length': String(contentLength),
      },
    })

    request.on('response', (response) => {
      void collect(response).then(resolve, reject)
    })
    // Body memang tidak pernah dikirim; koneksi ditutup server setelah 413.
    request.on('error', () => undefined)

    request.flushHeaders()
  })
}

const OVERSIZE_BYTES = 9_000_000

beforeAll(async () => {
  // Scope per-IP dihitung dari IP SOCKET, yang di test selalu `127.0.0.1` - jadi penghitungnya
  // menumpuk antar-run dan run kedua bisa 429 padahal kodenya benar.
  await clearRateLimitScope('otp:ip')
  await clearRateLimitScope('google:start:ip')
  await clearRateLimitScope('google:callback:ip')
})

afterAll(async () => {
  await scope.dispose()
  await closeTestDb()
})

describe('H1: batas ukuran body tidak bisa dilewati lewat chunked', () => {
  it('body chunked 20 MB tanpa `content-length` -> 413 PAYLOAD_TOO_LARGE (ApiErrorBody)', async () => {
    // Endpoint PUBLIK: penyerang tidak butuh akun sama sekali, dan sebelum perbaikan body 20 MB ini
    // dibaca utuh ke memori proses (yang juga melayani UI) sebelum ada satu pemeriksaan pun.
    const chunk = Buffer.alloc(2_000_000, 'x')
    const response = await chunkedUpload(
      '/v1/auth/otp/request',
      'POST',
      Array.from({ length: 10 }, () => chunk),
    )

    expect(response.status).toBe(413)
    expect(response.headers['transfer-encoding']).not.toBe('chunked')

    const problem = apiErrorBodySchema.safeParse(response.json())
    expect(problem.success, `bukan ApiErrorBody: ${response.body}`).toBe(true)
    if (problem.success) {
      expect(problem.data.error.code).toBe('PAYLOAD_TOO_LARGE')
      expect(problem.data.error.message).toBe(GENERIC_ERROR_MESSAGES.PAYLOAD_TOO_LARGE)
    }
  })

  it('`content-length` di atas batas ditolak dari HEADER-nya saja, termasuk method PATCH', async () => {
    // `PATCH` sengaja dipilih: limiter bawaan nuxt-security hanya memeriksa POST/PUT/DELETE, jadi
    // respons 413 di sini datang dari middleware `server/middleware/15-body-limit.ts`.
    const response = await declaredLengthUpload('/v1/sync/push', 'PATCH', OVERSIZE_BYTES)

    expect(response.status).toBe(413)
    const problem = apiErrorBodySchema.safeParse(response.json())
    expect(problem.success).toBe(true)
    if (problem.success) expect(problem.data.error.code).toBe('PAYLOAD_TOO_LARGE')
  })

  it('body chunked yang SAH tetap diproses (jalur streaming tidak memakan body-nya)', async () => {
    // Regresi yang paling mudah terjadi: middleware membaca body untuk menghitung byte-nya. Kalau
    // hasil bacaan itu tidak diserahkan balik ke h3, handler akan melihat body kosong dan request
    // yang sah gagal. Test ini yang menjaga itu.
    const fixture = scope.fixture({ prefix: 'http-chunked-ok' })
    const payload = JSON.stringify({
      email: fixture.email,
      client: 'web',
      device: { name: 'QA Chunked Browser', platform: 'web' },
    })
    const middle = Math.floor(payload.length / 2)

    const response = await chunkedUpload('/v1/auth/otp/request', 'POST', [
      Buffer.from(payload.slice(0, middle)),
      Buffer.from(payload.slice(middle)),
    ])

    expect(response.status, `body chunked yang sah ditolak: ${response.body}`).toBe(204)
  })

  it('batch push di bawah batas byte yang sah diterima, dan yang di atas 8 MB dijawab 413', async () => {
    const fixture = scope.fixture({ prefix: 'http-body-limit-sah' })
    const session = await seedSession(liveCtx(fixture), { email: fixture.email })
    const cookie = cookieFor(session.token)

    // Batch SAH menurut kontrak (500 x 1 MB) tapi totalnya dibatasi KLIEN per byte: di sini ~6,5 MB
    // (7 record x 700.000 byte blob -> ~933 kB base64 per record).
    const records = Array.from({ length: 7 }, (_, index) => ({
      id: randomUUID(),
      hlc: `1000-${index}-a`,
      deleted: false,
      blob: blobOf('x'.repeat(700_000)),
    }))
    const sized = Buffer.byteLength(JSON.stringify({ records }))
    expect(sized).toBeLessThan(8_388_608)

    const accepted = await api('/v1/sync/push', { method: 'POST', cookie, body: { records } })
    expect(accepted.status, JSON.stringify(accepted.body)).toBe(200)

    const oversize = await chunkedUpload('/v1/sync/push', 'POST', [
      Buffer.from(JSON.stringify({ records })),
      Buffer.alloc(8_500_000, 'x'),
    ])
    expect(oversize.status).toBe(413)
    expect(apiErrorBodySchema.safeParse(oversize.json()).success).toBe(true)
  })
})

describe('M4/M1: limiter endpoint mahal & bucket per akun', () => {
  /**
   * Isi bucket satu scope sampai tepat di plafon, untuk identifier ini.
   *
   * Seeding lebih andal daripada mengirim `limit + 1` request sungguhan: jendela fixed 1 jam, dan
   * yang diuji di sini adalah "penghitungnya dijalankan di endpoint itu", bukan aritmetika jendela.
   */
  async function seedAtLimit(
    env: Fixture['env'],
    scope: RateLimitScope,
    identifier: string,
  ): Promise<void> {
    const windowMs = RATE_LIMIT_RULES[scope].windowSeconds * 1_000
    const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs)
    const bucket = hmacSha256(identifier, env.rateLimitPepper)

    await testDb()
      .insert(rateLimits)
      .values({ scope, bucket, windowStart, count: RATE_LIMIT_RULES[scope].limit })
      .onConflictDoUpdate({
        target: [rateLimits.scope, rateLimits.bucket, rateLimits.windowStart],
        set: { count: RATE_LIMIT_RULES[scope].limit },
      })
  }

  type Case = {
    readonly label: string
    readonly scope: RateLimitScope
    readonly request: (cookie: string, fixture: Fixture, deviceId: string) => Promise<ApiResponse>
  }

  const cases: readonly Case[] = [
    {
      label: 'GET /v1/sync/pull',
      scope: 'sync:pull',
      request: (cookie) => api('/v1/sync/pull?cursor=0&limit=1', { cookie }),
    },
    {
      label: 'POST /v1/keys/transfer',
      scope: 'keys:transfer-create',
      request: (cookie) =>
        api('/v1/keys/transfer', {
          method: 'POST',
          cookie,
          body: { targetDeviceId: randomUUID(), blob: blobOf('mk') },
        }),
    },
    {
      label: 'POST /v1/keys/transfer/:id',
      scope: 'keys:transfer-claim',
      request: (cookie) => api(`/v1/keys/transfer/${'a'.repeat(22)}`, { method: 'POST', cookie }),
    },
    {
      label: 'DELETE /v1/devices/:id',
      scope: 'devices:revoke',
      request: (cookie, _fixture, deviceId) =>
        api(`/v1/devices/${deviceId}`, { method: 'DELETE', cookie }),
    },
    {
      label: 'DELETE /v1/account',
      scope: 'account:delete',
      request: (cookie, fixture) =>
        api('/v1/account', {
          method: 'DELETE',
          cookie,
          body: { email: fixture.email, code: '000000' },
        }),
    },
  ]

  it.each(cases)('$label melewati jatahnya -> 429 + `retry-after`', async (testCase) => {
    const fixture = scope.fixture({ prefix: 'http-limit' })
    const session = await seedSession(liveCtx(fixture), { email: fixture.email })
    const cookie = cookieFor(session.token)

    await seedAtLimit(fixture.env, testCase.scope, session.userId)

    const limited = await testCase.request(cookie, fixture, session.deviceId)

    expect(limited.status, `${testCase.label} tidak pernah dijawab 429`).toBe(429)
    expect(problemOf(limited).error.code).toBe('RATE_LIMITED')
    expect(limited.headers.get('retry-after')).toMatch(/^[1-9][0-9]*$/)

    // Penghitungnya bertambah SATU untuk request ini, dan bucket-nya milik user dari sesi.
    expect(await rateLimitCount(fixture.env, session.userId)).toBe(
      RATE_LIMIT_RULES[testCase.scope].limit + 1,
    )

    // Identifier tetap di-HMAC: tidak ada id user polos di tabel `rate_limits`.
    const rows = await testDb()
      .select()
      .from(rateLimits)
      .where(eq(rateLimits.scope, testCase.scope))
    expect(JSON.stringify(rows)).not.toContain(session.userId)
    expect(rows.length).toBeGreaterThan(0)
  })

  it('jatah `sync:pull` milik AKUN: habis di user A, user B tetap bisa pull', async () => {
    const alice = scope.fixture({ prefix: 'http-pull-limited-alice' })
    const bob = scope.fixture({ prefix: 'http-pull-limited-bob' })
    const aliceSession = await seedSession(liveCtx(alice), { email: alice.email })
    const bobSession = await seedSession(liveCtx(bob), { email: bob.email })

    await seedAtLimit(alice.env, 'sync:pull', aliceSession.userId)

    const limited = await api('/v1/sync/pull?cursor=0&limit=1', {
      cookie: cookieFor(aliceSession.token),
    })
    expect(limited.status).toBe(429)

    const allowed = await api('/v1/sync/pull?cursor=0&limit=1', {
      cookie: cookieFor(bobSession.token),
    })
    expect(allowed.status, JSON.stringify(allowed.body)).toBe(200)
  })

  it('endpoint yang tidak butuh limiter tetap bebas (GET /v1/devices)', async () => {
    // Sengaja TIDAK ditambahkan limiter: halaman "Perangkat" boleh dibuka berulang kali, biayanya satu
    // query terindeks dengan batas `DEVICE_LIST_MAX` baris, dan limiter di sini hanya akan menghukum
    // pemakaian normal. Yang mahal (revoke, transfer, pull, callback) yang dibatasi.
    const fixture = scope.fixture({ prefix: 'http-devices-free' })
    const session = await seedSession(liveCtx(fixture), { email: fixture.email })

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await api('/v1/devices', { cookie: cookieFor(session.token) })
      expect(response.status).toBe(200)
    }
  })
})

/**
 * Bentuk kegagalan callback per jenis klien.
 *
 * Dulu blok ini tinggal di `auth-session.test.ts`. Di sana ia flaky, dan sebabnya bukan produk:
 * `google:callback:ip` (limit 60 / 15 menit) dihitung dari IP SOCKET, jadi seluruh berkas test berbagi
 * SATU bucket. Test `M2 > callback dibatasi per IP` di bawah sengaja menjenuhkan bucket itu, sementara
 * berkas test berjalan PARALEL - request callback yang sah dari berkas lain ikut dijawab `429`
 * (`expected 429 to be 400`). Dipindah ke sini, urutannya berurutan: berkas ini membersihkan scope
 * `google:callback:ip` di `beforeAll`, blok ini berjalan SEBELUM test yang menjenuhkan bucket, dan
 * penghitung yang dipakai test penjenuhan dikembalikan setelah assertions-nya selesai.
 *
 * Cakupan yang diuji (semuanya tetap utuh setelah pemindahan):
 * - alur web (cookie binding ada) gagal -> 302 ke `/login?error=oauth`, BUKAN JSON;
 * - alur web dengan `state` tidak sah -> tetap 302 (satu bentuk, tanpa oracle);
 * - alur mobile (tanpa cookie binding) gagal -> 400 JSON `OAUTH_INVALID`;
 * - callback web SUKSES tidak pernah menerbitkan cookie sesi saat gagal, dan target redirect-nya tetap;
 * - anti open redirect: input klien tidak bisa membelokkan `location`;
 * - query callback rusak -> 400 JSON (bukan redirect).
 *
 * Catatan yang menjelaskan bentuk gejalanya: tabrakan bucket itu muncul sebagai `expected 429 to be 400`
 * pada test JSON, BUKAN pada test redirect. Sebabnya, semua kegagalan login jalur web - termasuk
 * `RATE_LIMITED` - memang di-`302` ke `/login?error=oauth` yang sama, jadi test berbentuk redirect
 * tidak bisa membedakan "login gagal" dari "kena rate limit" (dan itu memang perilaku produk yang
 * diinginkan: satu bentuk, tanpa oracle). Yang benar-benar sensitif adalah test yang mengharapkan
 * amplop JSON.
 *
 * "web TANPA cookie binding -> 400 JSON" diuji di describe M2 (`callback web TANPA cookie binding
 * ditolak OAUTH_INVALID`), bukan di sini lagi: skenarionya sama persis, dan assertion-nya sudah
 * digabung ke test yang memang sudah ada di sana.
 */
describe('callback Google: bentuk kegagalan per jenis klien', () => {
  // Isolasi: Google BELUM tersambung, dan tiap `completeGoogleLogin` yang lolos binding memicu satu
  // request keluar ke `oauth2.googleapis.com`. Kalau test di blok ini bergantung pada jawaban Google,
  // hasilnya ditentukan cuaca jaringan (pernah nyata: 500 INTERNAL saat koneksi keluar gagal, bukan
  // 302). Karena itu sebab kegagalan yang dipakai di sini sengaja dipilih yang terjadi SEBELUM
  // penukaran code (`state` tidak dikenal, atau binding tidak cocok) - bentuk respons ke klien tidak
  // bergantung pada sebabnya, jadi yang diuji tetap benar. Penukaran code & validasi ID token diuji di
  // `google-oauth.test.ts` lewat seam `fetchImpl` (satu-satunya tempat yang memang boleh menembak
  // Google, dan di sana batasnya diganti).
  it('alur web gagal (`state` tidak dikenal) -> 302 ke /login?error=oauth, bukan JSON', async () => {
    // `state` yang tidak pernah diterbitkan: ditolak sebagai `OAUTH_INVALID`, dan justru inilah jalur
    // yang dulu mengirim JSON mentah ke browser. Tidak ada baris `oauth_states` yang lahir dari test
    // ini, jadi tidak ada fixture yang perlu dibersihkan.
    const state = 'state-yang-tidak-pernah-diterbitkan'

    // Cookie binding tetap dikirim: keberadaannya yang menandai "ini alur web", jadi kegagalannya harus
    // dialihkan ke halaman login - bukan karena `state`-nya sah.
    const response = await api(
      `/v1/auth/google/callback?code=kode-karangan&state=${encodeURIComponent(state)}`,
      { cookie: bindingCookieFor(state) },
    )

    expect(response.status).toBe(302)
    // `location` harus PERSIS konstanta tetap itu - jadi tidak ada ruang bagi `code`/`state`/host
    // Google, maupun pesan error internal, untuk ikut menyelinap ke URL.
    expect(response.headers.get('location')).toBe('/login?error=oauth')
    expect(response.body).not.toContain('OAUTH_INVALID')
    expect(response.body).not.toContain('kode-karangan')
    expect(apiErrorBodySchema.safeParse(response.body).success).toBe(false)

    // Cookie binding tetap dibuang: sekali pakai, gagal maupun berhasil.
    expect(bindingCookieClear(response)).toBe(true)
  })

  it('alur web dengan `state` sah tapi binding tidak cocok juga di-redirect (satu bentuk, tanpa oracle)', async () => {
    const fixture = scope.fixture({ prefix: 'http-google-redirect-badstate' })
    const start = await startGoogleLogin(liveCtx(fixture), { client: 'web' })
    const state = new URL(start.authorizationUrl).searchParams.get('state') ?? ''
    // Binding milik `state` LAIN: `completeGoogleLogin` menolak, dan kegagalan itu pun harus redirect.
    // `state`-nya sendiri SAH - jadi yang menolak memang pemeriksaan binding (temuan M2), bukan
    // "state tidak ditemukan" seperti test sebelumnya.
    const otherState = (await startGoogleLogin(liveCtx(fixture), { client: 'web' })).state

    const rejected = await api(
      `/v1/auth/google/callback?code=kode&state=${encodeURIComponent(state)}`,
      { cookie: bindingCookieFor(otherState) },
    )

    expect(rejected.status).toBe(302)
    expect(rejected.headers.get('location')).toBe('/login?error=oauth')
    expect(bindingCookieClear(rejected)).toBe(true)
  })

  it('alur mobile (tanpa cookie binding) gagal -> JSON `OAUTH_INVALID` seperti sebelumnya', async () => {
    // Tanpa cookie binding, jadi `isWebFlow` false dan kegagalannya tetap JSON (native tidak punya
    // halaman login untuk dilihat user). Sebabnya `state` tidak dikenal supaya tidak menembak Google.
    const state = 'state-mobile-yang-tidak-dikenal'

    const response = await api(
      `/v1/auth/google/callback?code=kode-karangan&state=${encodeURIComponent(state)}`,
    )

    // Klien native tidak punya browser/halaman login: yang dibacanya amplop error JSON.
    expect(response.status).toBe(400)
    expect(problemOf(response).error.code).toBe('OAUTH_INVALID')
    expect(problemOf(response).error.message).toBe(GENERIC_ERROR_MESSAGES.OAUTH_INVALID)
    expect(response.headers.get('location')).toBeNull()
  })

  it('callback web yang GAGAL tidak pernah menerbitkan cookie sesi (tidak ada jalur setengah login)', async () => {
    const fixture = scope.fixture({ prefix: 'http-google-web-ok' })
    const start = await startGoogleLogin(liveCtx(fixture), { client: 'web' })
    const state = new URL(start.authorizationUrl).searchParams.get('state') ?? ''

    // Sebab kegagalannya sengaja binding yang tidak cocok, bukan `code` yang ditolak Google: jalur
    // SUKSES sungguhan butuh menukar `code` ke Google, dan server test berjalan sebagai proses
    // TERPISAH - seam `fetchImpl` (yang dipakai `google-oauth.test.ts`) tidak bisa disuntik dari sini.
    // Yang dikunci di HTTP adalah kontraknya: alur web yang gagal tidak boleh meninggalkan sesi
    // setengah jadi, apa pun sebab kegagalannya.
    const otherState = (await startGoogleLogin(liveCtx(fixture), { client: 'web' })).state

    const failed = await api(
      `/v1/auth/google/callback?code=kode-karangan&state=${encodeURIComponent(state)}`,
      { cookie: bindingCookieFor(otherState) },
    )

    expect(failed.status).toBe(302)
    for (const entry of failed.setCookie) {
      expect(entry.startsWith('ip_session='), `cookie sesi terbit walau gagal: ${entry}`).toBe(
        false,
      )
    }
    // Target redirect selalu path relatif: tidak ada nilai dari klien (code/state/host) yang ikut.
    expect(failed.headers.get('location')).toBe('/login?error=oauth')
  })

  it('target redirect TIDAK bisa dibelokkan oleh input klien (anti open redirect)', async () => {
    const fixture = scope.fixture({ prefix: 'http-google-openredirect' })
    const start = await startGoogleLogin(liveCtx(fixture), { client: 'web' })
    const state = new URL(start.authorizationUrl).searchParams.get('state') ?? ''

    // `code` yang memuat URL absolut/kontrol tidak boleh muncul di `location`. Kalau target redirect
    // pernah diambil dari input, inilah bentuk serangannya. Binding-nya sengaja milik `state` lain
    // supaya kegagalannya deterministik (tidak menembak Google) - `code` yang berbahaya tetap ikut di
    // query, jadi yang diuji tetap kebocoran nilai klien ke URL redirect.
    const otherState = (await startGoogleLogin(liveCtx(fixture), { client: 'web' })).state
    const hostile = 'https://jahat.example/pwn'
    const response = await api(
      `/v1/auth/google/callback?code=${encodeURIComponent(hostile)}&state=${encodeURIComponent(state)}`,
      { cookie: bindingCookieFor(otherState) },
    )

    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('/login?error=oauth')
    expect(response.headers.get('location')).not.toContain('jahat.example')
  })

  it('query callback yang rusak: web -> 400 JSON (bukan redirect), mobile -> 400 JSON', async () => {
    // Batas yang sengaja dipilih: yang dialihkan ke halaman login HANYA kegagalan login
    // (`ApiProblem`), bukan kegagalan validasi query. Alasannya dua:
    // 1. Query rusak berarti URL callback-nya memang tidak utuh (bukan alur yang normal terjadi), jadi
    //    tidak ada "kesempatan mencoba lagi" yang hilang kalau user melihat 400.
    // 2. Kegagalan validasi & kegagalan server harus tetap terlihat sebagai error - menelannya jadi
    //    redirect membuat bug server menyamar sebagai "login gagal biasa".
    // Test ini yang MENGUNCI batas itu: kalau suatu saat `catch`-nya diperlebar, test ini gagal.
    //
    // Catatan isolasi: kasus ini TIDAK menyentuh penghitung per-IP sama sekali (validasi query jalan
    // sebelum `completeGoogleLogin`), jadi ia juga tak terpengaruh bucket yang dijenuhkan test M2.
    const webFixture = scope.fixture({ prefix: 'http-google-badquery-web' })
    const webStart = await startGoogleLogin(liveCtx(webFixture), { client: 'web' })
    const webState = new URL(webStart.authorizationUrl).searchParams.get('state') ?? ''

    // `code` hilang sepenuhnya: skema strict menolak, dan `getValidatedQuery` melempar `H3Error` 400.
    const webBroken = await api(`/v1/auth/google/callback?state=${encodeURIComponent(webState)}`, {
      cookie: bindingCookieFor(webState),
    })
    expect(webBroken.status).toBe(400)
    expect(problemOf(webBroken).error.code).toBe('VALIDATION_FAILED')
    expect(webBroken.headers.get('location')).toBeNull()

    const mobileBroken = await api(`/v1/auth/google/callback?state=${encodeURIComponent(webState)}`)
    expect(mobileBroken.status).toBe(400)
    expect(problemOf(mobileBroken).error.code).toBe('VALIDATION_FAILED')
    expect(mobileBroken.headers.get('location')).toBeNull()
  })
})

describe('M2: binding `state` OAuth lewat HTTP', () => {
  it('`/start?client=web` memasang cookie binding berisi HASH state; `mobile` tanpa `state` di body', async () => {
    const webStart = await api('/v1/auth/google/start?client=web')

    expect(webStart.status).toBe(302)
    const binding = webStart.setCookie.find((entry) => entry.startsWith('ip_oauth_state='))
    expect(
      binding,
      `cookie binding tidak dipasang: ${webStart.setCookie.join(' | ')}`,
    ).toBeDefined()
    expect(binding).toMatch(/HttpOnly/i)
    expect(binding).toMatch(/SameSite=Lax/i)

    const state = new URL(webStart.headers.get('location') ?? '').searchParams.get('state') ?? ''
    expect(state.length).toBeGreaterThanOrEqual(32)
    expect(binding).toContain(sha256Hex(state))
    expect(binding, 'nilai `state` mentah ikut ke cookie').not.toContain(`=${state}`)

    // Klien mobile: URL di body, tanpa cookie apa pun, dan body-nya HANYA dua field itu. `state`
    // memang ada di dalam `authorizationUrl` (Google yang membutuhkannya), tapi tidak ada field
    // `state` terpisah yang menyerahkan nilai mentahnya ke klien.
    const mobileStart = await api('/v1/auth/google/start?client=mobile')

    expect(mobileStart.status).toBe(200)
    // Amplop sukses: body HANYA boleh punya `data`, dan di dalamnya HANYA dua field itu.
    expect(apiDataEnvelopeSchema(googleStartResultSchema).safeParse(mobileStart.body).success).toBe(
      true,
    )
    expect(Object.keys(mobileStart.body as object).sort()).toEqual(['data'])
    expect(Object.keys((mobileStart.body as { data: object }).data).sort()).toEqual([
      'authorizationUrl',
      'expiresAt',
    ])
    expect(mobileStart.setCookie.filter((entry) => entry.startsWith('ip_oauth_state='))).toEqual([])
  })

  it('callback web TANPA cookie binding ditolak `OAUTH_INVALID`, dan cookie-nya dibuang', async () => {
    const fixture = scope.fixture({ prefix: 'http-google-binding' })
    // Jam NYATA untuk baris `oauth_states`-nya: server test berjalan dengan waktu nyata, sedangkan
    // `fixture.ctx()` memakai `FIXED_NOW` (2026-05-01) yang sudah lewat. Dengan `FIXED_NOW`, `state`
    // keburu kedaluwarsa dan yang menolak request ini adalah pemeriksaan EXPIRY - test-nya lulus
    // tanpa pernah menyentuh pemeriksaan binding yang mau dibuktikan di sini.
    const start = await startGoogleLogin(liveCtx(fixture), { client: 'web' })
    const state = new URL(start.authorizationUrl).searchParams.get('state') ?? ''

    const rejected = await api(`/v1/auth/google/callback?code=kode-dari-google&state=${state}`)

    expect(rejected.status).toBe(400)
    expect(problemOf(rejected).error.code).toBe('OAUTH_INVALID')
    // "Bukan redirect: penanda alur web tidak ada". Browser yang memulai flow web SELALU membawa
    // cookie binding, jadi request tanpa cookie binding memang bukan alur web - jawabannya JSON
    // generik, bukan `302` ke halaman login.
    expect(rejected.headers.get('location')).toBeNull()
    // Sekali pakai: cookie binding selalu dibuang di akhir callback, gagal maupun berhasil.
    const cleared = rejected.setCookie.find((entry) => entry.startsWith('ip_oauth_state='))
    expect(cleared).toMatch(/Max-Age=0/i)
  })

  it('callback dibatasi per IP, dan limiter-nya jalan SEBELUM state disentuh', async () => {
    const fixture = scope.fixture({ prefix: 'http-google-callback-limit' })
    const start = await startGoogleLogin(fixture.ctx(), { client: 'web' })
    const state = new URL(start.authorizationUrl).searchParams.get('state') ?? ''

    // Jendela fixed yang sedang berjalan - aritmetika yang sama dengan `consumeRateLimit`.
    const windowMs = RATE_LIMIT_RULES['google:callback:ip'].windowSeconds * 1_000
    const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs)

    // Bucket scope ini dihitung dari alamat SOCKET (bukan IP fixture), jadi baris milik test ini
    // dikenali dari PERUBAHANNYA di jendela yang sedang berjalan - bukan dengan menebak alamat socket.
    //
    // Kenapa harus seteliti ini: bucket per-IP dipakai BERSAMA seluruh berkas test (alamat socket
    // semua request sama) dan jendelanya 15 menit, jadi perlakuan borongan pada scope ini berbahaya ke
    // DUA arah. Menyetel `limit` ke baris identifier lain membuat test berkas lain yang sedang berjalan
    // - mis. `google-oauth.test.ts` yang membuktikan aturan binding pada bucket IP fixture-nya sendiri -
    // menerima `429`, bukan kode yang dia harapkan. Dan baris yang dibiarkan jenuh sesudah test membuat
    // setiap request callback di jendela yang sama (berkas lain, atau run berikutnya) dijawab `429`.
    const scopeRows = () =>
      testDb().select().from(rateLimits).where(eq(rateLimits.scope, 'google:callback:ip'))
    const rowKey = (row: { bucket: string; windowStart: Date }): string =>
      `${row.bucket}|${row.windowStart.getTime()}`
    const rowWhere = (row: { bucket: string; windowStart: Date }) =>
      and(
        eq(rateLimits.scope, 'google:callback:ip'),
        eq(rateLimits.bucket, row.bucket),
        eq(rateLimits.windowStart, row.windowStart),
      )

    const before = new Map((await scopeRows()).map((row) => [rowKey(row), row.count]))

    // Satu request sah (ditolak binding, tapi tercatat di scope per-IP) supaya barisnya ada.
    const first = await api(`/v1/auth/google/callback?code=kode&state=${state}`)
    expect(first.status).toBe(400)

    const written = (await scopeRows()).filter(
      (row) =>
        row.windowStart.getTime() === windowStart.getTime() &&
        before.get(rowKey(row)) !== row.count,
    )
    expect(
      written.length,
      'request callback tidak menulis penghitung per-IP di jendela ini',
    ).toBeGreaterThan(0)

    try {
      // HANYA baris yang baru saja ditulis request di atas yang dijenuhkan: `count = limit` + satu
      // request berikutnya = `limit + 1` > limit, jadi 429-nya datang dari limiter - dan karena
      // limiter jalan sebelum `state` disentuh, `state` yang sudah kedaluwarsa di sini tidak pernah
      // sampai diperiksa.
      await testDb()
        .update(rateLimits)
        .set({ count: RATE_LIMIT_RULES['google:callback:ip'].limit })
        .where(
          and(
            eq(rateLimits.scope, 'google:callback:ip'),
            eq(rateLimits.windowStart, windowStart),
            inArray(
              rateLimits.bucket,
              written.map((row) => row.bucket),
            ),
          ),
        )

      const limited = await api(`/v1/auth/google/callback?code=kode&state=${state}`)

      expect(limited.status).toBe(429)
      expect(problemOf(limited).error.code).toBe('RATE_LIMITED')
      expect(limited.headers.get('retry-after')).toMatch(/^[1-9][0-9]*$/)
    } finally {
      // Bucket bersama ini DIKEMBALIKAN ke kondisi semula, apa pun hasil assertion di atas: baris yang
      // sudah ada dikembalikan ke hitungan lamanya, baris yang baru dibuat test ini dihapus. Tanpa ini,
      // sisa `count = limit` membuat request callback dari berkas atau run lain di jendela yang sama
      // dijawab 429 - flaky, padahal tidak ada bug produk.
      for (const row of written) {
        const previous = before.get(rowKey(row))

        if (previous === undefined) await testDb().delete(rateLimits).where(rowWhere(row))
        else await testDb().update(rateLimits).set({ count: previous }).where(rowWhere(row))
      }
    }
  })
})
