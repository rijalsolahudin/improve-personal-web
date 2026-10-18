import { keyTransferCreateInputSchema } from '@improve-personal/contracts'

import { serviceContext } from '../../../../services/context'
import { createKeyTransfer } from '../../../../services/keys'
import { consumeRateLimit } from '../../../../services/rate-limit'
import { setApiResponseStatus } from '../../../../utils/api-response'

/**
 * `POST /v1/keys/transfer` - perangkat lama menitipkan kunci utama yang SUDAH dienkripsi.
 *
 * Perangkat sumber diambil dari SESI (`auth.deviceId`), tidak dari body: klien tidak boleh memilih
 * "saya perangkat mana". Perangkat target divalidasi di service (harus milik user yang sama dan
 * belum di-revoke), dan transfer ke diri sendiri ditolak.
 *
 * TTL ditentukan server (`KEY_TRANSFER_TTL_SECONDS`, 120 detik) - schema-nya strict, jadi klien yang
 * mengirim `ttlSeconds` justru ditolak: nilai dari klien tidak boleh memperpanjang masa berlaku
 * sebuah envelope kunci.
 *
 * `201` karena baris `key_transfers` baru terbentuk dan `id`-nya dipakai perangkat BARU untuk
 * membuat QR yang discan perangkat lama.
 *
 * Rate limit `keys:transfer-create` dikonsumsi di sini dengan identifier SESI (`auth.userId`) - tiap
 * panggilan meninggalkan satu baris `key_transfers` yang harus dibersihkan job cron, jadi tanpa batas
 * satu akun bisa menulis puluhan ribu baris (temuan M4 audit keamanan). Jatahnya per akun, bukan per
 * perangkat: menambah login tidak boleh menambah jatah.
 */
export default defineApiHandler(async (event) => {
  const auth = await requireSession(event)
  const ctx = serviceContext(event)

  await consumeRateLimit(ctx, 'keys:transfer-create', auth.userId)

  const body = await readValidatedBody(event, (value) => keyTransferCreateInputSchema.parse(value))

  const transfer = await createKeyTransfer(ctx, {
    userId: auth.userId,
    sourceDeviceId: auth.deviceId,
    targetDeviceId: body.targetDeviceId,
    blob: body.blob,
  })

  setApiResponseStatus(event, 201)
  return transfer
})
