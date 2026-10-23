import {
  SYNC_MAX_BATCH,
  compareHlc,
  syncPushResultSchema,
  type SyncPushResult,
} from '@improve-personal/contracts'

import type { SealedRecord, SyncStatus } from '../domain/envelope.ts'
import {
  HttpError,
  type HttpClient,
  type HttpRequestInit,
  type OutboxRow,
  type StorageAdapter,
  type StoredRecord,
} from '../ports.ts'
import type { HlcGenerator } from './hlc.ts'

/**
 * Push outbox ke server (ARCHITECTURE.md §9, kontrak `POST /v1/sync/push` di `packages/contracts`).
 *
 * Aturan yang dipegang di sini:
 * - **Batch ≤ `SYNC_MAX_BATCH`.** Diambil dari konstanta contracts, bukan angka lokal.
 * - **Urut naik berdasarkan `hlc`** (perbandingan tuple, bukan string). Server menerapkan upsert
 *   berurutan dalam satu batch; tanpa urutan naik hasilnya bisa berbeda hanya karena urutan array
 *   - dan itu bikin dua perangkat bisa berakhir dengan pemenang berbeda.
 * - **Baris outbox dibuang hanya untuk status yang benar-benar selesai** (`applied` dan `stale`).
 *   `stale` tetap "selesai": server sudah punya versi yang lebih baru, jadi mengirim ulang kiriman
 *   yang kalah tidak akan pernah berhasil. `serverHlc` dari jawaban `stale` di-`observe` supaya
 *   tulisan lokal berikutnya pasti lebih besar dari versi yang menang - tanpa itu, perangkat yang
 *   jamnya tertinggal bisa kalah berulang kali dari versi lama dan tidak pernah pulih.
 *   `rejected` TIDAK dibuang dan TIDAK diulang tanpa jejak - barisnya disimpan dengan `attempts` +
 *   pesan error generik supaya UI bisa menawarkan pilihan.
 * - **Pesan error tidak pernah memuat isi record.** Yang disimpan cuma kode (`REJECTED`,
 *   `RECORD_MISSING`, ...) - bukan blob, bukan token, bukan pesan server mentah.
 * - **Gagal jaringan ≠ gagal server.** Timeout/tidak sampai server berarti `offline` (outbox tetap
 *   menumpuk, bukan error); jawaban non-2xx berarti `error`.
 */

/** Baris outbox menunjuk record yang tidak ada lagi di `record`. */
export const OUTBOX_ERROR_RECORD_MISSING = 'RECORD_MISSING'
/** Server menolak record secara permanen; baris disimpan supaya user tahu ada yang tidak terkirim. */
export const OUTBOX_ERROR_REJECTED = 'REJECTED'
/** Server tidak memberi status untuk sebuah record - jawabannya tidak lengkap. */
export const OUTBOX_ERROR_MISSING_RESULT = 'MISSING_RESULT'
/** Jawaban server tidak cocok dengan `syncPushResultSchema`. */
export const OUTBOX_ERROR_INVALID_RESPONSE = 'INVALID_RESPONSE'

export type PushOutboxInput = {
  readonly storage: StorageAdapter
  readonly http: HttpClient
  /** URL absolut `POST /v1/sync/push`; core tidak menyimpan base URL atau token. */
  readonly url: string
  readonly nowMs: number
  /**
   * Generator HLC perangkat ini. Dipakai untuk mengadopsi `serverHlc` saat server menjawab `stale`,
   * supaya tulisan lokal berikutnya lebih besar dari versi server yang menang.
   */
  readonly hlc: HlcGenerator
  /** Default `SYNC_MAX_BATCH`; lebih kecil hanya untuk test. */
  readonly maxBatch?: number
  /** `AbortSignal` milik platform. */
  readonly signal?: unknown
}

export type PushSummary = {
  /** Jumlah record unik yang benar-benar dikirim (bukan jumlah baris outbox). */
  readonly sent: number
  /** Record yang versinya diterima server. */
  readonly applied: number
  /** Record yang kalah dari versi server - selesai, tidak diulang. */
  readonly stale: number
  /** Record yang ditolak permanen; barisnya tetap ada dengan `attempts` + `lastError`. */
  readonly rejected: number
  /** Baris outbox yang tidak bisa diselesaikan: record hilang, jawaban tidak lengkap, atau gagal kirim. */
  readonly failed: number
  readonly status: SyncStatus
}

export async function pushOutbox(input: PushOutboxInput): Promise<PushSummary> {
  const batchLimit = input.maxBatch ?? SYNC_MAX_BATCH
  const rows = await input.storage.listOutbox(batchLimit)

  if (rows.length === 0) {
    return { sent: 0, applied: 0, stale: 0, rejected: 0, failed: 0, status: 'synced' }
  }

  const recordIds = [...new Set(rows.map((row) => row.recordId))]
  const stored = await input.storage.getRecords(recordIds)
  const byId = new Map(stored.map((record) => [record.id, record] as const))

  const missingRows = rows.filter((row) => !byId.has(row.recordId))
  const usableRows = rows.filter((row) => byId.has(row.recordId))

  for (const row of missingRows) {
    await input.storage.markOutboxFailure(row.id, { lastError: OUTBOX_ERROR_RECORD_MISSING })
  }

  /**
   * Beberapa baris outbox bisa menunjuk record yang sama (user menulis berkali-kali saat offline);
   * yang dikirim cukup satu record, tapi SEMUA barisnya selesai bersama begitu server membalas -
   * server idempoten terhadap `hlc` yang sama, jadi mengirim duplikat hanya memboroskan bandwidth.
   */
  const payloads = recordIds
    .filter((id) => byId.has(id))
    .map((id) => requireRecord(byId, id))
    .sort(byHlcAscending)
    .map(toSealedDto)

  if (payloads.length === 0) {
    const status = await patchStatus(input.storage, 'error')
    return {
      sent: 0,
      applied: 0,
      stale: 0,
      rejected: 0,
      failed: missingRows.length,
      status,
    }
  }

  const init: HttpRequestInit = input.signal === undefined ? {} : { signal: input.signal }

  let result: SyncPushResult
  try {
    const raw = await input.http.postJson<unknown>(input.url, { records: payloads }, init)
    const parsed = syncPushResultSchema.safeParse(raw)

    if (!parsed.success) {
      await markRowsFailed(input.storage, usableRows, OUTBOX_ERROR_INVALID_RESPONSE)
      const status = await patchStatus(input.storage, 'error')
      return {
        sent: payloads.length,
        applied: 0,
        stale: 0,
        rejected: 0,
        failed: missingRows.length + usableRows.length,
        status,
      }
    }

    result = parsed.data
  } catch (error) {
    // Tidak sampai server (timeout/DNS/offline) = bukan error data: outbox tetap menunggu.
    const status = await patchStatus(
      input.storage,
      error instanceof HttpError ? 'error' : 'offline',
    )
    return {
      sent: payloads.length,
      applied: 0,
      stale: 0,
      rejected: 0,
      failed: missingRows.length + usableRows.length,
      status,
    }
  }

  const resultById = new Map(result.results.map((entry) => [entry.id, entry] as const))

  // Hitungan status dihitung per RECORD yang dikirim, bukan per baris outbox: beberapa baris bisa
  // menunjuk record yang sama (user menulis berkali-kali saat offline), dan yang perlu dilaporkan ke
  // user adalah jumlah record - bukan jumlah baris antrean internal.
  let applied = 0
  let stale = 0
  let rejected = 0

  for (const entry of resultById.values()) {
    if (entry.status === 'applied') applied += 1
    else if (entry.status === 'stale') stale += 1
    else rejected += 1
  }

  const resolvedOutboxIds: string[] = []
  let failed = missingRows.length

  for (const row of usableRows) {
    const rowResult = resultById.get(row.recordId)

    if (rowResult === undefined) {
      await input.storage.markOutboxFailure(row.id, { lastError: OUTBOX_ERROR_MISSING_RESULT })
      failed += 1
      continue
    }

    if (rowResult.status === 'rejected') {
      await input.storage.markOutboxFailure(row.id, { lastError: OUTBOX_ERROR_REJECTED })
      continue
    }

    if (rowResult.status === 'stale' && rowResult.serverHlc !== undefined) {
      // Server menang; versi yang menang itu jadi batas bawah HLC lokal. Record lokalnya sendiri
      // tidak bisa diperbaiki di sini (jawaban `stale` tidak membawa blob) - pull berikutnya yang
      // menarik versi server, dan `serverSeq` versi itu selalu di depan cursor selama HLC lokal
      // belum pernah melewatinya.
      input.hlc.observe(rowResult.serverHlc)
    }

    resolvedOutboxIds.push(row.id)
  }

  const hasFailure = rejected > 0 || failed > 0
  const provisional: SyncStatus = hasFailure ? 'error' : 'pending'

  /**
   * Cursor SENGAJA tidak disentuh di sini: `serverSeq` pada hasil push bukan posisi pull, dan
   * melompatkan cursor ke situ bisa melewati record perangkat lain yang belum ditarik
   * (`packages/contracts/src/sync.ts`).
   */
  await input.storage.runTransaction('sync.push.ack', async (tx) => {
    await tx.deleteOutboxRows(resolvedOutboxIds)
    await tx.patchSyncState({ lastPushAtMs: input.nowMs, status: provisional })
  })

  const pendingCount = await input.storage.countOutbox()
  const status: SyncStatus = hasFailure ? 'error' : pendingCount > 0 ? 'pending' : 'synced'

  if (status !== provisional) {
    await patchStatus(input.storage, status)
  }

  return { sent: payloads.length, applied, stale, rejected, failed, status }
}

function byHlcAscending(a: StoredRecord, b: StoredRecord): number {
  return compareHlc(a.hlc, b.hlc)
}

function toSealedDto(record: StoredRecord): SealedRecord {
  return {
    id: record.id,
    hlc: record.hlc,
    deleted: record.deleted,
    blob: record.blob,
  }
}

function requireRecord(byId: ReadonlyMap<string, StoredRecord>, id: string): StoredRecord {
  const record = byId.get(id)
  if (record === undefined) throw new Error(`record ${id} hilang di tengah pushOutbox`)
  return record
}

async function markRowsFailed(
  storage: StorageAdapter,
  rows: readonly OutboxRow[],
  lastError: string,
): Promise<void> {
  for (const row of rows) {
    await storage.markOutboxFailure(row.id, { lastError })
  }
}

async function patchStatus(storage: StorageAdapter, status: SyncStatus): Promise<SyncStatus> {
  await storage.runTransaction('sync.push.status', async (tx) => {
    await tx.patchSyncState({ status })
  })
  return status
}
