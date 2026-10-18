import {
  OTP_RESEND_COOLDOWN_SECONDS,
  OTP_TTL_SECONDS,
  type OtpPurpose,
} from '@improve-personal/contracts'
import { and, desc, eq, gt, isNull, lt, sql } from 'drizzle-orm'

import { otpChallenges } from '../db/schema'
import { apiProblem } from '../utils/api-error'
import { hmacSha256, randomOtpCode, safeEqualHex } from '../utils/crypto'
import { secondsToMs, uuidv7 } from '../utils/uuid'
import type { ServiceContext } from './context'
import type { OtpMailer } from './mailer'
import { consumeRateLimit } from './rate-limit'
import { findOrCreateUserByEmail } from './user'

/**
 * OTP email (PRD F15, T19).
 *
 * Yang dipegang di seluruh berkas ini:
 * - `email` TIDAK PERNAH disimpan polos: yang masuk tabel hanya `HMAC-SHA256(email, OTP_PEPPER)`.
 *   Dengan begitu tabel `otp_challenges` tidak bisa dipakai menghitung email terdaftar.
 * - Kode juga hanya sebagai hash, dibandingkan `timingSafeEqual` lewat `safeEqualHex`.
 * - Konsumsi kode ATOMIK (`UPDATE ... WHERE consumed_at IS NULL ... RETURNING`). Dua verify paralel
 *   dengan kode yang sama harus menghasilkan tepat satu sesi - bukan dua.
 * - Respons selalu generik: permintaan kode untuk email terdaftar maupun tidak sama saja (204 tanpa
 *   body). Endpoint ini tidak boleh jadi cara mengetahui email mana yang punya akun.
 * - Kode TIDAK PERNAH dicatat. Jalur mailer pun tidak menerima logger.
 */

/**
 * Kode OTP fix untuk non-production (PRD F15 "OTP per Environment").
 *
 * Nilai ini HANYA dipakai kalau `env.fixedOtpEnabled`, dan itu murni turunan `APP_ENV` yang eksplisit
 * non-production - tidak ada header/query/flag client yang bisa menyalakannya (fail-closed).
 */
export const FIXED_OTP_CODE = '777777'

/** Batas percobaan salah per challenge (PRD F15 "rate limit per email (prevent brute force)"). */
export const OTP_MAX_ATTEMPTS = 5

export type RequestOtpInput = {
  readonly email: string
  readonly purpose: OtpPurpose
  readonly mailer: OtpMailer
}

/**
 * Buat + kirim kode OTP.
 *
 * Di dalam cooldown 30 detik, kode baru TIDAK dibuat dan email tidak dikirim - tapi responsnya tetap
 * sama (generic), dan rate limit tetap dihitung. Yang membedakan hanya ada/tidaknya email berikutnya,
 * bukan bentuk jawaban server.
 */
export async function requestOtp(ctx: ServiceContext, input: RequestOtpInput): Promise<void> {
  const emailHash = hmacSha256(input.email, ctx.env.otpPepper)

  await consumeRateLimit(ctx, 'otp:email', `email:${emailHash}`)
  if (ctx.clientIp) await consumeRateLimit(ctx, 'otp:ip', `ip:${ctx.clientIp}`)

  const cooldownStart = new Date(ctx.now.getTime() - secondsToMs(OTP_RESEND_COOLDOWN_SECONDS))
  const pending = await ctx.db
    .select({ id: otpChallenges.id })
    .from(otpChallenges)
    .where(
      and(
        eq(otpChallenges.emailHash, emailHash),
        eq(otpChallenges.purpose, input.purpose),
        gt(otpChallenges.createdAt, cooldownStart),
      ),
    )
    .limit(1)

  if (pending.length > 0) return

  const code = ctx.env.fixedOtpEnabled ? FIXED_OTP_CODE : randomOtpCode()

  await ctx.db.insert(otpChallenges).values({
    id: uuidv7(ctx.now.getTime()),
    emailHash,
    codeHash: hmacSha256(code, ctx.env.otpPepper),
    purpose: input.purpose,
    ipHash: ctx.clientIp ? hmacSha256(ctx.clientIp, ctx.env.rateLimitPepper) : null,
    attempts: 0,
    createdAt: ctx.now,
    expiresAt: new Date(ctx.now.getTime() + secondsToMs(OTP_TTL_SECONDS)),
  })

  await input.mailer.sendOtp({ to: input.email, code, purpose: input.purpose })
}

export type VerifyOtpInput = {
  readonly email: string
  readonly code: string
  readonly purpose: OtpPurpose
}

/**
 * Tukar kode jadi akun.
 *
 * Urutan pengecekannya sengaja: challenge -> kedaluwarsa -> batas percobaan -> banding hash ->
 * konsumsi atomik. Konsumsi paling AKHIR supaya kode yang salah tidak "menghabiskan" challenge yang
 * masih bisa dipakai user dengan kode yang benar.
 */
export async function verifyOtp(
  ctx: ServiceContext,
  input: VerifyOtpInput,
): Promise<{ userId: string }> {
  const emailHash = hmacSha256(input.email, ctx.env.otpPepper)
  const ipHash = ctx.clientIp ? hmacSha256(ctx.clientIp, ctx.env.rateLimitPepper) : 'tanpa-ip'

  await consumeRateLimit(ctx, 'otp:verify', `verify:${emailHash}:${ipHash}`)

  const rows = await ctx.db
    .select()
    .from(otpChallenges)
    .where(
      and(
        eq(otpChallenges.emailHash, emailHash),
        eq(otpChallenges.purpose, input.purpose),
        isNull(otpChallenges.consumedAt),
      ),
    )
    .orderBy(desc(otpChallenges.createdAt))
    .limit(1)

  const challenge = rows[0]
  if (!challenge) throw apiProblem('OTP_INVALID')
  if (challenge.expiresAt.getTime() <= ctx.now.getTime()) throw apiProblem('OTP_EXPIRED')
  if (challenge.attempts >= OTP_MAX_ATTEMPTS) throw apiProblem('OTP_INVALID')

  if (!safeEqualHex(challenge.codeHash, hmacSha256(input.code, ctx.env.otpPepper))) {
    await ctx.db
      .update(otpChallenges)
      .set({ attempts: sql`${otpChallenges.attempts} + 1` })
      .where(eq(otpChallenges.id, challenge.id))

    throw apiProblem('OTP_INVALID')
  }

  const consumed = await ctx.db
    .update(otpChallenges)
    .set({ consumedAt: ctx.now })
    .where(
      and(
        eq(otpChallenges.id, challenge.id),
        isNull(otpChallenges.consumedAt),
        gt(otpChallenges.expiresAt, ctx.now),
      ),
    )
    .returning({ id: otpChallenges.id })

  // Kosong = challenge sudah dikonsumsi request lain (atau kedaluwarsa di antara SELECT dan UPDATE).
  // Justru inilah yang membuat "dua verify paralel dengan kode sama -> tepat satu sukses" benar.
  if (consumed.length === 0) throw apiProblem('OTP_INVALID')

  const user = await findOrCreateUserByEmail(ctx, input.email)
  return { userId: user.id }
}

/** Retensi baris `otp_challenges`: 24 jam (dbml). Dipakai task `cleanup-ephemeral`. */
const OTP_RETENTION_HOURS = 24

/**
 * Buang challenge OTP yang sudah lewat retensi.
 *
 * Yang dihapus berbasis `expires_at`, bukan `consumed_at`: challenge yang tidak pernah dicoba pun
 * harus hilang, dan 24 jam jauh lebih lama dari TTL 10 menit sehingga tidak ada challenge hidup yang
 * ikut terhapus.
 */
export async function deleteExpiredOtpChallenges(ctx: ServiceContext): Promise<number> {
  const cutoff = new Date(ctx.now.getTime() - OTP_RETENTION_HOURS * 3_600_000)

  const deleted = await ctx.db
    .delete(otpChallenges)
    .where(lt(otpChallenges.expiresAt, cutoff))
    .returning({ id: otpChallenges.id })

  return deleted.length
}
