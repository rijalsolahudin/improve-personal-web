import { useDatabase } from '../../../db/client'
import { createSyncHub, createSyncSession, type SyncSession } from '../../../services/sync-session'
import { serverEnv } from '../../../utils/env'
import { resolveClientIp } from '../../../utils/request-ip'
import { logServerError } from '../../../utils/server-log'

/**
 * `GET /v1/sync/ws` (upgrade WebSocket) - relay sync E2E (ADR 17, ARCHITECTURE.md §9).
 *
 * Berkas ini hanya menyambungkan hook WebSocket Nitro ke `services/sync-session.ts`; seluruh aturan
 * (saklar, rate limit, challenge-auth Device Sign Key, kuota, routing, ack) ada di service dan diuji
 * tanpa jaringan. Server hanya meneruskan ciphertext - isi frame tidak pernah dibuka atau di-log.
 *
 * Hook `upgrade` tidak menolak apa pun: saklar mati dijawab SETELAH handshake (close `4001`), karena
 * client hanya bisa membaca close code dari koneksi yang sudah terbuka - respons HTTP penolakan
 * terbaca sebagai "gagal konek" biasa dan app akan retry terus, bukan turun ke Drive.
 *
 * Middleware `/v1` (CSRF, body limit) tidak berlaku untuk upgrade; auth-nya challenge-response, bukan
 * cookie, jadi tidak ada kredensial ambient yang bisa dipakai situs lain.
 */

/** Satu registri untuk seluruh proses: frame dari satu koneksi diteruskan ke koneksi lain di sini. */
const hub = createSyncHub()

/** Sesi per koneksi. Kunci = objek peer: hilang otomatis saat peer dibuang. */
const sessions = new WeakMap<object, SyncSession>()

export default defineWebSocketHandler({
  async open(peer) {
    const env = serverEnv()
    const clientIp = resolveClientIp(
      peer.request.headers.get('x-forwarded-for') ?? undefined,
      peer.remoteAddress,
      env.trustedProxyHops,
    )

    const session = createSyncSession({
      hub,
      connection: {
        send: (message) => peer.send(JSON.stringify(message)),
        close: (code, reason) => peer.close(code, reason),
      },
      context: () => ({ db: useDatabase(), env, now: new Date(), clientIp }),
    })
    sessions.set(peer, session)

    try {
      await session.open()
    } catch (error) {
      logServerError(undefined, error)
      session.dispose()
      peer.close(1011, 'internal')
    }
  },

  async message(peer, message) {
    // `text()` dari data biner mengubahnya jadi string; ukurannya tetap dibatasi di sesi sebelum parse.
    await sessions.get(peer)?.receive(message.text())
  },

  close(peer) {
    sessions.get(peer)?.dispose()
    sessions.delete(peer)
  },

  error(peer, error) {
    logServerError(undefined, error)
    sessions.get(peer)?.dispose()
    sessions.delete(peer)
  },
})
