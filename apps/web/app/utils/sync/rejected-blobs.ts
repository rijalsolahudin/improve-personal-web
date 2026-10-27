import type { BlobRejectReason } from '@improve-personal/core'

import { TECH_IDENTITY } from '#shared/tech-identity'

/**
 * Catatan blob remote yang DITOLAK atau berasal dari KID lain saat pull (spec #120 M2).
 *
 * Dipisah dari `quarantine.ts` karena artinya berbeda: karantina lama berarti "kunci lokal belum bisa
 * membuka record ini, coba lagi nanti" (dan punya jalur pemulihan/reindex). Di sini server mengirim
 * sesuatu yang MENCURIGAKAN atau bukan milik kunci akun ini - tidak ada yang perlu dicoba ulang, dan
 * blob-nya tidak pernah ditulis ke penyimpanan lokal. Hanya id + alasan + waktu yang dicatat (tanpa
 * blob/plaintext/KID), supaya kejadiannya terlihat tanpa menyimpan data mencurigakan sampai 1 MB di
 * `localStorage`. Blob aslinya tetap ada di server.
 *
 * Semua fungsi aman saat `localStorage` diblokir/penuh atau saat SSR: tidak pernah melempar.
 */

export const REJECTED_BLOBS_STORAGE_KEY = `${TECH_IDENTITY.storagePrefix}sync-rejected`

const REJECTED_BLOBS_VERSION = 1

/** Batas catatan per pemilik; yang paling lama dibuang lebih dulu. */
export const REJECTED_BLOBS_MAX_PER_OWNER = 200

/** Batas jumlah pemilik yang disimpan (sama dengan karantina kunci). */
const REJECTED_BLOBS_MAX_OWNERS = 3

/**
 * Alasan pencatatan: alasan `reject` dari core, `foreign` untuk blob v2 milik KID lain / versi tak
 * dikenal, dan `v1_downgrade` untuk v1 yang menimpa v2 lokal (diputuskan `pullDelta`, tanpa alasan).
 */
export type RejectedBlobReason = BlobRejectReason | 'foreign' | 'v1_downgrade'

export type RejectedBlobEntry = {
  readonly recordId: string
  readonly reason: RejectedBlobReason
  readonly atMs: number
}

type StoredRejected = {
  readonly version: number
  readonly owners: Record<string, readonly RejectedBlobEntry[]>
}

function storageOrNull(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    // Mode privat bisa melempar saat properti diakses.
    return null
  }
}

function isEntry(value: unknown): value is RejectedBlobEntry {
  if (typeof value !== 'object' || value === null) return false
  const entry = value as Partial<Record<keyof RejectedBlobEntry, unknown>>

  return (
    typeof entry.recordId === 'string' &&
    entry.recordId.length > 0 &&
    typeof entry.reason === 'string' &&
    typeof entry.atMs === 'number' &&
    Number.isFinite(entry.atMs)
  )
}

function readOwners(store: Storage): Map<string, RejectedBlobEntry[]> {
  try {
    const raw = store.getItem(REJECTED_BLOBS_STORAGE_KEY)
    if (raw === null) return new Map()

    const parsed = JSON.parse(raw) as Partial<StoredRejected> | null
    if (parsed?.version !== REJECTED_BLOBS_VERSION || typeof parsed.owners !== 'object') {
      return new Map()
    }

    return new Map(
      Object.entries(parsed.owners ?? {}).map(([ownerId, entries]) => [
        ownerId,
        Array.isArray(entries) ? entries.filter(isEntry) : [],
      ]),
    )
  } catch {
    // Catatan ini hanya diagnostik: nilai rusak dibaca sebagai kosong, bukan menghentikan sync.
    return new Map()
  }
}

/**
 * Catat satu blob yang ditolak. Idempoten per id (catatan terbaru menggantikan yang lama), karena
 * pull yang diulang membawa blob yang sama lagi.
 */
export function noteRejectedBlob(
  ownerId: string,
  recordId: string,
  reason: RejectedBlobReason,
  atMs: number,
): void {
  if (ownerId.length === 0 || recordId.length === 0) return

  const store = storageOrNull()
  if (store === null) return

  const owners = readOwners(store)
  const kept = (owners.get(ownerId) ?? []).filter((entry) => entry.recordId !== recordId)
  const next = [...kept, { recordId, reason, atMs }].slice(-REJECTED_BLOBS_MAX_PER_OWNER)

  // Ditulis ulang di urutan terakhir: pemilik yang paling lama tidak menulis dibuang lebih dulu.
  owners.delete(ownerId)
  owners.set(ownerId, next)
  while (owners.size > REJECTED_BLOBS_MAX_OWNERS) {
    const oldest = owners.keys().next().value
    if (oldest === undefined) break
    owners.delete(oldest)
  }

  try {
    const snapshot: StoredRejected = {
      version: REJECTED_BLOBS_VERSION,
      owners: Object.fromEntries(owners),
    }
    store.setItem(REJECTED_BLOBS_STORAGE_KEY, JSON.stringify(snapshot))
  } catch {
    // Kuota penuh/mode privat: catatan diagnostik tidak bertahan; sync tetap jalan.
  }
}

/** Catatan blob ditolak milik satu pemilik (lama -> baru). Kosong bila storage diblokir. */
export function listRejectedBlobs(ownerId: string): readonly RejectedBlobEntry[] {
  const store = storageOrNull()
  if (store === null || ownerId.length === 0) return []

  return readOwners(store).get(ownerId) ?? []
}

/** Dipakai test: catatan tidak boleh diwarisi antar kasus. */
export function clearRejectedBlobsForTest(): void {
  try {
    storageOrNull()?.removeItem(REJECTED_BLOBS_STORAGE_KEY)
  } catch {
    // Storage diblokir: tidak ada yang bisa dibersihkan.
  }
}
