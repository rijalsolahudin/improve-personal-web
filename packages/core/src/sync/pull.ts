import {
  SYNC_DEFAULT_PULL_LIMIT,
  SYNC_MAX_PULL_LIMIT,
  syncPullResultSchema,
  type ErrorCode,
  type ServerRecord,
} from '@improve-personal/contracts'

import type { RecordIndexEntry, SyncStatus } from '../domain/envelope.ts'
import {
  HttpError,
  type HttpClient,
  type HttpRequestInit,
  RECORD_INDEX_KEEP,
  RECORD_PULL_FOREIGN,
  RECORD_PULL_REJECT,
  type StorageAdapter,
} from '../ports.ts'
import { isV1DowngradeOfV2, type BlobKeyIdentity } from './blob-origin.ts'
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
 *   perangkat diam-diam divergen. Record yang `skipped` karena versi lokal menang tetap di-`observe`:
 *   nilai HLC-nya sudah ada di server. Record HIDUP yang blob-nya GAGAL dibuka (`indexFor` =>
 *   `'keep'`) TIDAK di-`observe`: HLC-nya belum terbukti berasal dari blob yang sah (kunci lain/
 *   rusak), jadi tidak boleh menarik jam lokal. Tombstone (`deleted = true`) dikecualikan: flag itu
 *   metadata plaintext, dan kalau tombstone diterapkan, HLC-nya ikut tersimpan di record lokal -
 *   jam lokal harus melewatinya supaya edit berikutnya tidak kalah dari tombstone yang baru ditulis.
 *   Semua `observe` terjadi sebelum keputusan akhir merge.
 * - **Blob remote yang gagal dibuka tidak menimpa versi lokal yang hidup.** `'keep'` dari `indexFor`
 *   berarti blob itu tidak terbaca di perangkat ini. Kalau versi lokal sudah ada (masih terbaca),
 *   menimpanya dengan blob yang tak terbaca = data hilang; record lokal + index lamanya dibiarkan
 *   utuh. Kalau belum ada versi lokal, blob tetap disimpan (jalur karantina shell: tidak ada yang
 *   bisa hilang, dan cursor bisa maju).
 * - **Tombstone remote tetap diterapkan walau `'keep'`.** `deleted` dibaca dari metadata, bukan dari
 *   blob, jadi penghapusan yang sah tidak butuh dekripsi. Melewatinya membuat cursor maju tanpa
 *   tombstone diambil ulang - record yang user hapus hidup lagi permanen di perangkat ini. Tombstone
 *   tetap tunduk pada LWW (`decideMerge`): yang kalah atau berHLC sama dilewati. Karena record sudah
 *   mati, baris `record_index`-nya dihapus seperti penghapusan lokal (`deleteRecord` memakai index
 *   `null`); membiarkannya hanya meninggalkan entri yatim.
 * - **`'reject'` dikarantina, bukan dibuang** (spec #120 M2). Blob yang terbukti tidak sah (KID kita
 *   tapi AEAD gagal, v1 sesudah `v1Closed`, v1 menimpa v2 lokal) tidak ditulis ke record, tidak
 *   menimpa versi lokal, dan HLC-nya tidak di-`observe`; blob mentahnya diserahkan ke `onReject`
 *   (store karantina milik shell). Cursor tetap maju. Tanpa `onReject`, `'reject'` melempar - itu bug
 *   penyambungan, bukan data: membuang diam-diam sama dengan kehilangan bukti tamper.
 * - **`'foreign'` (KID lain, atau versi blob tak dikenal) tidak pernah menghapus.** Seperti `'keep'`, tapi tombstone-nya pun tidak
 *   menimpa versi lokal, dan HLC-nya tidak di-`observe` (tombstone `'keep'` v1 tetap diterapkan lewat
 *   LWW seperti #111). Tanpa versi lokal, blob disimpan `opaque` untuk rescue.
 * - **Remote sah menang atas record `opaque`** berapa pun HLC-nya (M3): record yang tersimpan tanpa
 *   bisa dibuka tidak boleh membayangi versi sah selamanya. Record lokal non-opaque tidak terpengaruh.
 * - **v1 tidak pernah menimpa v2 lokal yang sah** (W1b), berapa pun HLC-nya - diputuskan di sini
 *   (butuh versi lokal), dengan `keyIdentity` dari shell. Remote itu diperlakukan `'reject'`.
 * - **Merge LWW** lewat `decideMerge` (HLC, tie-break deviceId) - bukan "yang datang belakangan
 *   menang".
 * - **Tulisan lokal yang mendarat di tengah pull tetap menang.** Versi lokal dibaca DUA kali: sebelum
 *   `indexFor` (kripto, bisa lama) dan sesudahnya, tepat sebelum transaksi tulis. Karena itu edit
 *   lokal ber-HLC lebih tinggi tidak ditimpa versi server yang lebih tua walau editnya masuk saat
 *   blob halaman sedang didekripsi. `onReject` (I/O) dijalankan SEBELUM re-cek, bukan di antara re-cek
 *   dan transaksi; satu-satunya `await` I/O yang tersisa sesudah re-cek adalah karantina downgrade W1b,
 *   dan itu diikuti re-cek ulang. Jadi sisa jendela hanya `await` internal storage (`runTransaction`
 *   sendiri) - bukan kripto dan bukan karantina. Menutupnya sepenuhnya butuh compare-and-swap di
 *   `StorageAdapter`, dan port itu belum punya; jadi tidak diklaim tertutup.
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

type IndexDecision =
  | RecordIndexEntry
  | null
  | typeof RECORD_INDEX_KEEP
  | typeof RECORD_PULL_REJECT
  | typeof RECORD_PULL_FOREIGN

/** Hasil `indexFor` yang berarti blob remote dibuka dan sah (entry atau `null`), bukan blob tak terbaca. */
function isAccepted(decision: IndexDecision | undefined): boolean {
  return (
    decision !== RECORD_INDEX_KEEP &&
    decision !== RECORD_PULL_REJECT &&
    decision !== RECORD_PULL_FOREIGN
  )
}

/** `'keep'`/`'foreign'`: blob tersimpan tanpa bisa dibuka, jadi record lokalnya ditandai `opaque`. */
function isUnreadable(decision: IndexDecision | undefined): boolean {
  return decision === RECORD_INDEX_KEEP || decision === RECORD_PULL_FOREIGN
}

export type PullDeltaInput = {
  readonly storage: StorageAdapter
  readonly http: HttpClient
  /** URL absolut `GET /v1/sync/pull` (tanpa query); core menambahkan `cursor` + `limit`. */
  readonly url: string
  readonly nowMs: number
  /**
   * Generator HLC perangkat ini. Record yang lolos verifikasi di-`observe`, termasuk yang versinya
   * kalah (`skipped`) - tapi bukan record hidup yang blob-nya gagal dibuka (`indexFor` => `'keep'`;
   * tombstone dikecualikan, lihat catatan modul) - supaya
   * tulisan lokal berikutnya lebih besar dari HLC sah mana pun yang sudah terlihat di server.
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
   * Lima nilai yang boleh dikembalikan (dua terakhir: lihat catatan modul dan `ports.ts`):
   * - `RecordIndexEntry` - index baru untuk record ini.
   * - `null` - record diterapkan TANPA index; baris index lama dihapus. Hanya benar kalau record-nya
   *   memang tidak punya dimensi waktu. Shell tetap bisa membangun ulang index saat unlock
   *   (`database.dbml` Bagian A: index boleh dibangun ulang di memori).
   * - `'keep'` (`RECORD_INDEX_KEEP`) - blob remote TIDAK bisa dibuka (kunci/skema/rusak), jadi index
   *   tidak bisa dihitung. Kalau versi lokal sudah ada, record remote DILEWATI (record + index lama
   *   utuh) dan HLC-nya tidak di-`observe`. Kalau belum ada versi lokal, blob remote tetap disimpan
   *   tanpa menyentuh `record_index` (jalur karantina shell). `null` di kasus ini salah: ia
   *   menghapus `record_index` yang masih sah - lihat `ports.ts`. Pengecualian: tombstone remote
   *   yang menang LWW tetap diterapkan (index-nya dihapus, HLC-nya di-`observe`).
   * - `'reject'` (`RECORD_PULL_REJECT`) - blob tidak sah: tidak ditulis, tidak di-`observe`,
   *   diserahkan ke `onReject`.
   * - `'foreign'` (`RECORD_PULL_FOREIGN`) - blob v2 milik KID lain: seperti `'keep'`, tetapi
   *   tombstone-nya tidak menimpa versi lokal dan HLC-nya tidak di-`observe`.
   */
  readonly indexFor?: (record: ServerRecord) => IndexDecision | Promise<IndexDecision>
  /**
   * Kait karantina untuk `'reject'` (dan v1-menimpa-v2): menerima record mentah (blob utuh). Dipanggil
   * SEBELUM cursor dimajukan; kalau melempar, halaman itu tidak di-commit dan cursor tidak maju, jadi
   * blob akan datang lagi di pull berikutnya - tidak ada yang terbuang. Implementasi sebaiknya tidak
   * melempar kecuali storage benar-benar gagal.
   */
  readonly onReject?: (record: ServerRecord) => void | Promise<void>
  /**
   * KID yang dikenal perangkat ini. Dipakai aturan W1b (v1 tidak menimpa v2 lokal sah). Tanpa ini aturan
   * itu tidak aktif - perilaku v1 murni (#111) tidak berubah.
   */
  readonly keyIdentity?: BlobKeyIdentity
}

export type PullSummary = {
  readonly pages: number
  /** Record yang versinya menang dan benar-benar ditulis. */
  readonly applied: number
  /**
   * Record yang tidak ditulis: versi lokal (atau HLC sama) menang, atau blob remote gagal dibuka
   * sedangkan versi lokal sudah ada.
   */
  readonly skipped: number
  /** Dari `skipped`: blob yang dikarantina lewat `onReject` (`'reject'` + v1-menimpa-v2). */
  readonly rejected: number
  /** Blob KID lain (`'foreign'`) yang terlihat; yang tanpa versi lokal tetap disimpan `opaque`. */
  readonly foreign: number
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
  let rejected = 0
  let foreign = 0
  let resets = 0

  /**
   * Keluar dengan status gagal tanpa mengubah cursor: yang gagal cuma percobaan kali ini, jadi pull
   * berikutnya harus mengulang dari cursor yang sama (bukan dari 0, dan bukan dari halaman setengah
   * jalan).
   */
  const fail = async (failureStatus: SyncStatus): Promise<PullSummary> => {
    await patchStatus(input.storage, failureStatus)
    return { pages, applied, skipped, rejected, foreign, cursor, resets, status: failureStatus }
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

    // Record yang kalah dari versi lokal tidak butuh dibuka (blob-nya tidak akan ditulis), dan HLC-nya
    // sah di server, jadi langsung di-`observe`. Sisanya (`candidates`) baru di-`observe` setelah
    // lolos verifikasi di bawah. Pengecekan ini optimistis soal bukti (`incomingAuthenticated`): lokal
    // `opaque` bisa dikalahkan remote sah berapa pun HLC-nya, jadi belum boleh dibuang sebelum blob dibuka.
    const candidates: ServerRecord[] = []
    for (const remote of records) {
      const decision = decideMerge(localById.get(remote.id) ?? null, remote, {
        incomingAuthenticated: true,
      })
      if (decision.action === 'skip') {
        input.hlc.observe(remote.hlc)
      } else {
        candidates.push(remote)
      }
    }

    // Index dihitung di LUAR transaksi: membuka blob itu operasi kripto (await non-storage), dan
    // transaksi IndexedDB auto-commit kalau ada pekerjaan lain diselipkan di antara request-nya.
    // Karena itu snapshot `getRecords` di atas diambil SEBELUM kripto, lalu dibaca ulang tepat
    // sebelum menulis (di bawah) - lihat catatan modul soal jendela balapan.
    const indexById = new Map<string, IndexDecision>()
    for (const remote of candidates) {
      let index: IndexDecision = input.indexFor === undefined ? null : await input.indexFor(remote)

      // W1b dicek juga di sini (snapshot pertama) supaya record yang ditolak tidak sempat di-`observe`.
      if (isAccepted(index) && isDowngrade(localById.get(remote.id), remote, input.keyIdentity)) {
        index = RECORD_PULL_REJECT
      }
      indexById.set(remote.id, index)

      // `observe` per record, langsung setelah terverifikasi (bukan di akhir halaman): edit lokal yang
      // mendarat selama record berikutnya didekripsi sudah memakai jam yang melewati HLC server ini.
      // Blob yang tidak terbukti (`'reject'`, `'foreign'`, dan record hidup `'keep'`) tidak di-`observe`.
      // Tombstone `'keep'` dikecualikan: `deleted` tidak butuh dekripsi dan HLC-nya akan tersimpan
      // lokal. Tombstone `'foreign'` TIDAK dikecualikan - ia tidak diterapkan atas versi lokal, jadi
      // HLC-nya tidak boleh menarik jam.
      if (isAccepted(index) || (index === RECORD_INDEX_KEEP && remote.deleted)) {
        input.hlc.observe(remote.hlc)
      }
    }

    // Karantina snapshot-1 DULU, sebelum snapshot kedua: `onReject` itu I/O (IndexedDB, blob sampai
    // 1 MB), jadi kalau dijalankan di antara re-cek dan transaksi, jendela balapannya melebar sebesar
    // itu - dan server bisa sengaja menyelipkan blob reject untuk memperlebarnya.
    const rejectedNow = candidates.filter(
      (remote) => indexById.get(remote.id) === RECORD_PULL_REJECT,
    )
    await quarantine(input.onReject, rejectedNow)

    // Snapshot KEDUA, sesudah kripto dan karantina: tulisan lokal yang mendarat selama `indexFor`
    // berjalan harus ikut diputuskan. Tanpa ini, edit lokal ber-HLC lebih tinggi yang datang di tengah
    // dekripsi ditimpa versi server yang lebih tua. Himpunan hasil re-cek hanya bisa MENYUSUT (HLC
    // lokal monoton naik): record yang sudah kalah di snapshot pertama tidak mungkin menang
    // belakangan, jadi tidak ada record yang jadi terlewat.
    // Downgrade (W1b) baru terlihat di snapshot ini, jadi karantinanya tak bisa mendahului re-cek.
    // Setelah dikarantina, sisa kandidat dibaca ulang supaya tidak ada `await` I/O di antara re-cek
    // terakhir dan transaksi; tiap putaran membuang >= 1 kandidat, jadi pasti berhenti.
    let pending: readonly ServerRecord[] = candidates.filter(
      (remote) => indexById.get(remote.id) !== RECORD_PULL_REJECT,
    )
    let toApply: readonly ServerRecord[] = []
    let quarantined = rejectedNow.length
    while (pending.length > 0) {
      const recheck = await recheckCandidates(input.storage, pending, indexById, input.keyIdentity)
      toApply = recheck.toApply
      if (recheck.downgraded.length === 0) break

      await quarantine(input.onReject, recheck.downgraded)
      quarantined += recheck.downgraded.length
      pending = recheck.toApply
    }

    applied += toApply.length
    skipped += records.length - toApply.length
    rejected += quarantined
    foreign += candidates.filter(
      (remote) => indexById.get(remote.id) === RECORD_PULL_FOREIGN,
    ).length

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
          index: indexToWrite(remote, indexById.get(remote.id) ?? null),
          ...(isUnreadable(indexById.get(remote.id)) ? { opaque: true } : {}),
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

  return { pages, applied, skipped, rejected, foreign, cursor, resets, status: finalStatus }
}

/**
 * Serahkan blob `'reject'` ke `onReject` (karantina milik shell) sebelum cursor dimajukan. Tanpa
 * `onReject`, melempar: itu bug penyambungan, dan membuang diam-diam sama dengan kehilangan bukti tamper.
 */
async function quarantine(
  onReject: PullDeltaInput['onReject'],
  records: readonly ServerRecord[],
): Promise<void> {
  if (records.length === 0) return
  if (onReject === undefined) {
    throw new Error('pullDelta: keputusan reject tanpa onReject (blob tidak boleh dibuang)')
  }
  for (const remote of records) await onReject(remote)
}

function clampLimit(limit: number): number {
  if (!Number.isSafeInteger(limit) || limit < 1) return SYNC_DEFAULT_PULL_LIMIT
  return Math.min(limit, SYNC_MAX_PULL_LIMIT)
}

/**
 * Baca ulang kandidat dan buang yang tidak boleh ditulis:
 * - versi lokalnya sudah menang (LWW, atau `opaque` yang dikalahkan remote sah - M3);
 * - blob remote-nya tak terbaca (`'keep'` hidup, `'foreign'` hidup ATAU tombstone) sedangkan versi
 *   lokal sudah ada;
 * - v1 yang akan menimpa v2 lokal sah (W1b): bukan sekadar dilewati, tapi dikembalikan di
 *   `downgraded` supaya dikarantina.
 *
 * Syarat-syarat itu dicek di snapshot TERBARU ini, bukan snapshot pertama: versi lokal yang baru
 * mendarat selama dekripsi juga harus dilindungi dari blob yang tidak terbaca. Tanpa versi lokal,
 * record `'keep'`/`'foreign'` lolos (jalur karantina shell) - tidak ada yang bisa tertimpa. Tombstone
 * `'keep'` (v1) tidak kena syarat itu: ia tidak membawa data yang bisa hilang, dan keputusannya
 * diserahkan ke `decideMerge` (#111). Tombstone `'foreign'` lain: KID asing tidak berhak menghapus.
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
  indexById: ReadonlyMap<string, IndexDecision>,
  keyIdentity: BlobKeyIdentity | undefined,
): Promise<{ toApply: readonly ServerRecord[]; downgraded: readonly ServerRecord[] }> {
  const fresh = await storage.getRecords(candidates.map((record) => record.id))
  const freshById = new Map(fresh.map((record) => [record.id, record] as const))

  const toApply: ServerRecord[] = []
  const downgraded: ServerRecord[] = []
  for (const remote of candidates) {
    const local = freshById.get(remote.id) ?? null
    const decision = indexById.get(remote.id)

    if (isAccepted(decision) && isDowngrade(local ?? undefined, remote, keyIdentity)) {
      downgraded.push(remote)
      continue
    }

    if (local !== null) {
      if (decision === RECORD_INDEX_KEEP && !remote.deleted) continue
      if (decision === RECORD_PULL_FOREIGN) continue
    }

    const merge = decideMerge(local, remote, { incomingAuthenticated: isAccepted(decision) })
    if (merge.action !== 'skip') toApply.push(remote)
  }

  return { toApply, downgraded }
}

/** W1b: tanpa `keyIdentity` aturan ini mati (perilaku v1 murni, #111). */
function isDowngrade(
  local: { readonly blob: string } | undefined,
  remote: ServerRecord,
  keyIdentity: BlobKeyIdentity | undefined,
): boolean {
  if (keyIdentity === undefined || local === undefined) return false

  return isV1DowngradeOfV2(local.blob, remote.blob, keyIdentity)
}

/**
 * Tombstone yang diterapkan tidak boleh meninggalkan baris index: record-nya sudah mati, dan
 * `'keep'` (index tak bisa dihitung) di sini justru akan membiarkan entri yatim. `'foreign'` ditulis
 * sebagai `'keep'` (hanya `'keep'`/entry/`null` yang dikenal `RecordWrite`). `'reject'` tidak pernah
 * sampai sini.
 */
function indexToWrite(
  remote: ServerRecord,
  decision: IndexDecision,
): RecordIndexEntry | null | typeof RECORD_INDEX_KEEP {
  if (decision === RECORD_PULL_REJECT) {
    throw new Error('pullDelta: record reject tidak boleh ditulis')
  }
  if (decision === RECORD_PULL_FOREIGN) return remote.deleted ? null : RECORD_INDEX_KEEP

  return remote.deleted && decision === RECORD_INDEX_KEEP ? null : decision
}

async function patchStatus(storage: StorageAdapter, status: SyncStatus): Promise<SyncStatus> {
  await storage.runTransaction('sync.pull.status', async (tx) => {
    await tx.patchSyncState({ status })
  })
  return status
}
