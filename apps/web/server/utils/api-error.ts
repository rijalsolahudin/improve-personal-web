import {
  ERROR_HTTP_STATUS,
  GENERIC_ERROR_MESSAGES,
  type ApiError,
  type ApiErrorBody,
  type ErrorCode,
} from '@improve-personal/contracts'

import { logServerError } from './server-log'
import { setApiResponseStatus } from './api-response'

/**
 * Satu bentuk kegagalan untuk semua endpoint yang dilayani `/v1` + `/health`
 * (`ApiErrorBody` dari contracts: `{ "error": { code, message, details? } }`).
 *
 * Kenapa dibungkus, bukan `createError` mentah di tiap handler:
 * - Pesan ke client WAJIB generik (`GENERIC_ERROR_MESSAGES`). `createError` meneruskan
 *   `statusMessage` yang gampang terisi pesan internal ("column users.email does not exist").
 * - Status code ditentukan `ERROR_HTTP_STATUS` di kontrak, bukan per-endpoint - endpoint baru tidak
 *   bisa "lupa" dan mengembalikan 500 untuk kegagalan yang sebenarnya 400.
 * - Detail teknis (stack, query SQL, pesan driver Postgres) tidak pernah ikut ke respons; yang
 *   tercatat hanya di log server (`server/plugins/error-log.ts`).
 */

export type ApiProblemOptions = {
  /** Hanya info yang AMAN ditampilkan. Dilarang memuat input user, email, token, atau blob. */
  readonly details?: Record<string, unknown>
  /** Header tambahan, mis. `Retry-After` untuk 429. */
  readonly headers?: Record<string, string>
}

/** Kegagalan API yang sudah dipetakan ke kode kontrak. */
export class ApiProblem extends Error {
  readonly code: ErrorCode
  readonly details: Record<string, unknown> | undefined
  readonly headers: Record<string, string> | undefined

  constructor(code: ErrorCode, options: ApiProblemOptions = {}) {
    super(GENERIC_ERROR_MESSAGES[code])
    this.name = 'ApiProblem'
    this.code = code
    this.details = options.details
    this.headers = options.headers
  }

  get statusCode(): number {
    return ERROR_HTTP_STATUS[this.code]
  }

  /**
   * Body respons - SATU-SATUNYA tempat bentuk amplop error disusun.
   *
   * Handler (`defineApiHandler`), middleware (`sendApiProblem`), dan plugin error global semuanya
   * memakai getter ini, jadi tidak ada dua implementasi bentuk error yang bisa saling menyimpang
   * (dulu plugin punya pemetaan sendiri, dan perbedaan itu yang menyembunyikan bug pemetaan status).
   */
  get body(): ApiErrorBody {
    const error: ApiError = {
      code: this.code,
      message: GENERIC_ERROR_MESSAGES[this.code],
      ...(this.details ? { details: this.details } : {}),
    }

    return { error }
  }
}

export function apiProblem(code: ErrorCode, options: ApiProblemOptions = {}): ApiProblem {
  return new ApiProblem(code, options)
}

/**
 * Tulis problem ke respons - dipakai middleware yang harus memutus request lebih awal.
 *
 * Middleware Nitro bisa mengakhiri request dengan me-return nilai, jadi jalur ini tidak butuh
 * `try/catch` di sekelilingnya. Nilai kembaliannya SUDAH lengkap (`{ error: { ... } }`), bukan detail
 * error telanjang: pemanggil cuma me-return-nya, tanpa membungkus ulang.
 */
export function sendApiProblem(event: H3Event, problem: ApiProblem): ApiErrorBody {
  setApiResponseStatus(event, problem.statusCode)
  for (const [name, value] of Object.entries(problem.headers ?? {})) setHeader(event, name, value)
  setHeader(event, 'cache-control', 'no-store')
  return problem.body
}

/** Status HTTP dari error bergaya h3 (`H3Error`), tanpa mengimpor h3. */
function statusCodeOf(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined

  const value = (error as { statusCode?: unknown }).statusCode
  return typeof value === 'number' && Number.isInteger(value) ? value : undefined
}

/** `error.data` - h3 menyimpan error ASLI dari callback validator di field ini (bukan `cause`). */
function errorDataOf(error: unknown): unknown {
  if (typeof error !== 'object' || error === null) return undefined
  return (error as { data?: unknown }).data
}

/**
 * Kenali `ZodError` dari bentuknya tanpa mengimpor zod.
 *
 * `zod` bukan dependency langsung request handler: schema hidup di `packages/contracts`. Memeriksa
 * bentuknya (`name` + `issues` array) cukup untuk memetakannya ke `VALIDATION_FAILED`, dan tidak
 * membuat dua salinan zod di bundel server.
 */
function isZodError(error: unknown): boolean {
  if (!(error instanceof Error) || error.name !== 'ZodError') return false
  const issues = (error as { issues?: unknown }).issues
  return Array.isArray(issues)
}

/**
 * `true` untuk SEMUA kegagalan validasi input, termasuk yang sudah dibungkus h3.
 *
 * Kenapa tidak cukup `error.name === 'ZodError'` (ini akar BUG-1): helper h3 `readValidatedBody`,
 * `getValidatedQuery`, dan `getValidatedRouterParams` semuanya lewat `validateData`, dan `validateData`
 * membungkus SETIAP kegagalan callback validator jadi `H3Error` berstatus 400 - ZodError-nya ditaruh
 * di `error.data`, tidak dilempar apa adanya. Jadi ZodError tidak pernah muncul di permukaan,
 * pemeriksaan `name` selalu meleset, dan body/query/param yang tidak valid dijawab `500 INTERNAL`:
 * sinyal "coba lagi sebentar lagi" untuk kesalahan yang tidak akan pernah berhasil.
 *
 * Tiga bentuk yang harus dikenali, dan ketiganya tetap kegagalan KLIEN:
 * 1. `ZodError` telanjang - kalau schema dipanggil langsung (`schema.parse(...)`).
 * 2. `H3Error` berstatus 400 dari h3 - termasuk `400` yang bukan zod (JSON body rusak, `readRawBody`
 *    gagal): semua 400 dari h3 memang soal bentuk request yang tidak bisa diproses.
 * 3. `ZodError` yang disembunyikan h3 di `error.data` - penelusuran ini yang membuat keterkaitan
 *    dengan zod tetap terbaca walau `name` di permukaan sudah `H3Error`.
 */
function isValidationFailure(error: unknown): boolean {
  if (isZodError(error)) return true
  if (statusCodeOf(error) === 400) return true

  return isZodError(errorDataOf(error))
}

/**
 * Petakan error jadi kode kontrak. Satu sumber kebenaran untuk `defineApiHandler` (yang menulis
 * respons) DAN plugin error global (yang menulis log + respons untuk error di luar handler).
 *
 * Kenapa disatukan: sebelumnya kedua tempat itu punya pemetaan sendiri-sendiri, dan perbedaan itulah
 * yang menyembunyikan BUG-1 - `mapErrorCode` di plugin sudah memetakan 400 ke `VALIDATION_FAILED`,
 * tapi tidak pernah tercapai karena `defineApiHandler` menjawab 500 lebih dulu.
 *
 * `ApiProblem` menang lebih dulu: di situ kodenya sudah pasti dan tidak boleh ditebak ulang dari
 * status. Sisanya dipetakan dari status h3 (413 dari size limiter, 404 rute tak dikenal, 405 method
 * tidak dilayani). Status yang tidak punya padanan (mis. 415) jatuh ke `INTERNAL`.
 */
export function errorCodeFor(error: unknown): ErrorCode {
  if (error instanceof ApiProblem) return error.code
  if (isValidationFailure(error)) return 'VALIDATION_FAILED'

  switch (statusCodeOf(error)) {
    case 401:
      return 'UNAUTHENTICATED'
    case 403:
      return 'FORBIDDEN'
    case 404:
      return 'NOT_FOUND'
    case 405:
      return 'METHOD_NOT_ALLOWED'
    case 413:
      return 'PAYLOAD_TOO_LARGE'
    case 429:
      return 'RATE_LIMITED'
    default:
      return 'INTERNAL'
  }
}

/**
 * Handler `/v1` tipis: auth -> validasi -> service -> DTO.
 *
 * Tiga hal yang dilakukan wrapper ini, dan ketiganya SENGAJA dipusatkan di sini:
 *
 * 1. Membungkus nilai kembalian handler jadi amplop sukses `{ data: <DTO> }`.
 *    Kenapa di sini, bukan `return { data: dto }` di tiap route: 16 route berarti 16 kesempatan lupa
 *    - satu saja yang lupa dan bentuk responsnya langsung tidak seragam, padahal klien web/mobile
 *    memakai satu jalur pembacaan untuk semua endpoint. Handler tetap menulis DTO apa adanya
 *    (termasuk `return { devices }`), jadi tidak ada route yang perlu tahu soal amplop.
 * 2. Tidak menyentuh respons yang SUDAH dikirim handler sendiri (204 lewat `sendApiNoContent`,
 *    redirect lewat `sendRedirect`, atau apa pun yang sudah menulis header/body). Deteksinya dari
 *    kondisinya, bukan konvensi `return null`: `writableEnded`/`headersSent` adalah definisi yang
 *    dipakai h3 sendiri untuk "sudah terkirim" (`event.handled`), jadi `sendApiNoContent` (yang
 *    memanggil `res.end()`) dan `sendRedirect` (yang menulis body lewat `send()`) dua-duanya lolos
 *    apa adanya - redirect tetap tanpa body, bukan `{ "data": "/app" }`.
 * 3. Menerjemahkan kegagalan jadi `ApiErrorBody` (`{ error: { ... } }`), sehingga handler bisa
 *    `throw apiProblem('NOT_FOUND')` tanpa mengulang blok `try/catch` di setiap berkas. Jalur
 *    error TIDAK ikut dibungkus `data` - nilainya sudah berbentuk amplop error yang lengkap.
 */
export function defineApiHandler(handler: (event: H3Event) => unknown) {
  return defineEventHandler(async (event) => {
    try {
      const result = await handler(event)

      // Respons sudah dikirim handler (204/redirect/streaming): jangan menambah body apa pun.
      if (event.node.res.writableEnded || event.node.res.headersSent) return undefined

      // `null`/`undefined` = handler memang tidak mengembalikan DTO. Dibedakan dari DTO kosong agar
      // tidak pernah ada `{ "data": null }` - "tidak ada isi" bukan "isi berisi null".
      if (result === undefined || result === null) return undefined

      return { data: result }
    } catch (error) {
      const problem = error instanceof ApiProblem ? error : apiProblem(errorCodeFor(error))

      // 4xx adalah alur normal (request ditolak) dan tetap dijawab dengan pesan generik. Yang dicatat
      // hanya kegagalan nyata supaya log tidak tenggelam oleh request yang memang salah.
      if (problem.code === 'INTERNAL') logServerError(event, error)

      return sendApiProblem(event, problem)
    }
  })
}
