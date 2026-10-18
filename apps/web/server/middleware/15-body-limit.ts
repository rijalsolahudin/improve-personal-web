import type { ApiErrorBody } from '@improve-personal/contracts'

import { apiProblem, sendApiProblem } from '../utils/api-error'
import { isApiRequest } from '../utils/api-path'
import {
  declaresChunkedBody,
  declaredBodyBytes,
  readBodyWithinLimit,
  REQUEST_SIZE_LIMIT_BYTES,
  setRawBody,
} from '../utils/request-size'

/**
 * Batas ukuran body yang tidak bisa dilewati route mana pun (temuan H1 audit keamanan).
 *
 * Kenapa middleware, bukan pemeriksaan di handler: `requestSizeLimiter` bawaan nuxt-security cuma
 * melihat header `content-length` (dan melewatkan `PATCH`), jadi request `Transfer-Encoding: chunked`
 * tanpa `content-length` masuk dengan body tak terbatas dan baru berhenti setelah dibaca utuh ke
 * memori oleh `readValidatedBody`. Middleware ini jalan SEBELUM handler mana pun, termasuk endpoint
 * publik yang tidak butuh sesi (`/v1/auth/otp/request`, `/v1/auth/google/callback`) - justru endpoint
 * itulah yang paling murah diserang karena tidak butuh akun.
 *
 * Bentuk responsnya `ApiErrorBody` dengan `413 PAYLOAD_TOO_LARGE` lewat jalur yang sama dengan error
 * lain (`sendApiProblem` -> kontrak), jadi web dan mobile tidak pernah menerima bentuk error kedua.
 *
 * Dua jalur yang ditangani, dan urutannya disengaja:
 * 1. `content-length` di atas batas -> ditolak tanpa membaca satu byte pun body (murah). Ini juga
 *    menutup `PATCH`, yang tidak diperiksa limiter bawaan.
 * 2. Body mengalir (`chunked`) -> byte-nya dihitung saat dibaca; lewat batas = ditolak. Body yang
 *    masih di bawah batas disimpan ke `req.rawBody` supaya handler membacanya dari memori, bukan dari
 *    socket (tanpa itu, handler akan menunggu data yang sudah kita konsumsi).
 *
 * Body yang di-frame `content-length` SENGAJA tidak dibaca di sini: nilainya sudah dibatasi
 * pemeriksaan di atas, dan h3 membacanya sendiri sesuai panjang yang dideklarasikan. Yang tidak punya
 * framing apa pun ("tidak ada `content-length`, tidak ada `chunked`") juga tidak disentuh - sama
 * seperti h3, request seperti itu memang tidak punya body.
 *
 * Lapisan di luar aplikasi (Nginx `client_max_body_size`, limit body Cloudflare) tetap disarankan:
 * middleware ini menahan memori PROSES ini, bukan lebar pita jaringan.
 */

/** Method HTTP yang boleh membawa body (h3: `PayloadMethods`). */
const PAYLOAD_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export default defineEventHandler(async (event) => {
  if (!isApiRequest(event)) return
  if (!PAYLOAD_METHODS.has(getMethod(event))) return

  const declared = declaredBodyBytes(getHeader(event, 'content-length'))
  if (declared !== null && declared > REQUEST_SIZE_LIMIT_BYTES) return payloadTooLarge(event)

  if (!declaresChunkedBody(getHeader(event, 'transfer-encoding'))) return

  const body = await readBodyWithinLimit(event.node.req)

  // Stream rusak/terputus: tidak ada yang bisa dijawab dengan 413, dan mengarang respons di sini
  // hanya menyembunyikan kegagalan yang memang sudah gagal. Diteruskan seperti sebelumnya.
  if (body.kind === 'aborted') return
  if (body.kind === 'too-large') return payloadTooLarge(event)

  setRawBody(event.node.req, body.bytes)
  return
})

/**
 * Tolak request karena body-nya kelewatan besar.
 *
 * Sisa body yang belum dibaca TIDAK dikonsumsi: pembacaan dihentikan (`pause`), respons dikirim
 * dengan `connection: close` (tidak ada request lain yang boleh menunggu di koneksi yang framing
 * body-nya kita tinggalkan), dan socket-nya baru ditutup SETELAH respons selesai - menutupnya lebih
 * dulu akan membatalkan respons 413 itu sendiri.
 */
function payloadTooLarge(event: H3Event): ApiErrorBody {
  const request = event.node.req

  request.pause()
  setHeader(event, 'connection', 'close')
  event.node.res.once('finish', () => request.destroy())

  return sendApiProblem(event, apiProblem('PAYLOAD_TOO_LARGE'))
}
