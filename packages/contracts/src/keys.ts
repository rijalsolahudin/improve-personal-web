import { z } from 'zod'

import { deviceNameSchema } from './devices.ts'
import { kidSchema } from './record-format.ts'
import {
  base64MaxLengthForBytes,
  base64WithinBytesSchema,
  isoInstantSchema,
  utf8ByteLength,
  uuidSchema,
} from './protocol.ts'

/**
 * Envelope kunci + transfer kunci antar perangkat (ARCHITECTURE.md §7, ADR 10-12).
 *
 * Slot yang sah HANYA `passkey`:
 * - Salinan "digembok OTP" DIHAPUS (ADR 10): OTP dibuat server, jadi server tahu pembukanya, dan ruang
 *   OTP cuma 10^6 sehingga brute-force offline praktis instan.
 * - Server TIDAK menyimpan recovery key dalam bentuk apa pun (ADR 11); envelope `recovery` ikut berkas
 *   backup user (ADR 12).
 * Jadi `otp` dan `recovery` BUKAN pilihan yang tertunda: keduanya keputusan yang sudah diambil dan
 * beralasan. Jangan ditambahkan ke `KEY_SLOTS`, jangan "disediakan sebagai cadangan".
 *
 * Server cuma menyimpan blob opak: tidak pernah mendekripsi dan tidak punya jalur kode untuk itu
 * (ARCHITECTURE.md §3: `apps/server` dilarang impor `core`/`crypto`).
 */

/** Slot envelope yang sah (`server.dbml` enum `key_slot`). */
export const KEY_SLOTS = ['passkey'] as const

export type KeySlot = (typeof KEY_SLOTS)[number]

export const keySlotSchema = z.enum(KEY_SLOTS)

/** Batas `wrapped_key` (`server.dbml` `key_envelopes.wrapped_key`: ~4 KB). */
export const KEY_ENVELOPE_MAX_WRAPPED_KEY_BYTES = 4096

export const KEY_ENVELOPE_MAX_WRAPPED_KEY_BASE64_LENGTH = base64MaxLengthForBytes(
  KEY_ENVELOPE_MAX_WRAPPED_KEY_BYTES,
)

/** Batas `kdf_params` (`server.dbml` `key_envelopes.kdf_params`: ~1 KB). */
export const KEY_ENVELOPE_MAX_KDF_PARAMS_BYTES = 1024

/** Batas bentuk `kdf_params`: jumlah field, panjang nama field, panjang nilai string. */
export const KDF_PARAM_MAX_KEYS = 16
export const KDF_PARAM_KEY_MAX_LENGTH = 32
export const KDF_PARAM_STRING_VALUE_MAX_LENGTH = 256

const kdfParamValueSchema = z.union([
  z.string().max(KDF_PARAM_STRING_VALUE_MAX_LENGTH),
  z.number(),
  z.boolean(),
])

/**
 * Parameter KDF milik client, disimpan server sebagai `jsonb`.
 *
 * Sengaja TIDAK dipecah jadi field tetap: format kripto hidup di `packages/crypto` (client) dan server
 * tidak boleh ikut menafsirkannya. Yang dijaga di sini cuma batasnya - nilai primitif saja (tanpa objek
 * bersarang, jadi kedalamannya terbatas dan tidak bisa jadi rantai penunjuk yang membengkak), jumlah
 * field dibatasi, dan besar JSON-nya <= 1 KB sesuai `server.dbml`.
 *
 * `.strict()` tidak berlaku untuk record (isinya memang bebas); yang dikunci adalah bentuk nilainya.
 */
export const kdfParamsSchema = z
  .record(z.string().min(1).max(KDF_PARAM_KEY_MAX_LENGTH), kdfParamValueSchema)
  .refine(
    (params) => Object.keys(params).length <= KDF_PARAM_MAX_KEYS,
    `kdfParams maksimum ${KDF_PARAM_MAX_KEYS} field`,
  )
  .refine(
    (params) => utf8ByteLength(JSON.stringify(params)) <= KEY_ENVELOPE_MAX_KDF_PARAMS_BYTES,
    `kdfParams maksimum ${KEY_ENVELOPE_MAX_KDF_PARAMS_BYTES} byte`,
  )

export type KdfParams = z.infer<typeof kdfParamsSchema>

/**
 * `PUT /v1/keys/envelopes` - upsert (unique `(user_id, slot)` di `server.dbml`).
 *
 * `slot` tetap dikirim walau sekarang cuma ada satu nilai yang sah: server jadi bisa menolak slot lain
 * secara eksplisit (bukan menebak), dan nama field-nya sudah jelas di log/error.
 */
export const keyEnvelopePutInputSchema = z
  .object({
    slot: keySlotSchema,
    wrappedKey: base64WithinBytesSchema(KEY_ENVELOPE_MAX_WRAPPED_KEY_BYTES, 'wrappedKey'),
    kdfParams: kdfParamsSchema,
  })
  .strict()

export type KeyEnvelopePutInput = z.infer<typeof keyEnvelopePutInputSchema>

/** Envelope seperti yang dilihat client. Tidak ada `user_id` di DTO. */
export const keyEnvelopeDtoSchema = z
  .object({
    slot: keySlotSchema,
    wrappedKey: base64WithinBytesSchema(KEY_ENVELOPE_MAX_WRAPPED_KEY_BYTES, 'wrappedKey'),
    kdfParams: kdfParamsSchema,
    updatedAt: isoInstantSchema,
  })
  .strict()

export type KeyEnvelopeDto = z.infer<typeof keyEnvelopeDtoSchema>

/** `GET /v1/keys/envelopes` - maksimum satu per slot yang sah. */
export const keyEnvelopeListResultSchema = z
  .object({ envelopes: z.array(keyEnvelopeDtoSchema).max(KEY_SLOTS.length) })
  .strict()

export type KeyEnvelopeListResult = z.infer<typeof keyEnvelopeListResultSchema>

/** TTL relay transfer kunci: <= 120 detik (ARCHITECTURE.md §7, `server.dbml` `key_transfers`). */
export const KEY_TRANSFER_TTL_SECONDS = 120

/** Panjang id transfer: 128-bit acak, di-encode base64url tanpa padding (16 byte -> 22 karakter). */
export const KEY_TRANSFER_ID_BYTES = 16

export const KEY_TRANSFER_ID_LENGTH = 22

/**
 * Pola id transfer.
 *
 * Server WAJIB mengisi id ini dari CSPRNG 128-bit (`server.dbml` `key_transfers.id`: "random 128-bit,
 * non-enumerable - bukan uuid berurut"). Pola ini menolak id pendek dan UUID, karena id yang bisa
 * ditebak atau dihitung membuat siapa pun yang menebaknya bisa mengklaim envelope kunci utama.
 */
export const KEY_TRANSFER_ID_PATTERN = /^[A-Za-z0-9_-]{22}$/

export const keyTransferIdSchema = z
  .string()
  .regex(KEY_TRANSFER_ID_PATTERN, 'id transfer harus 128-bit acak (base64url 22 karakter)')

/** Batas blob transfer: MK terenkripsi ke public key ephemeral (X25519) jauh di bawah 1 KB. */
export const KEY_TRANSFER_MAX_BLOB_BYTES = 4096

/**
 * `POST /v1/keys/transfer` - perangkat lama menitipkan MK yang sudah dienkripsi ke perangkat baru.
 *
 * `targetDeviceId` = perangkat yang baru login dan menampilkan QR. Kepemilikan (perangkat itu milik user
 * yang sama) dicek di service, bukan oleh schema. TTL ditentukan server (`KEY_TRANSFER_TTL_SECONDS`),
 * jadi client tidak mengirimnya - nilai dari client tidak boleh bisa memperpanjang masa berlaku.
 */
export const keyTransferCreateInputSchema = z
  .object({
    targetDeviceId: uuidSchema,
    blob: base64WithinBytesSchema(KEY_TRANSFER_MAX_BLOB_BYTES, 'blob'),
  })
  .strict()

export type KeyTransferCreateInput = z.infer<typeof keyTransferCreateInputSchema>

/**
 * Hasil pembuatan transfer: id-nya dipakai perangkat BARU untuk membuat QR yang discan perangkat lama.
 */
export const keyTransferCreateResultSchema = z
  .object({
    id: keyTransferIdSchema,
    expiresAt: isoInstantSchema,
  })
  .strict()

export type KeyTransferCreateResult = z.infer<typeof keyTransferCreateResultSchema>

/**
 * `POST /v1/keys/transfer/:id` - klaim (bukan GET: klaim MENGUBAH state `claimed_at` dan sekali pakai;
 * aksi yang mengubah data lewat GET dilarang, security.md §8).
 *
 * Cuma perangkat target yang boleh claim, dan konsumsinya atomik + sekali pakai
 * (`server.dbml` `key_transfers.claimed_at`). Semua kegagalan (id tak dikenal, kedaluwarsa, sudah
 * diklaim, bukan perangkat target) memakai kode `NOT_FOUND` yang sama supaya endpoint ini tidak jadi
 * oracle untuk menebak id transfer.
 */
export const keyTransferClaimParamsSchema = z.object({ id: keyTransferIdSchema }).strict()

export type KeyTransferClaimParams = z.infer<typeof keyTransferClaimParamsSchema>

export const keyTransferClaimResultSchema = z
  .object({ blob: base64WithinBytesSchema(KEY_TRANSFER_MAX_BLOB_BYTES, 'blob') })
  .strict()

export type KeyTransferClaimResult = z.infer<typeof keyTransferClaimResultSchema>

// -----------------------------------------------------------------------------
// Identitas kunci akun (spec #120 §2.1): satu KID per akun
// -----------------------------------------------------------------------------

/**
 * Endpoint identitas kunci. Server menyimpan KID (pengenal pseudonim, bukan kunci) supaya perangkat
 * baru tahu "akun ini sudah punya kunci" dan tidak diam-diam membuat master key kedua (split-brain).
 *
 *   - GET /v1/keys/identity  -> keyIdentityDtoSchema (200)
 *   - PUT /v1/keys/identity  keyIdentityClaimInputSchema -> keyIdentityDtoSchema
 *                            (201 baru, 200 klaim ulang KID yang sama; 409 KEY_IDENTITY_CONFLICT)
 *
 * Klaim bersifat sekali-seumur-akun: tidak ada jalur ganti/reset KID. Akun yang kehilangan kuncinya
 * dihapus lalu dibuat ulang (belum ada data produksi saat desain ini dikunci).
 *
 * KID DILARANG di-log, dikirim ke analytics, atau ditaruh di URL (itu sebabnya KID lewat body, bukan
 * path/query). KID juga BUKAN bukti kepemilikan kunci: server tidak boleh menganggap "mengirim KID
 * yang benar" sebagai autentikasi.
 */

/** `PUT /v1/keys/identity` - klaim KID untuk akun. `userId` tidak ada di body: selalu dari sesi. */
export const keyIdentityClaimInputSchema = z.object({ kid: kidSchema }).strict()

export type KeyIdentityClaimInput = z.infer<typeof keyIdentityClaimInputSchema>

/**
 * Identitas kunci seperti yang dilihat client: dipakai `GET` dan hasil `PUT` (200/201).
 *
 * `kid: null` = akun belum pernah mengklaim; field turunannya ikut `null`. `claimedByDeviceLabel` ikut
 * `null` bila perangkat pengklaim tidak punya label. Label dan waktu ini yang nanti ditampilkan di
 * layar split-brain supaya user bisa mengenali klaim yang bukan miliknya.
 */
export const keyIdentityDtoSchema = z
  .object({
    kid: kidSchema.nullable(),
    claimedAt: isoInstantSchema.nullable(),
    claimedByDeviceLabel: deviceNameSchema.nullable(),
  })
  .strict()
  .refine(
    (identity) =>
      identity.kid === null
        ? identity.claimedAt === null && identity.claimedByDeviceLabel === null
        : identity.claimedAt !== null,
    'tanpa kid, field klaim harus null; dengan kid, claimedAt wajib ada',
  )

export type KeyIdentityDto = z.infer<typeof keyIdentityDtoSchema>

/**
 * `details` untuk `409 KEY_IDENTITY_CONFLICT`. Sengaja TANPA KID lawan: KID pseudonim, dan klien yang
 * kalah cukup tahu siapa/kapan pengklaimnya, sedangkan KID yang benar ia baca dari `GET`.
 */
export const keyIdentityConflictDetailsSchema = z
  .object({
    claimedAt: isoInstantSchema,
    claimedByDeviceLabel: deviceNameSchema.nullable(),
  })
  .strict()

export type KeyIdentityConflictDetails = z.infer<typeof keyIdentityConflictDetailsSchema>
