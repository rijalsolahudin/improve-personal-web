import { useDatabase } from '../db/client'
import { purgeTombstones, type PurgeTombstonesSummary } from '../services/maintenance'
import { serverEnv } from '../utils/env'

/**
 * Task Nitro `purge-tombstones` - jalur Nitro (butuh `nitro.experimental.tasks`).
 *
 * Logika sesungguhnya ada di `server/services/maintenance.ts` (`purgeTombstones`). Berkas ini cuma
 * merakit konteks dari runtime Nitro lalu memanggilnya, supaya jalur Nitro dan jalur cron HOST
 * (memakai fungsi yang sama) tidak bisa berbeda perilaku.
 *
 * Cara menjalankan yang DIJAMIN jalan (bukan HTTP - endpoint task Nitro cuma ada di dev):
 *
 *   # crontab host, tiap hari 03:00
 *   # 0 3 * * * cd /srv/improve-personal && pnpm --filter @improve-personal/web cron:purge-tombstones
 *
 * Cron harus mewarisi env server (`NUXT_DATABASE_URL`, pepper, dst) dari environment service, bukan
 * dari berkas yang di-commit.
 */
export default defineTask({
  meta: {
    name: 'purge-tombstones',
    description: 'Hapus tombstone records yang lebih tua dari 90 hari dan naikkan purged_seq',
  },
  async run(): Promise<{ result: PurgeTombstonesSummary }> {
    const ctx = { db: useDatabase(), env: serverEnv(), now: new Date(), clientIp: null }

    return { result: await purgeTombstones(ctx) }
  },
})
