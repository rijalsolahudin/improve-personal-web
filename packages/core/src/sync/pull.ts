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
 * Aturan yang dipegang di sini:
 * - **Cursor hidup di client** (`sync_state.cursor`) dan HANYA berasal dari `nextCursor` jawaban
 *   pull - bukan dari `serverSeq` hasil push (`packages/contracts/src/sync.ts`).
 * - **Halaman berikutnya diminta sampai `nextCursor` berhenti maju.** Halaman pendek BUKAN tanda
 *   selesai: server boleh memotong halaman karena plafon byte (`SYNC_MAX_PULL_BYTES`), dan kontrak
 *   menyatakan klien wajib melanjutkan dari `nextCursor` (`packages/contracts/src/sync.ts`).
 *   Selesai = halaman kosong atau `nextCursor` tidak maju.
 * - **HLC server diadopsi lewat `hlc.observe()`.** Tanpa ini, tulisan lokal sesudah pull memakai jam
 *   lokal yang mungkin tertinggal dari perangkat lain - edit terakhir kalah dari versi lama dan dua
 *   perangkat diam-diam divergen. Record yang `skipped` pun tetap di-`observe`: nilai HLC-nya sudah
 *   ada di server walaupun versi lokal menang.
 * - **Merge LWW** lewat `decideMerge` (HLC, tie-break deviceId) - bukan "yang datang belakangan
 *   menang".
 * - **Tulisan lokal yang mendarat di tengah pull tetap menang.** Versi lokal dibaca DUA kali: sebelum
 *   `indexFor` (kripto, bisa lama) dan sesudahnya, tepat sebelum transaksi tulis. Karena itu edit
 *   lokal ber-HLC lebih tinggi tidak ditimpa versi server yang lebih tua walau editnya masuk saat
 *   blob halaman sedang didekripsi. Sisa jendela: antara re-cek dan `runTransaction` - beberapa
 *   microtask tanpa kripto. Menutupnya sepenuhnya butuh compare-and-swap di `StorageAdapter`, dan
 *   port itu belum punya; jadi tidak diklaim tertutup.
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
   * Generator HLC perangkat ini. Setiap record yang diterima di-`observe`, termasuk yang versinya
   * kalah (`skipped`), supaya tulisan lokal berikutnya selalu lebih besar dari HLC mana pun yang
   * sudah terlihat di server.
   */
  readonly hlc: HlcGenerator
  readonly pageLimit?: number
  readonly maxPages?: number
  readonly signal?: unknown
  /**
   * Hook opsional untuk menulis `record_index` record yang baru diterapkan.
   *
   * Core tidak bisa membangunnya sendiri: `entity_type` dan rentang tanggal ada DI DALAM blob
   * (`ADR 4`), jadi butuh kunci data untuk membukanya - dan itu milik shell yang sudah unlock.
   * Boleh asinkron (shell harus mendekripsi blob dulu). Nilainya DIHITUNG SEBELUM transaksi tulis:
   * `runTransaction` dilarang menyelipkan `await` non-storage di tengah transaksi (port §3).
   *
   * Tiga nilai yang boleh dikembalikan:
   * - `RecordIndexEntry` - index baru untuk record ini.
   * - `null` - record diterapkan TANPA index; baris index lama dihapus. Hanya benar kalau record-nya
   *   memang tidak punya dimensi waktu. Shell tetap bisa membangun ulang index saat unlock
   *   (`database.dbml` Bagian A: index boleh dibangun ulang di memori).
   * - `'keep'` - JANGAN sentuh baris index lama. Dipakai saat index tidak bisa dihitung (mis. blob
   *   gagal didekripsi karena skema lebih baru): record tetap diterapkan, tapi ia tidak boleh hilang
   *   dari kalender/overview/export hanya karena index-nya tidak sempat dibangun. `null` di kasus itu
   *   menghapus `record_index` yang masih sah - lihat `ports.ts`.
   */
  readonly indexFor?: (
    record: ServerRecord,
  ) => RecordIndexEntry | null | 'keep' | Promise<RecordIndexEntry | null | 'keep'>
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

    // Adopsi HLC server SEBELUM merge: keputusan merge memakai HLC record yang tersimpan, sedangkan
    // `observe` hanya memengaruhi tulisan LOKAL berikutnya. Karena itu semua record di halaman ikut
    // di-`observe` - termasuk yang nanti `skipped`, yang HLC-nya tetap hidup di server.
    for (const remote of records) input.hlc.observe(remote.hlc)

    pages += 1

    const locals = await input.storage.getRecords(records.map((record) => record.id))
    const localById = new Map(locals.map((record) => [record.id, record] as const))

    const candidates = records.filter(
      (remote) => decideMerge(localById.get(remote.id) ?? null, remote).action !== 'skip',
    )

    // Index dihitung di LUAR transaksi: membuka blob itu operasi kripto (await non-storage), dan
    // transaksi IndexedDB auto-commit kalau ada pekerjaan lain diselipkan di antara request-nya.
    // Karena itu snapshot `getRecords` di atas diambil SEBELUM kripto, lalu dibaca ulang tepat
    // sebelum menulis (di bawah) - lihat catatan modul soal jendela balapan.
    const indexById = new Map<string, RecordIndexEntry | null | 'keep'>()
    if (input.indexFor !== undefined) {
      for (const remote of candidates) {
        indexById.set(remote.id, await input.indexFor(remote))
      }
    }

    // Snapshot KEDUA, sesudah kripto: tulisan lokal yang mendarat selama `indexFor` berjalan harus
    // ikut diputuskan. Tanpa ini, edit lokal ber-HLC lebih tinggi yang datang di tengah dekripsi
    // ditimpa versi server yang lebih tua. Himpunan hasil re-cek hanya bisa MENYUSUT (HLC lokal
    // monoton naik): record yang sudah kalah di snapshot pertama tidak mungkin menang belakangan,
    // jadi tidak ada record yang jadi terlewat.
    const toApply =
      candidates.length === 0 ? candidates : await recheckCandidates(input.storage, candidates)

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
 * Kenapa perlu dibaca ulang: keputusan merge diambil dari snapshot yang usianya selebar pekerjaan
 * kripto `indexFor` (dekripsi blob per record). Tulisan lokal yang mendarat di jendela itu tidak
 * terlihat snapshot pertama, dan tanpa re-cek versi server yang LEBIH TUA akan menimpanya. HLC
 * perangkat ini monoton naik, jadi hasil saringan ini selalu himpunan bagian dari `candidates` -
 * tidak ada record yang jadi terlewat karena re-cek.
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
