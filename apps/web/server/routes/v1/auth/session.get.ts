import { sessionResultFrom } from '../../../services/session'

/**
 * `GET /v1/auth/session` - sesi yang SEDANG berlaku untuk request ini.
 *
 * Kenapa endpoint ini ada sama sekali: klien web menyimpan token di cookie `HttpOnly`, jadi JavaScript
 * TIDAK punya cara membacanya - justru itu tujuannya (token di `localStorage` bisa dicuri XSS).
 * Konsekuensinya, setelah reload halaman app tidak bisa tahu sendiri apakah sesinya masih hidup:
 * cookie yang kedaluwarsa atau sesi yang sudah di-revoke di server kelihatan sama saja dari sisi
 * klien (tidak ada cookie yang bisa dibaca). Tanpa endpoint ini, satu-satunya pilihan klien adalah
 * "anggap masih login" lalu tiba-tiba 401 di request pertama, atau "anggap logout" dan memaksa login
 * ulang padahal sesinya sehat. Endpoint ini yang menjawab pertanyaan itu di server, tempat
 * kebenarannya memang ada.
 *
 * Butuh sesi: auth di baris pertama. Tanpa cookie/bearer yang sah, `requireSession` melempar
 * `UNAUTHENTICATED` (401 lewat `defineApiHandler`) - jadi jawabannya bukan cuma "apa isi sesinya",
 * tapi juga "sesinya masih ada atau tidak" dalam satu panggilan.
 *
 * DTO disusun `sessionResultFrom`, bukan di route ini: bentuk respons adalah kontrak bersama dengan
 * mobile (`currentSessionResultSchema`), jadi ia harus hidup di satu tempat yang sama dengan DTO sesi
 * lain - bukan diulang di tiap handler yang kebetulan butuh.
 *
 * `no-store` seperti route auth lain: ini data per-user, dan cache (proxy maupun browser) yang
 * menyimpannya bisa menampilkan sesi user lain di perangkat bersama.
 *
 * Kenapa berlaku juga untuk mobile: `requireSession` menerima cookie ATAU bearer, jadi app native bisa
 * memakai endpoint yang sama untuk memeriksa token di SecureStore-nya masih diterima server. Bentuk
 * jawabannya sengaja tanpa `client` dan tanpa token - pembacaan sesi tidak butuh keduanya, dan token
 * yang ikut terkirim di sini justru token yang bisa dibaca JavaScript.
 */
export default defineApiHandler(async (event) => {
  const auth = await requireSession(event)

  setHeader(event, 'cache-control', 'no-store')

  return sessionResultFrom(auth)
})
