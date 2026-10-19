import type { LocalDataStatus } from '~/composables/useLocalData'

/**
 * Kapan user ditahan di layar "aktifkan Face ID/passkey" (ARCHITECTURE §7, ADR 10-12).
 *
 * Kenapa tetap ada layar wajib, padahal sebelumnya user diminta menulis 24 kata:
 *
 * Kunci utama dibuat acak di perangkat dan **tidak pernah dikirim ke server**. Jadi kalau perangkat ini
 * hilang tanpa pembuka lain, datanya hilang permanen - tidak ada layanan, termasuk kita, yang bisa
 * mengembalikannya. Pembuka "lain" itu sekarang **passkey**: user menyentuh Face ID sekali, envelope-nya
 * dititip ke server, dan PRF dari authenticator tidak pernah keluar dari perangkat. Nol tulisan tangan.
 *
 * Yang diuji di sini adalah ATURAN-nya; tampilan & penjagaan keyboard ada di
 * `PasskeyOnboarding.vue`. Satu test di `passkey-setup.test.ts` sengaja mengunci daftar pembuka yang
 * dianggap sah, supaya "ternyata tidak ada jalan pulih" tidak bisa terjadi diam-diam.
 */

/**
 * Apakah user harus ditahan di layar onboarding.
 *
 * Sengaja TIDAK memaksa saat data lokal belum siap (`idle`/`loading`/`error`): pada kondisi itu kunci
 * belum bisa dibuat sama sekali, dan menahan user dengan dialog yang tidak bisa diselesaikan lebih buruk
 * daripada membiarkannya melihat pesan error yang jelas.
 */
export function shouldForcePasskeyOnboarding(input: {
  readonly localDataStatus: LocalDataStatus
  readonly hasPasskey: boolean
  /**
   * User pernah memilih melanjutkan tanpa passkey (hanya mungkin saat perangkatnya memang tidak
   * mendukung). Tanpa ini, perangkat tanpa WebAuthn jadi jalan buntu: dialog wajib yang tidak punya
   * cara diselesaikan.
   */
  readonly hasSkipped?: boolean
}): boolean {
  if (input.hasPasskey || input.hasSkipped === true) return false

  return input.localDataStatus === 'ready'
}

/** Pesan error yang layak ditampilkan kalau passkey tidak bisa dipakai di lingkungan ini. */
export const PASSKEY_UNAVAILABLE_HINT =
  'Perangkat/browser ini belum bisa dipakai untuk passkey (butuh WebAuthn + koneksi aman). Coba browser lain, atau buka lewat HTTPS.'

/**
 * Kunci `localStorage` untuk penanda "user melanjutkan tanpa passkey".
 *
 * Dipakai `localStorage`, bukan tabel kunci: ini preferensi UI per-perangkat (seperti tema/hiasan), bukan
 * bahan kripto - dan `SecureKeyStore` sengaja hanya menerima slot yang dikenal (`device`/`passkey`/
 * `recovery`).
 */
export const PASSKEY_SKIP_STORAGE_KEY = 'ip.passkeySetupSkipped'

export function readPasskeySkip(storage?: Pick<Storage, 'getItem'>): boolean {
  const target = storage ?? (typeof localStorage === 'undefined' ? undefined : localStorage)
  return target?.getItem(PASSKEY_SKIP_STORAGE_KEY) === '1'
}

export function writePasskeySkip(storage?: Pick<Storage, 'setItem'>): void {
  const target = storage ?? (typeof localStorage === 'undefined' ? undefined : localStorage)
  target?.setItem(PASSKEY_SKIP_STORAGE_KEY, '1')
}
