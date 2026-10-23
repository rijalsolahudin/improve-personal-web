import { HttpError, type HttpClient, type HttpRequestInit } from '@improve-personal/core'

import { errorCodeFrom } from '../http/json-fetch'

/**
 * `HttpClient` web untuk engine sync (`POST /v1/sync/push`, `GET /v1/sync/pull`).
 *
 * Tiga hal yang dijaga di sini:
 * - **Amplop server dibuka di satu tempat.** Route `/v1` membalas `{ data: DTO }`; core sync hanya
 *   mengenal DTO telanjang. Kalau `data` tidak ada, itu respons yang menyimpang - bukan DTO kosong.
 * - **Kegagalan jaringan BUKAN `HttpError`.** Engine memakai perbedaan ini: `HttpError` = server
 *   menjawab (status error), selain itu = offline/timeout, dan outbox harus tetap menunggu.
 * - **Tidak ada URL dari user.** Path konstan; base URL dari origin sendiri.
 */

const PUSH_PATH = '/v1/sync/push'
const PULL_PATH = '/v1/sync/pull'

/**
 * Header identitas pemilik data lokal: `user.id` yang dipegang controller sync.
 *
 * Cookie sesi bersifat ambient - tab yang sesinya sudah berganti (login akun lain di tab sebelah)
 * tetap mengirim cookie AKUN BARU sambil memegang data akun lama. Server membandingkan header ini
 * dengan sesi cookie dan menolak batch yang tidak cocok; tanpa itu, ciphertext akun A bisa masuk ke
 * baris akun B (QA T76 B1). Yang dikirim hanya id (UUID), bukan token - token tetap di cookie
 * `HttpOnly` dan tidak pernah menyentuh JavaScript.
 */
export const SYNC_EXPECTED_USER_HEADER = 'x-expected-user-id'

/** Batas satu request sync. Cukup longgar untuk batch 500 record, tetap tidak menggantung selamanya. */
export const SYNC_REQUEST_TIMEOUT_MS = 20_000

/** Bentuk minimal `fetch` yang dibutuhkan - supaya test bisa memakai respons palsu tanpa DOM. */
export type SyncFetcher = (
  url: string,
  init: {
    readonly method: 'GET' | 'POST'
    readonly headers: Readonly<Record<string, string>>
    readonly body?: string
    readonly signal?: AbortSignal
    readonly cache: 'no-store'
    readonly credentials: 'same-origin'
  },
) => Promise<{
  readonly ok: boolean
  readonly status: number
  json: () => Promise<unknown>
}>

export type SyncHttpClientOptions = {
  /** Origin server, mis. `https://app.example.com` (tanpa slash akhir). */
  readonly baseUrl: string
  /**
   * Pemilik data lokal yang dipegang controller (`session.userId`). Dikirim sebagai
   * `x-expected-user-id` supaya server bisa menolak request yang cookie-nya sudah milik akun lain.
   * Kosong/`undefined` = header tidak dikirim (dipakai test & pemanggil non-controller).
   */
  readonly expectedUserId?: string
  readonly fetcher?: SyncFetcher
  readonly timeoutMs?: number
}

export function createSyncHttpClient(options: SyncHttpClientOptions): HttpClient {
  const baseUrl = options.baseUrl.replace(/\/+$/, '')
  const fetcher = options.fetcher ?? defaultFetcher
  const timeoutMs = options.timeoutMs ?? SYNC_REQUEST_TIMEOUT_MS
  const expectedUserId = options.expectedUserId?.trim() ?? ''

  async function call<T>(
    path: string,
    method: 'GET' | 'POST',
    body: unknown,
    init: HttpRequestInit | undefined,
  ): Promise<T> {
    const signal = mergeSignal(init?.signal, timeoutMs)

    // Timeout/abort/DNS: tidak ada jawaban HTTP. `fetch` melempar, dan engine melihat error yang
    // BUKAN `HttpError` sebagai offline - outbox tetap menunggu, bukan ditandai gagal permanen.
    const response = await fetcher(`${baseUrl}${path}`, {
      method,
      headers: {
        accept: 'application/json',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(expectedUserId === '' ? {} : { [SYNC_EXPECTED_USER_HEADER]: expectedUserId }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      ...(signal === undefined ? {} : { signal }),
      cache: 'no-store',
      credentials: 'same-origin',
    })

    const parsed = await readJson(response)

    if (!response.ok) {
      throw new HttpError(
        response.status,
        errorCodeFrom({ status: response.status, body: parsed }),
        'sync request gagal',
      )
    }

    return unwrapData(parsed) as T
  }

  return {
    postJson: <TResponse>(url: string, body: unknown, init?: HttpRequestInit) =>
      call<TResponse>(pathOf(url, PUSH_PATH), 'POST', body, init),
    getJson: <TResponse>(url: string, init?: HttpRequestInit) =>
      call<TResponse>(pathOf(url, PULL_PATH), 'GET', undefined, init),
  }
}

/**
 * Core mengirim URL absolut (`${baseUrl}/v1/sync/...`). Yang dipakai hanya path + query-nya, supaya
 * tidak ada origin kedua yang bisa datang dari pemanggil.
 */
function pathOf(url: string, fallback: string): string {
  try {
    const parsed = new URL(url, 'http://sync.local')
    return `${parsed.pathname}${parsed.search}`
  } catch {
    return fallback
  }
}

function unwrapData(body: unknown): unknown {
  if (typeof body === 'object' && body !== null && 'data' in body) {
    return (body as { data: unknown }).data
  }

  // Server yang menjawab 2xx tanpa amplop adalah bug kontrak. Core tetap memvalidasi DTO-nya, jadi
  // mengembalikan nilai apa adanya lebih jujur daripada mengarang `undefined`.
  return body
}

async function readJson(response: { json: () => Promise<unknown> }): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return undefined
  }
}

/**
 * Gabungkan `AbortSignal` pemanggil dengan timeout.
 *
 * `AbortSignal.any` belum ada di semua browser target (Safari 16-17.3, Chrome <=115, Firefox <=123).
 * Kalau hanya timeout yang dipakai di sana, `stopSync()` tidak membatalkan request yang sedang jalan
 * - jadi cabang fallback ini WAJIB merambatkan abort pemanggil, bukan membuangnya.
 */
function mergeSignal(signal: unknown, timeoutMs: number): AbortSignal | undefined {
  const timeout =
    typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
      ? AbortSignal.timeout(timeoutMs)
      : undefined

  if (!(signal instanceof AbortSignal)) return timeout
  if (timeout === undefined) return signal
  if (typeof AbortSignal.any === 'function') return AbortSignal.any([signal, timeout])

  const merged = new AbortController()
  const abort = (reason: AbortSignal): void => merged.abort(reason.reason)

  if (signal.aborted) {
    abort(signal)
  } else if (timeout.aborted) {
    abort(timeout)
  } else {
    signal.addEventListener('abort', () => abort(signal), { once: true })
    timeout.addEventListener('abort', () => abort(timeout), { once: true })
  }

  return merged.signal
}

const defaultFetcher: SyncFetcher = (url, init) => fetch(url, init)
