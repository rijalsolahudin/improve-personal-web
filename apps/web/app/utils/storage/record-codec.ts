import {
  CURRENT_SCHEMA_VERSION,
  CURRENT_STATE_KEY,
  migrateRecords,
  makeRecord,
  validateEntityPayload,
  type CryptoProvider,
  type EntityType,
  type Record,
  type SchemaMigration,
  type SealedRecord,
  type SecureKeyMaterial,
  type StoredRecord,
} from '@improve-personal/core'
import { z } from 'zod'

/**
 * Kodek record: payload domain ↔ `blob` tersegel (ARCHITECTURE §6, ADR 4).
 *
 * Isi blob = JSON dari `{ type, schemaVersion, data }`. `type` ikut di dalam blob supaya server tidak
 * tahu record ini memo atau todo; `id`/`hlc`/`deleted` tetap di luar karena server butuh membandingkan
 * versi (LWW) tanpa bisa membuka isinya.
 *
 * Jalur baca punya tiga pagar yang sengaja TIDAK dilewati diam-diam:
 * 1. versi lebih BARU dari build ini → DITOLAK (jangan menebak-nebak isi data dari app versi baru),
 * 2. versi lebih lama → dimigrasikan; kalau jalur migrasinya tidak ada → DITOLAK,
 * 3. payload divalidasi schema tipe-nya → record rusak terlihat sebagai error, bukan jadi UI kosong.
 */

/** Bentuk payload di dalam blob. */
const payloadSchema = z
  .object({
    type: z.string().min(1),
    schemaVersion: z.int().min(1),
    data: z.unknown(),
  })
  .strict()

export type DecodeOptions = {
  /** Migrasi yang dikenal build ini; test menyuntik daftar sendiri. */
  readonly migrations?: readonly SchemaMigration[]
}

/** Envelope plaintext → `blob` tersegel. */
export async function encodeRecord(
  provider: CryptoProvider,
  dataKey: SecureKeyMaterial,
  record: Record<unknown>,
): Promise<SealedRecord> {
  const payload = JSON.stringify({
    type: record.type,
    schemaVersion: record.schemaVersion,
    data: record.data,
  } satisfies z.infer<typeof payloadSchema>)

  return {
    id: record.id,
    hlc: record.hlc,
    deleted: record.deleted,
    blob: await provider.sealRecord({ recordId: record.id, dataKey, plaintext: payload }),
  }
}

/**
 * Baris `record` dari disk → envelope plaintext.
 *
 * Melempar untuk semua kegagalan di atas, dan pesannya menyebut SEBAB-nya (versi, migrasi, atau
 * schema) karena pemanggilnyalah yang memutuskan apakah ini "lewati record ini" atau "ada yang salah
 * dengan kunci".
 */
export async function decodeRecord(
  provider: CryptoProvider,
  dataKey: SecureKeyMaterial,
  stored: StoredRecord,
  options: DecodeOptions = {},
): Promise<Record<unknown>> {
  const plaintext = await provider.openRecord({
    recordId: stored.id,
    dataKey,
    blob: stored.blob,
  })

  const parsed = payloadSchema.safeParse(parseJson(plaintext, stored.id))
  if (!parsed.success) {
    throw new Error(`isi record ${stored.id} tidak dikenali (bukan payload record yang sah)`)
  }

  const { type, schemaVersion, data } = parsed.data

  if (schemaVersion > CURRENT_SCHEMA_VERSION) {
    throw new Error(
      `record ${stored.id} dibuat app versi lebih baru (skema ${schemaVersion} > ${CURRENT_SCHEMA_VERSION}): perbarui aplikasi`,
    )
  }

  const migrated =
    schemaVersion === CURRENT_SCHEMA_VERSION
      ? data
      : migratePayload(
          { id: stored.id, type, schemaVersion, data, deleted: stored.deleted },
          options,
        )

  const validation = validateEntityPayload(type, migrated)
  if (!validation.ok) {
    throw new Error(
      `payload record ${stored.id} (${type}) tidak sah: ${validation.issues.join('; ')}`,
    )
  }

  return makeRecord({
    id: stored.id,
    type: type as EntityType,
    hlc: stored.hlc,
    deleted: stored.deleted,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    data: validation.data,
  })
}

function parseJson(plaintext: string, recordId: string): unknown {
  try {
    return JSON.parse(plaintext)
  } catch (error) {
    throw new Error(`isi record ${recordId} bukan JSON yang sah`, { cause: error })
  }
}

/**
 * Migrasikan payload record lama.
 *
 * Memakai `migrateRecords` dari core - bukan menulis ulang logikanya - supaya jalur import dan jalur
 * baca memakai aturan migrasi yang sama persis. Jalur yang buntu DILAPORKAN, bukan dilewati.
 */
function migratePayload(
  record: { id: string; type: string; schemaVersion: number; data: unknown; deleted: boolean },
  options: DecodeOptions,
): unknown {
  const result = migrateRecords({
    records: [
      {
        id: record.id,
        type: record.type as EntityType,
        hlc: '0-0-x',
        deleted: record.deleted,
        schemaVersion: record.schemaVersion,
        data: record.data,
      },
    ],
    fromVersion: record.schemaVersion,
    toVersion: CURRENT_SCHEMA_VERSION,
    migrations: options.migrations,
  })

  if (!result.ok) {
    throw new Error(
      `record ${record.id} tidak bisa dimigrasikan (skema ${String(result.from)} -> ${String(result.to)}, berhenti di ${String(result.reached)})`,
    )
  }

  return result.records[0]?.data
}

/** Dipakai shell untuk mengetahui status sync yang tersimpan (tanpa membuka apa pun). */
export { CURRENT_STATE_KEY }
