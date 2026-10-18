import {
  SYNC_DEFAULT_PULL_LIMIT,
  SYNC_MAX_PULL_LIMIT,
  syncPullResultSchema,
  type ErrorCode,
  type ServerRecord,
} from '@improve-personal/contracts'

import type { RecordIndexEntry, SyncStatus } from '../domain/envelope.ts'
import { HttpError, type HttpClient, type HttpRequestInit, type StorageAdapter } from '../ports.ts'
import { decideMerge } from './merge.ts'
import { pullOutboxId } from './outbox.ts'

/**
 * Pull delta berhalaman dari cursor (ARCHITECTURE.md §9, `GET /v1/sync/pull`).
 *
 * Aturan yang dipegang di sini:
 * - **Cursor hidup di client** (`sync_state.cursor`) dan HANYA berasal dari `nextCursor` jawaban
 *   pull - bukan dari `serverSeq` hasil push (`packages/contracts/src/sync.ts`).
 * - **Halaman berikutnya diminta selama server masih mengirim penuh.** Halaman kosong = selesai.
 * - **Merge LWW** lewat `decideMerge` (HLC, tie-break deviceId) - bukan "yang datang belakangan
 *   menang".
 * - **`409 SYNC_RESET_REQUIRED`** (cursor di bawah watermark purge) = reset cursor ke 0 lalu pull
 *   ulang dari awal. Tanpa itu, perangkat yang lama offline bisa menghidupkan lagi data yang sudah
 *   user hapus (zombie resurrection).
 * - **Record hasil pull tidak dikirim balik ke server.** `putRecord` selalu menulis baris outbox,
 *   jadi baris itu ditulis dengan id turunan lalu dibuang di transaksi yang sama
 *   (`pullOutboxId`). Kalau tidak, setiap pull akan memicu push balik ke server - loop yang tidak
 *   pernah berhenti.
 */

/** Kode `409` dari contracts; dijaga test supaya tidak jadi string lokal yang menyimpang. */
export const SYNC_RESET_REQUIRED_CODE: ErrorCode = 'SYNC_RESET_REQUIRED'

/** Pagar supaya loop halaman tidak bisa berjalan tanpa akhir kalau server berperilaku aneh. */
export const SYNC_PULL_MAX_PAGES_DEFAULT = 100

export type PullDeltaInput = {
  readonly storage: StorageAdapter
  readonly http: HttpClient
  /** URL absolut `GET /v1/sync/pull` (tanpa query); core menambahkan `cursor` + `limit`. */
  readonly url: string
  readonly nowMs: number
  readonly pageLimit?: number
  readonly maxPages?: number
  readonly signal?: unknown
  /**
   * Hook opsional untuk menulis `record_index` record yang baru diterapkan.
   *
   * Core tidak bisa membangunnya sendiri: `entity_type` dan rentang tanggal ada DI DALAM blob
   * (`ADR 4`), jadi butuh kunci data untuk membukanya - dan itu milik shell yang sudah unlock.
   * Default `null`: record diterapkan tanpa index, dan shell membangun ulang index-nya saat unlock
   * (`database.dbml` Bagian A: index boleh dibangun ulang di memori). Record yang benar-benar
   * berubah memang wajib dibangun ulang - kalau versi lokal yang menang, record ini tidak disentuh.
   */
  readonly indexFor?: (record: ServerRecord) => RecordIndexEntry | null
}

export type PullSummary = {
  readonly pages: number
  /** Record yang versinya menang dan benar-benar ditulis. */
  readonly applied: number
  /** Record yang versi lokalnya (atau HLC-nya sama) menang - tidak ditulis. */
  readonly skipped: number
  /** Cursor setelah pull; `0` kalau server minta reset dan halaman pertama pun kosong. */
  readonly cursor: number
  /** Berapa kali server meminta reset cursor (maksimum 1 per pemanggilan). */
  readonly resets: number
  readonly status: SyncStatus
}

export function buildPullUrl(baseUrl: string, cursor: number, limit: number): string {
  const separator = baseUrl.includes('?') ? '&' : '?'
  return `${baseUrl}${separator}cursor=${cursor}&limit=${limit}`
}

export async function pullDelta(input: PullDeltaInput): Promise<PullSummary> {
  const limit = clampLimit(input.pageLimit ?? SYNC_DEFAULT_PULL_LIMIT)
  const maxPages = input.maxPages ?? SYNC_PULL_MAX_PAGES_DEFAULT
  const init: HttpRequestInit = input.signal === undefined ? {} : { signal: input.signal }

  const state = await input.storage.getSyncState()
  let cursor = state?.cursor ?? 0

  let pages = 0
  let applied = 0
  let skipped = 0
  let resets = 0

  /**
   * Keluar dengan status gagal tanpa mengubah cursor: yang gagal cuma percobaan kali ini, jadi pull
   * berikutnya harus mengulang dari cursor yang sama (bukan dari 0, dan bukan dari halaman setengah
   * jalan).
   */
  const fail = async (failureStatus: SyncStatus): Promise<PullSummary> => {
    await patchStatus(input.storage, failureStatus)
    return { pages, applied, skipped, cursor, resets, status: failureStatus }
  }

  while (pages < maxPages) {
    let raw: unknown

    try {
      raw = await input.http.getJson<unknown>(buildPullUrl(input.url, cursor, limit), init)
    } catch (error) {
      if (error instanceof HttpError && error.code === SYNC_RESET_REQUIRED_CODE) {
        if (resets > 0) {
          // Server minta reset lagi padahal baru saja kita reset: jangan berputar selamanya.
          return await fail('error')
        }

        resets += 1
        cursor = 0
        await input.storage.runTransaction('sync.pull.reset', async (tx) => {
          await tx.patchSyncState({ cursor: 0 })
        })
        continue
      }

      return await fail(error instanceof HttpError ? 'error' : 'offline')
    }

    const parsed = syncPullResultSchema.safeParse(raw)
    if (!parsed.success) {
      return await fail('error')
    }

    const { records, nextCursor } = parsed.data
    if (records.length === 0) break

    pages += 1

    const locals = await input.storage.getRecords(records.map((record) => record.id))
    const localById = new Map(locals.map((record) => [record.id, record] as const))

    const toApply = records.filter(
      (remote) => decideMerge(localById.get(remote.id) ?? null, remote).action !== 'skip',
    )
    applied += toApply.length
    skipped += records.length - toApply.length

    await input.storage.runTransaction('sync.pull.merge', async (tx) => {
      for (const remote of toApply) {
        const outboxId = pullOutboxId(remote.id, remote.hlc)

        await tx.putRecord({
          sealed: {
            id: remote.id,
            hlc: remote.hlc,
            deleted: remote.deleted,
            blob: remote.blob,
          },
          index: input.indexFor === undefined ? null : input.indexFor(remote),
          op: remote.deleted ? 'delete' : 'put',
          outbox: { id: outboxId, queuedAtMs: input.nowMs },
        })

        // Record dari server tidak boleh dikirim balik - lihat catatan modul ini.
        await tx.deleteOutboxRows([outboxId])
      }

      // Cursor dan perubahan record ikut transaksi yang sama: cursor yang naik tanpa record yang
      // diterapkan = perubahan itu terlewat selamanya.
      await tx.patchSyncState({ cursor: nextCursor, lastPullAtMs: input.nowMs })
    })

    if (nextCursor <= cursor) {
      // Server tidak memajukan cursor; berhenti daripada meminta halaman yang sama terus.
      break
    }

    cursor = nextCursor

    if (records.length < limit) break
  }

  const pendingCount = await input.storage.countOutbox()
  const finalStatus = await patchStatus(input.storage, pendingCount > 0 ? 'pending' : 'synced')

  return { pages, applied, skipped, cursor, resets, status: finalStatus }
}

function clampLimit(limit: number): number {
  if (!Number.isSafeInteger(limit) || limit < 1) return SYNC_DEFAULT_PULL_LIMIT
  return Math.min(limit, SYNC_MAX_PULL_LIMIT)
}

async function patchStatus(storage: StorageAdapter, status: SyncStatus): Promise<SyncStatus> {
  await storage.runTransaction('sync.pull.status', async (tx) => {
    await tx.patchSyncState({ status })
  })
  return status
}
