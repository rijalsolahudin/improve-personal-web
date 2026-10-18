import { ERROR_HTTP_STATUS, type ApiErrorBody } from '@improve-personal/contracts'

import { ApiProblem, apiProblem, errorCodeFor } from '../utils/api-error'
import { isApiRequest } from '../utils/api-path'
import { logServerError } from '../utils/server-log'
import { setApiResponseStatus } from '../utils/api-response'

/**
 * Error global untuk rute API: selalu berbentuk `ApiErrorBody`, tidak pernah membocorkan detail internal.
 *
 * Jalur normalnya sudah tertutup sebelum plugin ini: `defineApiHandler` menangkap semua error di
 * dalam handler (termasuk `ApiProblem` dari service) dan mengubahnya jadi `ApiErrorBody`, sedangkan
 * middleware memakai `sendApiProblem`. Plugin ini adalah lapisan terakhir untuk error yang TIDAK
 * melewati dua jalur itu - body yang gagal diparse, request yang ditolak `requestSizeLimiter`,
 * rute `/v1` yang tidak ada, atau bug di middleware/plugin lain.
 *
 * Dua hal yang dikerjakan:
 * 1. Logging tanpa PII - hanya untuk kegagalan nyata (kode `INTERNAL`), lewat `logServerError` yang
 *    mencatat rute, method, nama error, pesan, dan stack. Tidak ada body, token, OTP, email, atau
 *    blob yang pernah masuk log: tidak satu pun nilai itu diteruskan ke logger.
 * 2. Mengubah respons jadi `ApiErrorBody` (`{ "error": { code, message } }`) dengan status dari
 *    `ERROR_HTTP_STATUS` (kontrak), sehingga klien web maupun mobile tidak pernah menerima bentuk
 *    error kedua.
 *
 * Bentuk amplopnya TIDAK disusun di sini: `problem.body` (getter `ApiProblem`) adalah satu-satunya
 * tempat `{ error: { ... } }` dibentuk, sama seperti yang dipakai `defineApiHandler` dan middleware.
 * Kalau plugin ini menyusun body sendiri, satu perubahan kontrak akan lolos dari dua tempat lain.
 *
 * Isi pesan selalu `GENERIC_ERROR_MESSAGES` milik kontrak. Stack trace dan pesan driver Postgres
 * tidak pernah ikut ke respons - kalau bocor ke klien, penyerang dapat nama tabel sekaligus bentuk
 * query dari satu request gagal.
 *
 * Pemetaan error -> kode kontrak TIDAK ditulis ulang di sini: dipakai `errorCodeFor` yang sama dengan
 * `defineApiHandler`. Dulu plugin ini punya salinannya sendiri, dan salinan itu yang menyembunyikan
 * BUG-1: pemetaan 400 -> `VALIDATION_FAILED` sudah benar di sini, tapi tidak pernah tercapai.
 */

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('error', (error, context) => {
    // Cast tipe saja: `context.event` bertipe h3 v2 lewat tipe milik nitropack, sedangkan runtime dan
    // seluruh helper di `server/**` bertipe h3 v1 (lihat `shared/h3-event.d.ts`).
    const event = context.event as unknown as H3Event | undefined
    const code = errorCodeFor(error)

    // 4xx adalah alur normal (ditolak) dan sudah dijawab rapi oleh handler/middleware; yang perlu
    // tercatat hanya kegagalan nyata supaya log tidak tenggelam oleh percobaan login yang gagal.
    if (code === 'INTERNAL') logServerError(event, error)

    if (!event || event.handled) return
    // Halaman app dan aset statis tetap memakai halaman error Nuxt - bentuk `ApiErrorBody` cuma
    // untuk rute API yang memang dikonsumsi web/mobile sebagai JSON.
    if (!isApiRequest(event)) return

    const problem = error instanceof ApiProblem ? error : apiProblem(code)
    const body: ApiErrorBody = problem.body

    setApiResponseStatus(event, ERROR_HTTP_STATUS[problem.code])
    for (const [name, value] of Object.entries(problem.headers ?? {})) {
      setHeader(event, name, value)
    }
    setHeader(event, 'content-type', 'application/json; charset=utf-8')

    // `send()` menulis lewat `setImmediate` dan melewati respons yang sudah dikirim, jadi ini tidak
    // bisa menimpa respons yang sudah terbentuk (mis. dari `defineApiHandler`).
    void send(event, JSON.stringify(body))
  })
})
