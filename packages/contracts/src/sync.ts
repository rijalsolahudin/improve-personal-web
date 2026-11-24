import { z } from 'zod'

import { hlcSchema } from './hlc.ts'
import { licenseTokenSchema, LICENSE_SIGNATURE_BYTES } from './license.ts'
import { base64WithinBytesSchema, uuidSchema } from './protocol.ts'
import { RECORD_PAD_BLOCK_BYTES } from './record-format.ts'

/**
 * Kontrak sync E2E dua lapis (ADR 17, ARCHITECTURE.md §7 + §9).
 *
 * Unit data = SEGMEN: header polos (`SyncSegmentHeader`) + isi record terenkripsi Sync Key. Bentuk
 * yang sama dipakai di relay (`/v1/sync/ws`) dan Google Drive, jadi satu parser untuk dua jalur.
 *
 * Layout biner segmen (diimplementasi `packages/core/sync`, dikunci vektor emas di sana):
 *
 *   u16 BE panjang header | header JSON UTF-8 | secretstream header 24 B | chunk ciphertext...
 *
 * Header ikut sebagai AAD chunk pertama, jadi metadata yang dipakai server untuk routing (`epoch`,
 * `seq`, `kind`) tidak bisa ditukar tanpa gagal dekripsi. Isi plaintext (record envelope) divalidasi
 * di `packages/core` dengan schema record backup - entitas domain bukan urusan paket ini.
 *
 * Identitas perangkat di semua schema = `did` token lisensi (baris `devices`), sama dengan yang
 * dipakai relay untuk menentukan penerima.
 */

export const SYNC_PROTOCOL_VERSION = 1

export const SYNC_SEGMENT_FORMAT = 'ip-sync-seg'

/** Frame relay maksimum (segmen utuh, setelah enkripsi + padding). */
export const SYNC_FRAME_MAX_BYTES = 256 * 1024

/** Kuota fair use per lisensi: byte yang boleh dikirim ke relay per hari (UTC). */
export const SYNC_DAILY_SEND_MAX_BYTES = 20 * 1024 * 1024

/** Kuota fair use per lisensi: total ciphertext yang boleh menunggu di antrean relay. */
export const SYNC_QUEUE_MAX_BYTES = 50 * 1024 * 1024

/** Umur titipan di relay. Drive adalah lapis tahan lama, jadi relay tidak perlu menitip lebih lama. */
export const SYNC_RELAY_TTL_DAYS = 7

/** Umur salinan versi kalah (memo/jurnal) di tabel lokal `conflicts`. */
export const SYNC_CONFLICT_RETENTION_DAYS = 30

/** Padding isi segmen; bucket yang sama dengan blob record lokal supaya ukuran bocor seminim itu. */
export const SYNC_PAD_BLOCK_BYTES = RECORD_PAD_BLOCK_BYTES

/**
 * Subkey penyegel segmen: `crypto_kdf_derive_from_key(32, SYNC_KDF_SUBKEY_ID, SYNC_KDF_CONTEXT, SK)`.
 * Konteks 8 karakter dan berbeda dari `ip-data-`/`ip-keyid`, supaya tidak pernah sama dengan subkey lain.
 */
export const SYNC_KDF_CONTEXT = 'ip-sync-'
export const SYNC_KDF_SUBKEY_ID = 1

/** Nonce challenge auth relay. */
export const SYNC_AUTH_NONCE_BYTES = 32

/** Batas jumlah id frame per pesan `ack`. */
export const SYNC_ACK_MAX_IDS = 500

/** Batas jumlah record per segmen (delta kecil; snapshot dipecah per bagian). */
export const SYNC_SEGMENT_MAX_RECORDS = 5_000

const SYNC_EPOCH_MAX = 2_147_483_647

export const syncEpochSchema = z.number().int().min(1).max(SYNC_EPOCH_MAX)

export const syncSeqSchema = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER)

/** Id frame di relay (`sync_frames.id`, bigserial) - aman sebagai number sampai 2^53. */
export const syncFrameIdSchema = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER)

export const SYNC_SEGMENT_KINDS = ['delta', 'snapshot'] as const

export type SyncSegmentKind = (typeof SYNC_SEGMENT_KINDS)[number]

const segmentHeaderBase = {
  format: z.literal(SYNC_SEGMENT_FORMAT),
  v: z.literal(SYNC_PROTOCOL_VERSION),
  epoch: syncEpochSchema,
  deviceId: uuidSchema,
  hlcMin: hlcSchema,
  hlcMax: hlcSchema,
  count: z.number().int().min(0).max(SYNC_SEGMENT_MAX_RECORDS),
}

/**
 * Header polos segmen.
 *
 * - `delta`: perubahan sejak flush sebelumnya; `seq` naik 1 per segmen per perangkat. Celah `seq`
 *   (`seq > seen[deviceId] + 1`) = ada segmen terlewat (§9 "Celah").
 * - `snapshot`: seluruh state perangkat pengirim, dipecah `parts` bagian. Penerima baru boleh
 *   memajukan `seen[deviceId]` ke `asOfSeq` setelah SEMUA bagian `snapshotId` ter-merge.
 */
export const syncSegmentHeaderSchema = z.discriminatedUnion('kind', [
  z
    .object({ ...segmentHeaderBase, kind: z.literal('delta'), seq: syncSeqSchema })
    .strict()
    .refine((header) => header.count > 0, 'segmen delta tidak boleh kosong'),
  z
    .object({
      ...segmentHeaderBase,
      kind: z.literal('snapshot'),
      snapshotId: uuidSchema,
      asOfSeq: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
      part: z.number().int().min(1),
      parts: z.number().int().min(1),
    })
    .strict()
    .refine((header) => header.part <= header.parts, 'part melebihi parts'),
])

export type SyncSegmentHeader = z.infer<typeof syncSegmentHeaderSchema>

const segmentBytesSchema = base64WithinBytesSchema(SYNC_FRAME_MAX_BYTES, 'segmen')

const signatureSchema = base64WithinBytesSchema(LICENSE_SIGNATURE_BYTES, 'tanda tangan')

const nonceSchema = base64WithinBytesSchema(SYNC_AUTH_NONCE_BYTES, 'nonce')

/** Id korelasi buatan client untuk mencocokkan `send` dengan `accepted`/`error`. */
const clientRefSchema = z.string().min(1).max(64)

// -----------------------------------------------------------------------------
// Auth relay: challenge-response Device Sign Key (Ed25519)
// -----------------------------------------------------------------------------

const SYNC_AUTH_LABEL = 'ip-sync-auth'

/**
 * Pesan yang ditandatangani perangkat saat auth relay. String kanonik (bukan JSON) supaya byte yang
 * ditandatangani sama persis di web, mobile, dan server tanpa bergantung urutan key.
 */
export function encodeSyncAuthMessage(nonce: string, lid: string, did: string): string {
  return [SYNC_AUTH_LABEL, `v${SYNC_PROTOCOL_VERSION}`, nonce, lid, did].join('|')
}

// -----------------------------------------------------------------------------
// Pesan WebSocket client -> server
// -----------------------------------------------------------------------------

export const syncClientMessageSchema = z.discriminatedUnion('t', [
  /** Balasan challenge: `lid`/`did` diambil server dari token, bukan dari field terpisah. */
  z
    .object({
      t: z.literal('auth'),
      v: z.literal(SYNC_PROTOCOL_VERSION),
      token: licenseTokenSchema,
      sig: signatureSchema,
    })
    .strict(),
  /**
   * Kirim segmen. `epoch`/`seq`/`kind` diulang polos untuk routing & pencatatan celah; penerima wajib
   * mencocokkannya dengan header di dalam `bytes`. `to` hanya untuk balasan snapshot (unicast).
   */
  z
    .object({
      t: z.literal('send'),
      clientRef: clientRefSchema,
      epoch: syncEpochSchema,
      kind: z.enum(SYNC_SEGMENT_KINDS),
      seq: syncSeqSchema.nullable(),
      to: uuidSchema.nullable(),
      bytes: segmentBytesSchema,
    })
    .strict()
    .refine(
      (message) => (message.kind === 'delta') === (message.seq !== null),
      'seq wajib untuk delta dan null untuk snapshot',
    )
    .refine(
      (message) => message.kind === 'snapshot' || message.to === null,
      'delta selalu broadcast (to = null)',
    ),
  z
    .object({ t: z.literal('ack'), ids: z.array(syncFrameIdSchema).min(1).max(SYNC_ACK_MAX_IDS) })
    .strict(),
  /** Minta snapshot ke perangkat lain saat celah tidak bisa ditutup dari Drive. */
  z.object({ t: z.literal('snapshot-request'), to: uuidSchema, requestId: uuidSchema }).strict(),
])

export type SyncClientMessage = z.infer<typeof syncClientMessageSchema>

// -----------------------------------------------------------------------------
// Pesan WebSocket server -> client
// -----------------------------------------------------------------------------

/**
 * Kode error relay. Terpisah dari `ERROR_CODES` HTTP karena dikirim di dalam koneksi WebSocket.
 * Client memetakan ke perilaku; arti kode yang sudah ada tidak boleh berubah.
 */
export const SYNC_RELAY_ERROR_CODES = [
  /** Saklar mati server (`NUXT_SYNC_RELAY_ENABLED=false`) - turun ke sync Drive saja. */
  'relay_disabled',
  /** Tanda tangan/token salah atau aktivasi sudah dicabut. */
  'unauthenticated',
  /** Lisensi habis (ADR 16): menerima tetap jalan, mengirim ditolak. */
  'license_read_only',
  'quota_daily',
  'quota_queue',
  'frame_too_large',
  'rate_limited',
  /** `epoch` lebih tua dari epoch terbaru lisensi - perangkat harus memuat Sync Key baru. */
  'epoch_stale',
  'invalid_message',
] as const

export type SyncRelayErrorCode = (typeof SYNC_RELAY_ERROR_CODES)[number]

/** Kode error yang membuat client turun ke sync Drive saja (bukan retry segera). */
export const SYNC_RELAY_FALLBACK_CODES: readonly SyncRelayErrorCode[] = [
  'relay_disabled',
  'quota_daily',
  'quota_queue',
]

/**
 * Close code WebSocket (rentang aplikasi 4000-4999) untuk kegagalan yang memutus koneksi.
 * Kegagalan per pesan (`quota_daily`, `frame_too_large`, ...) dikirim sebagai pesan `error`.
 */
export const SYNC_CLOSE_CODES = {
  relay_disabled: 4001,
  unauthenticated: 4003,
  invalid_message: 4400,
} as const satisfies Partial<Record<SyncRelayErrorCode, number>>

export const syncServerMessageSchema = z.discriminatedUnion('t', [
  z
    .object({ t: z.literal('challenge'), v: z.literal(SYNC_PROTOCOL_VERSION), nonce: nonceSchema })
    .strict(),
  /**
   * Auth lolos. `expired` = frame untuk perangkat ini yang dibuang karena TTL, per pengirim, sampai
   * `seq` tertinggi yang dibuang - pemicu menutup celah dari Drive/perangkat lain (§9 "Celah").
   */
  z
    .object({
      t: z.literal('ready'),
      epoch: syncEpochSchema,
      readOnly: z.boolean(),
      expired: z.array(z.object({ from: uuidSchema, upToSeq: syncSeqSchema }).strict()),
    })
    .strict(),
  z
    .object({
      t: z.literal('frame'),
      id: syncFrameIdSchema,
      from: uuidSchema,
      epoch: syncEpochSchema,
      kind: z.enum(SYNC_SEGMENT_KINDS),
      seq: syncSeqSchema.nullable(),
      bytes: segmentBytesSchema,
    })
    .strict(),
  z
    .object({ t: z.literal('accepted'), clientRef: clientRefSchema, id: syncFrameIdSchema })
    .strict(),
  z
    .object({
      t: z.literal('error'),
      code: z.enum(SYNC_RELAY_ERROR_CODES),
      clientRef: clientRefSchema.nullable(),
    })
    .strict(),
  z.object({ t: z.literal('snapshot-request'), from: uuidSchema, requestId: uuidSchema }).strict(),
])

export type SyncServerMessage = z.infer<typeof syncServerMessageSchema>

// -----------------------------------------------------------------------------
// Nama berkas di Google Drive (`appDataFolder`)
// -----------------------------------------------------------------------------

export type SyncDriveFile =
  | { readonly kind: 'key'; readonly epoch: number }
  | {
      readonly kind: 'pack'
      readonly deviceId: string
      readonly seqFrom: number
      readonly seqTo: number
    }
  | { readonly kind: 'snapshot'; readonly epoch: number; readonly hlc: string }

/** Nama berkas Drive. Satu berkas hanya ditulis satu perangkat, jadi tidak ada konflik tulis. */
export function formatSyncDriveFileName(file: SyncDriveFile): string {
  switch (file.kind) {
    case 'key':
      return `sync-key.e${file.epoch}`
    case 'pack':
      return `pack-${file.deviceId}-${file.seqFrom}-${file.seqTo}`
    case 'snapshot':
      return `snap-${file.epoch}-${file.hlc}`
  }
}

const KEY_FILE_PATTERN = /^sync-key\.e(\d{1,10})$/
// deviceId (UUID) memuat '-', jadi dua angka seq dibaca dari ujung.
const PACK_FILE_PATTERN = /^pack-([0-9a-f-]{36})-(\d{1,16})-(\d{1,16})$/
const SNAPSHOT_FILE_PATTERN = /^snap-(\d{1,10})-(.+)$/

/** Kebalikan `formatSyncDriveFileName`. `null` = bukan berkas sync (abaikan, jangan error). */
export function parseSyncDriveFileName(name: string): SyncDriveFile | null {
  const key = KEY_FILE_PATTERN.exec(name)
  if (key?.[1] !== undefined) {
    const epoch = syncEpochSchema.safeParse(Number(key[1]))
    return epoch.success ? { kind: 'key', epoch: epoch.data } : null
  }

  const pack = PACK_FILE_PATTERN.exec(name)
  if (pack?.[1] !== undefined && pack[2] !== undefined && pack[3] !== undefined) {
    const deviceId = uuidSchema.safeParse(pack[1])
    const seqFrom = syncSeqSchema.safeParse(Number(pack[2]))
    const seqTo = syncSeqSchema.safeParse(Number(pack[3]))
    if (!deviceId.success || !seqFrom.success || !seqTo.success) return null
    if (seqFrom.data > seqTo.data) return null
    return { kind: 'pack', deviceId: deviceId.data, seqFrom: seqFrom.data, seqTo: seqTo.data }
  }

  const snapshot = SNAPSHOT_FILE_PATTERN.exec(name)
  if (snapshot?.[1] !== undefined && snapshot[2] !== undefined) {
    const epoch = syncEpochSchema.safeParse(Number(snapshot[1]))
    const hlc = hlcSchema.safeParse(snapshot[2])
    if (!epoch.success || !hlc.success) return null
    return { kind: 'snapshot', epoch: epoch.data, hlc: hlc.data }
  }

  return null
}
