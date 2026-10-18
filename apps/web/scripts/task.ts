import { closeAllDatabases, databaseFor } from '../server/db/client'
import {
  cleanupEphemeral,
  purgeTombstones,
  type CleanupEphemeralSummary,
  type PurgeTombstonesSummary,
} from '../server/services/maintenance'
import { resolveServerEnv } from '../server/utils/env'

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
 *   tsx scripts/task.ts purge-tombstones
 *   tsx scripts/task.ts cleanup-ephemeral
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
  }
}

const TASKS = {
  'purge-tombstones': async (): Promise<PurgeTombstonesSummary> => {
    const env = resolveServerEnv(runtimeConfigFromProcessEnv())
    const ctx = { db: databaseFor(env.databaseUrl), env, now: new Date(), clientIp: null }
    return purgeTombstones(ctx)
  },
  'cleanup-ephemeral': async (): Promise<CleanupEphemeralSummary> => {
    const env = resolveServerEnv(runtimeConfigFromProcessEnv())
    const ctx = { db: databaseFor(env.databaseUrl), env, now: new Date(), clientIp: null }
    return cleanupEphemeral(ctx)
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

  // Output cuma jumlah baris (tanpa id/user/blob) supaya aman masuk log cron (security.md §11).
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
