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

export const PASSKEY_SKIP_STORAGE_KEY = 'ip-passkey-setup-skipped'

/**
 * Kunci `localStorage` untuk penanda "user melanjutkan tanpa passkey" milik satu akun.
 *
 * Dipakai `localStorage`, bukan tabel kunci: ini preferensi UI per-perangkat (seperti tema/hiasan),
 * bukan bahan kripto - dan `SecureKeyStore` sengaja hanya menerima slot yang dikenal
 * (`device`/`passkey`/`recovery`). Penandanya per akun karena satu browser bisa dipakai lebih dari satu
 * akun: "akun A tidak bisa memakai WebAuthn" bukan alasan membiarkan akun B melewati onboarding.
 *
 * Prefiksnya WAJIB `ip-` (sama dengan `TECH_IDENTITY.storagePrefix`): `clearAppStorage` menyapu key
 * ber-prefiks itu saat logout/hapus akun. Versi sebelumnya memakai `ip.` sehingga penandanya tertinggal
 * di perangkat - termasuk setelah akunnya dihapus.
 */
export function passkeySkipStorageKey(userId?: string | null): string {
  return userId === undefined || userId === null
    ? PASSKEY_SKIP_STORAGE_KEY
    : `${PASSKEY_SKIP_STORAGE_KEY}:${userId}`
}

export type PasskeySkipOptions = {
  /** Akun yang sedang login. Tanpa ini penanda lama (per-perangkat) tidak dihormati. */
  readonly userId?: string | null
  /**
   * Hasil `isWebAuthnAvailable()` di perangkat ini.
   *
   * Skip HANYA sah kalau perangkatnya memang tidak mendukung WebAuthn (PRD F15). Nilai di
   * `localStorage` bisa diubah siapa saja lewat console, jadi penanda itu tidak boleh jadi satu-satunya
   * penentu: kalau WebAuthn tersedia, onboarding tetap wajib.
   */
  readonly isSupported: boolean
  readonly storage?: Pick<Storage, 'getItem'>
}

export function readPasskeySkip(options: PasskeySkipOptions): boolean {
  if (options.isSupported) return false

  const target = options.storage ?? (typeof localStorage === 'undefined' ? undefined : localStorage)
  return target?.getItem(passkeySkipStorageKey(options.userId)) === '1'
}

export function writePasskeySkip(userId: string | null, storage?: Pick<Storage, 'setItem'>): void {
  const target = storage ?? (typeof localStorage === 'undefined' ? undefined : localStorage)
  target?.setItem(passkeySkipStorageKey(userId), '1')
}
