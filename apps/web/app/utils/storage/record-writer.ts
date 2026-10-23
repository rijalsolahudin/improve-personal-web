import {
  buildRecordWrite,
  commitLocalWrite,
  makeRecord,
  syncOpFor,
  type Clock,
  type CryptoProvider,
  type EntityType,
  type HlcGenerator,
  type Record,
  type RecordIndexEntry,
  type SecureKeyMaterial,
  type StorageAdapter,
} from '@improve-personal/core'

import { notifyLocalWrite } from '../sync/events'
import { decodeRecord, encodeRecord } from './record-codec'
import { createOutboxId, createUuidV7Generator } from './uuid'

/**
 * Jalur TULIS record lokal (ARCHITECTURE §5 "tulis lokal dulu, selalu").
 *
 * Aturan yang dipegang:
 * - **Satu transaksi.** Record, entri index, dan baris outbox ditulis bersama lewat
 *   `commitLocalWrite` dari core. Kalau tidak, crash di antaranya bikin data tersimpan tapi tidak
 *   pernah terkirim - hilang diam-diam.
 * - **UI tidak pernah menunggu jaringan.** Fungsi di sini hanya menyentuh penyimpanan lokal; jaringan
 *   urusan `sync/`.
 * - **`hlc` diambil per tulisan** dari generator yang sama untuk seluruh perangkat ini, supaya urutan
 *   tulisan tidak bergantung pada jam yang bisa mundur.
 */

export type RecordWriterDeps = {
  readonly storage: StorageAdapter
  readonly provider: CryptoProvider
  readonly dataKey: SecureKeyMaterial
  readonly hlc: HlcGenerator
  readonly clock: Clock
  /** Sumber acak untuk id & baris outbox; disuntik di test. */
  readonly random?: (bytes: number) => Uint8Array
}

/** Rentang waktu record di `record_index`. `null` = entitas tanpa dimensi waktu (mis. `user_prefs`). */
export type IndexRangeInput = {
  readonly rangeStartMs: number | null
  readonly rangeEndMs: number | null
}

export type WriteRecordInput = {
  readonly type: EntityType
  /**
   * Payload entitas, dibangun dari `id` record.
   *
   * Sengaja fungsi, bukan objek: payload entitas di core memuat `id`-nya sendiri (`todoSchema.id`,
   * `goalSchema.id`, ...), dan `id` itu juga dipakai sebagai rujukan antar record (`todo.scheduleId`).
   * Kalau pemanggil boleh mengisi `data` langsung, payload bisa membawa id yang berbeda dari envelope -
   * dan itu bug yang tidak terlihat sampai ada fitur yang menautkan record. Dengan bentuk fungsi,
   * invariant "id payload = id record" tidak bisa dilanggar.
   */
  readonly data: (id: string) => unknown
  /** Id yang dipakai. Kosong = id baru (UUIDv7). Diisi saat menulis ulang record yang sudah ada. */
  readonly id?: string
  readonly deleted?: boolean
  /**
   * Rentang waktu untuk `record_index`. Tidak diisi = entitas tanpa dimensi waktu.
   *
   * Baris index SELALU ditulis, walau rentangnya `null`. Itu bukan detail: `record_index` satu-satunya
   * cara menemukan record berdasarkan tipe (tipe entitas ada di dalam blob, bukan kolom), jadi record
   * tanpa baris index tidak akan pernah ketemu `listAll` - dan itu berarti hilang dari export.
   */
  readonly index?: IndexRangeInput | null
}

export type WriteResult = {
  readonly id: string
  readonly hlc: string
}

/**
 * Penulis yang dependensinya sudah terikat.
 *
 * Dipakai shell (sesi data lokal) supaya pemanggil tidak perlu membawa `storage`/`provider`/`dataKey`/
 * `hlc` ke mana-mana - dan supaya tidak ada tempat lain yang bisa "lupa" memakai HLC yang sama.
 */
export type RecordWriter = {
  readonly write: (input: WriteRecordInput) => Promise<WriteResult>
  readonly update: <T>(input: {
    readonly id: string
    readonly update: (record: Record<T>) => T
    readonly index?: IndexRangeInput | null
  }) => Promise<WriteResult>
  readonly remove: (input: {
    readonly id: string
    readonly index?: IndexRangeInput | null
  }) => Promise<WriteResult>
}

export function createRecordWriter(deps: RecordWriterDeps): RecordWriter {
  return {
    write: (input) => writeRecord(deps, input),
    update: (input) => updateRecord(deps, input),
    remove: (input) => deleteRecord(deps, input),
  }
}

/** Tulis record baru (atau tulis ulang record yang sudah ada, kalau `id` diisi). */
export async function writeRecord(
  deps: RecordWriterDeps,
  input: WriteRecordInput,
): Promise<WriteResult> {
  const id = input.id ?? createUuidV7Generator({ clock: deps.clock, random: deps.random })()
  const hlc = deps.hlc.tick()
  const nowMs = deps.clock.nowMs()

  const record = makeRecord({
    id,
    type: input.type,
    hlc,
    data: input.data(id),
    deleted: input.deleted ?? false,
  })

  const sealed = await encodeRecord(deps.provider, deps.dataKey, record)

  // Baris index selalu ada (lihat catatan di `WriteRecordInput.index`): rentang `null` berarti entitas
  // tanpa dimensi waktu - record seperti itu tetap harus bisa ditemukan berdasarkan tipe.
  const index: RecordIndexEntry = {
    recordId: id,
    entityType: input.type,
    rangeStartMs: input.index?.rangeStartMs ?? null,
    rangeEndMs: input.index?.rangeEndMs ?? null,
    updatedAtMs: nowMs,
  }

  await commitLocalWrite({
    storage: deps.storage,
    write: buildRecordWrite({
      sealed,
      index,
      op: syncOpFor(sealed),
      outbox: { id: createOutboxId(deps.random), queuedAtMs: nowMs },
    }),
    label: `record.write:${input.type}`,
  })

  // Outbox sudah ikut commit. Plugin sync memakai ini untuk menjadwalkan push berdebounce - tanpa
  // event, satu-satunya pemicu adalah timer, dan data baru bisa tertahan sampai 5 menit.
  notifyLocalWrite()

  return { id, hlc }
}

/**
 * Ubah record yang sudah ada.
 *
 * `update` menerima envelope lengkap (termasuk `hlc`/`deleted`) supaya pemanggil bisa memutuskan
 * berdasarkan versi yang benar-benar ada di disk - bukan berdasarkan salinan di memori yang mungkin
 * sudah basi karena tab lain menulis.
 */
export async function updateRecord<T>(
  deps: RecordWriterDeps,
  input: {
    readonly id: string
    readonly update: (record: Record<T>) => T
    readonly index?: IndexRangeInput | null
  },
): Promise<WriteResult> {
  const existing = await readExisting(deps, input.id)
  const data = input.update({ ...existing, data: existing.data as T })

  return writeRecord(deps, {
    id: input.id,
    type: existing.type,
    data: () => data,
    deleted: existing.deleted,
    index: input.index === undefined ? null : input.index,
  })
}

/**
 * Hapus = tombstone, bukan penghapusan fisik (ARCHITECTURE §9: hapus ikut tersinkron).
 *
 * Isi record tetap disimpan (dengan `deleted = true`) supaya perangkat lain tahu record ini dihapus -
 * kalau barisnya hilang begitu saja, perangkat lain hanya melihat "tidak ada perubahan".
 */
export async function deleteRecord(
  deps: RecordWriterDeps,
  input: { readonly id: string; readonly index?: IndexRangeInput | null },
): Promise<WriteResult> {
  const existing = await readExisting(deps, input.id)

  return writeRecord(deps, {
    id: input.id,
    type: existing.type,
    data: () => existing.data,
    deleted: true,
    index: input.index === undefined ? null : input.index,
  })
}

async function readExisting(deps: RecordWriterDeps, id: string): Promise<Record<unknown>> {
  const stored = await deps.storage.getRecord(id)

  if (stored === null) {
    throw new Error(`record ${id} tidak ada: tidak bisa diubah/dihapus`)
  }

  return decodeRecord(deps.provider, deps.dataKey, stored)
}
