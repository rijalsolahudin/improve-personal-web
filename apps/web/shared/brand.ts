/**
 * Identitas BRAND - satu-satunya tempat nama aplikasi ditulis di kode.
 *
 * Nama ini belum final. Jadi tujuannya: begitu nama yang pas ketemu, yang perlu diganti cuma berkas ini
 * plus dua kunci di `i18n/locales/id.json` (`brand.*` dan `landing.*.copyright`) - bukan berburu literal
 * di seluruh repo.
 *
 * Aturan yang penting, dan ini pelajaran dari bug nyata di repo ini: **identifier teknis TIDAK BOLEH
 * diturunkan dari nama brand.** Nama database, cookie, penanda format berkas, dan konteks KDF hidup di
 * `./tech-identity.ts` dan sengaja dibekukan. Kalau nama DB ikut nama brand, setiap kali brand berganti,
 * data lokal user jadi yatim - dan itu pernah terjadi di sini.
 *
 * Nama yang dipakai UI tetap dari `i18n` (supaya bisa diterjemahkan/ganti tanpa build ulang); berkas ini
 * untuk tempat yang tidak lewat i18n: subjek email, nama passkey (RP name), teks error, dan nama berkas.
 */
export const BRAND = {
  /** Nama tampilan lengkap. Dipakai di subjek email dan pesan error. */
  name: 'Improve Personal',
  /** Bagian pertama nama (UI memecahnya untuk gaya dua warna: `<first><second>`). */
  first: 'Improve',
  /** Bagian kedua nama. */
  second: 'Personal',
  /** Dipakai untuk nama berkas unduhan (backup/envelope), bukan identifier teknis. */
  slug: 'improve-personal',
  /**
   * Nama yang muncul di dialog passkey/authenticator user (WebAuthn RP name + user name).
   * Disimpan di perangkat user saat kredensial dibuat, jadi menggantinya nanti bersifat kosmetik.
   */
  passkeyName: 'Improve Personal',
} as const

/** Subjek email OTP, memakai `BRAND.name` supaya ikut berubah saat nama diganti. */
export const MAIL_SUBJECTS = {
  login: `Kode masuk ${BRAND.name}`,
  delete_account: `Kode konfirmasi hapus akun ${BRAND.name}`,
} as const
