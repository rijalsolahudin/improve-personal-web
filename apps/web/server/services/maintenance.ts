import { and, isNotNull, lt } from 'drizzle-orm'

import { oauthStates } from '../db/schema'
import type { ServiceContext } from './context'
import { deleteExpiredOauthStates } from './google'
import { deleteExpiredOtpChallenges } from './otp'
import { deleteOldRateLimits } from './rate-limit'

/**
 * Logika maintenance berkala (ARCHITECTURE.md §9, `docs/server.dbml`).
 *
 * Ini SATU-SATUNYA sumber implementasi purge/cleanup. Dua pemanggil memakai fungsi yang sama:
 * 1. Task Nitro (`server/tasks/cleanup-ephemeral.ts`) - jalur
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

/** Retensi `oauth_states`: 1 jam (dbml). TTL-nya sendiri cuma <= 10 menit. */
export const OAUTH_STATE_RETENTION_HOURS = 1

const MS_PER_HOUR = 60 * 60 * 1000

export type CleanupEphemeralSummary = {
  readonly otpChallenges: number
  readonly oauthStates: number
  readonly rateLimits: number
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
 * | `rate_limits` | 24 jam | `window_start < now - 24 jam` |
 *
 * Semua tabel di atas isinya metadata operasional, bukan data user - tapi tetap ada alasannya cepat
 * dibuang: `otp_challenges`/`oauth_states` menyimpan hash kode dan verifier PKCE, dan `rate_limits`
 * menyimpan hash email/IP yang selalu bertambah karena bucket baru muncul terus. Tanpa job ini
 * ketiganya tumbuh selamanya.
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
  const rateLimits = await deleteOldRateLimits(ctx)

  return {
    otpChallenges,
    oauthStates: openOauthStates + retiredOauthStates,
    rateLimits,
  }
}
