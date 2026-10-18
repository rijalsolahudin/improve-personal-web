import {
  ERROR_HTTP_STATUS,
  apiDataEnvelopeSchema,
  apiErrorBodySchema,
  currentSessionResultSchema,
  webSessionDtoSchema,
  type CurrentSessionResult,
  type DeviceInfo,
  type ErrorCode,
  type WebSessionDto,
} from '@improve-personal/contracts'

import { currentDeviceInfo } from '~/utils/device'

import { AuthRequestError, type AuthGateway } from './gateway'

/** Client yang selalu dikirim web: server memakainya untuk memilih jalur cookie (web) vs token (mobile). */
const CLIENT_KIND = 'web'

const OTP_REQUEST_PATH = '/v1/auth/otp/request'
const OTP_VERIFY_PATH = '/v1/auth/otp/verify'
const SESSION_PATH = '/v1/auth/session'
const LOGOUT_PATH = '/v1/auth/logout'

/** Browser jadi agen OAuth: server membalas 302 ke Google (`googleStartQuerySchema`). */
const GOOGLE_START_URL = `/v1/auth/google/start?client=${CLIENT_KIND}`

/**
 * Batas jaringan gateway: satu fungsi saja, supaya test bisa menukar transportnya tanpa mem-mock
 * composable atau Nuxt (mock jaringan di batas, bukan di tengah alur).
 */
export type AuthFetch = (
  path: string,
  options: { readonly method: 'GET' | 'POST'; readonly body?: Record<string, unknown> },
) => Promise<unknown>

export interface AuthGatewayOptions {
  /** Info perangkat yang disumbang web (`deviceInfoSchema`): server yang menerbitkan id perangkatnya. */
  readonly device: DeviceInfo
}

/**
 * Amplop sukses per DTO, diparse dari schema KONTRAK: bentuk server yang menyimpang dari kontrak
 * ketahuan di sini, bukan jadi `undefined` yang menjalar ke UI.
 */
const sessionEnvelopeSchema = apiDataEnvelopeSchema(currentSessionResultSchema)
const loginEnvelopeSchema = apiDataEnvelopeSchema(webSessionDtoSchema)

/**
 * Status -> kode kontrak saat body error TIDAK bisa dibaca (mis. respons kosong dari proxy/host).
 *
 * Diturunkan dari `ERROR_HTTP_STATUS` supaya tidak ada tabel status kedua yang bisa menyimpang dari
 * kontrak. Beberapa kode memang berbagi status 400; daftar ini menentukan pilihan saat body-nya tidak
 * ada - `VALIDATION_FAILED` dipilih sebagai bacaan paling netral ("request tidak bisa diproses").
 * Status yang ambigu (409 = SYNC_RESET_REQUIRED atau DEVICE_LIMIT_REACHED) sengaja tidak ada:
 * lebih baik `INTERNAL` daripada menebak sebabnya.
 */
const STATUS_FALLBACK_ORDER = [
  'UNAUTHENTICATED',
  'RATE_LIMITED',
  'FORBIDDEN',
  'NOT_FOUND',
  'METHOD_NOT_ALLOWED',
  'PAYLOAD_TOO_LARGE',
  'VALIDATION_FAILED',
  'INTERNAL',
] as const satisfies readonly ErrorCode[]

const CODE_BY_STATUS: ReadonlyMap<number, ErrorCode> = new Map(
  STATUS_FALLBACK_ORDER.map((code) => [ERROR_HTTP_STATUS[code], code]),
)

type RequestFailure = { readonly status?: number; readonly body?: unknown }

/**
 * Status + body dari error `ofetch` dibaca lewat BENTUKNYA, tanpa mengimpor tipe internal ofetch:
 * yang dibutuhkan cuma dua field itu, dan `$fetch` sendiri tidak dijamin melempar kelas tertentu.
 */
function failureOf(error: unknown): RequestFailure {
  if (typeof error !== 'object' || error === null) return {}

  const { status, data } = error as { status?: unknown; data?: unknown }
  return typeof status === 'number' ? { status, body: data } : { body: data }
}

/** Kegagalan apa pun (HTTP, jaringan, bentuk respons) -> satu tipe error milik kontrak. */
function toAuthRequestError(error: unknown): AuthRequestError {
  const failure = failureOf(error)

  // Tanpa status = permintaan tidak pernah dapat respons HTTP (offline, DNS, request diblokir).
  if (failure.status === undefined) {
    return new AuthRequestError('INTERNAL', { isNetworkError: true })
  }

  const parsed = apiErrorBodySchema.safeParse(failure.body)
  if (parsed.success) return new AuthRequestError(parsed.data.error.code)

  return new AuthRequestError(CODE_BY_STATUS.get(failure.status) ?? 'INTERNAL')
}

export function createAuthGateway(request: AuthFetch, options: AuthGatewayOptions): AuthGateway {
  const { device } = options

  /** Satu jalur request: kegagalan jaringan/HTTP jadi `AuthRequestError`, bukan error mentah. */
  async function call(
    path: string,
    requestOptions: { method: 'GET' | 'POST'; body?: Record<string, unknown> },
  ): Promise<unknown> {
    try {
      return await request(path, requestOptions)
    } catch (caught) {
      throw toAuthRequestError(caught)
    }
  }

  /**
   * Body di luar kontrak = server mengirim bentuk yang tidak kita kenali. Itu bukan kegagalan
   * jaringan (responsnya sampai) dan bukan salah user, jadi `INTERNAL` tanpa `isNetworkError` -
   * UI tidak boleh menyuruh user memeriksa koneksinya untuk hal ini.
   */
  function readEnvelope<TData>(
    schema: { parse: (value: unknown) => { data: TData } },
    body: unknown,
  ): TData {
    try {
      return schema.parse(body).data
    } catch {
      throw new AuthRequestError('INTERNAL')
    }
  }

  async function currentSession(): Promise<CurrentSessionResult | null> {
    try {
      return readEnvelope(sessionEnvelopeSchema, await call(SESSION_PATH, { method: 'GET' }))
    } catch (caught) {
      // 401 = belum ada sesi (kunjungan pertama, atau sesi sudah mati): keadaan normal, bukan kegagalan.
      if (caught instanceof AuthRequestError && caught.code === 'UNAUTHENTICATED') return null
      throw caught
    }
  }

  async function requestEmailOtp(email: string): Promise<void> {
    // 204 tanpa body: tidak ada yang boleh diparse (amplop `{ data }` hanya untuk yang punya DTO).
    await call(OTP_REQUEST_PATH, {
      method: 'POST',
      body: { email, client: CLIENT_KIND, device },
    })
  }

  async function verifyEmailOtp(email: string, code: string): Promise<WebSessionDto> {
    const body = await call(OTP_VERIFY_PATH, {
      method: 'POST',
      body: { email, code, client: CLIENT_KIND, device },
    })

    return readEnvelope(loginEnvelopeSchema, body)
  }

  async function startGoogleLogin(): Promise<void> {
    // Navigasi PENUH (`window.location.assign`), bukan `$fetch`/`navigateTo`: server membalas 302 ke
    // Google dan browser yang mengikuti alur OAuth (cookie binding state ikut lewat browser, bukan
    // lewat JS). Halaman `/login` client-only (`routeRules` ssr:false), jadi `window` aman di sini.
    window.location.assign(GOOGLE_START_URL)
  }

  async function signOut(): Promise<void> {
    await call(LOGOUT_PATH, { method: 'POST' })
  }

  return {
    requestEmailOtp,
    verifyEmailOtp,
    startGoogleLogin,
    currentSession,
    signOut,
  }
}

/**
 * Gateway nyata untuk web: `$fetch` Nuxt ke path relatif. Origin sama, jadi cookie `HttpOnly` sesi
 * ikut otomatis dan tidak ada CORS/token yang perlu diurus client.
 */
export function useAuthGateway(): AuthGateway {
  // Tidak ada flag "mode demo" di sini: apakah OTP fix aktif hanya bisa diketahui server
  // (`NUXT_SMTP_URL`, dilaporkan di log startup `server/plugins/env.ts`), sementara public config
  // tidak melihatnya. UI tidak menebak - hint kode demo dihapus, bukan diganti tebakan baru.
  return createAuthGateway((path, options) => $fetch(path, options), {
    device: currentDeviceInfo(),
  })
}
