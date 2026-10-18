import { and, isNotNull, lt, sql } from 'drizzle-orm'

import { oauthStates } from '../db/schema'
import type { ServiceContext } from './context'
import { deleteExpiredOauthStates } from './google'
import { deleteExpiredKeyTransfers } from './keys'
import { deleteExpiredOtpChallenges } from './otp'
import { deleteOldRateLimits } from './rate-limit'

/**
 * Logika maintenance berkala (ARCHITECTURE.md §9, `docs/server.dbml`).
 *
 * Ini SATU-SATUNYA sumber implementasi purge/cleanup. Dua pemanggil memakai fungsi yang sama:
 * 1. Task Nitro (`server/tasks/purge-tombstones.ts`, `server/tasks/cleanup-ephemeral.ts`) - jalur
 *    Nitro yang butuh `nitro.experimental.tasks` menyala supaya task terdaftar.
 * 2. Cron HOST lewat `apps/web/scripts/task.ts` (`tsx`) - jalur yang benar-benar dipanggil crontab.
 *
 * Alasannya fungsi-fungsi di bawah menerima `ServiceContext` (bukan membaca `useRuntimeConfig`/
 * `useDatabase` sendiri): jalur Nitro merakit konteks dari request runtime, sedangkan jalur cron
 * merakitnya dari env proses - dan dua perakit konteks itu tidak boleh menghasilkan dua perilaku
 * maintenance yang berbeda. Di sini yang dibutuhkan cuma `ctx.db` dan `ctx.now`.
 *
 * Semua fungsi idempotent: panggilan kedua dalam rentang waktu yang sama menghapus 0 baris, jadi
 * aman di-retry atau dijalankan dua proses sekaligus.
 */

/** Retensi tombstone: 90 hari (ARCHITECTURE.md §9, `docs/server.dbml`). */
export const TOMBSTONE_RETENTION_DAYS = 90

/** Retensi `oauth_states`: 1 jam (dbml). TTL-nya sendiri cuma <= 10 menit. */
export const OAUTH_STATE_RETENTION_HOURS = 1

const MS_PER_DAY = 24 * 60 * 60 * 1000
const MS_PER_HOUR = 60 * 60 * 1000

export type PurgeTombstonesSummary = {
  /** Jumlah tombstone yang dihapus di jalannya kali ini. */
  readonly purgedRecords: number
  /** Jumlah user yang `purged_seq`-nya naik (dipakai hanya untuk laporan operasional). */
  readonly usersAdvanced: number
  /** Batas umur yang dipakai purge ini (ISO-8601), supaya operator bisa memverifikasi retensinya. */
  readonly cutoff: string
}

export type CleanupEphemeralSummary = {
  readonly otpChallenges: number
  readonly oauthStates: number
  readonly keyTransfers: number
  readonly rateLimits: number
}

/**
 * Hapus tombstone `records` yang sudah lewat 90 hari, lalu naikkan `sync_watermarks.purged_seq`.
 *
 * Kenapa harus satu transaksi:
 *
 * Tombstone (baris `records` dengan `deleted = true`) ikut disinkronkan supaya perangkat lain tahu
 * ada data yang dihapus. Kalau tombstone-nya dibuang TANPA memberi tahu siapa pun, perangkat yang
 * lama offline (cursor-nya masih di belakang) akan pull, tidak menemukan apa-apa, lalu saat dia push
 * versi lamanya yang masih hidup, record itu "hidup lagi" - zombie resurrection (ARCHITECTURE.md §9).
 *
 * Sabuk pengamannya `sync_watermarks.purged_seq`: nilai `server_seq` TERTINGGI yang sudah dipurge.
 * Karena itu purge dan kenaikan watermark HARUS satu transaksi: kalau dua langkah ini terpisah dan
 * prosesnya mati di antaranya, tombstone hilang sementara watermark belum naik - dan jendela itu
 * persis jendela zombie resurrection. Endpoint pull menolak cursor < `purged_seq` dengan
 * `409 SYNC_RESET_REQUIRED` (`server/services/sync.ts`), jadi klien yang ketinggalan melakukan full
 * resync alih-alih menghidupkan data yang sudah dihapus.
 *
 * Detail yang menentukan bentuk query ini:
 * - Satu statement (CTE), bukan SELECT-lalu-DELETE. Kalau max `server_seq` dihitung di query
 *   terpisah, ada jendela di antaranya di mana push paralel mengubah `updated_at` baris yang sudah
 *   "terpilih" - watermark bisa naik melewati tombstone yang sebenarnya tidak jadi dihapus, dan
 *   tombstones itu lalu hilang tanpa reset (bentuk lain dari zombie resurrection).
 * - `GREATEST(...)`: watermark HANYA boleh naik. Kalau turun, klien yang sudah lewat `purged_seq`
 *   lama akan diminta reset ulang tanpa alasan.
 * - Predikatnya (`deleted` + `updated_at < cutoff`) cocok dengan index partial
 *   `idx_records_purge` (lihat `server/db/migrations/0001_partial_indexes.sql`) supaya job harian ini
 *   tidak pernah memindai seluruh ciphertext `records`.
 *
 * Log: TIDAK mencatat id record, blob, atau user - yang dikembalikan cuma jumlah baris.
 */
export async function purgeTombstones(ctx: ServiceContext): Promise<PurgeTombstonesSummary> {
  const now = ctx.now
  const cutoff = new Date(now.getTime() - TOMBSTONE_RETENTION_DAYS * MS_PER_DAY)

  // Waktu dikirim sebagai ISO string + cast `::timestamptz`, BUKAN objek `Date`: driver drizzle
  // postgres-js pada jalur `execute()` meneruskan `Date` mentah ke encoder Node dan gagal
  // ("The string argument must be of type string ... Received an instance of Date"). String + cast
  // memberi hasil dan semantik yang sama tanpa bergantung pada perilaku driver itu.
  const cutoffIso = cutoff.toISOString()
  const nowIso = now.toISOString()

  const summary = await ctx.db.transaction(
    async (tx): Promise<Omit<PurgeTombstonesSummary, 'cutoff'>> => {
      const rows = await tx.execute<{ purgedRecords: number; usersAdvanced: number }>(sql`
      WITH purged AS (
        DELETE FROM records
        WHERE deleted AND updated_at < ${cutoffIso}::timestamptz
        RETURNING user_id, server_seq
      ), advanced AS (
        INSERT INTO sync_watermarks (user_id, purged_seq, updated_at)
        SELECT user_id, MAX(server_seq), ${nowIso}::timestamptz
        FROM purged
        GROUP BY user_id
        ON CONFLICT (user_id) DO UPDATE
          SET purged_seq = GREATEST(sync_watermarks.purged_seq, EXCLUDED.purged_seq),
              updated_at = EXCLUDED.updated_at
        RETURNING user_id
      )
      SELECT
        (SELECT COUNT(*)::int FROM purged) AS "purgedRecords",
        (SELECT COUNT(*)::int FROM advanced) AS "usersAdvanced"
    `)

      const first = rows[0]

      return {
        purgedRecords: first?.purgedRecords ?? 0,
        usersAdvanced: first?.usersAdvanced ?? 0,
      }
    },
  )

  return { ...summary, cutoff: cutoff.toISOString() }
}

/**
 * Buang `oauth_states` yang sudah dikonsumsi dan sudah lewat retensi.
 *
 * `deleteExpiredOauthStates` hanya membuang state yang BELUM dikonsumsi (`consumed_at IS NULL`)
 * dengan predikat `expires_at < now`. State yang sudah dikonsumsi ditandai, bukan dihapus, dan tidak
 * ada jalur lain yang membersihkannya - jadi tanpa tambahan ini tabel `oauth_states` tetap tumbuh
 * selama login Google masih dipakai. Sisanya ditahan 1 jam supaya debug login yang gagal masih punya
 * jejak singkat.
 */
async function deleteRetiredOauthStates(ctx: ServiceContext): Promise<number> {
  const cutoff = new Date(ctx.now.getTime() - OAUTH_STATE_RETENTION_HOURS * MS_PER_HOUR)

  const deleted = await ctx.db
    .delete(oauthStates)
    .where(and(isNotNull(oauthStates.consumedAt), lt(oauthStates.expiresAt, cutoff)))
    .returning({ stateHash: oauthStates.stateHash })

  return deleted.length
}

/**
 * Buang data berumur pendek sesuai catatan retensi `docs/server.dbml`.
 *
 * | Tabel | Retensi | Predikat |
 * |---|---|---|
 * | `otp_challenges` | 24 jam | `expires_at < now - 24 jam` |
 * | `oauth_states` | 1 jam | `expires_at < now` (belum dikonsumsi) + `expires_at < now - 1 jam` (sudah) |
 * | `key_transfers` | TTL-nya sendiri | `expires_at < now` |
 * | `rate_limits` | 24 jam | `window_start < now - 24 jam` |
 *
 * Semua tabel di atas isinya metadata operasional, bukan data user - tapi tetap ada alasannya cepat
 * dibuang: `otp_challenges`/`oauth_states` menyimpan hash kode dan verifier PKCE, `key_transfers`
 * menyimpan MK terenkripsi (TTL-nya cuma 2 menit!), dan `rate_limits` menyimpan hash email/IP yang
 * selalu bertambah karena bucket baru muncul terus. Tanpa job ini keempatnya tumbuh selamanya.
 *
 * Predikatnya TIDAK ditulis ulang di sini: yang dipakai adalah fungsi service yang sudah ada
 * (`deleteExpiredOtpChallenges` dan kawan-kawan) supaya definisi "kedaluwarsa" cuma ada satu tempat
 * dan tidak bisa berbeda antara jalur request dan jalur pembersihan.
 *
 * Log: yang dikembalikan cuma jumlah baris per tabel. Tidak ada email, kode OTP, state, atau blob
 * yang pernah masuk log (security.md §11).
 */
export async function cleanupEphemeral(ctx: ServiceContext): Promise<CleanupEphemeralSummary> {
  const otpChallenges = await deleteExpiredOtpChallenges(ctx)
  const openOauthStates = await deleteExpiredOauthStates(ctx)
  const retiredOauthStates = await deleteRetiredOauthStates(ctx)
  const keyTransfers = await deleteExpiredKeyTransfers(ctx)
  const rateLimits = await deleteOldRateLimits(ctx)

  return {
    otpChallenges,
    oauthStates: openOauthStates + retiredOauthStates,
    keyTransfers,
    rateLimits,
  }
}
