import { googleStartQuerySchema, googleStartResultSchema } from '@improve-personal/contracts'

import { serviceContext } from '../../../../services/context'
import { startGoogleLogin } from '../../../../services/google'
import { apiProblem } from '../../../../utils/api-error'
import { setOAuthStateCookie } from '../../../../utils/oauth-state-cookie'
import { logServerError } from '../../../../utils/server-log'

/**
 * `GET /v1/auth/google/start?client=` - mulai login Google (Authorization Code + PKCE).
 *
 * Publik (langkah pertama login).
 *
 * Dua bentuk respons, sesuai jenis klien:
 * - `web`: `302` ke URL otorisasi Google. Browser-nya yang jadi agen, jadi tidak perlu body - dan
 *   browser itu juga yang diberi cookie binding `ip_oauth_state` (hash `state`), supaya callback hanya
 *   bisa diselesaikan browser yang MEMULAI flow (temuan M2: login CSRF / session fixation). Cookie-nya
 *   `HttpOnly` + `SameSite=Lax` + sekali pakai; nilainya cuma hash, bukan `state` mentah.
 * - `mobile`: URL dikembalikan di body supaya app membukanya di browser sistem. Body-nya cuma URL
 *   otorisasi + `expiresAt` - TIDAK ada token dan TIDAK ada `state`, karena sesi baru terbit di langkah
 *   callback. Jalur mobile tidak memasang cookie apa pun (app native tidak punya cookie jar), dan itu
 *   aman karena binding ini melindungi penerbitan COOKIE SESI di browser korban - respons mobile berupa
 *   JSON yang tidak bisa dibaca situs lain.
 *
 * `redirect_uri` TIDAK diterima dari klien (schema strict): server memetakan `client` -> redirect URI
 * yang terdaftar di env. Kalau klien boleh mengirimnya, endpoint ini jadi open redirect sekaligus
 * jalur pencurian authorization code.
 *
 * `installationId` (opsional, task #80) diterima dan hanya DICATAT di baris `oauth_states`; ia tidak
 * ikut ke URL Google dan tidak mengubah bentuk respons. Callback yang memakainya, setelah state
 * terbukti sah, supaya login Google juga bisa membedakan dua instalasi yang nama + platform-nya sama.
 * Field lain tetap ditolak: schema-nya strict, dan `redirectUri` sengaja tidak ada di daftar itu.
 *
 * Body `mobile` divalidasi dengan `googleStartResultSchema` (kontrak, additive) supaya bentuk yang
 * benar-benar dikirim ke klien diuji terhadap definisi bersama - web dan mobile membaca schema yang
 * sama. Kegagalan di situ BUKAN kesalahan klien: body ini disusun server sendiri, jadi jawabannya
 * `500 INTERNAL` (dan dicatat), bukan `400 VALIDATION_FAILED` yang menyalahkan pemanggil.
 */
export default defineApiHandler(async (event) => {
  const query = await getValidatedQuery(event, (value) => googleStartQuerySchema.parse(value))
  const ctx = serviceContext(event)

  const start = await startGoogleLogin(ctx, {
    client: query.client,
    ...(query.installationId === undefined ? {} : { installationId: query.installationId }),
  })

  setHeader(event, 'cache-control', 'no-store')

  if (query.client === 'web') {
    setOAuthStateCookie(event, ctx.env, start.state, {
      expiresAt: start.expiresAt,
      now: ctx.now,
    })

    return sendRedirect(event, start.authorizationUrl, 302)
  }

  const body = googleStartResultSchema.safeParse({
    authorizationUrl: start.authorizationUrl,
    expiresAt: start.expiresAt.toISOString(),
  })

  if (!body.success) {
    logServerError(event, body.error)
    throw apiProblem('INTERNAL')
  }

  return body.data
})
