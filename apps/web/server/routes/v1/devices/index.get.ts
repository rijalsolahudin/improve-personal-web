import { serviceContext } from '../../../services/context'
import { listDevices } from '../../../services/device'

/**
 * `GET /v1/devices` - daftar perangkat user (PRD F15 halaman "Perangkat").
 *
 * `user_id` diambil dari SESI, tidak pernah dari query: daftar perangkat adalah data per akun, dan
 * menerima id user dari klien akan menjadikannya IDOR pertama di app ini.
 *
 * Batas jumlah baris (`DEVICE_LIST_MAX`) sudah ditegakkan di service, jadi satu respons tidak bisa
 * membengkak walau ada jejak audit perangkat yang sudah di-revoke.
 *
 * Sengaja TIDAK diberi rate limit, walau audit M4 menyebut endpoint ini: biayanya satu query
 * terindeks (`user_id`) dengan jumlah baris terbatas, dan halaman "Perangkat" boleh dibuka berulang
 * kali - limiter di sini hanya akan menghukum pemakaian normal tanpa menutup penyalahgunaan nyata.
 * Yang memang dibatasi adalah jalur yang menulis atau mahal per panggilan: revoke perangkat
 * (`devices:revoke`), transfer kunci (`keys:transfer-create`/`keys:transfer-claim`), `sync:pull`, dan
 * `google:callback:ip`.
 */
export default defineApiHandler(async (event) => {
  const auth = await requireSession(event)
  const ctx = serviceContext(event)

  const devices = await listDevices(ctx, auth.userId)

  return { devices }
})
