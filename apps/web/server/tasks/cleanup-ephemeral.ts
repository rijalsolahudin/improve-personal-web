import { useDatabase } from '../db/client'
import { cleanupEphemeral, type CleanupEphemeralSummary } from '../services/maintenance'
import { serverEnv } from '../utils/env'

/**
 * Task Nitro `cleanup-ephemeral` - jalur Nitro (butuh `nitro.experimental.tasks`).
 *
 * Logika sesungguhnya ada di `server/services/maintenance.ts` (`cleanupEphemeral`). Berkas ini cuma
 * merakit konteks dari runtime Nitro lalu memanggilnya, supaya jalur Nitro dan jalur cron HOST
 * (memakai fungsi yang sama) tidak bisa berbeda perilaku.
 *
 * `clientIp` sengaja `null`: task tidak melayani request, jadi tidak ada IP klien yang bisa dipercaya.
 * `env` dibaca lewat `serverEnv()` - `databaseUrl` berasal dari key privat `runtimeConfig`, bukan
 * `process.env` (security.md §1).
 *
 * Cara menjalankan yang DIJAMIN jalan (bukan HTTP - endpoint task Nitro cuma ada di dev):
 *
 *   # crontab host, tiap jam
 *   # 0 * * * * cd /srv/improve-personal && pnpm --filter @improve-personal/web cron:cleanup-ephemeral
 */
export default defineTask({
  meta: {
    name: 'cleanup-ephemeral',
    description: 'Buang OTP, oauth_states, key_transfers, dan rate_limits yang sudah kedaluwarsa',
  },
  async run(): Promise<{ result: CleanupEphemeralSummary }> {
    const ctx = { db: useDatabase(), env: serverEnv(), now: new Date(), clientIp: null }

    return { result: await cleanupEphemeral(ctx) }
  },
})
