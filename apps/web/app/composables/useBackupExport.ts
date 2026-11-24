import {
  createBackupFile,
  createEncryptedBackupFile,
  describeExportFailure,
  type BackupFile,
  type EncryptedBackupFile,
} from '~/utils/io/export'
import type { LocalDataSession } from '~/utils/storage/session'
import { deviceTimeZone } from '@improve-personal/core/planner'

import { useBackupReminder } from './useBackupReminder'
import { useLocalData } from './useLocalData'

/**
 * Aksi "Export" halaman Import & Export (PRD F10).
 *
 * Komponen hanya bertugas menampilkan; pengumpulan data, penegakan batas, dan penyusunan pesan
 * kegagalan ada di `utils/io/export.ts`. Pemisahan itu yang membuat batas ukuran dan
 * `BackupExportLimitError` bisa diuji tanpa browser.
 *
 * State-nya `ref` lokal, bukan `useState`: isinya cuma status sesaat halaman ini (sedang sibuk, pesan
 * error, nama berkas) - tidak ada gunanya ikut payload SSR, dan tidak ada data rahasia di sini.
 */
export function useBackupExport() {
  const localData = useLocalData()
  const reminder = useBackupReminder()

  const isBusy = ref(false)
  const error = ref<string | null>(null)
  const status = ref<string | null>(null)

  /**
   * Jalankan satu export dengan status sibuk/error yang sama. `null` = gagal, alasannya di `error`.
   *
   * Unduhan TIDAK dilakukan di sini: composable ini tidak menyentuh DOM, jadi pemanggil yang memutuskan
   * kapan berkas diserahkan ke browser (`downloadFile`).
   */
  async function run<T>(
    build: (session: LocalDataSession) => Promise<T>,
    describe: (file: T) => string,
  ): Promise<T | null> {
    if (isBusy.value) return null

    isBusy.value = true
    error.value = null
    status.value = null

    try {
      const session = await localData.ensure()

      if (session === null) {
        error.value =
          'Data lokal belum bisa dibuka di perangkat ini. Kalau pembuka kuncinya hilang, pulihkan dulu lewat halaman Akun.'
        return null
      }

      const file = await build(session)
      reminder.markBackedUp(session.clock.nowMs())
      status.value = describe(file)
      return file
    } catch (cause) {
      error.value = describeExportFailure(cause)
      return null
    } finally {
      isBusy.value = false
    }
  }

  /** Berkas JSON terbaca (PRD F10). */
  function exportBackup(): Promise<BackupFile | null> {
    return run(
      (session) =>
        createBackupFile({
          source: session,
          exportedAtMs: session.clock.nowMs(),
          tz: deviceTimeZone(),
        }),
      (file) => `Berkas ${file.name} siap diunduh (${file.document.records.length} data).`,
    )
  }

  /**
   * Berkas terenkripsi `.ipbackup` (PRD F15). Kata sandi hanya diteruskan ke worker; composable tidak
   * menyimpannya di state mana pun.
   */
  function exportEncryptedBackup(password: string): Promise<EncryptedBackupFile | null> {
    return run(
      (session) =>
        createEncryptedBackupFile({
          source: session,
          exportedAtMs: session.clock.nowMs(),
          tz: deviceTimeZone(),
          key: { password },
        }),
      (file) => `Berkas ${file.name} siap diunduh (${file.recordCount} data, terenkripsi).`,
    )
  }

  return {
    isBusy: computed(() => isBusy.value),
    error: computed(() => error.value),
    status: computed(() => status.value),
    exportBackup,
    exportEncryptedBackup,
  }
}
