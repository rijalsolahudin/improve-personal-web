import type { RecordPayload } from '@improve-personal/contracts'
import {
  SYNC_DEBOUNCE_MS,
  pullDelta,
  pushOutbox,
  readSyncStatus,
  type HttpClient,
  type StorageAdapter,
  type SyncStatus,
} from '@improve-personal/core'

import type { LocalDataSession } from '../storage/session'
import { decodeRecord } from '../storage/record-codec'
import { guardStorageWrite } from '../storage/quota-guard'
import { indexEntryForRecord } from '../io/index-entry'
import { markSyncRunEnd, markSyncRunStart } from './activity'
import { createSyncHttpClient } from './client'
import { LOCAL_WRITE_EVENT, notifyRemoteApplied, notifySyncState } from './events'

/**
 * Pengendali sync di sisi web: kapan push/pull dijalankan, dan bagaimana kegagalannya terlihat.
 *
 * Pembagian tugasnya sengaja:
 * - `packages/core/src/sync` memutuskan APA yang dikirim/diterapkan (LWW, cursor, tombstone).
 * - Berkas ini memasang pemicu platform (app_open, reconnect, resume, interval, debounce) dan
 *   menerjemahkan record lokal ↔ payload wire: blob lokal dibuka kunci perangkat sebelum push, dan
 *   payload hasil pull disegel lagi dengan kunci perangkat sebelum disimpan.
 *
 * Dua invarian yang menjaga akun tidak tercampur:
 * 1. **Satu siklus per satu generasi.** Tiap `startSync` menaikkan `generation` dan memegang satu
 *    `AbortController`. Siklus generasi lama tidak pernah menyentuh state generasi baru.
 * 2. **Tidak ada request tanpa identitas.** Client bawaan mengirim `x-expected-user-id`.
 *
 * Satu proses sync pada satu waktu. Pemicu yang datang saat proses berjalan tidak memulai proses
 * kedua; mereka menandai `pendingRun` supaya siklus berikutnya menyusul.
 */

const FOREGROUND_INTERVAL_MS = 5 * 60 * 1_000
/** Pagar anti-loop kalau outbox terus bertambah saat sync berjalan. */
const MAX_PUSH_BATCHES = 100

export type SyncOutcome = {
  readonly pushed: number
  readonly pulled: number
  readonly status: SyncStatus
}

type ActiveSync = {
  readonly generation: number
  readonly session: LocalDataSession
  readonly baseUrl: string
  readonly http: HttpClient
  readonly abort: AbortController
  readonly debounceTimer: { current: ReturnType<typeof setTimeout> | null }
  readonly intervalTimer: ReturnType<typeof setInterval>
  readonly onLocalWrite: () => void
  readonly onOnline: () => void
  readonly onVisibility: () => void
}

type InFlight = {
  readonly generation: number
  readonly promise: Promise<SyncOutcome | null>
}

let active: ActiveSync | null = null
let generationCounter = 0
let inFlight: InFlight | null = null
let pendingPull = false
let pendingRun = false

function isGenerationStale(current: ActiveSync): boolean {
  return (
    active === null ||
    active.generation !== current.generation ||
    active.session.userId !== current.session.userId
  )
}

/** Mulai (atau ganti) pengendali untuk sesi data lokal yang sudah terbuka. */
export function startSync(
  session: LocalDataSession,
  baseUrl: string,
  options: { readonly http?: HttpClient; readonly autoStart?: boolean } = {},
): () => void {
  stopSync()

  generationCounter += 1
  const generation = generationCounter
  const abort = new AbortController()

  const http = options.http ?? createSyncHttpClient({ baseUrl, expectedUserId: session.userId })
  const debounceTimer: { current: ReturnType<typeof setTimeout> | null } = { current: null }

  const onLocalWrite = (): void => {
    if (debounceTimer.current !== null) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(() => {
      debounceTimer.current = null
      void runSync({ pull: false })
    }, SYNC_DEBOUNCE_MS)
  }

  const onOnline = (): void => {
    void runSync({ pull: true })
  }

  const onVisibility = (): void => {
    if (document.visibilityState === 'visible') void runSync({ pull: true })
  }

  const intervalTimer = setInterval(() => {
    void runSync({ pull: true })
  }, FOREGROUND_INTERVAL_MS)

  active = {
    generation,
    session,
    baseUrl,
    http,
    abort,
    debounceTimer,
    intervalTimer,
    onLocalWrite,
    onOnline,
    onVisibility,
  }

  window.addEventListener(LOCAL_WRITE_EVENT, onLocalWrite)
  window.addEventListener('online', onOnline)
  document.addEventListener('visibilitychange', onVisibility)

  // app_open: jalan sekali saat sesi siap, tidak menunggu timer pertama.
  if (options.autoStart !== false) void runSync({ pull: true })

  return stopSync
}

/** Hentikan pengendali aktif. Idempoten. */
export function stopSync(): void {
  const current = active
  if (current === null) return

  window.removeEventListener(LOCAL_WRITE_EVENT, current.onLocalWrite)
  window.removeEventListener('online', current.onOnline)
  document.removeEventListener('visibilitychange', current.onVisibility)
  if (current.debounceTimer.current !== null) clearTimeout(current.debounceTimer.current)
  clearInterval(current.intervalTimer)

  current.abort.abort()

  active = null
  inFlight = null
  pendingPull = false
  pendingRun = false
}

/** Dipakai tombol "Coba lagi" di indikator status. */
export function requestSyncNow(): void {
  void runSync({ pull: true })
}

export function runSync(options: { readonly pull: boolean }): Promise<SyncOutcome | null> {
  const current = active
  if (current === null) return Promise.resolve(null)

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    notifySyncState()
    return Promise.resolve(null)
  }

  pendingRun = true
  pendingPull ||= options.pull
  if (inFlight !== null && inFlight.generation === current.generation) return inFlight.promise

  const generation = current.generation

  markSyncRunStart()

  const promise = execute(current).finally(() => {
    markSyncRunEnd()

    if (inFlight?.promise !== promise) return

    inFlight = null

    // Pemicu yang datang saat siklus ini berjalan tidak boleh hilang.
    if (pendingRun && active?.generation === generation) {
      pendingRun = false
      void runSync({ pull: pendingPull })
    }
  })

  inFlight = { generation, promise }
  return promise
}

async function execute(current: ActiveSync): Promise<SyncOutcome | null> {
  const mySession = current.session

  const isStale = (): boolean => isGenerationStale(current)

  if (isStale()) return null

  pendingRun = false

  const { baseUrl, http, abort } = current
  const nowMs = (): number => mySession.clock.nowMs()

  let pushed = 0
  let pulled = 0

  try {
    // Push berulang: satu panggilan hanya mengirim maksimal satu batch.
    for (let batch = 0; batch < MAX_PUSH_BATCHES; batch += 1) {
      if (isStale() || !navigator.onLine) break

      const summary = await pushOutbox({
        storage: mySession.storage,
        http,
        url: `${baseUrl}/v1/sync/push`,
        nowMs: nowMs(),
        hlc: mySession.hlc,
        signal: abort.signal,
        payloadFor: async (record) => {
          // Blob lokal dibuka dengan kunci perangkat lalu dikirim sebagai payload polos; server yang
          // menyegelnya lagi dengan kunci milik server.
          const decoded = await decodeRecord(mySession.provider, mySession.dataKey, record)

          return {
            type: decoded.type,
            schemaVersion: decoded.schemaVersion,
            // `decodeRecord` sudah memvalidasi payload lewat schema entitasnya; bentuknya JSON.
            data: decoded.data as RecordPayload,
          }
        },
      })

      if (isStale()) return null

      pushed += summary.sent
      if (summary.sent === 0 || summary.status === 'offline' || summary.status === 'error') break
      if ((await mySession.storage.countOutbox()) === 0) break
    }

    if (isStale()) return null

    const shouldPull = pendingPull
    pendingPull = false

    if (shouldPull && navigator.onLine) {
      const summary = await pullDelta({
        storage: guardPullWrites(mySession.storage, nowMs()),
        http,
        url: `${baseUrl}/v1/sync/pull`,
        nowMs: nowMs(),
        hlc: mySession.hlc,
        signal: abort.signal,
        indexFor: (remote) => {
          // Payload dari server sudah plaintext: index bisa dibangun tanpa dekripsi apa pun.
          const payload = remote.payload as { readonly type?: unknown; readonly data?: unknown }
          if (typeof payload?.type !== 'string') return null

          return indexEntryForRecord(
            {
              id: remote.id,
              type: payload.type as Parameters<typeof indexEntryForRecord>[0]['type'],
              data: payload.data,
            },
            nowMs(),
          )
        },
        sealForStorage: async (remote) =>
          mySession.provider.sealRecord({
            recordId: remote.id,
            hlc: remote.hlc,
            deleted: remote.deleted,
            dataKey: mySession.dataKey,
            plaintext: JSON.stringify(remote.payload),
          }),
      })

      if (isStale()) return null

      pulled += summary.applied

      // Hanya pull yang BENAR-BENAR menerapkan sesuatu yang memicu muat ulang store.
      if (summary.applied > 0) notifyRemoteApplied()
    }

    const status = await readSyncStatus({
      storage: mySession.storage,
      online: navigator.onLine,
    })

    return { pushed, pulled, status }
  } catch {
    if (isStale()) return null

    // Siklus berhenti di tengah: tandai `error` supaya indikator tidak menampilkan "tersinkron"
    // padahal ada yang gagal, dan user mendapat tombol coba lagi.
    const status = await markError(mySession.storage).catch(() =>
      readSyncStatus({ storage: mySession.storage, online: navigator.onLine }).catch(
        () => 'error' as const,
      ),
    )

    return { pushed, pulled, status }
  } finally {
    if (!isStale()) notifySyncState()
  }
}

/** Tandai `sync_state.status = 'error'` - satu-satunya jalur yang membuat UI menawarkan coba lagi. */
async function markError(storage: StorageAdapter): Promise<SyncStatus> {
  await storage.runTransaction('sync.error', async (tx) => {
    await tx.patchSyncState({ status: 'error' })
  })

  return 'error'
}

/**
 * Bungkus storage untuk pull: merge menarik menulis langsung lewat adapter, jadi kuota penuh di sini
 * juga harus memunculkan banner - bukan berhenti sebagai kegagalan siklus yang tidak dijelaskan.
 */
function guardPullWrites(storage: StorageAdapter, atMs: number): StorageAdapter {
  return {
    ...storage,
    runTransaction: (label, fn) => {
      if (label !== 'sync.pull.merge') return storage.runTransaction(label, fn)
      return guardStorageWrite(() => storage.runTransaction(label, fn), atMs)
    },
  }
}
