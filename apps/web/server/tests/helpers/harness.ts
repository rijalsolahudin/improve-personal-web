import { randomInt, randomUUID } from 'node:crypto'

import { eq, inArray } from 'drizzle-orm'
import postgres from 'postgres'

import { closeAllDatabases, databaseFor, type ServerDatabase } from '../../db/client'
import { otpChallenges, rateLimits, users } from '../../db/schema'
import type { ServiceContext } from '../../services/context'
import { resolveDeviceForLogin } from '../../services/device'
import type { OtpMail, OtpMailer } from '../../services/mailer'
import type { RateLimitScope } from '../../services/rate-limit'
import { issueSession } from '../../services/session'
import { findOrCreateUserByEmail } from '../../services/user'
import { hmacSha256 } from '../../utils/crypto'
import { resolveServerEnv, type ServerEnv } from '../../utils/env'

export type { ServerEnv }

/**
 * Harness test server (T19 & T21).
 *
 * Berkas ini HANYA berisi helper: tidak ada `it()` di sini, jadi tidak dijalankan sebagai test.
 *
 * Yang dipegang:
 * - Postgres test dari container layanan lokal yang sudah jalan di mesin ini (`local-postgres`,
 *   port 5432, database `improve_personal_test`; dibuat oleh `db:test:create`). TIDAK ada mock
 *   database: seluruh AC logika diuji terhadap DB nyata supaya sifat atomik
 *   (`UPDATE ... WHERE ... RETURNING`), unique index, dan cascade benar-benar terbukti, bukan
 *   diasumsikan.
 * - Mock HANYA di batas keluar: mailer (SMTP/Resend) dan Google. Itu sebabnya `capturingMailer()`
 *   ada di sini.
 * - Nilai rahasia di bawah khusus test lokal dan tidak dipakai di luar mesin developer.
 * - Setiap test memakai email + IP unik (`newEmail()`/`newClientIp()`), dan `fixture.cleanup()`
 *   membuang barisnya sendiri. Dengan begitu satu berkas test bisa dijalankan berulang kali tanpa
 *   saldo data, dan dua berkas test tidak saling menghapus data yang sedang dipakai.
 */

/**
 * Database test: database TERPISAH di Postgres lokal (`db:test:create`), bukan database app.
 *
 * Sengaja TIDAK membaca `NUXT_DATABASE_URL`: test membuang baris datanya sendiri, dan env itu justru
 * menunjuk database dev/produksi milik app - satu salah set, test bisa menyentuh data nyata. Kalau
 * perlu database test lain, isi `TEST_DATABASE_URL`.
 */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://postgres:secret@127.0.0.1:5432/improve_personal_test'

/** Pepper khusus test (>= 32 karakter). Bukan nilai produksi apa pun. */
export const TEST_OTP_PEPPER = 'qa-test-otp-pepper-000000000000000000000000'
export const TEST_RATE_LIMIT_PEPPER = 'qa-test-rate-limit-pepper-0000000000000000000'

/** Redirect URI Google khusus test; cukup URL lengkap karena tidak pernah dipanggil ke Google. */
export const TEST_GOOGLE_REDIRECT_URI = 'https://qa.test/v1/auth/google/callback'

/** Env yang dibaca Nitro lewat key privat `runtimeConfig` (`NUXT_*`). */
export const TEST_ENV_VARS = {
  NUXT_APP_ENV: 'test',
  NUXT_DATABASE_URL: TEST_DATABASE_URL,
  NUXT_OTP_PEPPER: TEST_OTP_PEPPER,
  NUXT_RATE_LIMIT_PEPPER: TEST_RATE_LIMIT_PEPPER,
  NUXT_TRUSTED_PROXY_HOPS: '0',
  NUXT_GOOGLE_CLIENT_ID: 'qa-google-client-id',
  NUXT_GOOGLE_CLIENT_SECRET: 'qa-google-client-secret',
  NUXT_GOOGLE_REDIRECT_URI_WEB: TEST_GOOGLE_REDIRECT_URI,
  NUXT_GOOGLE_REDIRECT_URI_MOBILE: TEST_GOOGLE_REDIRECT_URI,
} as const

// Diisi saat modul ini di-import - SEBELUM `setup()` membangun instance Nitro pada test HTTP.
for (const [name, value] of Object.entries(TEST_ENV_VARS)) {
  process.env[name] ??= value
}

/**
 * Transport email DIPAKSA kosong di runtime test, dan sengaja bukan `??=`.
 *
 * Seluruh test login memakai kode fix (`FIXED_OTP_CODE`) supaya tidak bergantung pada inbox mana pun -
 * dan kode fix hanya hidup kalau TIDAK ada transport email (`isFixedOtpEnabled`). Masalahnya,
 * `NUXT_SMTP_URL` di `.env` developer ikut terbaca: `nuxt build` memuat `.env`, dan proses test
 * mewarisi env itu, jadi tanpa baris ini suite test tiba-tiba mengirim email sungguhan lewat Mailpit
 * dan semua test kode fix gagal (`expected 400 to be 200`) - tergantung apa yang ada di mesin orang.
 *
 * Ditulis sebagai assignment biasa (bukan `??=`) justru karena yang ditutup adalah nilai yang SUDAH
 * ada di environment. Test yang butuh jalur SMTP mengujinya di level service dengan transport
 * disuntik (`otp.test.ts`), bukan lewat HTTP - jadi tidak ada cakupan yang hilang.
 */
process.env.NUXT_SMTP_URL = ''

/** Waktu tetap: TTL/expiry diuji dengan menggeser `ctx.now`, bukan `setTimeout`. */
export const FIXED_NOW = new Date('2026-05-01T10:00:00.000Z')

/** Semua field wajib schema env, dengan nilai test. `overrides` dipakai test negatif. */
export function makeEnv(overrides: Record<string, unknown> = {}): ServerEnv {
  return resolveServerEnv({
    appEnv: 'test',
    databaseUrl: TEST_DATABASE_URL,
    otpPepper: TEST_OTP_PEPPER,
    rateLimitPepper: TEST_RATE_LIMIT_PEPPER,
    googleClientId: 'qa-google-client-id',
    googleClientSecret: 'qa-google-client-secret',
    googleRedirectUriWeb: TEST_GOOGLE_REDIRECT_URI,
    googleRedirectUriMobile: TEST_GOOGLE_REDIRECT_URI,
    ...overrides,
  })
}

let cachedDb: ServerDatabase | null = null

/** Satu pool per proses test (sama seperti server: `server/db/client.ts` men-cache per URL). */
export function testDb(): ServerDatabase {
  cachedDb ??= databaseFor(TEST_DATABASE_URL)
  return cachedDb
}

/** Tutup pool di `afterAll` supaya proses Vitest tidak menggantung. */
export async function closeTestDb(): Promise<void> {
  cachedDb = null
  await closeAllDatabases()
}

const EMAIL_DOMAIN = 'qa.test'

/** Email unik per test: membedakan data satu test dari test lain tanpa truncate tabel. */
export function newEmail(prefix = 'qa'): string {
  return `${prefix}-${randomUUID()}@${EMAIL_DOMAIN}`
}

/**
 * IP unik per test.
 *
 * Penting untuk rate limit: scope `otp:ip` dihitung per IP dalam fixed window 15 menit. Kalau semua
 * test memakai IP yang sama, run berulang kali bisa menabrak jatah 20 dan hasilnya flaky padahal
 * kodenya benar.
 */
export function newClientIp(): string {
  return `198.18.${randomInt(0, 256)}.${randomInt(1, 255)}`
}

export type CapturingMailer = {
  readonly mailer: OtpMailer
  readonly mails: OtpMail[]
}

/**
 * Mailer palsu yang mencatat panggilan - pengganti Resend (batas keluar).
 *
 * Dipakai membuktikan dua hal yang tidak bisa dibuktikan lewat jaringan di test: "email TIDAK dikirim"
 * (kode fix aktif) dan "kode yang dikirim persis yang diharapkan".
 */
export function capturingMailer(): CapturingMailer {
  const mails: OtpMail[] = []

  return {
    mails,
    mailer: {
      async sendOtp(mail: OtpMail): Promise<void> {
        mails.push(mail)
      },
    },
  }
}

export type Fixture = {
  readonly email: string
  readonly clientIp: string
  readonly env: ServerEnv
  readonly mailer: CapturingMailer
  /** Konteks service untuk test ini; `overrides` dipakai menggeser waktu atau env. */
  ctx(overrides?: Partial<Pick<ServiceContext, 'now' | 'env' | 'clientIp' | 'db'>>): ServiceContext
  /** Sama dengan `ctx({ now })` - TTL/expiry diuji dengan menggeser waktu. */
  ctxAt(now: Date): ServiceContext
  /** User sesi ini (dibuat saat pertama dipanggil, seperti `verifyOtp`). */
  userId(): Promise<string>
  /** Buang SELURUH baris milik test ini. `extraEmails` untuk test yang membuat user kedua. */
  cleanup(extraEmails?: readonly string[]): Promise<void>
}

export function createFixture(options: { prefix?: string; env?: ServerEnv } = {}): Fixture {
  const email = newEmail(options.prefix)
  const clientIp = newClientIp()
  const env = options.env ?? makeEnv()
  const mailer = capturingMailer()

  const ctx = (
    overrides: Partial<Pick<ServiceContext, 'now' | 'env' | 'clientIp' | 'db'>> = {},
  ): ServiceContext => ({
    db: testDb(),
    env,
    now: FIXED_NOW,
    clientIp,
    ...overrides,
  })

  const userId = async (): Promise<string> => {
    const user = await findOrCreateUserByEmail(ctx(), email)
    return user.id
  }

  return {
    email,
    clientIp,
    env,
    mailer,
    ctx,
    ctxAt: (now: Date) => ctx({ now }),
    userId,
    cleanup: async (extraEmails: readonly string[] = []) => {
      const emails = [email, ...extraEmails]
      const db = testDb()

      for (const target of emails) {
        const emailHash = hmacSha256(target, env.otpPepper)
        const ipHash = hmacSha256(clientIp, env.rateLimitPepper)

        const owned = await db.select({ id: users.id }).from(users).where(eq(users.email, target))

        // Identifier yang mungkin sudah menulis baris di `rate_limits` untuk test ini. Dihapus
        // supaya run kedua tidak menemukan penghitung dari run pertama (fixed window-nya sama
        // karena `FIXED_NOW` juga sama).
        //
        // Scope per user (`sync:pull`, `keys:transfer-create`, `keys:transfer-claim`,
        // `devices:revoke`, `account:delete`) memakai identifier `userId`, jadi semuanya tercakup
        // `owned.map(row => row.id)` di bawah. Identifier konstan `'delete-otp'` yang dulu ada di
        // daftar ini sudah TIDAK dipakai lagi - identifier konstan itu justru temuan M1 (satu bucket
        // untuk seluruh sistem).
        const identifiers = [
          `email:${emailHash}`,
          `ip:${clientIp}`,
          clientIp,
          `verify:${emailHash}:${ipHash}`,
          ...owned.map((row) => row.id),
        ]
        const buckets = identifiers.map((identifier) => hmacSha256(identifier, env.rateLimitPepper))

        await db.delete(rateLimits).where(inArray(rateLimits.bucket, buckets))
        await db.delete(otpChallenges).where(eq(otpChallenges.emailHash, emailHash))
        // Cascade dari FK (`server/db/schema.ts`) membuang devices, sessions, key_envelopes,
        // key_transfers, records, dan sync_watermarks milik user ini.
        await db.delete(users).where(eq(users.email, target))
      }
    },
  }
}

export type SeededSession = {
  readonly userId: string
  readonly deviceId: string
  readonly sessionId: string
  readonly token: string
}

/**
 * User + perangkat + sesi siap pakai untuk test HTTP.
 *
 * Sesi dibuat lewat service yang sama dengan jalur produksi (`requestOtp` -> `loginDevice`), bukan
 * disuntik langsung ke tabel: token mentah hanya keluar dari `issueSession`, dan `sessions` memang
 * cuma menyimpan hash-nya.
 */
export async function seedSession(
  ctx: ServiceContext,
  input: {
    readonly email: string
    readonly client?: 'web' | 'mobile'
    readonly deviceName?: string
  },
): Promise<SeededSession> {
  const user = await findOrCreateUserByEmail(ctx, input.email)
  const deviceId = await resolveDeviceForLogin(ctx, user.id, {
    name: input.deviceName ?? `QA Device ${randomUUID().slice(0, 8)}`,
    platform: input.client === 'mobile' ? 'android' : 'web',
  })
  const issued = await issueSession(ctx, {
    userId: user.id,
    deviceId,
    client: input.client ?? 'web',
  })

  return { userId: user.id, deviceId, sessionId: issued.sessionId, token: issued.token }
}

/** Cek langsung ke DB: berapa baris `rate_limits` yang bucket-nya milik identifier ini. */
export async function rateLimitCount(env: ServerEnv, identifier: string): Promise<number> {
  const rows = await testDb()
    .select({ count: rateLimits.count })
    .from(rateLimits)
    .where(eq(rateLimits.bucket, hmacSha256(identifier, env.rateLimitPepper)))

  return rows.reduce((total, row) => total + row.count, 0)
}

/**
 * Buang SEMUA baris `rate_limits` satu scope, untuk semua identifier.
 *
 * Dipakai test HTTP: bucket scope per-IP dihitung dari IP SOCKET (di test selalu `127.0.0.1`), jadi
 * penghitungnya menumpuk antar-run dan run kedua bisa `429` padahal kodenya benar. Menghapus per
 * scope lebih aman daripada menghapus identitas tertentu yang tidak kita ketahui (mis. IP socket).
 */
export async function clearRateLimitScope(scope: RateLimitScope): Promise<void> {
  await testDb().delete(rateLimits).where(eq(rateLimits.scope, scope))
}

/** Jumlah baris `otp_challenges` untuk satu email (tanpa email polos - tabelnya menyimpan hash). */
export async function otpChallengeCount(env: ServerEnv, email: string): Promise<number> {
  const rows = await testDb()
    .select({ id: otpChallenges.id })
    .from(otpChallenges)
    .where(eq(otpChallenges.emailHash, hmacSha256(email, env.otpPepper)))

  return rows.length
}

/**
 * Kolom `information_schema` seluruh tabel `public`.
 *
 * Dipakai membuktikan skema DB: tidak ada satu pun kolom plaintext data user. Query-nya langsung ke
 * Postgres (bukan lewat drizzle) supaya yang diperiksa benar-benar DB yang sudah dimigrasi, bukan
 * definisi skema di kode.
 */
export async function informationSchemaColumns(): Promise<
  Array<{ table_name: string; column_name: string }>
> {
  const sql = postgres(TEST_DATABASE_URL, { max: 1 })

  try {
    return await sql<Array<{ table_name: string; column_name: string }>>`
      select table_name, column_name
      from information_schema.columns
      where table_schema = 'public'
    `
  } finally {
    await sql.end({ timeout: 5 })
  }
}
