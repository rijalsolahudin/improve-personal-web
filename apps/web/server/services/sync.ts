import {
  compareHlc,
  encodeKid,
  normalizeDeviceId,
  parseHlc,
  parseSealedBlobHeader,
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
import { accountKeys, records, syncWatermarks, type RecordRow } from '../db/schema'
import { apiProblem } from '../utils/api-error'
import { base64ToBytes, bytesToBase64, toBytes } from '../utils/crypto'
import type { ServiceContext } from './context'

/**
 * Sync relay (ARCHITECTURE.md §9, T21 sisi server).
 *
 * Server cuma menyimpan ciphertext + metadata. Yang harus benar di sini cuma dua hal: LWW yang
 * konsisten, dan cursor yang tidak melompati record yang sudah committed.
 *
 * Syarat "cursor tidak melompati record" adalah: untuk satu user, urutan `server_seq` == urutan
 * COMMIT. `nextval` dialokasikan di tengah transaksi dan sequence Postgres tidak transaksional, jadi
 * tanpa serialisasi dua push paralel bisa commit terbalik (T1 dapat 100, T2 dapat 101, T2 commit
 * duluan, perangkat lain pull dan cursor-nya jadi 101, lalu T1 commit -> seq 100 tidak pernah
 * ditarik). Jebakan #4 menutupnya. Kondisinya berlaku PER USER: seq user lain tidak ikut
 * menentukan cursor user ini, karena pull memfilter `user_id` dan cursor hanya dibandingkan dengan
 * seq milik user yang sama.
 *
 * Empat jebakan yang ditutup di berkas ini:
 * 1. Perbandingan HLC lewat `compareHlc` dari kontrak - SATU implementasi untuk server dan client.
 *    Membandingkan string HLC mentah salah begitu panjang digitnya beda (`'999-0-a' > '1000-0-b'`),
 *    dan dua pembanding yang berbeda pendapat membuat data divergen permanen.
 * 2. `server_seq` diperbarui saat record yang sudah ada menang lagi. Kalau baris di-update di tempat
 *    tanpa `server_seq` baru, perangkat yang sudah melewati seq itu TIDAK PERNAH menarik versi
 *    barunya - perubahan hilang diam-diam untuk semua perangkat selain penulisnya.
 * 3. Halaman pull kosong mengembalikan cursor yang DIKIRIM klien, bukan 0 (lihat `pullRecords`).
 * 4. Push per user diserialkan lewat advisory lock transaksi (lihat `pushRecords`), sehingga seq yang
 *    lebih kecil selalu sudah committed sebelum seq yang lebih besar dialokasikan. Pull tidak
 *    mengambil lock apa pun.
 */

/** Transaksi drizzle yang dipakai upsert batch. */
type SyncTransaction = PostgresJsTransaction<
  typeof dbSchema,
  ExtractTablesWithRelations<typeof dbSchema>
>

/**
 * Awalan kunci advisory lock push. Namespace terpisah dari lock lain di DB yang sama (mis.
 * `devices:<userId>` di `device.ts`) supaya kunci tidak bertabrakan lintas fitur.
 */
const PUSH_LOCK_NAMESPACE = 'sync-push'

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
 *
 * Push user yang sama DISERIALKAN lewat `pg_advisory_xact_lock` yang diambil sebagai statement
 * PERTAMA transaksi - sebelum `SELECT ... FOR UPDATE` dan `nextval` pertama. Kenapa harus di awal:
 * lock itulah yang menjamin seq dialokasikan hanya setelah push sebelumnya (user yang sama) commit,
 * jadi urutan seq == urutan commit dan cursor pull tidak bisa melompati record yang belum committed.
 *
 * Kenapa advisory lock dan bukan alternatif lain:
 * - Lock per USER, bukan global: push user lain tetap paralel; yang menunggu hanya perangkat milik
 *   akun yang sama, dan itu jarang (beberapa perangkat per akun, batch kecil).
 * - Dilepas otomatis saat commit/rollback, jadi request yang crash tidak meninggalkan lock menggantung.
 * - Berlaku per DATABASE, bukan per proses, jadi tetap benar kalau API jalan di lebih dari satu instance.
 * - Pull tidak mengambil lock, sehingga jalur baca yang panas tidak melambat.
 * - Tabrakan `hashtext` antar user hanya membuat dua user saling menunggu sebentar; tidak memengaruhi
 *   kebenaran data.
 */
export async function pushRecords(
  ctx: ServiceContext,
  userId: string,
  incoming: readonly SealedRecordDto[],
): Promise<SyncPushResult> {
  const results: SyncRecordResult[] = []

  await ctx.db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`${PUSH_LOCK_NAMESPACE}:${userId}`}))`,
    )

    // Dibaca SEKALI per batch, setelah lock: klaim identity tidak berubah selama transaksi ini.
    const activeKid = await readActiveKid(tx, userId)

    for (const record of incoming) {
      results.push(await upsertRecord(tx, ctx, userId, record, activeKid))
    }
  })

  return { results }
}

/** KID aktif akun dalam bentuk wire, atau `null` kalau belum pernah diklaim. */
async function readActiveKid(tx: SyncTransaction, userId: string): Promise<string | null> {
  const rows = await tx
    .select({ kid: accountKeys.kid })
    .from(accountKeys)
    .where(eq(accountKeys.userId, userId))
    .limit(1)

  const row = rows[0]

  return row ? encodeKid(toBytes(row.kid)) : null
}

async function upsertRecord(
  tx: SyncTransaction,
  ctx: ServiceContext,
  userId: string,
  record: SealedRecordDto,
  activeKid: string | null,
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

  // Blob harus berformat v2 dan dikunci dengan KID aktif akun. Akun tanpa KID juga menolak semua:
  // klien wajib mengklaim identity dulu. Ini pertahanan server; kunci sungguhan hanya dibuktikan AEAD
  // di client (KID di header bukan bukti memegang kunci).
  const header = parseSealedBlobHeader(bytes)
  if (!header || activeKid === null || encodeKid(header.kid) !== activeKid) {
    return { id: record.id, status: 'rejected' }
  }
  const kid = new Uint8Array(header.kid)

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

      const updated = await updateRecord(tx, ctx, userId, record, tuple, bytes, kid)
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
        kid,
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
  kid: Uint8Array,
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
      kid,
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
