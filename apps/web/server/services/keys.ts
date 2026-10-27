import {
  decodeKid,
  encodeKid,
  KEY_TRANSFER_TTL_SECONDS,
  type KeyEnvelopeDto,
  type KeyEnvelopeListResult,
  type KeyEnvelopePutInput,
  type KeyIdentityClaimInput,
  type KeyIdentityDto,
  type KeyTransferClaimResult,
  type KeyTransferCreateResult,
} from '@improve-personal/contracts'
import { and, eq, gt, isNull, lt } from 'drizzle-orm'

import { accountKeys, devices, keyEnvelopes, keyTransfers } from '../db/schema'
import { apiProblem } from '../utils/api-error'
import { base64ToBytes, bytesToBase64, createKeyTransferId, toBytes } from '../utils/crypto'
import { secondsToMs, uuidv7 } from '../utils/uuid'
import type { ServiceContext } from './context'

/**
 * Envelope kunci + relay transfer kunci (ARCHITECTURE.md §7, ADR 10-12).
 *
 * Server HANYA menyimpan envelope slot `passkey`, dan tidak pernah mendekripsinya. Tidak ada jalur
 * kode di sini untuk membuka `wrapped_key` - dan memang tidak boleh ada: `apps/web/server` tidak
 * mengimpor `packages/crypto`, jadi klaim zero-knowledge-nya bisa diperiksa dari kode.
 *
 * Slot `otp` dan `recovery` bukan "pilihan yang tertunda": keduanya keputusan yang sudah diambil
 * (ADR 10 & 11). Enum `key_slot` di DB dan `keySlotSchema` di kontrak cuma punya `passkey`, jadi
 * permintaan dengan slot lain ditolak validasi sebelum menyentuh DB.
 */

function toEnvelopeDto(row: {
  slot: KeyEnvelopeDto['slot']
  wrappedKey: Uint8Array
  kdfParams: unknown
  updatedAt: Date
}): KeyEnvelopeDto {
  return {
    slot: row.slot,
    wrappedKey: bytesToBase64(row.wrappedKey),
    kdfParams: row.kdfParams as KeyEnvelopeDto['kdfParams'],
    updatedAt: row.updatedAt.toISOString(),
  }
}

/** Semua envelope milik user ini. Maksimumnya satu per slot yang sah. */
export async function listEnvelopes(
  ctx: ServiceContext,
  userId: string,
): Promise<KeyEnvelopeListResult> {
  const rows = await ctx.db
    .select({
      slot: keyEnvelopes.slot,
      wrappedKey: keyEnvelopes.wrappedKey,
      kdfParams: keyEnvelopes.kdfParams,
      updatedAt: keyEnvelopes.updatedAt,
    })
    .from(keyEnvelopes)
    .where(eq(keyEnvelopes.userId, userId))

  return { envelopes: rows.map(toEnvelopeDto) }
}

/**
 * Upsert envelope - unique `(user_id, slot)` dari dbml.
 *
 * Batas ukuran sudah ditegakkan schema kontrak (`wrappedKey` <= 4 KB, `kdfParams` <= 1 KB) SEBELUM
 * request sampai ke sini, jadi tidak ada decode blob raksasa di jalur ini.
 */
export async function putEnvelope(
  ctx: ServiceContext,
  userId: string,
  input: KeyEnvelopePutInput,
): Promise<KeyEnvelopeDto> {
  const wrappedKey = base64ToBytes(input.wrappedKey)

  const rows = await ctx.db
    .insert(keyEnvelopes)
    .values({
      id: uuidv7(ctx.now.getTime()),
      userId,
      slot: input.slot,
      wrappedKey,
      kdfParams: input.kdfParams,
      createdAt: ctx.now,
      updatedAt: ctx.now,
    })
    .onConflictDoUpdate({
      target: [keyEnvelopes.userId, keyEnvelopes.slot],
      set: { wrappedKey, kdfParams: input.kdfParams, updatedAt: ctx.now },
    })
    .returning({
      slot: keyEnvelopes.slot,
      wrappedKey: keyEnvelopes.wrappedKey,
      kdfParams: keyEnvelopes.kdfParams,
      updatedAt: keyEnvelopes.updatedAt,
    })

  const row = rows[0]
  if (!row) throw apiProblem('INTERNAL')

  return toEnvelopeDto(row)
}

/**
 * Perangkat lama menitipkan kunci utama yang sudah dienkripsi ke perangkat baru (relay ala WhatsApp).
 *
 * Yang dicek: perangkat target milik user yang sama dan belum di-revoke (dbml
 * `key_transfers.device_id`). Perangkat sumber tidak boleh jadi target - transfer ke diri sendiri
 * tidak punya arti dan hanya menambah baris yang bisa di-claim.
 *
 * TTL ditentukan SERVER (`KEY_TRANSFER_TTL_SECONDS`), bukan dikirim klien: nilai dari client tidak
 * boleh bisa memperpanjang masa berlaku sebuah envelope kunci.
 */
export async function createKeyTransfer(
  ctx: ServiceContext,
  input: {
    readonly userId: string
    readonly sourceDeviceId: string
    readonly targetDeviceId: string
    readonly blob: string
  },
): Promise<KeyTransferCreateResult> {
  if (input.targetDeviceId === input.sourceDeviceId) throw apiProblem('NOT_FOUND')

  const targets = await ctx.db
    .select({ id: devices.id })
    .from(devices)
    .where(
      and(
        eq(devices.id, input.targetDeviceId),
        eq(devices.userId, input.userId),
        isNull(devices.revokedAt),
      ),
    )
    .limit(1)

  if (!targets[0]) throw apiProblem('NOT_FOUND')

  const id = createKeyTransferId()
  const expiresAt = new Date(ctx.now.getTime() + secondsToMs(KEY_TRANSFER_TTL_SECONDS))

  await ctx.db.insert(keyTransfers).values({
    id,
    userId: input.userId,
    deviceId: input.targetDeviceId,
    blob: base64ToBytes(input.blob),
    createdAt: ctx.now,
    expiresAt,
  })

  return { id, expiresAt: expiresAt.toISOString() }
}

/**
 * Klaim envelope oleh perangkat target - ATOMIK dan sekali pakai.
 *
 * Semua sebab kegagalan (id tidak dikenal, kedaluwarsa, sudah diklaim, bukan perangkat target,
 * perangkat sudah di-revoke) menghasilkan `404` yang SAMA. Kalau dibedakan, endpoint ini jadi oracle
 * untuk menebak id transfer - dan menebak id berarti menerima envelope kunci utama orang lain.
 */
export async function claimKeyTransfer(
  ctx: ServiceContext,
  input: { readonly userId: string; readonly deviceId: string; readonly id: string },
): Promise<KeyTransferClaimResult> {
  const claimed = await ctx.db
    .update(keyTransfers)
    .set({ claimedAt: ctx.now })
    .where(
      and(
        eq(keyTransfers.id, input.id),
        eq(keyTransfers.userId, input.userId),
        eq(keyTransfers.deviceId, input.deviceId),
        isNull(keyTransfers.claimedAt),
        gt(keyTransfers.expiresAt, ctx.now),
      ),
    )
    .returning({ blob: keyTransfers.blob })

  const row = claimed[0]
  if (!row) throw apiProblem('NOT_FOUND')

  return { blob: bytesToBase64(row.blob) }
}

/**
 * Buang transfer yang sudah lewat TTL (dbml: "Baris dihapus job cron, bukan disimpan").
 *
 * Dipakai task `cleanup-ephemeral`. Predikatnya di sini supaya tidak ada dua definisi "kedaluwarsa"
 * yang bisa berbeda antara jalur klaim dan jalur pembersihan.
 */
export async function deleteExpiredKeyTransfers(ctx: ServiceContext): Promise<number> {
  const deleted = await ctx.db
    .delete(keyTransfers)
    .where(lt(keyTransfers.expiresAt, ctx.now))
    .returning({ id: keyTransfers.id })

  return deleted.length
}

// -----------------------------------------------------------------------------
// Identitas kunci akun (KID)
// -----------------------------------------------------------------------------

const NO_KEY_IDENTITY: KeyIdentityDto = { kid: null, claimedAt: null, claimedByDeviceLabel: null }

function toKeyIdentityDto(row: {
  kid: Uint8Array
  claimedAt: Date
  claimedByDeviceLabel: string | null
}): KeyIdentityDto {
  return {
    kid: encodeKid(toBytes(row.kid)),
    claimedAt: row.claimedAt.toISOString(),
    claimedByDeviceLabel: row.claimedByDeviceLabel,
  }
}

/** KID akun ini, atau identitas kosong (`kid: null`) kalau belum pernah diklaim. */
export async function getActiveKeyIdentity(
  ctx: ServiceContext,
  userId: string,
): Promise<KeyIdentityDto> {
  const rows = await ctx.db
    .select({
      kid: accountKeys.kid,
      claimedAt: accountKeys.claimedAt,
      claimedByDeviceLabel: accountKeys.claimedByDeviceLabel,
    })
    .from(accountKeys)
    .where(eq(accountKeys.userId, userId))
    .limit(1)

  const row = rows[0]

  return row ? toKeyIdentityDto(row) : NO_KEY_IDENTITY
}

export type KeyIdentityClaimResult = {
  readonly identity: KeyIdentityDto
  /** `true` = klaim pertama (201); `false` = KID yang sama sudah terklaim (200, idempoten). */
  readonly created: boolean
}

/**
 * Klaim KID untuk akun: pemenang pertama menang, selamanya.
 *
 * Atomiknya dari unique `user_id` + `ON CONFLICT DO NOTHING`: statement kedua yang bersaing menunggu
 * yang pertama commit lalu tidak menyisipkan apa-apa, jadi tidak perlu transaksi, isolation level
 * khusus, atau retry. Klaim ulang dengan KID yang sama (perangkat yang sudah tahu KID-nya) sukses
 * idempoten; KID berbeda dijawab `KEY_IDENTITY_CONFLICT`.
 */
export async function claimKeyIdentity(
  ctx: ServiceContext,
  userId: string,
  input: KeyIdentityClaimInput,
  deviceLabel: string,
): Promise<KeyIdentityClaimResult> {
  const kid = decodeKid(input.kid)
  // Schema kontrak sudah menolak KID tak kanonik; ini hanya mempersempit tipe `Uint8Array | null`.
  if (!kid) throw apiProblem('VALIDATION_FAILED')

  const inserted = await ctx.db
    .insert(accountKeys)
    .values({
      id: uuidv7(ctx.now.getTime()),
      userId,
      kid,
      claimedAt: ctx.now,
      claimedByDeviceLabel: deviceLabel,
    })
    .onConflictDoNothing({ target: accountKeys.userId })
    .returning({
      kid: accountKeys.kid,
      claimedAt: accountKeys.claimedAt,
      claimedByDeviceLabel: accountKeys.claimedByDeviceLabel,
    })

  const created = inserted[0]
  if (created) return { identity: toKeyIdentityDto(created), created: true }

  const existing = await getActiveKeyIdentity(ctx, userId)
  // Baris hilang di antara dua statement hanya mungkin kalau akunnya dihapus bersamaan.
  if (existing.kid === null || existing.claimedAt === null) throw apiProblem('NOT_FOUND')

  if (existing.kid !== input.kid) {
    throw apiProblem('KEY_IDENTITY_CONFLICT', {
      details: {
        claimedAt: existing.claimedAt,
        claimedByDeviceLabel: existing.claimedByDeviceLabel,
      },
    })
  }

  return { identity: existing, created: false }
}
