/**
 * Sinyal "sedang sync" untuk indikator di shell.
 *
 * Bukan status sync (itu `readSyncStatus` dari core): ini hanya penanda bahwa SATU siklus push/pull
 * sedang berjalan. Dipisah dari `events.ts` karena sengaja TIDAK lewat `window`: penanda ini hanya
 * menghidupkan spinner, jadi tidak perlu bisa dikirim script lain, dan registry fungsi tidak
 * meninggalkan listener yatim seperti event jendela.
 *
 * Penghitung (bukan boolean) karena siklus susulan bisa dimulai tepat saat siklus sebelumnya selesai
 * (`pendingRun` di controller): tanpa hitungan, akhir siklus lama bisa mematikan indikator siklus baru.
 */

export type SyncActivityListener = (isRunning: boolean) => void

const listeners = new Set<SyncActivityListener>()

let runningCycles = 0

function emit(): void {
  const isRunning = runningCycles > 0

  for (const listener of listeners) listener(isRunning)
}

/** Satu siklus push/pull mulai berjalan. */
export function markSyncRunStart(): void {
  runningCycles += 1
  emit()
}

/** Satu siklus selesai (berhasil, gagal, atau dibatalkan). Idempoten di angka nol. */
export function markSyncRunEnd(): void {
  if (runningCycles === 0) return

  runningCycles -= 1
  emit()
}

/** Keadaan saat ini - dipakai komponen yang dipasang di tengah siklus. */
export function isSyncRunning(): boolean {
  return runningCycles > 0
}

/** Berlangganan perubahan; fungsi yang dikembalikan melepas listener. */
export function onSyncActivity(listener: SyncActivityListener): () => void {
  listeners.add(listener)

  return () => {
    listeners.delete(listener)
  }
}

/** Hanya untuk test: kembalikan hitungan dan listener ke keadaan awal. */
export function resetSyncActivityForTest(): void {
  runningCycles = 0
  listeners.clear()
}
