import { createBackupFile, describeExportFailure, type BackupFile } from '~/utils/io/export'
import { deviceTimeZone } from '~/utils/time'

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

  const isBusy = ref(false)
  const error = ref<string | null>(null)
  const status = ref<string | null>(null)

  /**
   * Susun berkas backup. `null` = gagal, dan alasannya sudah ada di `error`.
   *
   * Unduhan TIDAK dilakukan di sini: composable ini tidak menyentuh DOM, jadi pemanggil yang memutuskan
   * kapan berkas diserahkan ke browser (`downloadTextFile`).
   */
  async function exportBackup(): Promise<BackupFile | null> {
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

      const file = await createBackupFile({
        source: session,
        exportedAtMs: session.clock.nowMs(),
        tz: deviceTimeZone(),
      })

      status.value = `Berkas ${file.name} siap diunduh (${file.document.records.length} data).`
      return file
    } catch (cause) {
      error.value = describeExportFailure(cause)
      return null
    } finally {
      isBusy.value = false
    }
  }

  return {
    isBusy: computed(() => isBusy.value),
    error: computed(() => error.value),
    status: computed(() => status.value),
    exportBackup,
  }
}
