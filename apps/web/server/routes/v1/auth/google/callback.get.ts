import { googleCallbackQuerySchema } from '@improve-personal/contracts'

import { serviceContext } from '../../../../services/context'
import { completeGoogleLogin } from '../../../../services/google'
import { ApiProblem } from '../../../../utils/api-error'
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
 * KEGAGALAN di jalur web juga di-`302`, bukan JSON: browser tidak bisa "menampilkan error JSON" dengan
 * cara yang masuk akal - user melihat JSON mentah di tab dan TIDAK PERNAH sampai ke halaman login,
 * padahal yang dia butuhkan cuma kesempatan mencoba lagi (`/login?error=oauth`). Ini murni perbaikan
 * PENGALAMAN, bukan pelonggaran keamanan: pesannya tetap generik, satu bentuk untuk semua sebab
 * (`OAUTH_INVALID`: binding tidak cocok, `state` kedaluwarsa/dipakai, code ditolak Google), dan tidak
 * ada satu nilai pun dari klien yang ikut ke URL tujuan.
 *
 * Cara menentukan "ini alur web": cookie binding `ip_oauth_state` ADA di request. Cookie itu HANYA
 * dipasang `/auth/google/start` untuk `client=web`, dan klien `mobile` tidak punya cookie jar sama
 * sekali - jadi keberadaannya adalah fakta yang dibuat server, bukan klaim klien. Itu sebabnya pilihan
 * `Sec-Fetch-Mode`/`Sec-Fetch-Dest` ditolak walau sekilas lebih langsung: header Fetch Metadata cuma
 * dikirim browser modern, tidak ada di klien web lama, dan (lebih penting) tidak membedakan request
 * hasil NAVIGASI browser dari panggilan `fetch` lintas-origin - sementara cookie binding hanya bisa
 * ada di browser yang benar-benar memulai flow ini di origin kita. Konsekuensinya yang harus disadari:
 * setelah redirect, halaman login di `app/` yang membaca `?error=oauth` dan menampilkan pesan generik
 * (sisi FE dikerjakan orang lain - tidak diimplementasikan di sini).
 */

/** Halaman app setelah login web. Relatif dan tetap: tidak ada nilai dari klien yang diteruskan. */
const WEB_AFTER_LOGIN_PATH = '/app'

/**
 * Halaman login saat alur web gagal. Relatif dan tetap, tanpa detail error apa pun: tidak ada nilai
 * dari klien (termasuk pesan error, `code`, atau `state`) yang boleh ikut - URL ini selalu sama persis.
 */
const WEB_LOGIN_FAILED_PATH = '/login?error=oauth'

export default defineApiHandler(async (event) => {
  const ctx = serviceContext(event)

  // Dibaca dari request apa adanya, dan sengaja SEBELUM `try`: penandanya adalah "browser ini yang
  // memulai flow", bukan "login web berhasil" - jadi nilainya sudah pasti walau loginnya gagal.
  const stateBinding = readOAuthStateBinding(event)
  const isWebFlow = stateBinding !== null

  try {
    const query = await getValidatedQuery(event, (value) => googleCallbackQuerySchema.parse(value))

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
  } catch (error) {
    // Mobile: bentuk lama dipertahankan - app native membaca JSON error lewat amplop biasa
    // (`{ error: { code } }`), dan redirect tidak ada artinya di klien tanpa browser.
    if (!isWebFlow) throw error

    // HANYA kegagalan login yang dialihkan: `ApiProblem` selalu berpesan generik
    // (`GENERIC_ERROR_MESSAGES`), jadi mengalihkannya ke halaman login tidak menyembunyikan detail apa
    // pun dari user - dan detail sebabnya memang tidak pernah kita kirim, cuma "coba lagi".
    //
    // Error LAIN (mis. DB mati, atau bug) sengaja TIDAK ditelan jadi redirect: `defineApiHandler`
    // mencatatnya sebagai `INTERNAL` lewat `logServerError`, dan menyamarkannya di sini akan membuat
    // kegagalan server hilang dari log sekaligus memberi user kesan "login gagal biasa". Fail-closed
    // lebih penting daripada halaman yang rapi.
    if (!(error instanceof ApiProblem)) throw error

    setHeader(event, 'cache-control', 'no-store')

    return sendRedirect(event, WEB_LOGIN_FAILED_PATH, 302)
  } finally {
    clearOAuthStateCookie(event, ctx.env)
  }
})
