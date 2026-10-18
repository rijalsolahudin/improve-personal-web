import type { IncomingMessage } from 'node:http'

/**
 * Batas ukuran body request - dan pembacaan body yang benar-benar menegakkan batas itu.
 *
 * Kenapa ini ada (temuan H1 audit keamanan): `requestSizeLimiter` bawaan nuxt-security HANYA membaca
 * header `content-length` (dan hanya untuk `POST`/`PUT`/`DELETE` di implementasinya). Request dengan
 * `Transfer-Encoding: chunked` tidak punya `content-length`, dan `parseInt(undefined)` = `NaN` - jadi
 * pemeriksaannya tidak pernah menyalak. Body lalu dibaca UTUH oleh `readValidatedBody` sebelum
 * validasi maupun rate limit jalan: satu proses Node yang juga melayani UI bisa kehabisan memori dari
 * request tanpa autentikasi (endpoint OTP publik sudah cukup).
 *
 * Dua lapis yang dipakai middleware `server/middleware/15-body-limit.ts`:
 * 1. Header `content-length` di atas batas -> ditolak tanpa membaca body (murah, dan menutup method
 *    `PATCH` yang tidak diperiksa limiter bawaan).
 * 2. Body yang MENGALIR (chunked, tanpa `content-length`) dihitung byte-nya saat dibaca; begitu lewat
 *    batas, pembacaan dihentikan dan request ditolak `413`.
 *
 * Batas ini satu angka untuk seluruh aplikasi: `nuxt.config.ts` mengimpor konstanta yang sama, jadi
 * limiter bawaan nuxt-security dan middleware ini tidak bisa berbeda pendapat soal angka.
 */
export const REQUEST_SIZE_LIMIT_BYTES = 8_388_608

/** `transfer-encoding` bisa berisi daftar (`gzip, chunked`), jadi dicari sebagai token. */
const CHUNKED_TOKEN_PATTERN = /\bchunked\b/i

/** Header `content-length` yang sah: digit polos. Nilai aneh dianggap "tidak diketahui". */
const CONTENT_LENGTH_PATTERN = /^[0-9]{1,16}$/

export function declaresChunkedBody(transferEncoding: string | undefined): boolean {
  return transferEncoding !== undefined && CHUNKED_TOKEN_PATTERN.test(transferEncoding)
}

/**
 * Nilai `content-length` sebagai byte, atau `null` kalau header-nya tidak ada/tidak terbaca.
 *
 * `null` berarti "jangan percaya header" - jalur chunked yang menentukannya, bukan nilai tebakan.
 * Perhatikan bedanya dengan `parseInt` yang dipakai limiter bawaan: di sana header yang hilang jadi
 * `NaN` dan perbandingannya selalu `false` (lubang H1), di sini header yang hilang jadi `null` dan
 * pemanggilnya wajib menangani kasus itu.
 */
export function declaredBodyBytes(contentLength: string | undefined): number | null {
  if (contentLength === undefined) return null

  const trimmed = contentLength.trim()
  if (!CONTENT_LENGTH_PATTERN.test(trimmed)) return null

  const bytes = Number(trimmed)
  return Number.isSafeInteger(bytes) ? bytes : null
}

export type LimitedBody =
  /** Body terbaca penuh dan masih di bawah batas. */
  | { readonly kind: 'body'; readonly bytes: Uint8Array }
  /** Body melewati batas; pembacaan dihentikan (sisanya sengaja TIDAK dikonsumsi). */
  | { readonly kind: 'too-large' }
  /** Stream request rusak/terputus sebelum selesai. */
  | { readonly kind: 'aborted' }

/**
 * Baca seluruh body sambil menghitung byte-nya, dan berhenti begitu melewati `limitBytes`.
 *
 * Yang penting di sini: jumlah byte yang ditahan tidak pernah melebihi `limitBytes` + satu chunk
 * terakhir yang membuatnya melewati batas. Chunk itu dibuang (tidak masuk `chunks`), jadi memori
 * proses tidak tumbuh mengikuti ukuran body yang dikirim penyerang - inilah yang membuat batasnya
 * nyata, bukan cuma pemeriksaan header.
 *
 * Body yang berhasil dibaca disimpan di `rawBody` request (lihat `setRawBody`) supaya `readRawBody`
 * milik h3 memakai buffer ini dan tidak membaca socket untuk kedua kali.
 */
export function readBodyWithinLimit(
  request: IncomingMessage,
  limitBytes: number = REQUEST_SIZE_LIMIT_BYTES,
): Promise<LimitedBody> {
  return new Promise<LimitedBody>((resolve) => {
    const chunks: Buffer[] = []
    let total = 0
    let settled = false

    const finish = (result: LimitedBody): void => {
      if (settled) return
      settled = true

      request.off('data', onData)
      request.off('end', onEnd)
      request.off('error', onError)
      request.off('aborted', onError)
      request.off('close', onError)

      // Sisa body TIDAK dibaca. Socket-nya baru boleh ditutup setelah respons terkirim (lihat
      // middleware): menutupnya di sini akan membatalkan respons 413 itu sendiri.
      if (result.kind === 'too-large') request.pause()

      resolve(result)
    }

    const onData = (chunk: Buffer): void => {
      total += chunk.length

      if (total > limitBytes) {
        finish({ kind: 'too-large' })
        return
      }

      chunks.push(chunk)
    }

    const onEnd = (): void => finish({ kind: 'body', bytes: Buffer.concat(chunks, total) })
    const onError = (): void => finish({ kind: 'aborted' })

    request
      .on('data', onData)
      .on('end', onEnd)
      .on('error', onError)
      .on('aborted', onError)
      .on('close', onError)
  })
}

/**
 * Simpan body yang sudah dibaca supaya handler tidak membaca socket lagi.
 *
 * `readRawBody` milik h3 (1.15) memeriksa `event.node.req.rawBody` lebih dulu sebelum menyentuh
 * stream, jadi nilai ini yang dipakai `readBody`/`readValidatedBody`. Cast-nya tipe saja: properti
 * `rawBody` tidak ada di tipe `IncomingMessage` Node, tapi memang properti itulah yang dibaca h3.
 *
 * Menyimpan `Buffer` kosong juga sah dan disengaja: h3 memeriksa keberadaan nilainya (bukan
 * `length`), jadi request chunked tanpa byte tetap dijawab `undefined` seperti sebelumnya.
 */
export function setRawBody(request: IncomingMessage, bytes: Uint8Array): void {
  ;(request as { rawBody?: Uint8Array }).rawBody = bytes
}
