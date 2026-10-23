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
import { RecordKeyError, decodeRecord } from '../storage/record-codec'
import { RECORD_INDEX_KEEP, type RecordIndexDecision } from '../storage/index-decision'
import { indexEntryForRecord } from '../io/index-entry'
import { createSyncHttpClient } from './client'
import { LOCAL_WRITE_EVENT, notifySyncState } from './events'

/**
 * Pengendali sync di sisi web: kapan push/pull dijalankan, dan bagaimana kegagalannya terlihat.
 *
 * Pembagian tugasnya sengaja:
 * - `packages/core/src/sync` memutuskan APA yang dikirim/diterapkan (LWW, cursor, tombstone).
 * - Berkas ini hanya memasang pemicu platform: app_open, reconnect, resume, interval 5 menit, dan
 *   debounce setelah tulis lokal. Tidak ada logika merge di sini.
 *
 * Dua invarian yang menjaga akun tidak tercampur (QA T76 B1):
 * 1. **Satu siklus per satu generasi.** Tiap `startSync` menaikkan `generation` dan pemilik satu
 *    `AbortController`. `stopSync` membatalkan request yang sedang jalan; siklus generasi lama tidak
 *    pernah menyentuh state generasi baru (cek `active.generation === myGen && active.session.userId`).
 * 2. **Tidak ada request tanpa identitas.** Client bawaan mengirim `x-expected-user-id`; server
 *    menolak request yang cookie-nya sudah berganti akun (mis. login akun lain di tab sebelah).
 *
 * Satu proses sync pada satu waktu. Pemicu yang datang saat proses berjalan tidak memulai proses
 * kedua; mereka menandai `pendingRun` supaya siklus berikutnya menyusul. Tanpa itu, dua push
 * bersamaan bisa mengirim batch yang sama dan dua pull bisa saling menimpa cursor.
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
  /**
   * Nomor urut controller. Naik setiap `startSync`; dipakai siklus yang sedang berjalan untuk tahu
   * apakah ia masih pemilik `active` atau sudah basi.
   */
  readonly generation: number
  readonly session: LocalDataSession
  readonly baseUrl: string
  readonly http: HttpClient
  /**
   * Dibatalkan `stopSync()`. Request yang sedang menunggu jaringan ikut batal - bukan dibiarkan
   * selesai membawa data sesi lama ke server yang cookie-nya sudah akun lain.
   */
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

  // Client bawaan selalu membawa identitas pemilik sesi. `http` yang disuntik (test/tool) memikul
  // tanggung jawab yang sama, tetapi tidak dipaksa di sini supaya controller tetap bisa diuji tanpa
  // jaringan.
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

/**
 * Hentikan pengendali aktif. Idempoten: memanggilnya dua kali (atau saat belum pernah start) aman.
 *
 * Request yang sedang jalan DIBATALKAN, dan `inFlight` dilepas: siklus akun berikutnya tidak boleh
 * menunggu - atau mewarisi hasil - promise milik akun sebelumnya.
 */
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

/**
 * Satu siklus sync. `pull` hanya diminta untuk app_open/reconnect/resume/interval; setelah tulis
 * lokal cukup push, karena cursor tidak berubah dan pull tambahan hanya membakar kuota.
 */
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
  const promise = execute(current).finally(() => {
    // Generasi lain sudah mengambil alih (`stopSync` melepas `inFlight`): akhir siklus akun lama
    // tidak boleh menutup siklus akun baru, apalagi menjadwalkan siklus untuknya.
    if (inFlight?.promise !== promise) return

    inFlight = null

    // Pemicu yang datang saat siklus ini berjalan tidak boleh hilang (mis. user menulis lagi saat
    // push sedang mengirim). Jalankan satu siklus susulan; `pendingPull` menentukan perlu pull atau
    // cukup push.
    if (pendingRun && active?.generation === generation) {
      pendingRun = false
      void runSync({ pull: pendingPull })
    }
  })

  inFlight = { generation, promise }
  return promise
}

async function execute(current: ActiveSync): Promise<SyncOutcome | null> {
  const myGeneration = current.generation
  const mySession = current.session

  /**
   * Siklus ini masih milik sesi yang aktif? Diperiksa SEBELUM dan SESUDAH tiap await besar: `stopSync`
   * (logout, ganti akun, pindah rute) bisa terjadi kapan saja saat request menunggu jaringan.
   */
  const isStale = (): boolean =>
    active === null ||
    active.generation !== myGeneration ||
    active.session.userId !== mySession.userId

  if (isStale()) return null

  // Permintaan yang sudah memicu siklus ini dianggap tertangani; permintaan BARU selama menunggu
  // jaringan akan menyalakan `pendingRun` lagi lewat `runSync`.
  pendingRun = false

  const { baseUrl, http, abort } = current
  const nowMs = (): number => mySession.clock.nowMs()

  let pushed = 0
  let pulled = 0

  try {
    // Push berulang: satu panggilan hanya mengirim maksimal satu batch. Import besar bisa
    // meninggalkan ribuan baris, dan timer tidak boleh menunggu 5 menit untuk batch berikutnya.
    for (let batch = 0; batch < MAX_PUSH_BATCHES; batch += 1) {
      if (isStale() || !navigator.onLine) break

      const summary = await pushOutbox({
        storage: mySession.storage,
        http,
        url: `${baseUrl}/v1/sync/push`,
        nowMs: nowMs(),
        hlc: mySession.hlc,
        signal: abort.signal,
      })

      if (isStale()) return null

      pushed += summary.sent
      if (summary.sent === 0 || summary.status === 'offline' || summary.status === 'error') break
      if ((await mySession.storage.countOutbox()) === 0) break
    }

    // Hanya generasi pemilik yang boleh mengonsumsi permintaan pull - kalau tidak, permintaan milik
    // akun baru ikut terpakai oleh siklus akun lama.
    if (isStale()) return null

    const shouldPull = pendingPull
    pendingPull = false

    if (shouldPull && navigator.onLine) {
      const summary = await pullDelta({
        storage: mySession.storage,
        http,
        url: `${baseUrl}/v1/sync/pull`,
        nowMs: nowMs(),
        hlc: mySession.hlc,
        signal: abort.signal,
        indexFor: (remote) => buildIndex(mySession, remote),
      })

      if (isStale()) return null

      pulled += summary.applied
    }

    const status = await readSyncStatus({
      storage: mySession.storage,
      online: navigator.onLine,
    })

    return { pushed, pulled, status }
  } catch {
    if (isStale()) return null

    // Kegagalan yang tidak ditangani core (mis. `RecordKeyError`: kunci tidak bisa membuka record,
    // atau adapter storage gagal) berarti siklus berhenti di TENGAH. Statusnya ditandai `error`
    // supaya indikator tidak menampilkan "menunggu/tersinkron" padahal ada yang gagal dan supaya user
    // mendapat tombol coba lagi. Kalau penandaan itu pun gagal, status dibaca apa adanya dari storage.
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
 * `record_index` untuk record hasil pull.
 *
 * Tipe dan rentang ada DI DALAM blob, jadi harus didekripsi dulu. Dua kelas kegagalan diperlakukan
 * berbeda - dan bedanya menjaga data:
 *
 * - **Kunci/kripto gagal (`RecordKeyError`)**: TIDAK ADA record di halaman itu yang bisa dibaca dengan
 *   kunci ini. Pull dihentikan (cursor tidak maju di atas data yang tidak bisa dibuka) dan error
 *   dilaporkan ke status. Melempar di sini memang tujuannya.
 * - **Payload/skema tidak dikenal**: hanya index record itu yang tidak bisa dibangun. Record tetap
 *   disimpan dan baris index lama DIBIARKAN (`'keep'`) - `null` akan MENGHAPUS-nya dan membuat record
 *   hilang dari UI/export selamanya.
 */
async function buildIndex(
  session: LocalDataSession,
  remote: {
    readonly id: string
    readonly hlc: string
    readonly deleted: boolean
    readonly blob: string
  },
): Promise<RecordIndexDecision> {
  const now = session.clock.nowMs()

  let record
  try {
    record = await decodeRecord(session.provider, session.dataKey, {
      ...remote,
      createdAtMs: now,
      updatedAtMs: now,
    })
  } catch (error) {
    if (error instanceof RecordKeyError) throw error

    return RECORD_INDEX_KEEP
  }

  return indexEntryForRecord(record, now)
}
