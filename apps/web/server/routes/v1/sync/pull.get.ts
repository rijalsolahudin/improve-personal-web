import { syncPullQuerySchema } from '@improve-personal/contracts'

import { serviceContext } from '../../../services/context'
import { consumeRateLimit } from '../../../services/rate-limit'
import { pullRecords } from '../../../services/sync'

/**
 * `GET /v1/sync/pull?cursor=&limit=` - delta berhalaman berdasarkan `server_seq`.
 *
 * Batas biaya endpoint ini ada DUA, dan keduanya diperlukan (temuan H2 audit keamanan):
 * 1. Plafon byte per halaman (`SYNC_MAX_PULL_BYTES`, 4 MiB) ditegakkan service: halaman dipotong
 *    begitu total ciphertext-nya melewati plafon. Inilah yang menutup DoS memori - tanpa itu,
 *    `limit=500` pada akun berisi record 1 MB menghasilkan respons ratusan MB yang dibangun utuh di
 *    memori proses ini.
 * 2. Limiter `sync:pull` per USER, longgar dan per jam (bukan per menit). Sebelumnya endpoint ini
 *    sengaja tanpa limiter dengan alasan "jangan menghukum perangkat yang baru bangun dari offline" -
 *    alasan itu tetap dihormati: jatah 600/jam tidak menghalangi sync normal, tapi menghentikan loop
 *    tanpa henti yang membakar CPU + egress.
 *
 * Query diparse `syncPullQuerySchema`: `cursor=abc`, `cursor=-1`, `limit=0`, dan parameter tak dikenal
 * ditolak sebagai `VALIDATION_FAILED` - bukan diabaikan diam-diam.
 *
 * `limit` BUKAN janji jumlah record: halaman bisa lebih pendek karena plafon byte. Klien melanjutkan
 * dari `nextCursor` (kontrak `syncPullResultSchema`).
 *
 * Cursor di bawah `sync_watermarks.purged_seq` dijawab `409 SYNC_RESET_REQUIRED` oleh service:
 * tanpa itu, perangkat lama bisa "menghidupkan lagi" record yang sudah dipurge (zombie
 * resurrection). `nextCursor` juga bukan `server_seq` record sendiri - klien tidak boleh melompati
 * record perangkat lain yang belum ditarik.
 *
 * `requireExpectedUserId` jalan SEBELUM query diparse dan sebelum rate limit (temuan H1): cookie
 * sesi ambient bisa membuat tab yang login sebagai akun lain menarik data akun tersebut. Klien
 * browser WAJIB mengirim `x-expected-user-id`; klien native (tanpa penanda browser) masih boleh tanpa
 * header. Request yang bukan milik sesi ini ditolak `FORBIDDEN` tanpa membaca data dan tanpa
 * menghabiskan jatah.
 */
export default defineApiHandler(async (event) => {
  const auth = await requireSession(event)
  requireExpectedUserId(event, auth)
  const query = await getValidatedQuery(event, (value) => syncPullQuerySchema.parse(value))
  const ctx = serviceContext(event)

  // Dihitung sebelum query dijalankan: jatah milik AKUN (bukan perangkat), jadi satu akun tidak bisa
  // melipatgandakan jatahnya dengan login di banyak perangkat.
  await consumeRateLimit(ctx, 'sync:pull', auth.userId)

  return pullRecords(ctx, auth.userId, query)
})
