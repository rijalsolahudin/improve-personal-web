import { defineConfig } from 'drizzle-kit'

/**
 * Konfigurasi drizzle-kit (`db:generate` + `db:migrate`).
 *
 * Ini TOOLING, bukan runtime Nitro. Karena itu kredensial dibaca dari `process.env` di sini, BUKAN
 * dari `useRuntimeConfig` - drizzle-kit jalan di luar proses server (CI, mesin developer, job
 * migrasi sekali jalan). Aturan security.md §1 (`secret` hanya lewat runtimeConfig) tetap berlaku
 * untuk kode yang jalan di dalam server; berkas ini tidak pernah masuk bundle Nitro.
 *
 * Urutan env yang dibaca:
 * 1. `DATABASE_URL` - konvensi drizzle-kit/CI.
 * 2. `NUXT_DATABASE_URL` - supaya satu nilai di `.env` cukup: Nitro sudah memakai nama itu untuk
 *    key privat `runtimeConfig.databaseUrl`.
 *
 * Tidak ada nilai default dan tidak ada kredensial di berkas ini: kalau env-nya kosong, konfigurasi
 * gagal keras dengan pesan yang hanya menyebut NAMA variabel. Nilai default yang "kelihatan praktis"
 * justru berbahaya - satu kali salah set, migrasi bisa dijalankan ke database yang salah.
 *
 * Catatan: drizzle-kit memuat berkas ini untuk SEMUA perintah, termasuk `db:generate` yang cuma
 * menulis SQL dan tidak menyentuh database. Jadi env harus terisi walau cuma generate.
 */

const DATABASE_URL = process.env.DATABASE_URL ?? process.env.NUXT_DATABASE_URL

if (!DATABASE_URL) {
  throw new Error(
    'DATABASE_URL (atau NUXT_DATABASE_URL) wajib diisi untuk menjalankan drizzle-kit. ' +
      'Untuk database test lokal: jalankan `db:test:create` lalu pakai ' +
      '`postgres://postgres:secret@127.0.0.1:5432/improve_personal_test` ' +
      '(database terpisah di container Postgres yang sudah jalan, bukan compose milik repo ini).',
  )
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './server/db/schema.ts',
  out: './server/db/migrations',
  dbCredentials: { url: DATABASE_URL },
  /**
   * Tabel pelacak migrasi. Skema `drizzle` dipisah dari skema `public` supaya tabel aplikasi
   * (`records`, `sessions`, ...) dan tabel internal tooling tidak pernah tercampur saat
   * memeriksa/mem-backup database. Ini default drizzle-kit, ditulis eksplisit supaya jelas.
   */
  migrations: { table: '__drizzle_migrations', schema: 'drizzle' },
})
