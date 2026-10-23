import type { SyncStatus } from '../domain/envelope.ts'
import type { StorageAdapter } from '../ports.ts'

/**
 * Status sync yang dibaca UI (ARCHITECTURE.md §9: `synced | pending | offline | error`).
 *
 * Fungsi murni + satu pembaca tipis. UI tidak boleh menyimpulkan statusnya sendiri dari
 * "ada request yang gagal" atau "kelihatannya offline" - satu tempat, dua platform.
 *
 * Prioritasnya sengaja begini:
 * 1. `offline` - kalau tidak ada koneksi, semua yang lain belum bisa dinilai. Outbox yang menumpuk
 *    saat offline BUKAN error; itu perilaku normal local-first.
 * 2. `error` - kegagalan yang bukan karena offline (mis. `rejected` permanen). Ini yang perlu
 *    perhatian user, jadi tidak boleh tenggelam di balik badge "menunggu".
 * 3. `pending` - ada baris outbox menunggu dikirim.
 * 4. `synced` - outbox kosong dan tidak ada error terakhir.
 */

export type SyncStatusInput = {
  readonly online: boolean
  readonly pendingCount: number
  readonly hasError: boolean
}

export function deriveSyncStatus(input: SyncStatusInput): SyncStatus {
  if (!input.online) return 'offline'
  if (input.hasError) return 'error'
  if (input.pendingCount > 0) return 'pending'
  return 'synced'
}

/** Baca status langsung dari storage + keadaan jaringan yang diketahui shell. */
export async function readSyncStatus(input: {
  readonly storage: StorageAdapter
  readonly online: boolean
  /**
   * Override eksplisit kalau pemanggil sudah tahu ada error (mis. baru saja menerima `rejected`).
   * Kalau tidak diisi, error dideteksi dari baris outbox yang punya `lastError` - jadi status
   * `error` tidak bisa tertimpa `pending` hanya karena push lalu pull berjalan berurutan.
   */
  readonly hasError?: boolean
}): Promise<SyncStatus> {
  const pendingCount = await input.storage.countOutbox()

  return deriveSyncStatus({
    online: input.online,
    pendingCount,
    hasError: input.hasError ?? (await hasOutboxError(input.storage, pendingCount)),
  })
}

/**
 * Apakah ada baris outbox yang tercatat gagal (pernah `markOutboxFailure`).
 *
 * Daftar outbox dibaca penuh saat ada baris menunggu: kalau hanya membaca batch pertama, baris gagal
 * di urutan belakang bisa lolos dan statusnya turun jadi `pending` - bug yang justru ingin ditutup.
 * Outbox kosong (kasus normal) tidak memicu pembacaan tambahan.
 */
async function hasOutboxError(storage: StorageAdapter, pendingCount: number): Promise<boolean> {
  if (pendingCount === 0) return false

  const rows = await storage.listOutbox(pendingCount)
  return rows.some((row) => row.lastError !== null)
}
