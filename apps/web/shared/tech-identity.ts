/**
 * Identitas TEKNIS: nama-nama yang tersimpan di perangkat user atau jadi bagian dari format.
 *
 * Semuanya sengaja NETRAL (prefix `ip`), bukan nama brand. Alasannya bukan kerapian semata: nilai-nilai
 * ini hidup lebih lama daripada nama aplikasi.
 *
 * ==============================  JANGAN DIUBAH TANPA MIGRASI  ==============================
 * Mengubah satu nilai di sini punya konsekuensi nyata ke user:
 *
 * - `cookieName`     : berubah = SEMUA sesi web langsung tidak valid (user ter-logout serentak).
 * - `databasePrefix` : berubah = data lokal user jadi YATIM (aplikasi tidak membukanya lagi).
 *                      Ini pernah terjadi di repo ini waktu penyimpanan masih memakai nama ber-brand.
 * - `keyDatabasePrefix`: sama, untuk pembuka kunci perangkat (kunci perangkat & petunjuk passkey).
 * - `writerLockName`: Web Locks; berubah = jaminan satu-penulis antar tab hilang di sesi lama.
 * - `backupCodePrefix`, `formatMarkers`: penanda FORMAT berkas. Berubah = berkas backup lama tidak dikenali.
 * - `passkeyKdfContext`: konteks KDF libsodium (WAJIB tepat 8 karakter). Berubah = SEMUA envelope passkey
 *                      yang sudah ada TIDAK BISA DIBUKA LAGI. Praktis tidak bisa diubah.
 *
 * Kalau memang harus berubah: tambahkan langkah migrasi (baca nama lama → tulis ke nama baru), dan untuk
 * `passkeyKdfContext`/`formatMarkers` perlakukan sebagai perubahan protokol, bukan sekadar rename.
 * ==========================================================================================
 */

/** Prefix teknis. Nama brand tidak boleh masuk ke sini. */
const TECH_PREFIX = 'ip'

export const TECH_IDENTITY = {
  cookieName: 'ip_session',
  databasePrefix: TECH_PREFIX,
  keyDatabasePrefix: `${TECH_PREFIX}-keys`,
  /** Awalan key `localStorage` milik app (dipakai `clearAppStorage` saat logout). */
  storagePrefix: `${TECH_PREFIX}-`,
  writerLockName: `${TECH_PREFIX}-writer`,
  backupCodePrefix: 'iprk1.',
  passkeyKdfContext: 'ip-passk',
  formatMarkers: {
    backup: `${TECH_PREFIX}-backup`,
    recoveryKey: `${TECH_PREFIX}-recovery-key`,
    recoveryEncrypted: `${TECH_PREFIX}-recovery-encrypted`,
  },
} as const

/**
 * Nama database lokal milik satu akun.
 *
 * `userId` disertakan supaya satu browser tidak pernah jadi satu bak data untuk semua akun (lihat
 * `storage/session.ts`). `label` memisahkan penyimpanan record dari penyimpanan kunci.
 */
export function localDatabaseNameFor(userId: string, label?: 'keys'): string {
  const base = label === 'keys' ? TECH_IDENTITY.keyDatabasePrefix : TECH_IDENTITY.databasePrefix
  return `${base}-${userId}`
}

/**
 * Nama lama (ber-brand) yang masih mungkin ada di perangkat user dari versi sebelumnya.
 *
 * Dipakai HANYA oleh migrasi sekali jalan; sengaja dikumpulkan di sini supaya nama lama tidak
 * berceceran di kode baru.
 */
export const LEGACY_DATABASE_NAMES = {
  /** Penyimpanan record ber-brand, sebelum dipisah per akun. Tidak bisa dipetakan ke akun mana pun. */
  unscopedRecord: 'improve-personal',
  unscopedKeys: 'improve-personal-keys',
  scopedRecordPrefix: 'improve-personal',
  scopedKeysPrefix: 'improve-personal-keys',
} as const
