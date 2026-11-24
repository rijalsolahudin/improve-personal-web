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

/** Scope minimal yang dipakai endpoint (prompt T19). */
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
  /**
   * Per user: penerbitan token lisensi menulis DB (kunci baris + sisip aktivasi). Normalnya dipanggil
   * sekali per perangkat, jadi jatahnya kecil.
   */
  'license:token': { limit: 20, windowSeconds: 3600 },
  /**
   * Penyegaran token (publik, ADR 16): app memanggilnya paling sering sekali per start saat masa
   * aktif < 7 hari, jadi jatah per IP cukup longgar untuk satu rumah/kantor dengan banyak perangkat.
   */
  'license:refresh': { limit: 60, windowSeconds: 3600 },
  /**
   * Checkout publik: tiap checkout baru membuat payment request Mayar (yang mengirim email ke
   * pembeli). Per email menahan spam ke satu inbox; per IP menahan satu IP menyapu banyak email.
   */
  'purchase:email': { limit: 5, windowSeconds: 3600 },
  'purchase:ip': { limit: 20, windowSeconds: 3600 },
  /**
   * Koneksi relay sync per IP (ADR 17): tiap koneksi baru menyentuh DB (auth + flush antrean). Longgar
   * karena satu NAT operator bisa memuat banyak perangkat sah; yang ditahan hanya badai reconnect.
   */
  'sync:connect': { limit: 60, windowSeconds: 300 },
  /**
   * Kirim frame per perangkat. Client mem-debounce flush 2 detik, jadi pemakaian normal jauh di
   * bawahnya; jatah ini menahan perangkat yang macet dalam loop kirim.
   */
  'sync:send': { limit: 120, windowSeconds: 60 },
} as const

export type RateLimitScope = keyof typeof RATE_LIMIT_RULES

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
