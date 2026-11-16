import { randomBytes } from 'node:crypto'

import { emailSchema, licensePlanSchema } from '@improve-personal/contracts'

import { closeAllDatabases, databaseFor } from '../server/db/client'
import { grantLicense } from '../server/services/license'
import { cleanupEphemeral, type CleanupEphemeralSummary } from '../server/services/maintenance'
import { resolveServerEnv } from '../server/utils/env'
import { LICENSE_SEED_BYTES, createLicenseSigner } from '../server/utils/license-signing'

/**
 * Entry cron HOST - dijalankan di luar proses Nitro lewat `tsx`.
 *
 * Kenapa berkas ini ada: script lama (`nuxt task run ...`) memakai subcommand yang TIDAK ADA di nuxi
 * 3.37.0, jadi crontab host tidak pernah benar-benar menjalankan apa pun. Nitro memang bisa
 * menjalankan task, tapi endpoint `/_nitro/tasks/<nama>` cuma ada di DEV (lihat
 * `presets/_nitro/runtime/nitro-dev.mjs`) - jadi tidak boleh diandalkan di production, dan
 * ARCHITECTURE.md §9 + `docs/server.dbml` menegaskan purge TIDAK lewat HTTP. Karena itu cron host
 * butuh entry yang benar-benar jalan dari CLI.
 *
 * Berkas ini sengaja tipis: semua logika ada di `server/services/maintenance.ts` (SATU sumber yang
 * juga dipakai task Nitro), dan di sini cuma dirakit:
 *   - `db` dari connection string (pool yang sama dengan runtime, lihat `server/db/client.ts`),
 *   - `env` dari `resolveServerEnv` (fungsi validasi yang sama dengan plugin startup),
 *   - `now` satu titik waktu, `clientIp` null (cron tidak melayani request).
 *
 * Env dibaca dari `process.env` DI SINI (bukan `useRuntimeConfig`): ini tooling yang jalan di luar
 * proses server, sama seperti `drizzle.config.ts`. Cron host mewarisi env service
 * (`NUXT_DATABASE_URL`, pepper, dst) dari secret manager/container - bukan dari berkas yang di-commit.
 *
 * Pakai:
 *   tsx scripts/task.ts cleanup-ephemeral
 *   tsx scripts/task.ts license-keygen
 *   tsx scripts/task.ts license-grant <email> <order-ref> [monthly|yearly|lifetime]
 */

/** Petakan env `NUXT_*` ke bentuk config yang diterima `resolveServerEnv` (key privat runtimeConfig). */
function runtimeConfigFromProcessEnv(): Record<string, unknown> {
  return {
    appEnv: process.env.NUXT_APP_ENV,
    databaseUrl: process.env.NUXT_DATABASE_URL,
    otpPepper: process.env.NUXT_OTP_PEPPER,
    rateLimitPepper: process.env.NUXT_RATE_LIMIT_PEPPER,
    googleClientId: process.env.NUXT_GOOGLE_CLIENT_ID,
    googleClientSecret: process.env.NUXT_GOOGLE_CLIENT_SECRET,
    googleRedirectUriWeb: process.env.NUXT_GOOGLE_REDIRECT_URI_WEB,
    googleRedirectUriMobile: process.env.NUXT_GOOGLE_REDIRECT_URI_MOBILE,
    corsAllowedOrigins: process.env.NUXT_CORS_ALLOWED_ORIGINS,
    trustedProxyHops: process.env.NUXT_TRUSTED_PROXY_HOPS,
    resendApiKey: process.env.NUXT_RESEND_API_KEY,
    mailFrom: process.env.NUXT_MAIL_FROM,
    licenseSigningKey: process.env.NUXT_LICENSE_SIGNING_KEY,
    mayarApiKey: process.env.NUXT_MAYAR_API_KEY,
    mayarWebhookToken: process.env.NUXT_MAYAR_WEBHOOK_TOKEN,
    mayarProduct: process.env.NUXT_MAYAR_PRODUCT,
    mayarEnvironment: process.env.NUXT_MAYAR_ENVIRONMENT,
    priceOverrideIdr: process.env.NUXT_PRICE_OVERRIDE_IDR,
    public: { licensePublicKey: process.env.NUXT_PUBLIC_LICENSE_PUBLIC_KEY },
  }
}

function contextFromProcessEnv() {
  const env = resolveServerEnv(runtimeConfigFromProcessEnv())
  return { db: databaseFor(env.databaseUrl), env, now: new Date(), clientIp: null }
}

const TASKS = {
  'cleanup-ephemeral': async (): Promise<CleanupEphemeralSummary> =>
    cleanupEphemeral(contextFromProcessEnv()),
  /**
   * Pasangan kunci lisensi baru untuk satu environment. Seed-nya RAHASIA: salin langsung ke secret
   * manager (`NUXT_LICENSE_SIGNING_KEY`), jangan ke berkas yang di-commit. Tidak butuh DB/env.
   */
  'license-keygen': async () => {
    const seed = randomBytes(LICENSE_SEED_BYTES).toString('base64')
    return {
      NUXT_LICENSE_SIGNING_KEY: seed,
      NUXT_PUBLIC_LICENSE_PUBLIC_KEY: createLicenseSigner(seed).publicKey,
    }
  },
  /**
   * Catat pembelian manual (penjualan di luar webhook, kompensasi, uji). Idempoten per order-ref.
   * Paket default `lifetime` (kompensasi/uji paling sering butuh akses tanpa batas).
   * Output hanya id lisensi - email tidak ikut dicetak supaya log operator tidak menyimpan PII.
   */
  'license-grant': async () => {
    const email = emailSchema.parse(process.argv[3])
    const orderRef = process.argv[4]
    if (!orderRef)
      throw new Error('order-ref wajib: tsx scripts/task.ts license-grant <email> <ref> [paket]')
    const plan = licensePlanSchema.parse(process.argv[5] ?? 'lifetime')

    const license = await grantLicense(contextFromProcessEnv(), { email, orderRef, plan })
    return { licenseId: license.id, plan: license.plan, expiresAt: license.expiresAt }
  },
} as const

async function main(): Promise<void> {
  const name = process.argv[2]
  if (!name || !(name in TASKS)) {
    throw new Error(
      `Task tidak dikenal: ${name ?? '(kosong)'}. Pilih: ${Object.keys(TASKS).join(', ')}`,
    )
  }

  const run = TASKS[name as keyof typeof TASKS]
  const result = await run()

  // Output tanpa data user (jumlah baris / id lisensi) supaya aman masuk log cron (security.md §11).
  // Pengecualian sadar: `license-keygen` mencetak seed - perintah manual operator, bukan cron.
  process.stdout.write(`${JSON.stringify({ task: name, result })}\n`)
}

main()
  .then(() => closeAllDatabases())
  .catch(async (error: unknown) => {
    await closeAllDatabases()
    // Cetak seluruh rantai `cause`: drizzle membungkus error driver sebagai `Failed query`, dan tanpa
    // cause-nya pesan Postgres yang sebenarnya hilang. Pesan ini aman: cuma query + params (bukan data
    // user), dan hanya tampil di stderr cron.
    const chain: string[] = []
    let current: unknown = error
    while (current instanceof Error) {
      chain.push(`${current.name}: ${current.message}`)
      current = (current as { cause?: unknown }).cause
    }
    if (chain.length === 0) chain.push(String(error))
    process.stderr.write(`task gagal: ${chain.join(' <- ')}\n`)
    process.exitCode = 1
  })
