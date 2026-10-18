import type { BackupRecord } from './backup.ts'

/**
 * Migrasi versi skema payload (ARCHITECTURE.md §4: `io/` = "import/export JSON + validasi skema +
 * migrasi versi", PRD F10 "Validasi: schema match (version check)").
 *
 * Aturannya:
 * - **Berkas versi LEBIH BARU dari `CURRENT_SCHEMA_VERSION` ditolak.** Bukan ditebak-tebak, bukan
 *   "coba saja dibaca sebagian" - user diminta upgrade app.
 * - **Berkas versi LEBIH LAMA dimigrasikan**, dan seluruh migrasi harus ada. Kalau ada langkah yang
 *   hilang, import DITOLAK (`NO_MIGRATION_PATH`) - bukan dilewatkan diam-diam.
 * - Migrasi dijalankan **sebelum** validasi payload per tipe? Tidak: lihat `io/import.ts` - berkas
 *   divalidasi bentuknya dulu (envelope + versi), lalu dimigrasikan, lalu payload hasil migrasi
 *   divalidasi penuh per tipe. Urutan itu yang membuat berkas rusak tidak pernah menyentuh data.
 *
 * Daftar `SCHEMA_MIGRATIONS` sengaja kosong SEKARANG karena `CURRENT_SCHEMA_VERSION` masih 1: tidak
 * ada versi lama untuk dimigrasikan. Jalur migrasinya tetap ada, dipakai, dan diuji (test
 * meng-inject daftar migrasi sendiri), sehingga saat versi skema naik tinggal menambah satu entri di
 * sini - bukan membangun mekanismenya dari nol di tengah rilis.
 */

/** Satu langkah migrasi: dari versi `from` ke versi `to`. Satu langkah = satu kenaikan angka. */
export type SchemaMigration = {
  readonly from: number
  readonly to: number
  /** Keterangan singkat; muncul di log/diagnostik, bukan pesan ke user. */
  readonly description: string
  /** Ubah satu record. Harus murni: tanpa I/O, tanpa jam, tanpa randomness. */
  readonly migrate: (record: BackupRecord) => BackupRecord
}

/** Migrasi yang dikenal build ini. Tambah entri di sini bersamaan dengan menaikkan versi skema. */
export const SCHEMA_MIGRATIONS: readonly SchemaMigration[] = []

export type MigrationResult =
  | { readonly ok: true; readonly records: readonly BackupRecord[] }
  | {
      readonly ok: false
      readonly reason: 'NO_MIGRATION_PATH'
      readonly from: number
      readonly to: number
      /** Versi yang berhasil dicapai sebelum jalurnya buntu. */
      readonly reached: number
    }

/**
 * Naikkan semua record dari `fromVersion` ke `toVersion`.
 *
 * Dipakai `io/import.ts` untuk setiap berkas dengan `schemaVersion` lebih lama. Jalur migrasi
 * dicari langkah demi langkah (`from` harus sama persis), jadi urutan langkahnya eksplisit - tidak
 * ada "lompat versi" yang mengandaikan langkah yang mungkin tidak pernah ada.
 */
export function migrateRecords(input: {
  readonly records: readonly BackupRecord[]
  readonly fromVersion: number
  readonly toVersion: number
  readonly migrations?: readonly SchemaMigration[]
}): MigrationResult {
  const migrations = input.migrations ?? SCHEMA_MIGRATIONS

  let version = input.fromVersion
  let records = input.records

  // Satu langkah per kenaikan versi; pagar ini menahan daftar migrasi yang siklik.
  const maxSteps = migrations.length + 1

  for (let step = 0; step < maxSteps; step += 1) {
    if (version === input.toVersion) return { ok: true, records }
    if (version > input.toVersion) {
      return {
        ok: false,
        reason: 'NO_MIGRATION_PATH',
        from: input.fromVersion,
        to: input.toVersion,
        reached: version,
      }
    }

    const migration = migrations.find((candidate) => candidate.from === version)
    if (migration === undefined) {
      return {
        ok: false,
        reason: 'NO_MIGRATION_PATH',
        from: input.fromVersion,
        to: input.toVersion,
        reached: version,
      }
    }

    records = records.map((record) => migration.migrate(record))
    version = migration.to
  }

  return {
    ok: false,
    reason: 'NO_MIGRATION_PATH',
    from: input.fromVersion,
    to: input.toVersion,
    reached: version,
  }
}
