import { ERROR_HTTP_STATUS, apiErrorBodySchema, type ErrorCode } from '@improve-personal/contracts'

/**
 * Batas jaringan bersama untuk gateway client (ARCHITECTURE §5: jaringan hanya di tepi).
 *
 * Dipakai gateway `keys` sekarang; gateway `auth` sudah punya bentuk yang sama (dan bisa memakai modul
 * ini nanti tanpa mengubah perilakunya). Yang penting di sini bukan DRY-nya, tapi: **pemetaan
 * status HTTP -> kode kontrak hanya ada di satu tempat**. Dua tabel status yang berbeda adalah cara
 * paling halus membuat satu endpoint melaporkan sebab yang salah.
 */

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

/**
 * Satu fungsi transport: path + method + body -> body JSON.
 *
 * Test menukar transportnya di batas ini (mock jaringan di batas, bukan mem-mock composable/Nuxt).
 */
export type JsonFetch = (
  path: string,
  options: { readonly method: HttpMethod; readonly body?: Record<string, unknown> },
) => Promise<unknown>

export type RequestFailure = {
  readonly status?: number
  /** Body error apa adanya; bentuknya diperiksa schema kontrak, tidak dipercaya. */
  readonly body?: unknown
}

/**
 * Status + body dari error transport dibaca lewat BENTUKNYA, tanpa mengimpor tipe internal `$fetch`:
 * yang dibutuhkan cuma dua field itu, dan `$fetch` tidak dijamin melempar kelas tertentu.
 */
export function failureOf(error: unknown): RequestFailure {
  if (typeof error !== 'object' || error === null) return {}

  const { status, data } = error as { status?: unknown; data?: unknown }
  return typeof status === 'number' ? { status, body: data } : { body: data }
}

/**
 * Status -> kode kontrak saat body error TIDAK bisa dibaca (respons kosong dari proxy/host).
 *
 * Diturunkan dari `ERROR_HTTP_STATUS` supaya tidak ada tabel status kedua. Beberapa kode berbagi status
 * 400; daftar ini menentukan pilihan saat body-nya tidak ada, dan `VALIDATION_FAILED` dipilih sebagai
 * bacaan paling netral. Status ambigu (409 = SYNC_RESET_REQUIRED atau DEVICE_LIMIT_REACHED) sengaja
 * TIDAK ada: lebih baik `INTERNAL` daripada menebak sebabnya.
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

/** Tanpa status = permintaan tidak pernah dapat respons HTTP (offline, DNS, diblokir). */
export function isNetworkFailure(failure: RequestFailure): boolean {
  return failure.status === undefined
}

/** Kode kontrak untuk sebuah kegagalan; selalu mengembalikan kode, tidak pernah menebak `undefined`. */
export function errorCodeFrom(failure: RequestFailure): ErrorCode {
  const parsed = apiErrorBodySchema.safeParse(failure.body)
  if (parsed.success) return parsed.data.error.code

  if (failure.status === undefined) return 'INTERNAL'

  return CODE_BY_STATUS.get(failure.status) ?? 'INTERNAL'
}
