import { z } from 'zod'

import { compareHlc, hlcSchema } from './hlc.ts'
import { optionalIntegerQuerySchema, utf8ByteLength, uuidSchema } from './protocol.ts'

/**
 * Kontrak sinkronisasi (ARCHITECTURE.md §9, PRD F15 "Sync", task T21).
 *
 * Client menulis ke DB lokal dulu (record + outbox dalam SATU transaksi), lalu push batch ke server.
 * Server menyimpan ciphertext miliknya sendiri (AES-256-GCM, kunci di env) + metadata plaintext
 * (id, hlc, tombstone, server_seq). Wire TIDAK membawa ciphertext: `payload` adalah JSON polos yang
 * disegel server sebelum masuk database dan dibuka lagi saat pull.
 *
 * Batas & aturan yang dipegang server:
 * - Satu batch push maksimum `SYNC_MAX_BATCH` (500) record - ARCHITECTURE.md §9.
 * - Server meng-upsert HANYA kalau `hlc` yang masuk > `hlc` tersimpan (LWW), dan perbandingannya WAJIB
 *   lewat `compareHlc` dari `hlc.ts` - bukan perbandingan string.
 * - Pull = delta berhalaman berdasarkan `server_seq` (`server.dbml` `records.server_seq`), dibatasi
 *   DUA arah: `SYNC_MAX_PULL_LIMIT` record DAN `SYNC_MAX_PULL_BYTES` byte ciphertext per halaman.
 *
 * Jebakan yang sengaja ditutup di kontrak ini:
 * - `serverSeq` pada hasil push BUKAN cursor pull. Cursor tidak boleh dilompati ke `server_seq` record
 *   sendiri, karena bisa melangkahi record perangkat lain yang belum ditarik. Cursor hanya boleh
 *   berasal dari `syncPullResultSchema.nextCursor`.
 * - Server bisa menjawab `SYNC_RESET_REQUIRED` (kode di `protocol.ts`) kalau cursor client <
 *   `sync_watermarks.purged_seq`. Client wajib reset cursor ke 0 lalu full pull - tanpa itu, perangkat
 *   yang lama offline bisa "menghidupkan lagi" data yang sudah user hapus (zombie resurrection).
 */

/** Maksimum record per batch push (ARCHITECTURE.md §9). */
export const SYNC_MAX_BATCH = 500

/**
 * Maksimum JUMLAH record satu halaman pull. Client boleh minta lebih kecil; server tidak melampaui
 * ini.
 *
 * Batas jumlah BUKAN satu-satunya batas: `SYNC_MAX_PULL_BYTES` memotong halaman lebih awal begitu
 * total ciphertext-nya kelewat besar. Jadi halaman yang diterima klien boleh LEBIH PENDEK dari
 * `limit` - dan itu bukan kegagalan: klien wajib melanjutkan dari `nextCursor`, bukan menganggap
 * "halaman pendek = sudah selesai".
 */
export const SYNC_MAX_PULL_LIMIT = 500

/** Minimum halaman pull. `limit=0` ditolak supaya klien tidak bisa "pull kosong" tanpa batas. */
export const SYNC_MIN_PULL_LIMIT = 1

/** Halaman pull default: di tengah rentang PRD F15 ("page size ~100-1000 record"). */
export const SYNC_DEFAULT_PULL_LIMIT = 200

/** Tombstone dibersihkan setelah 90 hari, lewat job cron - bukan lewat HTTP (ARCHITECTURE.md §9). */
export const SYNC_TOMBSTONE_RETENTION_DAYS = 90

/**
 * Ukuran maksimum `payload` satu record di wire: 1 MB, dihitung dari `JSON.stringify(payload)` dalam
 * byte UTF-8 (bukan `string.length`).
 *
 * Batas kontrak, jadi harus selaras dengan request size limiter server. Tanpa batas ini, satu client
 * bisa mengirim batch 500 x payload raksasa dan menghabiskan memori server sebelum validasi lain jalan.
 * Server menegakkannya SEBELUM menyegel, jadi ukuran ciphertext selalu `payload + 34 byte`.
 */
export const RECORD_PAYLOAD_MAX_BYTES = 1_048_576

/**
 * Ukuran maksimum blob tersegel di penyimpanan LOKAL (IndexedDB/SQLite) - format v2, lihat
 * `record-format.ts`. Bukan batas wire: yang dikirim ke server adalah `payload` polos
 * (`RECORD_PAYLOAD_MAX_BYTES`), dan yang disimpan server adalah ciphertext milik server sendiri.
 */
export const SEALED_RECORD_MAX_BLOB_BYTES = 1_048_576

/**
 * Plafon BYTE satu halaman pull (temuan H2 audit keamanan) - jumlah byte `payload` yang boleh
 * dikirim server dalam SATU respons.
 *
 * Kenapa perlu, padahal sudah ada `SYNC_MAX_PULL_LIMIT`: 500 record x 1 MB (`RECORD_PAYLOAD_MAX_BYTES`)
 * = ~500 MB payload, dan JSON-nya dibangun seluruhnya DI DALAM memori proses Node (yang juga melayani
 * UI) sebelum dikirim, dan bisa diulang kapan saja oleh akun mana pun (registrasi gratis). Batas
 * jumlah record saja tidak menutup itu.
 *
 * Angka 4 MiB dipilih sadar:
 * - Cukup besar untuk perangkat yang baru bangun dari offline: ratusan record kecil tetap muat dalam
 *   satu halaman (yang menentukan biaya sync sehari-hari adalah jumlah record, bukan byte).
 * - Cukup kecil sehingga satu request tidak bisa mengunci ratusan MB memori; empat record 1 MB penuh
 *   adalah halaman terbesar yang mungkin.
 * - `>= RECORD_PAYLOAD_MAX_BYTES`, jadi halaman tidak pernah kosong selama masih ada record yang
 *   cocok: server selalu menyertakan MINIMAL satu record, sehingga klien tidak bisa terjebak meminta
 *   halaman yang sama tanpa kemajuan. Dijaga test kontrak.
 *
 * Konsekuensi kontrak yang disengaja: halaman bisa lebih pendek daripada `limit` yang diminta klien.
 * Itu tetap sah menurut `syncPullResultSchema` dan bukan breaking change - klien sudah wajib memakai
 * `nextCursor` untuk melanjutkan.
 */
export const SYNC_MAX_PULL_BYTES = 4_194_304

/**
 * `server_seq` = cursor pull (`server.dbml` `records.server_seq`). `0` berarti "belum ada record",
 * jadi schema-nya menerima 0 dan harus tetap muat bilangan aman JS.
 */
export const serverSeqSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)

/**
 * Field record di wire, ditulis SEKALI dan dipakai dua schema di bawah.
 *
 * Dipisah supaya `syncRecordDtoSchema` (yang dikirim client) dan `serverRecordSchema` (yang dikirim
 * server saat pull) tidak bisa divergen: keduanya WAJIB memakai bentuk record yang sama, kalau tidak
 * record yang sudah diterima server bisa ditolak validasi saat ditarik perangkat lain.
 */
const SYNC_RECORD_FIELDS = {
  /** UUIDv7, dibuat client (ARCHITECTURE.md §6). */
  id: uuidSchema,
  hlc: hlcSchema,
  /** Tombstone: hapus ikut tersinkron, bukan hilang diam-diam. */
  deleted: z.boolean(),
  /**
   * JSON polos `{ type, schemaVersion, data }`.
   *
   * Server TIDAK menafsirkan isinya: ia hanya mengukur ukuran hasil `JSON.stringify` lalu
   * menyegelnya dengan kunci milik server. `undefined` ditolak karena tidak punya representasi JSON -
   * mengirimnya berarti record tanpa isi, dan itu bug client, bukan data.
   */
  payload: z
    .json()
    .refine(
      (value) => utf8ByteLength(JSON.stringify(value)) <= RECORD_PAYLOAD_MAX_BYTES,
      `payload maksimum ${RECORD_PAYLOAD_MAX_BYTES} byte`,
    ),
} as const

/**
 * Bentuk record yang dikirim client ke server (ARCHITECTURE.md §6).
 *
 * `type`/`schemaVersion`/`data` ada di dalam `payload`; server menyegelnya utuh. Metadata di luar
 * payload (`id`, `hlc`, `deleted`) ikut masuk AAD ciphertext server, jadi baris tidak bisa dipindah
 * ke record/akun lain atau diubah `hlc`-nya tanpa membuat dekripsi gagal.
 */
export const syncRecordDtoSchema = z.object({ ...SYNC_RECORD_FIELDS }).strict()

export type SyncRecordDto = z.infer<typeof syncRecordDtoSchema>

/** Nilai JSON yang sah sebagai `payload` (hasil `z.json()`), dipakai hook push di core. */
export type RecordPayload = SyncRecordDto['payload']

/** Record hasil pull: bentuk yang sama + posisinya di server. */
export const serverRecordSchema = z
  .object({ ...SYNC_RECORD_FIELDS, serverSeq: serverSeqSchema })
  .strict()

export type ServerRecord = z.infer<typeof serverRecordSchema>

/**
 * Batch push WAJIB terurut naik berdasarkan `hlc` (boleh sama, kalau record yang sama dikirim ulang).
 *
 * Kenapa divalidasi: server menerapkan upsert berurutan dalam satu batch. Dengan urutan naik, hasil
 * akhirnya sama dengan kalau record itu diterapkan satu-satu dalam urutan waktu - jadi dua record yang
 * menyentuh `id` yang sama tidak bisa berakhir dengan pemenang berbeda hanya karena urutan array.
 * Perbandingannya lewat `compareHlc` (tuple), bukan perbandingan string.
 */
function isAscendingHlc(records: readonly { readonly hlc: string }[]): boolean {
  let previousHlc: string | undefined

  for (const record of records) {
    if (previousHlc !== undefined && compareHlc(previousHlc, record.hlc) > 0) return false
    previousHlc = record.hlc
  }

  return true
}

/**
 * `POST /v1/sync/push`
 *
 * `user_id` tidak ada di body (selalu dari sesi), dan perangkat pemanggil juga tidak dikirim: server
 * mengambilnya dari sesi. Batch kosong ditolak supaya klien ber-outbox kosong tidak memakai jatah rate
 * limit tanpa alasan.
 */
export const syncPushInputSchema = z
  .object({
    records: z
      .array(syncRecordDtoSchema)
      .min(1, 'Batch push tidak boleh kosong')
      .max(SYNC_MAX_BATCH, `Batch push maksimum ${SYNC_MAX_BATCH} record`)
      .refine(isAscendingHlc, 'Record harus terurut naik berdasarkan hlc'),
  })
  .strict()

export type SyncPushInput = z.infer<typeof syncPushInputSchema>

/**
 * Status per record.
 *
 * - `applied`  : record masuk (atau sudah sama), `serverSeq` = posisi barisnya di server.
 * - `stale`    : versi server lebih baru (hlc lebih besar), kiriman client TIDAK dipakai. Baris outbox
 *                tetap selesai (bukan gagal), dan `serverHlc` memberitahu versi yang menang.
 * - `rejected` : record ditolak permanen (tidak akan berhasil kalau diulang) - mis. blob kebesaran
 *                atau hlc tidak bisa dibaca. Client boleh membuang baris outbox-nya dan melaporkan
 *                status error, bukan retry tanpa batas.
 */
export const SYNC_RECORD_STATUSES = ['applied', 'stale', 'rejected'] as const

export type SyncRecordStatus = (typeof SYNC_RECORD_STATUSES)[number]

export const syncRecordStatusSchema = z.enum(SYNC_RECORD_STATUSES)

/**
 * Hasil satu record. `serverSeq` tidak wajib karena `rejected` tidak pernah punya posisi, dan
 * `serverHlc` hanya ada kalau server memang punya versi lain yang menang.
 */
export const syncRecordResultSchema = z
  .object({
    id: uuidSchema,
    status: syncRecordStatusSchema,
    /** Posisi record di server. BUKAN cursor pull - lihat catatan modul ini. */
    serverSeq: serverSeqSchema.optional(),
    /** Versi server yang menang saat `stale`, supaya client tidak perlu pull tambahan. */
    serverHlc: hlcSchema.optional(),
  })
  .strict()

export type SyncRecordResult = z.infer<typeof syncRecordResultSchema>

/** `POST /v1/sync/push` - satu status untuk tiap record yang dikirim, urutannya sama. */
export const syncPushResultSchema = z
  .object({ results: z.array(syncRecordResultSchema).max(SYNC_MAX_BATCH) })
  .strict()

export type SyncPushResult = z.infer<typeof syncPushResultSchema>

/**
 * `GET /v1/sync/pull?cursor=&limit=`
 *
 * Nilai query datang sebagai string; konversinya lewat `optionalIntegerQuerySchema` (`protocol.ts`),
 * jadi `cursor=abc`, `cursor=-1`, dan `limit=0` ditolak, sedangkan query kosong memakai default. Objeknya
 * `.strict()` supaya parameter tak dikenal ditolak, bukan diabaikan diam-diam.
 */
export const syncPullQuerySchema = z
  .object({
    cursor: optionalIntegerQuerySchema(0, Number.MAX_SAFE_INTEGER, 'cursor', 0),
    limit: optionalIntegerQuerySchema(
      SYNC_MIN_PULL_LIMIT,
      SYNC_MAX_PULL_LIMIT,
      'limit',
      SYNC_DEFAULT_PULL_LIMIT,
    ),
  })
  .strict()

export type SyncPullQuery = z.infer<typeof syncPullQuerySchema>

/**
 * `GET /v1/sync/pull`
 *
 * `nextCursor` = `serverSeq` record terakhir di halaman ini; kalau halaman kosong, nilainya sama
 * dengan cursor yang dikirim (jangan direset ke 0, karena itu memicu full pull ulang).
 *
 * `records` boleh lebih pendek dari `limit` yang diminta: server memotong halaman begitu total
 * ciphertext-nya melewati `SYNC_MAX_PULL_BYTES`. Alasan satu-satunya halaman pendek boleh dianggap
 * "sudah selesai" adalah `nextCursor` sama dengan cursor yang dikirim (halaman kosong) - bukan
 * panjang array-nya.
 */
export const syncPullResultSchema = z
  .object({
    records: z.array(serverRecordSchema).max(SYNC_MAX_PULL_LIMIT),
    nextCursor: serverSeqSchema,
  })
  .strict()

export type SyncPullResult = z.infer<typeof syncPullResultSchema>
