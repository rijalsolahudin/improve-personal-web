import { syncPushInputSchema } from '@improve-personal/contracts'

import { serviceContext } from '../../../services/context'
import { consumeRateLimit } from '../../../services/rate-limit'
import { pushRecords } from '../../../services/sync'

/**
 * `POST /v1/sync/push` - terima batch record ter-seal dari satu perangkat.
 *
 * Server cuma relay: yang disimpan ciphertext + metadata (id, hlc, tombstone, `server_seq`). `user_id`
 * dari sesi; perangkat penulis juga diambil dari sesi oleh service, bukan dari body.
 *
 * Urutan pengecekan: auth -> rate limit -> validasi body. Rate limit didahulukan di sini (beda dari
 * endpoint lain) karena body endpoint ini bisa sampai 8 MB: jangan sampai server mem-parse payload
 * raksasa milik klien yang jatahnya sudah habis. Scopenya per USER, bukan per IP - push jalan tiap
 * beberapa detik saat app aktif, dan jatahnya milik akun, bukan jaringan.
 *
 * Batas yang ditegakkan kontrak (`syncPushInputSchema`): maksimum `SYNC_MAX_BATCH` (500) record,
 * batch kosong ditolak, tiap blob <= 1 MB, dan batch WAJIB terurut naik berdasarkan `hlc` (dibanding
 * sebagai tuple lewat `compareHlc`, bukan string). Batas byte TOTAL tetap milik klien - lihat
 * `REQUEST_SIZE_LIMIT_BYTES` di `nuxt.config.ts`.
 *
 * Status per record (`applied`/`stale`/`rejected`) dibiarkan sampai service: hanya di sana HLC
 * tersimpan bisa dibandingkan, dan `stale` memang bukan kegagalan request.
 */
export default defineApiHandler(async (event) => {
  const auth = await requireSession(event)
  const ctx = serviceContext(event)

  await consumeRateLimit(ctx, 'sync:push', auth.userId)

  const body = await readValidatedBody(event, (value) => syncPushInputSchema.parse(value))

  return pushRecords(ctx, auth.userId, body.records)
})
