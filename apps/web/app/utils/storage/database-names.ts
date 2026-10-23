import { ENTITY_TYPES, type StorageAdapter } from '@improve-personal/core'

import { localDatabaseNameFor } from '#shared/tech-identity'

/**
 * Nama database lokal + penjaga `userId` + pemeriksa isi penyimpanan.
 *
 * Kenapa dipisah dari `session.ts`: fungsi-fungsi ini murni dan dipakai juga oleh komposabel yang
 * TIDAK membuka sesi data (layar pemulihan kunci, tambah perangkat). Selama mereka mengimpor
 * `session.ts`, modul sesi (adaptor IndexedDB + kripto + repository, ~49 KB gzip) tidak akan pernah
 * bisa di-`import()` malas - Rollup menaruhnya kembali ke bundel awal dan halaman `/login` ikut
 * membayarnya. Lihat `storage/session.ts` untuk catatan lengkap alur kuncinya.
 */

const USER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * `userId` WAJIB UUID dari sesi server.
 *
 * Nilainya masuk ke nama database, jadi nilai bebas di situ adalah cara paling halus membuat dua akun
 * berbagi satu bak data - atau satu akun punya beberapa bak - tanpa ada yang sadar. Ditolak dengan pesan
 * jelas, bukan dibersihkan diam-diam.
 */
export function assertUserId(userId: string): string {
  if (!USER_ID_PATTERN.test(userId)) {
    throw new Error(
      'userId harus UUID dari sesi server: penyimpanan lokal tidak boleh dibuka tanpa akun yang jelas',
    )
  }

  return userId.toLowerCase()
}

/** Nama database record milik satu akun (prefix netral: lihat `shared/tech-identity.ts`). */
export function localDatabaseName(userId: string): string {
  return localDatabaseNameFor(assertUserId(userId))
}

/** Nama database kunci milik satu akun (pembuka perangkat juga dipisah per akun). */
export function keyDatabaseName(userId: string): string {
  return localDatabaseNameFor(assertUserId(userId), 'keys')
}

/**
 * Apakah penyimpanan sudah berisi record - dipakai untuk MENOLAK pembuatan kunci utama baru.
 *
 * Port `StorageAdapter` sengaja tidak punya "hitung semua record" (menambahkannya berarti mengubah
 * kontrak bersama yang juga dipegang adapter mobile). Yang tersedia adalah index per tipe, jadi tipe
 * entitas diperiksa satu per satu: 20 pembacaan index kecil, sekali per sesi, dan hasilnya hanya
 * dipakai saat slot pembuka perangkat kosong.
 *
 * Diekspor karena alur tambah perangkat membutuhkan pertanyaan yang sama sebelum MENIMPA pembuka
 * perangkat yang sudah ada: menimpanya saat ada record berarti record itu tidak akan bisa dibuka lagi.
 */
export async function hasStoredRecords(storage: StorageAdapter): Promise<boolean> {
  for (const type of ENTITY_TYPES) {
    if ((await storage.listIndexByType(type)).length > 0) return true
  }

  return false
}
