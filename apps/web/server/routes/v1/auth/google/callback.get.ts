import { googleCallbackQuerySchema } from '@improve-personal/contracts'

import { serviceContext } from '../../../../services/context'
import { completeGoogleLogin } from '../../../../services/google'
import { clearOAuthStateCookie, readOAuthStateBinding } from '../../../../utils/oauth-state-cookie'
import { setSessionCookie } from '../../../../utils/session-cookie'

/**
 * `GET /v1/auth/google/callback?code=&state=` - selesaikan login Google.
 *
 * Publik (state + PKCE verifier-nya yang jadi bukti, bukan sesi). `state` dikonsumsi atomik di
 * service, jadi callback kedua dengan `state` yang sama selalu gagal.
 *
 * Yang ditambahkan untuk menutup login CSRF (temuan M2 audit keamanan): cookie binding `ip_oauth_state`
 * yang dipasang `/auth/google/start` dibaca di sini dan diteruskan ke service. `state` yang sah tapi
 * TIDAK terikat ke browser ini ditolak - kalau tidak, penyerang bisa menyelesaikan flow akun Google
 * miliknya sendiri lalu mengirim URL callback-nya ke korban, dan browser korban berakhir dengan sesi
 * akun penyerang (semua yang korban tulis setelah itu masuk ke akun penyerang).
 *
 * Cookie binding SELALU dibuang di akhir, apa pun hasilnya (sukses maupun gagal): sekali pakai. Klien
 * mobile tidak mengirim cookie itu sama sekali, dan service hanya mewajibkannya untuk `state` yang
 * client-nya `web` (nilai itu datang dari baris `oauth_states`, bukan dari klien).
 *
 * Respons per jenis klien, sama seperti `/auth/otp/verify`:
 * - `web`: cookie `HttpOnly` + `302` ke halaman app. Redirect-nya path RELATIF (`/app`), jadi tidak
 *   ada jalur open redirect dari parameter apa pun (security.md §5).
 * - `mobile`: DTO sesi dengan token di body.
 *
 * Hal yang menggantung (lihat laporan): penyerahan sesi ke app native setelah callback belum
 * ditentukan kontrak - idealnya deep link dengan kode sekali pakai. Untuk sekarang body JSON
 * dipakai supaya bentuk DTO-nya persis `mobileSessionDtoSchema`, tanpa mengarang kontrak baru.
 */

/** Halaman app setelah login web. Relatif dan tetap: tidak ada nilai dari klien yang diteruskan. */
const WEB_AFTER_LOGIN_PATH = '/app'

export default defineApiHandler(async (event) => {
  const query = await getValidatedQuery(event, (value) => googleCallbackQuerySchema.parse(value))
  const ctx = serviceContext(event)

  const stateBinding = readOAuthStateBinding(event)

  try {
    const { login } = await completeGoogleLogin(ctx, query, { stateBinding })

    setHeader(event, 'cache-control', 'no-store')

    if (login.dto.client === 'web') {
      setSessionCookie(event, ctx.env, login.token, {
        expiresAt: new Date(login.dto.expiresAt),
        now: ctx.now,
      })

      return sendRedirect(event, WEB_AFTER_LOGIN_PATH, 302)
    }

    return login.dto
  } finally {
    clearOAuthStateCookie(event, ctx.env)
  }
})
