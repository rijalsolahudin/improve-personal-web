import type { RecordIndexEntry, StoredRecord } from '@improve-personal/core'

import { decodeRecord } from '../storage/record-codec'
import type { LocalDataSession } from '../storage/session'
import { indexEntryForRecord } from '../io/index-entry'
import { notifyRemoteApplied } from './events'
import { listQuarantined, releaseQuarantined } from './quarantine'

/**
 * Bangun ulang `record_index` untuk record yang dulu dikarantina karena blob-nya tidak bisa dibuka.
 *
 * Kenapa ini perlu, padahal sudah ada "bersihkan karantina + minta siklus sync": record yang dulu
 * dikarantina sudah TERSIMPAN di tabel `record` dengan `index: 'keep'`, dan cursor pull sudah
 * melewatinya. Server tidak akan mengirimnya lagi, jadi pull tidak pernah membangun index-nya - record
 * tetap tidak muncul di kalender/daftar/export walaupun datanya ada di perangkat. Satu-satunya sumber
 * yang benar adalah blob LOKAL, dan itulah yang dibaca di sini.
 *
 * Operasinya `putRecordIndex` (core): hanya menulis/menghapus baris `record_index`. `record`,
 * `sync_outbox`, dan `sync_state` tidak disentuh, karena tidak ada data baru - index yang belum
 * terbangun bukan perubahan yang perlu dikabarkan ke server. Baris outbox tambahan justru merugikan:
 * push-nya akan dijawab `stale` dan badge "menunggu" naik tanpa guna.
 *
 * Hasil per record, dan bedanya menjaga data:
 * - **Berhasil dibuka**: index dibangun dari payload yang sudah tervalidasi (`indexEntryForRecord`,
 *   jalur yang sama dengan import & pull), lalu id keluar dari karantina.
 * - **`RecordKeyError`** (kunci data tidak cocok): tetap terkarantina. Tidak ada yang bisa dilakukan
 *   dengan blob yang tidak bisa dibuka; menghapusnya atau menghapus index lama justru menghilangkan
 *   data.
 * - **Payload/skema tidak dikenal** (bukan `RecordKeyError`): tetap terkarantina dan baris index lama
 *   DIBIARKAN. Menulis `null` akan MENGHAPUS baris itu dan membuat record hilang dari UI selamanya;
 *   build yang lebih baru mungkin bisa membacanya nanti.
 * - **Record tidak ada di penyimpanan**: keluar dari karantina. Tidak ada yang bisa dipulihkan, dan
 *   mempertahankannya hanya membuat percobaan berikutnya sia-sia.
 *
 * Tidak pernah melempar untuk satu record yang gagal: satu blob rusak tidak boleh menghentikan
 * pemulihan record lain. Storage yang menolak dibaca/ditulis juga tidak melempar - daftar karantina
 * dibiarkan apa adanya supaya percobaan berikutnya masih punya id-nya.
 */

export type ReindexResult = {
  /** Jumlah record yang baris `record_index`-nya benar-benar dibangun ulang. */
  readonly recovered: number
  /**
   * Jumlah record yang MASIH tidak bisa dibuka setelah percobaan ini - angka yang sama dengan badge
   * "tidak bisa dibuka" di shell (`blockedCount`). Entri yang masih menunggu percobaan berikutnya ikut
   * dihitung: bagi user, record yang belum tampil tetap belum tampil.
   */
  readonly remaining: number
}

/**
 * Bangun ulang index record terkarantina milik `session.userId`.
 *
 * `dueOnly: true` menyentuh HANYA entri yang sudah lewat `QUARANTINE_TTL_MS`; dipakai jalur otomatis
 * saat halaman dibuka supaya percobaan ulang tidak mendekripsi semua record setiap muat halaman.
 * `dueOnly: false` dipakai aksi user ("Coba buka ulang") dan setelah pemulihan kunci.
 */
export async function reindexQuarantined(
  session: LocalDataSession,
  options: { readonly dueOnly: boolean },
): Promise<ReindexResult> {
  const candidates = listQuarantined(session.userId).filter(
    (entry) => !options.dueOnly || entry.isDue,
  )
  if (candidates.length === 0) return { recovered: 0, remaining: remainingCount(session.userId) }

  const ids = candidates.map((entry) => entry.recordId)

  // Satu panggilan untuk semua id: membaca per id berarti N transaksi IndexedDB untuk pekerjaan yang
  // selalu dibutuhkan bersama.
  const stored = await session.storage.getRecords(ids).catch(() => null)
  // Storage diblokir/ditolak: daftar karantina dibiarkan apa adanya, bukan diklaim pulih.
  if (stored === null) return { recovered: 0, remaining: remainingCount(session.userId) }

  const byId = new Map(stored.map((record) => [record.id, record]))
  const nowMs = session.clock.nowMs()

  /** Index benar-benar terbangun: layak memicu muat ulang store. */
  const recoveredIds: string[] = []
  /** Berhasil dipulihkan ATAU tidak ada lagi di storage: tidak perlu dicoba lagi. */
  const releasedIds: string[] = []

  for (const recordId of ids) {
    const record = byId.get(recordId)

    if (record === undefined) {
      releasedIds.push(recordId)
      continue
    }

    const index = await indexOf(session, record, nowMs)
    if (index === null) continue

    try {
      // Dekripsi selesai SEBELUM transaksi: tidak boleh ada `await` non-storage di dalamnya.
      await session.storage.runTransaction('sync.reindex', (tx) =>
        tx.putRecordIndex(recordId, index),
      )
    } catch {
      // Penulisan index gagal (storage penuh/diblokir): id tetap terkarantina supaya bisa dicoba lagi.
      continue
    }

    recoveredIds.push(recordId)
    releasedIds.push(recordId)
  }

  if (releasedIds.length > 0) releaseQuarantined(session.userId, releasedIds)

  // Event ini artinya "data lokal berubah, muat ulang" - bukan hanya "pull menerapkan sesuatu".
  // Tanpa ini record yang pulih tetap tidak tampil sampai halaman dimuat ulang, karena store sudah
  // ter-hydrate dari snapshot sebelum index-nya ada.
  if (recoveredIds.length > 0) notifyRemoteApplied()

  return { recovered: recoveredIds.length, remaining: remainingCount(session.userId) }
}

/** Sisa yang belum tampil setelah percobaan ini: terkarantina baru maupun yang menunggu dibangun ulang. */
function remainingCount(ownerId: string): number {
  return listQuarantined(ownerId).length
}

/**
 * Entri `record_index` dari blob lokal, atau `null` kalau blob-nya belum bisa dipakai.
 *
 * `RecordKeyError` (kunci masih tidak cocok) dan payload/skema tidak dikenal sama-sama menghasilkan
 * `null` - dua-duanya berarti "jangan sentuh apa pun, biarkan terkarantina". Yang membedakannya hanya
 * sebabnya, dan sebabnya tidak mengubah tindakan di sini.
 */
async function indexOf(
  session: LocalDataSession,
  record: StoredRecord,
  nowMs: number,
): Promise<RecordIndexEntry | null> {
  try {
    const decoded = await decodeRecord(session.provider, session.dataKey, record)
    return indexEntryForRecord(decoded, nowMs)
  } catch {
    return null
  }
}
