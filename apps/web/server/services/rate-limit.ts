import { lt, sql } from 'drizzle-orm'

import { apiProblem } from '../utils/api-error'
import { hmacSha256 } from '../utils/crypto'
import { rateLimits } from '../db/schema'
import type { ServiceContext } from './context'

/**
 * Rate limit fixed-window di POSTGRES - bukan memori.
 *
 * `apps/web/docs/server.dbml` menegaskan ini: penghitung di memori hanya benar kalau pod-nya satu.
 * Begitu ada dua pod, satu klien dapat jatah limit di masing-masing pod dan efektif jadi 3x. Karena
 * itu `security.rateLimiter` bawaan nuxt-security (in-memory) DIMATIKAN di `nuxt.config.ts` - kalau
 * dibiarkan menyala, rate limit akan tampak "ada" padahal tidak menghitung apa pun yang dibagi.
 *
 * Identifier tidak pernah disimpan polos: yang masuk tabel adalah `HMAC-SHA256(identifier,
 * RATE_LIMIT_PEPPER)`. Tabel `rate_limits` karenanya tidak bisa dipakai membaca email atau IP user.
 */

/** Scope minimal yang dipakai endpoint (prompt T19/T21). */
export const RATE_LIMIT_RULES = {
  /** Per alamat email: mencegah spam OTP ke satu inbox. */
  'otp:email': { limit: 5, windowSeconds: 900 },
  /** Per IP: mencegah satu IP menyapu banyak email sekaligus. */
  'otp:ip': { limit: 20, windowSeconds: 900 },
  /** Per email + IP: mencegah brute-force kode. */
  'otp:verify': { limit: 10, windowSeconds: 900 },
  'google:start:ip': { limit: 20, windowSeconds: 900 },
  /**
   * Per IP: callback OAuth adalah endpoint PUBLIK yang punya biaya nyata (satu panggilan keluar ke
   * token endpoint Google + upsert user). Tanpa limiter, siapa pun bisa memakainya sebagai pengganda
   * beban - dan `state` yang tidak dikenal pun sampai menyentuh DB.
   */
  'google:callback:ip': { limit: 60, windowSeconds: 900 },
  /** Push jalan tiap beberapa detik saat app aktif, jadi jatahnya per menit. */
  'sync:push': { limit: 120, windowSeconds: 60 },
  /**
   * Per user (temuan H2/M4 audit keamanan): pull TIDAK dibatasi per menit karena perangkat yang baru
   * bangun dari offline memang perlu menarik banyak halaman. Jatahnya per jam dan longgar - yang
   * menutup DoS memori adalah plafon byte halaman (`SYNC_MAX_PULL_BYTES`), limiter ini yang menutup
   * penyalahgunaan egress/CPU tanpa henti.
   */
  'sync:pull': { limit: 600, windowSeconds: 3600 },
  'keys:envelope': { limit: 30, windowSeconds: 3600 },
  'account:delete': { limit: 5, windowSeconds: 3600 },
  /**
   * Per user: pembuatan baris `key_transfers` tanpa batas = abuse storage + beban job cleanup
   * (temuan M4). Jatahnya cukup untuk alur nyata (menitipkan kunci ke perangkat baru), tapi tidak
   * untuk script yang membuat 10 ribu baris.
   */
  'keys:transfer-create': { limit: 30, windowSeconds: 3600 },
  /**
   * Per user: klaim transfer. Menebak id 128-bit tidak praktis, tapi tanpa limiter endpoint ini
   * gratis untuk menghantam DB berulang kali.
   */
  'keys:transfer-claim': { limit: 60, windowSeconds: 3600 },
  /** Per user: revoke perangkat menulis DB (soft-revoke + tutup sesi dalam satu transaksi). */
  'devices:revoke': { limit: 60, windowSeconds: 3600 },
} as const

export type RateLimitScope = keyof typeof RATE_LIMIT_RULES

/** Scope yang bucket-nya per user (jalur yang sudah butuh sesi), bukan per IP/email. */
const USER_SCOPED: readonly RateLimitScope[] = [
  'sync:push',
  'sync:pull',
  'keys:envelope',
  'keys:transfer-create',
  'keys:transfer-claim',
  'devices:revoke',
  'account:delete',
]

export function isUserScopedScope(scope: RateLimitScope): boolean {
  return USER_SCOPED.includes(scope)
}

/**
 * Naikkan penghitung scope ini, dan LEMPAR `RATE_LIMITED` kalau jatahnya habis.
 *
 * Lempar-lempar di sini disengaja: memaksa setiap handler mengingat pengecekan berarti satu handler
 * baru cukup lupa sekali untuk jadi jalur tanpa batas. Yang mengubahnya jadi respons HTTP adalah
 * `defineApiHandler`.
 */
export async function consumeRateLimit(
  ctx: ServiceContext,
  scope: RateLimitScope,
  identifier: string,
): Promise<void> {
  const rule = RATE_LIMIT_RULES[scope]
  const windowMs = rule.windowSeconds * 1000
  const nowMs = ctx.now.getTime()

  // Fixed window: awal jendela dibulatkan ke bawah, jadi nilainya sama untuk semua pod tanpa jam
  // bersama. `Date` dikirim eksplisit (bukan `now()` di SQL) supaya test bisa menggeser waktu.
  const windowStart = new Date(Math.floor(nowMs / windowMs) * windowMs)
  const bucket = hmacSha256(identifier, ctx.env.rateLimitPepper)

  const rows = await ctx.db
    .insert(rateLimits)
    .values({ scope, bucket, windowStart, count: 1 })
    .onConflictDoUpdate({
      target: [rateLimits.scope, rateLimits.bucket, rateLimits.windowStart],
      set: { count: sql`${rateLimits.count} + 1` },
    })
    .returning({ count: rateLimits.count })

  const count = rows[0]?.count
  if (count === undefined) throw apiProblem('INTERNAL')

  if (count > rule.limit) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((windowStart.getTime() + windowMs - nowMs) / 1000),
    )
    throw apiProblem('RATE_LIMITED', { headers: { 'retry-after': String(retryAfterSeconds) } })
  }
}

/** Retensi baris `rate_limits`: 24 jam (dbml). Window terpanjang di atas cuma 1 jam. */
const RATE_LIMIT_RETENTION_HOURS = 24

/**
 * Buang window yang sudah lampau.
 *
 * Tanpa ini tabel `rate_limits` tumbuh selamanya: setiap (scope, bucket, window) meninggalkan satu
 * baris, dan bucket berisi hash IP/email baru terus muncul. Dipakai task `cleanup-ephemeral`.
 */
export async function deleteOldRateLimits(ctx: ServiceContext): Promise<number> {
  const cutoff = new Date(ctx.now.getTime() - RATE_LIMIT_RETENTION_HOURS * 3_600_000)

  const deleted = await ctx.db
    .delete(rateLimits)
    .where(lt(rateLimits.windowStart, cutoff))
    .returning({ bucket: rateLimits.bucket })

  return deleted.length
}
