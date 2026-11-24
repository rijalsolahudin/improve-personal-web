import { randomBytes } from 'node:crypto'

import {
  SYNC_AUTH_NONCE_BYTES,
  SYNC_CLOSE_CODES,
  SYNC_FRAME_MAX_BYTES,
  SYNC_PROTOCOL_VERSION,
  base64MaxLengthForBytes,
  syncClientMessageSchema,
  type SyncClientMessage,
  type SyncRelayErrorCode,
  type SyncServerMessage,
} from '@improve-personal/contracts'

import { ApiProblem } from '../utils/api-error'
import { logServerError } from '../utils/server-log'
import type { ServiceContext } from './context'
import { consumeRateLimit } from './rate-limit'
import {
  ackSyncFrames,
  acceptSyncFrame,
  authenticateSyncDevice,
  findSyncActivation,
  listPendingFrames,
  recordBytesOut,
  takeExpiredNotices,
  type PendingFrame,
  type SyncPrincipal,
  type SyncSendMessage,
} from './sync-relay'

/**
 * Sesi koneksi relay sync (ADR 17): state machine per WebSocket + registri koneksi online.
 *
 * Berkas ini tidak mengimpor WebSocket apa pun: koneksi masuk lewat port `SyncConnection`, jadi
 * seluruh perilaku (auth, routing, kuota, ack) diuji dengan koneksi palsu tanpa jaringan. Rute
 * `server/routes/v1/sync/ws.ts` hanya menyambungkan hook WebSocket ke sini.
 *
 * Server tidak pernah membuka `bytes`: string base64 dari client diteruskan apa adanya ke penerima,
 * dan tidak ada log di sini yang memuat isi, token, atau tanda tangan.
 */

/** Koneksi yang belum auth ditutup kalau tidak membalas challenge dalam waktu ini. */
const AUTH_TIMEOUT_MS = 10_000

/** Cek ulang aktivasi koneksi yang sudah hidup: aktivasi dicabut = putus dalam selang ini. */
const REVALIDATE_INTERVAL_MS = 60_000

/** Frame antrean dikirim per halaman supaya antrean besar tidak dimuat sekaligus ke memori. */
const FLUSH_PAGE_SIZE = 20

/** Pesan yang boleh mengantre di satu koneksi; sisanya dibuang dengan `rate_limited`. */
const MAX_INFLIGHT_MESSAGES = 32

/** Pesan `auth` = token (<= 1 KB) + tanda tangan; selebihnya sebelum auth bukan client sah. */
const AUTH_MESSAGE_MAX_CHARS = 2_048

/** Sisa amplop JSON `send` di luar `bytes` (t, clientRef, epoch, kind, seq, to) - batas kasar. */
const SEND_ENVELOPE_MAX_CHARS = 1_024

/** Batas ukuran pesan mentah SEBELUM di-parse, supaya JSON raksasa tidak memakan CPU/memori. */
export const SYNC_MESSAGE_MAX_CHARS =
  base64MaxLengthForBytes(SYNC_FRAME_MAX_BYTES) + SEND_ENVELOPE_MAX_CHARS

/** `1013 Try Again Later` (RFC 6455 registry): koneksi ditolak karena rate limit, boleh dicoba lagi. */
const CLOSE_TRY_AGAIN_LATER = 1013

/** `1011 Internal Error`: kegagalan server yang tidak terduga; client reconnect dengan backoff. */
const CLOSE_INTERNAL_ERROR = 1011

const CLIENT_REF_MAX_CHARS = 64

export type SyncConnection = {
  send(message: SyncServerMessage): void
  close(code: number, reason: string): void
}

type SyncCloseReason = keyof typeof SYNC_CLOSE_CODES

/** Registri koneksi online per `(lisensi, perangkat)`. Satu perangkat boleh punya beberapa koneksi (tab). */
export type SyncHub = {
  /** Daftarkan koneksi terautentikasi; hasilnya fungsi pelepas. */
  attach(licenseId: string, deviceId: string, connection: SyncConnection): () => void
  /** Kirim ke semua koneksi perangkat itu. Hasil = jumlah koneksi yang dituju (0 = offline). */
  deliver(licenseId: string, deviceId: string, message: SyncServerMessage): number
}

export function createSyncHub(): SyncHub {
  const connections = new Map<string, Set<SyncConnection>>()
  const keyOf = (licenseId: string, deviceId: string): string => `${licenseId}/${deviceId}`

  return {
    attach(licenseId, deviceId, connection) {
      const key = keyOf(licenseId, deviceId)
      const group = connections.get(key) ?? new Set<SyncConnection>()
      group.add(connection)
      connections.set(key, group)

      return () => {
        group.delete(connection)
        if (group.size === 0 && connections.get(key) === group) connections.delete(key)
      }
    },
    deliver(licenseId, deviceId, message) {
      const group = connections.get(keyOf(licenseId, deviceId))
      if (group === undefined) return 0

      for (const connection of group) connection.send(message)
      return group.size
    },
  }
}

export type SyncSessionOptions = {
  readonly connection: SyncConnection
  readonly hub: SyncHub
  /** Konteks segar per operasi (`now` harus waktu sekarang, bukan waktu connect). */
  readonly context: () => ServiceContext
  readonly authTimeoutMs?: number
  readonly revalidateIntervalMs?: number
}

export type SyncSession = {
  /** Panggil saat socket terbuka: cek saklar + rate limit, lalu kirim challenge. */
  open(): Promise<void>
  /** Terima satu pesan teks mentah. Diproses berurutan per koneksi; promise selesai setelah diproses. */
  receive(raw: string): Promise<void>
  /** Panggil saat socket tertutup/error: lepas dari hub dan hentikan timer. */
  dispose(): void
}

type Phase = 'new' | 'challenged' | 'ready' | 'closed'

function frameKind(frame: Pick<PendingFrame, 'seq'>): 'delta' | 'snapshot' {
  return frame.seq === null ? 'snapshot' : 'delta'
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return undefined
  }
}

/** `send` yang `bytes`-nya melewati batas - dikenali dari JSON mentah supaya bisa dijawab `frame_too_large`. */
function oversizedSendClientRef(json: unknown): { readonly clientRef: string | null } | null {
  if (typeof json !== 'object' || json === null) return null
  const candidate = json as { t?: unknown; bytes?: unknown; clientRef?: unknown }
  if (candidate.t !== 'send' || typeof candidate.bytes !== 'string') return null
  if (candidate.bytes.length <= base64MaxLengthForBytes(SYNC_FRAME_MAX_BYTES)) return null

  const ref = candidate.clientRef
  const valid = typeof ref === 'string' && ref.length > 0 && ref.length <= CLIENT_REF_MAX_CHARS
  return { clientRef: valid ? ref : null }
}

export function createSyncSession(options: SyncSessionOptions): SyncSession {
  const { connection, hub } = options
  const authTimeoutMs = options.authTimeoutMs ?? AUTH_TIMEOUT_MS
  const revalidateIntervalMs = options.revalidateIntervalMs ?? REVALIDATE_INTERVAL_MS

  let phase: Phase = 'new'
  let nonce = ''
  let principal: SyncPrincipal | null = null
  let detach: (() => void) | null = null
  let authTimer: ReturnType<typeof setTimeout> | null = null
  let revalidateTimer: ReturnType<typeof setInterval> | null = null
  let inflight = 0
  let queue: Promise<void> = Promise.resolve()

  // Fungsi (bukan perbandingan langsung): `phase` berubah dari callback lain selama `await`, dan
  // TypeScript tidak melacak itu - perbandingan langsung setelah `await` dianggap mustahil.
  const isClosed = (): boolean => phase === 'closed'
  const isReady = (): boolean => phase === 'ready'

  function stopTimers(): void {
    if (authTimer !== null) clearTimeout(authTimer)
    if (revalidateTimer !== null) clearInterval(revalidateTimer)
    authTimer = null
    revalidateTimer = null
  }

  function sendError(code: SyncRelayErrorCode, clientRef: string | null): void {
    connection.send({ t: 'error', code, clientRef })
  }

  /** Kegagalan yang memutus koneksi (`SYNC_CLOSE_CODES`): kirim `error`, tutup, lepas semua. */
  function closeWith(reason: SyncCloseReason): void {
    if (isClosed()) return
    sendError(reason, null)
    connection.close(SYNC_CLOSE_CODES[reason], reason)
    dispose()
  }

  function dispose(): void {
    phase = 'closed'
    stopTimers()
    detach?.()
    detach = null
  }

  function isRateLimited(error: unknown): boolean {
    return error instanceof ApiProblem && error.code === 'RATE_LIMITED'
  }

  async function open(): Promise<void> {
    const ctx = options.context()
    if (!ctx.env.syncRelayEnabled) return closeWith('relay_disabled')

    if (ctx.clientIp !== null) {
      try {
        await consumeRateLimit(ctx, 'sync:connect', ctx.clientIp)
      } catch (error) {
        if (!isRateLimited(error)) throw error
        sendError('rate_limited', null)
        connection.close(CLOSE_TRY_AGAIN_LATER, 'rate_limited')
        dispose()
        return
      }
    }
    if (isClosed()) return

    nonce = randomBytes(SYNC_AUTH_NONCE_BYTES).toString('base64')
    phase = 'challenged'
    connection.send({ t: 'challenge', v: SYNC_PROTOCOL_VERSION, nonce })
    authTimer = setTimeout(() => closeWith('unauthenticated'), authTimeoutMs)
    authTimer.unref()
  }

  async function authenticate(message: Extract<SyncClientMessage, { t: 'auth' }>): Promise<void> {
    if (authTimer !== null) clearTimeout(authTimer)
    authTimer = null

    const ctx = options.context()
    const result = await authenticateSyncDevice(ctx, {
      token: message.token,
      sig: message.sig,
      nonce,
    })
    if (isClosed()) return
    if (result === null) return closeWith('unauthenticated')

    const expired = await takeExpiredNotices(ctx, result.principal.deviceId)
    if (isClosed()) return

    principal = result.principal
    phase = 'ready'
    connection.send({
      t: 'ready',
      epoch: result.activation.epoch,
      readOnly: result.activation.readOnly,
      expired,
    })

    // Daftar ke hub SEBELUM flush: frame yang masuk di antara dua langkah ini tertangkap salah satunya
    // (live atau antrean). Duplikat aman - penerima dedup `deviceId + seq` dan ack idempoten.
    detach = hub.attach(principal.licenseId, principal.deviceId, connection)
    revalidateTimer = setInterval(() => void revalidate(), revalidateIntervalMs)
    revalidateTimer.unref()

    await flushPending(principal)
  }

  async function revalidate(): Promise<void> {
    if (principal === null || !isReady()) return
    try {
      const activation = await findSyncActivation(options.context(), principal)
      if (activation === null) closeWith('unauthenticated')
    } catch (error) {
      logServerError(undefined, error)
    }
  }

  async function flushPending(self: SyncPrincipal): Promise<void> {
    const ctx = options.context()
    let afterId = 0
    let sentBytes = 0

    for (;;) {
      const page = await listPendingFrames(ctx, self.deviceId, afterId, FLUSH_PAGE_SIZE)
      if (page.length === 0 || !isReady()) break

      for (const frame of page) {
        connection.send({
          t: 'frame',
          id: frame.id,
          from: frame.from,
          epoch: frame.epoch,
          kind: frameKind(frame),
          seq: frame.seq,
          bytes: frame.bytes.toString('base64'),
        })
        sentBytes += frame.bytes.length
      }
      afterId = page[page.length - 1]?.id ?? afterId
      if (page.length < FLUSH_PAGE_SIZE) break
    }

    await trackBytesOut(self.licenseId, sentBytes)
  }

  /** Metrik tidak boleh memutus alur kirim: gagal mencatat cukup dilaporkan. */
  async function trackBytesOut(licenseId: string, bytes: number): Promise<void> {
    if (bytes === 0) return
    try {
      await recordBytesOut(options.context(), licenseId, bytes)
    } catch (error) {
      logServerError(undefined, error)
    }
  }

  async function send(self: SyncPrincipal, message: SyncSendMessage): Promise<void> {
    const bytes = Buffer.from(message.bytes, 'base64')
    if (bytes.length === 0) return closeWith('invalid_message')
    if (bytes.length > SYNC_FRAME_MAX_BYTES) return sendError('frame_too_large', message.clientRef)

    const ctx = options.context()
    try {
      await consumeRateLimit(ctx, 'sync:send', self.deviceId)
    } catch (error) {
      if (!isRateLimited(error)) throw error
      return sendError('rate_limited', message.clientRef)
    }

    const result = await acceptSyncFrame(ctx, self, message, bytes)
    if (isClosed()) return
    if (!result.ok) {
      if (result.code === 'unauthenticated') return closeWith('unauthenticated')
      return sendError(result.code, message.clientRef)
    }

    connection.send({ t: 'accepted', clientRef: message.clientRef, id: result.frameId })

    let deliveredCopies = 0
    for (const recipient of result.recipients) {
      deliveredCopies += hub.deliver(self.licenseId, recipient, {
        t: 'frame',
        id: result.frameId,
        from: self.deviceId,
        epoch: message.epoch,
        kind: message.kind,
        seq: message.seq,
        bytes: message.bytes,
      })
    }
    await trackBytesOut(self.licenseId, deliveredCopies * result.size)
  }

  async function snapshotRequest(
    self: SyncPrincipal,
    message: Extract<SyncClientMessage, { t: 'snapshot-request' }>,
  ): Promise<void> {
    try {
      await consumeRateLimit(options.context(), 'sync:send', self.deviceId)
    } catch (error) {
      if (!isRateLimited(error)) throw error
      return sendError('rate_limited', null)
    }

    // Hanya diteruskan ke koneksi online dengan lisensi yang sama (kunci hub memuat `licenseId`);
    // perangkat offline atau milik lisensi lain tidak menerima apa pun dan pengirim tidak diberi tahu.
    hub.deliver(self.licenseId, message.to, {
      t: 'snapshot-request',
      from: self.deviceId,
      requestId: message.requestId,
    })
  }

  async function dispatch(message: SyncClientMessage): Promise<void> {
    if (phase === 'challenged') {
      if (message.t !== 'auth') return closeWith('unauthenticated')
      return authenticate(message)
    }
    if (phase !== 'ready' || principal === null) return

    switch (message.t) {
      case 'auth':
        return closeWith('invalid_message')
      case 'send':
        return send(principal, message)
      case 'ack':
        await ackSyncFrames(options.context(), principal, message.ids)
        return
      case 'snapshot-request':
        return snapshotRequest(principal, message)
    }
  }

  async function handle(raw: string): Promise<void> {
    if (phase !== 'challenged' && phase !== 'ready') return

    // Batas ukuran SEBELUM parse. Sebelum auth batasnya jauh lebih kecil: hanya pesan `auth`.
    if (phase === 'challenged' && raw.length > AUTH_MESSAGE_MAX_CHARS) {
      return closeWith('invalid_message')
    }
    if (raw.length > SYNC_MESSAGE_MAX_CHARS) return sendError('frame_too_large', null)

    const json = parseJson(raw)
    if (json === undefined) return closeWith('invalid_message')

    const oversized = oversizedSendClientRef(json)
    if (oversized !== null && phase === 'ready') {
      return sendError('frame_too_large', oversized.clientRef)
    }

    const parsed = syncClientMessageSchema.safeParse(json)
    if (!parsed.success) return closeWith('invalid_message')

    await dispatch(parsed.data)
  }

  function receive(raw: string): Promise<void> {
    if (inflight >= MAX_INFLIGHT_MESSAGES) {
      sendError('rate_limited', null)
      return Promise.resolve()
    }

    inflight += 1
    const run = queue.then(() => handle(raw))
    queue = run
      .catch((error: unknown) => {
        logServerError(undefined, error)
        if (isClosed()) return
        connection.close(CLOSE_INTERNAL_ERROR, 'internal')
        dispose()
      })
      .finally(() => {
        inflight -= 1
      })

    return queue
  }

  return { open, receive, dispose }
}
