import {
  compareHlc,
  normalizeDeviceId,
  parseHlc,
  SEALED_RECORD_MAX_BLOB_BYTES,
  SYNC_MAX_PULL_BYTES,
  type HlcTuple,
  type SealedRecordDto,
  type ServerRecord,
  type SyncPullQuery,
  type SyncPullResult,
  type SyncPushResult,
  type SyncRecordResult,
} from '@improve-personal/contracts'
import type { ExtractTablesWithRelations } from 'drizzle-orm'
import { and, asc, eq, gt, sql } from 'drizzle-orm'
import type { PostgresJsTransaction } from 'drizzle-orm/postgres-js'

import type * as dbSchema from '../db/schema'
import { records, syncWatermarks, type RecordRow } from '../db/schema'
import { apiProblem } from '../utils/api-error'
import { base64ToBytes, bytesToBase64, toBytes } from '../utils/crypto'
import type { ServiceContext } from './context'

/**
 * Sync relay (ARCHITECTURE.md §9, T21 sisi server).
 *
 * Server cuma menyimpan ciphertext + metadata. Yang harus benar di sini cuma dua hal: LWW yang
 * konsisten, dan cursor yang tidak pernah melompati record yang belum terkirim.
 *
 * Tiga jebakan yang ditutup di berkas ini:
 * 1. Perbandingan HLC lewat `compareHlc` dari kontrak - SATU implementasi untuk server dan client.
 *    Membandingkan string HLC mentah salah begitu panjang digitnya beda (`'999-0-a' > '1000-0-b'`),
 *    dan dua pembanding yang berbeda pendapat membuat data divergen permanen.
 * 2. `server_seq` diperbarui saat record yang sudah ada menang lagi. Kalau baris di-update di tempat
 *    tanpa `server_seq` baru, perangkat yang sudah melewati seq itu TIDAK PERNAH menarik versi
 *    barunya - perubahan hilang diam-diam untuk semua perangkat selain penulisnya.
 * 3. Halaman pull kosong mengembalikan cursor yang DIKIRIM klien, bukan 0 (lihat `pullRecords`).
 */

/** Transaksi drizzle yang dipakai upsert batch. */
type SyncTransaction = PostgresJsTransaction<
  typeof dbSchema,
  ExtractTablesWithRelations<typeof dbSchema>
>

/**
 * Batas percobaan insert saat baris dibuat request paralel di antara SELECT dan INSERT.
 * Percobaan kedua selalu menemukan barisnya, jadi tidak ada alasan mencoba lebih dari dua kali.
 */
const MAX_UPSERT_ATTEMPTS = 2

/**
 * Batch push: SATU transaksi untuk seluruh batch.
 *
 * Sebagian batch masuk dan sebagian tidak akan membuat klien dan server berbeda pendapat soal isi
 * outbox. Hasil per record tetap dilaporkan satu-satu (`applied`/`stale`/`rejected`) sesuai kontrak.
 */
export async function pushRecords(
  ctx: ServiceContext,
  userId: string,
  incoming: readonly SealedRecordDto[],
): Promise<SyncPushResult> {
  const results: SyncRecordResult[] = []

  await ctx.db.transaction(async (tx) => {
    for (const record of incoming) {
      results.push(await upsertRecord(tx, ctx, userId, record))
    }
  })

  return { results }
}

async function upsertRecord(
  tx: SyncTransaction,
  ctx: ServiceContext,
  userId: string,
  record: SealedRecordDto,
): Promise<SyncRecordResult> {
  // `hlc` sudah divalidasi `hlcSchema` di kontrak. `parseHlc` tetap dipanggil supaya kalau kontrak
  // dan server tidak sinkron, record itu ditolak SATU-SATU (`rejected`) - bukan menggagalkan seluruh
  // batch karena satu record rusak.
  let tuple: HlcTuple
  try {
    tuple = parseHlc(record.hlc)
  } catch {
    return { id: record.id, status: 'rejected' }
  }

  const bytes = base64ToBytes(record.blob)
  if (bytes.byteLength > SEALED_RECORD_MAX_BLOB_BYTES) return { id: record.id, status: 'rejected' }

  for (let attempt = 0; attempt < MAX_UPSERT_ATTEMPTS; attempt += 1) {
    const existing = await tx
      .select({ hlc: records.hlc })
      .from(records)
      .where(and(eq(records.userId, userId), eq(records.id, record.id)))
      // Kunci barisnya: tanpa ini dua push paralel untuk record yang sama sama-sama membaca versi
      // lama, lalu dua-duanya menulis - dan hasil akhirnya ditentukan urutan commit, bukan HLC.
      .for('update')
      .limit(1)

    const stored = existing[0]

    if (stored) {
      // LWW: incoming hanya menang kalau HLC-nya lebih besar. HLC yang sama atau lebih kecil = stale,
      // dan pemenangnya dikirim balik supaya klien tidak perlu pull tambahan.
      if (compareHlc(record.hlc, stored.hlc) <= 0) {
        return { id: record.id, status: 'stale', serverHlc: stored.hlc }
      }

      const updated = await updateRecord(tx, ctx, userId, record, tuple, bytes)
      return { id: record.id, status: 'applied', serverSeq: updated }
    }

    const inserted = await tx
      .insert(records)
      .values({
        userId,
        id: record.id,
        hlc: record.hlc,
        hlcWallMs: tuple.wallMs,
        hlcCounter: tuple.counter,
        hlcDevice: normalizeDeviceId(tuple.deviceId),
        deleted: record.deleted,
        blob: bytes,
        createdAt: ctx.now,
        updatedAt: ctx.now,
      })
      .onConflictDoNothing({ target: [records.userId, records.id] })
      .returning({ serverSeq: records.serverSeq })

    const created = inserted[0]
    if (created) return { id: record.id, status: 'applied', serverSeq: created.serverSeq }
  }

  // Sampai di sini hanya mungkin kalau baris terus dibuat ulang oleh transaksi lain; itu anomali,
  // bukan alur normal.
  throw apiProblem('INTERNAL')
}

/**
 * Tulis versi yang menang dan beri posisi BARU di cursor.
 *
 * `serverSeq: nextval('records_seq')` bukan hiasan: itu yang membuat perangkat lain menarik versi ini
 * pada pull berikutnya (jebakan #2 di header berkas).
 */
async function updateRecord(
  tx: SyncTransaction,
  ctx: ServiceContext,
  userId: string,
  record: SealedRecordDto,
  tuple: HlcTuple,
  bytes: Uint8Array,
): Promise<number> {
  const updated = await tx
    .update(records)
    .set({
      hlc: record.hlc,
      hlcWallMs: tuple.wallMs,
      hlcCounter: tuple.counter,
      hlcDevice: normalizeDeviceId(tuple.deviceId),
      deleted: record.deleted,
      blob: bytes,
      updatedAt: ctx.now,
      serverSeq: sql`nextval('records_seq')`,
    })
    .where(and(eq(records.userId, userId), eq(records.id, record.id)))
    .returning({ serverSeq: records.serverSeq })

  const row = updated[0]
  if (!row) throw apiProblem('INTERNAL')

  return row.serverSeq
}

/** Bentuk record saat pull - sama dengan yang dikirim klien, ditambah posisinya di server. */
function toServerRecord(row: RecordRow): ServerRecord {
  return {
    id: row.id,
    hlc: row.hlc,
    deleted: row.deleted,
    blob: bytesToBase64(row.blob),
    serverSeq: row.serverSeq,
  }
}

/**
 * Delta berhalaman berdasarkan `server_seq`.
 *
 * Cursor di bawah `sync_watermarks.purged_seq` ditolak `409 SYNC_RESET_REQUIRED` - tanpa itu,
 * perangkat yang lama offline bisa "menghidupkan lagi" record yang sudah dipurge (zombie
 * resurrection).
 *
 * Halaman kosong mengembalikan cursor yang DIKIRIM klien. Reset ke 0 akan memaksa full pull ulang di
 * setiap polling kosong, dan biayanya tumbuh terus seiring jumlah record.
 *
 * Halaman dibatasi DUA arah (temuan H2 audit keamanan): `query.limit` record, lalu `SYNC_MAX_PULL_BYTES`
 * byte ciphertext. Tanpa plafon byte, `limit=500` pada akun berisi record 1 MB berarti satu respons
 * ~500 MB ciphertext (~670 MB setelah base64 + JSON) yang seluruhnya dibangun di memori proses ini
 * SEBELUM dikirim - dan bisa diulang kapan saja.
 */
export async function pullRecords(
  ctx: ServiceContext,
  userId: string,
  query: SyncPullQuery,
): Promise<SyncPullResult> {
  const watermark = await ctx.db
    .select({ purgedSeq: syncWatermarks.purgedSeq })
    .from(syncWatermarks)
    .where(eq(syncWatermarks.userId, userId))
    .limit(1)

  if (query.cursor < (watermark[0]?.purgedSeq ?? 0)) throw apiProblem('SYNC_RESET_REQUIRED')

  const rows = await ctx.db
    .select()
    .from(records)
    .where(and(eq(records.userId, userId), gt(records.serverSeq, query.cursor)))
    .orderBy(asc(records.serverSeq))
    .limit(query.limit)

  const page = takeWithinByteBudget(rows)
  const last = page.at(-1)

  return {
    records: page.map(toServerRecord),
    nextCursor: last ? last.serverSeq : query.cursor,
  }
}

/**
 * Ambil baris sebanyak yang masih muat dalam plafon byte, berurutan naik.
 *
 * Yang dijaga:
 * - Baris pertama SELALU ikut. Kalau tidak, satu record yang (karena apa pun) lebih besar dari plafon
 *   akan membuat halaman kosong selamanya di cursor yang sama: klien menarik, dapat kosong, cursor
 *   tidak bergerak, ulangi - dan record itu tidak pernah bisa ditarik.
 * - Setelah itu, berhenti pada baris pertama yang membuat totalnya melewati plafon. Baris yang tidak
 *   ikut disertakan tetap tersedia di halaman berikutnya, karena `nextCursor` = `serverSeq` baris
 *   terakhir yang BENAR-BENAR dikirim.
 *
 * Byte yang dihitung adalah ukuran ciphertext setelah decode (satuan yang sama dengan
 * `SEALED_RECORD_MAX_BLOB_BYTES`), bukan panjang base64-nya. Base64 memang ~33% lebih besar di wire,
 * tapi yang menentukan memori server adalah blob yang dibaca dari DB lalu diserialisasi - dan angka
 * kontrak ini yang paling mudah dipahami klien.
 */
function takeWithinByteBudget(rows: readonly RecordRow[]): RecordRow[] {
  const page: RecordRow[] = []
  let totalBytes = 0

  for (const row of rows) {
    const blobBytes = toBytes(row.blob).byteLength

    if (page.length > 0 && totalBytes + blobBytes > SYNC_MAX_PULL_BYTES) break

    page.push(row)
    totalBytes += blobBytes
  }

  return page
}
