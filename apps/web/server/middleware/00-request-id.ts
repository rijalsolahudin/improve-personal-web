import { randomUUID } from 'node:crypto'

/**
 * Request id untuk setiap request.
 *
 * Tujuan: satu kegagalan di production bisa dilacak tanpa meminta data user - log server memuat
 * path + method, dan id ini yang menyambungkan laporan klien ke baris log yang tepat.
 *
 * Dua aturan yang dipegang di sini:
 * - Id dari klien hanya diteruskan kalau bentuknya aman. Nilai header respons TIDAK boleh memuat
 *   CR/LF, dan men-echo header kiriman klien apa adanya adalah cara termudah menyuntik nilai
 *   seperti itu (atau teks panjang) ke respons kita. Bentuk yang tidak lolos pola = id baru.
 * - Id dibuat di server (`randomUUID`), bukan diambil dari body/query: nilainya tidak pernah masuk
 *   keputusan keamanan apa pun, jadi tidak ada nilai di memalsukannya.
 *
 * Nama berkas diberi awalan angka supaya urutannya deterministik: middleware Nitro dijalankan
 * berurutan, dan id ini harus sudah ada sebelum middleware lain bisa memutus request (mis. CSRF),
 * sehingga respons 403 pun tetap membawa `x-request-id`.
 */

const REQUEST_ID_HEADER = 'x-request-id'

/** Bentuk id yang boleh diteruskan: huruf, angka, `.`, `_`, `-`, maksimum 64 karakter. */
const SAFE_REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/

export default defineEventHandler((event) => {
  const incoming = getHeader(event, REQUEST_ID_HEADER)
  const requestId = incoming && SAFE_REQUEST_ID_PATTERN.test(incoming) ? incoming : randomUUID()

  // `event.context` dipakai (bukan state modul): nilainya harus ter-scope satu request.
  event.context.requestId = requestId
  setHeader(event, REQUEST_ID_HEADER, requestId)
})
