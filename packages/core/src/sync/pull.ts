import {
  SYNC_DEFAULT_PULL_LIMIT,
  SYNC_MAX_PULL_LIMIT,
  syncPullResultSchema,
  type ErrorCode,
  type ServerRecord,
} from '@improve-personal/contracts'

import type { RecordIndexEntry, SyncStatus } from '../domain/envelope.ts'
import { HttpError, type HttpClient, type HttpRequestInit, type StorageAdapter } from '../ports.ts'
import type { HlcGenerator } from './hlc.ts'
import { decideMerge } from './merge.ts'
import { pullOutboxId } from './outbox.ts'
import { readSyncStatus } from './status.ts'

/**
 * Pull delta berhalaman dari cursor (ARCHITECTURE.md §9, `GET /v1/sync/pull`).
 *
 * Server mengirim `payload` PLAINTEXT (sudah dibuka dari ciphertext miliknya sendiri). Karena itu pull
 * tidak lagi butuh kunci user untuk memutuskan apa pun: urusan kripto yang tersisa hanyalah menyegel
 * payload dengan kunci PERANGKAT sebelum ditulis ke penyimpanan lokal (`sealForStorage`).
 *
 * Aturan yang dipegang di sini:
 * - **Cursor hidup di client** (`sync_state.cursor`) dan HANYA berasal dari `nextCursor` jawaban
 *   pull - bukan dari `serverSeq` hasil push (`packages/contracts/src/sync.ts`).
 * - **Halaman berikutnya diminta sampai `nextCursor` berhenti maju.** Halaman pendek BUKAN tanda
 *   selesai: server boleh memotong halaman karena plafon byte (`SYNC_MAX_PULL_BYTES`), dan kontrak
 *   menyatakan klien wajib melanjutkan dari `nextCursor` (`packages/contracts/src/sync.ts`).
 * - **HLC server diadopsi lewat `hlc.observe()`** untuk SEMUA record yang terlihat. Payload datang
 *   dari server kita sendiri lewat TLS, jadi HLC-nya sah; tanpa adopsi, tulisan lokal sesudah pull
 *   memakai jam yang mungkin tertinggal dan edit terakhir kalah dari versi lama.
 * - **Tombstone tetap diterapkan walau payload tidak dihitung index-nya.** `deleted` adalah metadata
 *   plaintext, bukan isi payload.
 * - **Merge LWW** lewat `decideMerge` (HLC, tie-break deviceId) - bukan "yang datang belakangan
 *   menang".
 * - **Tulisan lokal yang mendarat di tengah pull tetap menang.** Versi lokal dibaca DUA kali: sebelum
 *   `indexFor` dan sesudahnya, tepat sebelum transaksi tulis.
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
  /**
   * Generator HLC perangkat ini. Record yang terlihat di-`observe` supaya tulisan lokal berikutnya
   * lebih besar dari HLC sah mana pun yang sudah ada di server.
   */
  readonly hlc: HlcGenerator
  /**
   * Bangun `record_index` dari `payload` remote. Payload sudah plaintext, jadi TIDAK perlu await
   * kripto - tapi boleh asinkron untuk kenyamanan shell.
   *
   * `null` = record ini memang tidak punya dimensi waktu (baris index lama dihapus).
   */
  readonly indexFor?: (
    record: ServerRecord,
  ) => RecordIndexEntry | null | Promise<RecordIndexEntry | null>
  /**
   * Segel `payload` remote dengan kunci PERANGKAT sebelum disimpan lokal (XChaCha20-Poly1305).
   *
   * Dipanggil DI LUAR transaksi tulis: kripto adalah `await` non-storage, dan transaksi IndexedDB
   * auto-commit kalau ada pekerjaan lain diselipkan di antaranya. Melempar = halaman itu tidak
   * ditulis dan cursor tidak maju, jadi record akan datang lagi di pull berikutnya - tidak ada yang
   * hilang diam-diam.
   */
  readonly sealForStorage: (record: ServerRecord) => Promise<string>
  readonly pageLimit?: number
  readonly maxPages?: number
  readonly signal?: unknown
}

export type PullSummary = {
  readonly pages: number
  /** Record yang versinya menang dan benar-benar ditulis. */
  readonly applied: number
  /** Record yang tidak ditulis karena versi lokal (atau HLC sama) menang. */
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

    // HLC semua record yang terlihat diadopsi: payload datang dari server sendiri lewat TLS, jadi
    // tidak ada versi yang perlu "dibuktikan" lagi seperti pada era blob terenkripsi client.
    for (const remote of records) input.hlc.observe(remote.hlc)

    const candidates = records.filter(
      (remote) => decideMerge(localById.get(remote.id) ?? null, remote).action !== 'skip',
    )

    // Index dihitung di LUAR transaksi, dengan payload plaintext: tidak ada dekripsi di jalur ini.
    const indexById = new Map<string, RecordIndexEntry | null>()
    for (const remote of candidates) {
      indexById.set(remote.id, input.indexFor === undefined ? null : await input.indexFor(remote))
    }

    // Snapshot KEDUA, sesudah `indexFor`: tulisan lokal yang mendarat selama perhitungan index harus
    // ikut diputuskan. HLC lokal monoton naik, jadi hasil re-cek selalu himpunan bagian `candidates`.
    const toApply = await recheckCandidates(input.storage, candidates)

    // Segel SEMUA record yang akan ditulis SEBELUM transaksi: kripto adalah `await` non-storage.
    const sealedById = new Map<string, string>()
    for (const remote of toApply) {
      sealedById.set(remote.id, await input.sealForStorage(remote))
    }

    applied += toApply.length
    skipped += records.length - toApply.length

    await input.storage.runTransaction('sync.pull.merge', async (tx) => {
      for (const remote of toApply) {
        const outboxId = pullOutboxId(remote.id, remote.hlc)
        const blob = sealedById.get(remote.id)
        if (blob === undefined) throw new Error(`pullDelta: blob ${remote.id} tidak tersegel`)

        await tx.putRecord({
          sealed: {
            id: remote.id,
            hlc: remote.hlc,
            deleted: remote.deleted,
            blob,
          },
          index: indexById.get(remote.id) ?? null,
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

    // TIDAK ada break berbasis `records.length < limit`: halaman pendek bisa berarti server memotong
    // karena plafon byte, bukan karena delta habis. Selesai hanya kalau halaman kosong (di atas) atau
    // `nextCursor` tidak maju.
  }

  // Satu sumber derivasi status: baris outbox yang pernah gagal (`lastError`) harus tetap `error`,
  // bukan ditimpa `pending` hanya karena outbox masih berisi. Lihat `status.ts`.
  const finalStatus = await readSyncStatus({ storage: input.storage, online: true })
  await patchStatus(input.storage, finalStatus)

  return { pages, applied, skipped, cursor, resets, status: finalStatus }
}

function clampLimit(limit: number): number {
  if (!Number.isSafeInteger(limit) || limit < 1) return SYNC_DEFAULT_PULL_LIMIT
  return Math.min(limit, SYNC_MAX_PULL_LIMIT)
}

/**
 * Baca ulang kandidat dan buang yang versi lokalnya sudah menang.
 *
 * Perlu dibaca ulang karena keputusan merge pertama diambil dari snapshot yang usianya selebar
 * pekerjaan `indexFor`. Tulisan lokal yang mendarat di jendela itu tidak terlihat snapshot pertama,
 * dan tanpa re-cek versi server yang LEBIH TUA akan menimpanya.
 */
async function recheckCandidates(
  storage: StorageAdapter,
  candidates: readonly ServerRecord[],
): Promise<readonly ServerRecord[]> {
  const fresh = await storage.getRecords(candidates.map((record) => record.id))
  const freshById = new Map(fresh.map((record) => [record.id, record] as const))

  return candidates.filter(
    (remote) => decideMerge(freshById.get(remote.id) ?? null, remote).action !== 'skip',
  )
}

async function patchStatus(storage: StorageAdapter, status: SyncStatus): Promise<SyncStatus> {
  await storage.runTransaction('sync.pull.status', async (tx) => {
    await tx.patchSyncState({ status })
  })
  return status
}
