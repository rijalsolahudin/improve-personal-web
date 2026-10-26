/**
 * Sinyal global "penyimpanan menolak tulisan" (kuota penuh).
 *
 * Sengaja di level modul, bukan event `window`: ini hanya menghidupkan banner di shell, tidak perlu
 * bisa dikirim script lain. Pola yang sama dipakai indikator sync (`utils/sync/activity.ts`).
 *
 * Dikirim dari satu tempat - pembungkus commit tulis lokal - supaya semua fitur (to-do, habit, goal,
 * jurnal, memo) memberi tahu shell tanpa masing-masing menulis kode UI sendiri.
 */

export type StorageQuotaState = {
  /** Waktu kejadian (epoch ms) - dipakai hanya untuk debugging/logika UI, bukan ditampilkan. */
  readonly atMs: number
}

export type StorageQuotaListener = (state: StorageQuotaState | null) => void

const listeners = new Set<StorageQuotaListener>()

let current: StorageQuotaState | null = null

function emit(): void {
  for (const listener of listeners) listener(current)
}

/** Tandai bahwa tulisan terakhir gagal karena kuota penuh. */
export function reportStorageQuotaError(atMs: number): void {
  current = { atMs }
  emit()
}

/** Sembunyikan banner (user menutupnya atau penyimpanan sudah lega). */
export function clearStorageQuotaError(): void {
  if (current === null) return

  current = null
  emit()
}

/** Keadaan saat ini - dipakai komponen yang dipasang setelah kejadian. */
export function storageQuotaState(): StorageQuotaState | null {
  return current
}

/** Berlangganan perubahan; fungsi yang dikembalikan melepas listener. */
export function onStorageQuotaChange(listener: StorageQuotaListener): () => void {
  listeners.add(listener)

  return () => {
    listeners.delete(listener)
  }
}

/** Hanya untuk test: kembalikan state & listener ke awal. */
export function resetStorageQuotaForTest(): void {
  current = null
  listeners.clear()
}
