import { useDatabase } from '../db/client'
import { purgeSyncRelay, type SyncPurgeSummary } from '../services/sync-relay'
import { serverEnv } from '../utils/env'

/**
 * Task Nitro `sync-relay-purge` - buang frame relay sync yang lewat TTL (`SYNC_RELAY_TTL_DAYS`) dan
 * catat pengirim + seq yang dibuang untuk pemberitahuan `expired` (ADR 17).
 *
 * Logika ada di `server/services/sync-relay.ts` (`purgeSyncRelay`); berkas ini cuma merakit konteks,
 * sama seperti `cleanup-ephemeral`. Jalur yang dijamin jalan adalah cron host (bukan HTTP):
 *
 *   # crontab host, tiap jam
 *   # 0 * * * * cd /srv/improve-personal && pnpm --filter @improve-personal/web cron:sync-relay-purge
 */
export default defineTask({
  meta: {
    name: 'sync-relay-purge',
    description: 'Buang frame relay sync yang lewat TTL 7 hari dan catat yang hangus',
  },
  async run(): Promise<{ result: SyncPurgeSummary }> {
    const ctx = { db: useDatabase(), env: serverEnv(), now: new Date(), clientIp: null }

    return { result: await purgeSyncRelay(ctx) }
  },
})
