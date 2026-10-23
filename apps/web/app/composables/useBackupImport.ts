import {
  BACKUP_MAX_BYTES,
  BackupImportInvariantError,
  validateBackupText,
  type BackupDocument,
  type ImportMode,
} from '@improve-personal/core'

import { applyBackupDocument, describeImportFailure, describeImportResult } from '~/utils/io/import'
import {
  backupPreviewRows,
  describeImportInvariantError,
  describeImportRejection,
  type BackupPreviewRow,
} from '~/utils/io/preview'
import { readBackupFileText } from '~/utils/io/read-file'

import { useLocalData } from './useLocalData'

/**
 * Alur "Import" halaman Import & Export (PRD F10): pilih berkas → validasi → preview → pilih mode →
 * konfirmasi → tulis.
 *
 * Tiga aturan yang menentukan bentuk composable ini:
 * 1. **`File.size` diperiksa sebelum berkas dibaca.** Batas 32 MB milik core hanya bisa dicek setelah
 *    isinya ada di memori; membaca berkas 500 MB dulu berarti perangkat kehabisan memori sebelum
 *    penolakan sempat terjadi.
 * 2. **Preview memakai `dataCount` hasil `validateBackupText`.** Angkanya sudah dicocokkan dengan isi
 *    `records` (kalau tidak cocok, berkas ditolak dengan `DATA_COUNT_MISMATCH`) - jadi tidak ada
 *    `JSON.parse` kedua di UI yang bisa menampilkan angka berbeda.
 * 3. **"Ganti semua" tidak bisa dijalankan tanpa konfirmasi.** `canApply` menahan tombolnya, dan
 *    `applyImport` memeriksa ulang aturan yang sama supaya jalur programatik tidak bisa melewatinya.
 */
export type BackupImportPreview = {
  readonly rows: readonly BackupPreviewRow[]
  readonly totalRecords: number
  readonly exportedAtMs: number
  /** Versi skema asal berkas kalau dimigrasikan; `null` kalau sudah versi terkini. */
  readonly migratedFrom: number | null
}

export function useBackupImport() {
  const localData = useLocalData()

  const isBusy = ref(false)
  const error = ref<string | null>(null)
  const status = ref<string | null>(null)
  const fileName = ref<string | null>(null)
  const preview = ref<BackupImportPreview | null>(null)
  // Dokumen bisa berisi puluhan ribu record: `shallowRef` supaya Vue tidak membuat proxy reaktif
  // dalam untuk seluruh isi berkas.
  const document = shallowRef<BackupDocument | null>(null)
  const mode = ref<ImportMode>('merge')
  const isReplaceConfirmed = ref(false)

  const canApply = computed(
    () =>
      document.value !== null &&
      preview.value !== null &&
      // Berkas kosong tidak boleh diimpor: di mode "ganti semua" ia akan menghapus seluruh data
      // tanpa memasukkan apa pun.
      preview.value.totalRecords > 0 &&
      !isBusy.value &&
      (mode.value === 'merge' || isReplaceConfirmed.value),
  )

  /** Buang pilihan berkas, tapi biarkan pesan status terakhir tetap terlihat. */
  function clearSelection(): void {
    fileName.value = null
    preview.value = null
    document.value = null
    isReplaceConfirmed.value = false
  }

  async function selectFile(file: File): Promise<void> {
    clearSelection()
    // Mode kembali ke "gabung" (default aman) setiap kali berkas baru dipilih. Tanpa ini, pilihan
    // "ganti semua" dari berkas sebelumnya bisa ikut terpakai untuk berkas lain.
    mode.value = 'merge'
    error.value = null
    status.value = null
    fileName.value = file.name

    const read = await readBackupFileText(file, BACKUP_MAX_BYTES)

    if (!read.ok) {
      error.value = read.message
      return
    }

    const validation = validateBackupText(read.text)

    if (!validation.ok) {
      error.value = describeImportRejection(validation)
      return
    }

    document.value = validation.document
    preview.value = {
      rows: backupPreviewRows(validation.document.dataCount),
      totalRecords: validation.document.records.length,
      exportedAtMs: validation.document.exportedAtMs,
      migratedFrom: validation.migratedFrom,
    }
  }

  async function applyImport(): Promise<void> {
    if (!canApply.value) return

    const selected = document.value
    if (selected === null) return

    isBusy.value = true
    error.value = null
    status.value = null

    try {
      const session = await localData.ensure()

      if (session === null) {
        error.value =
          'Data lokal belum bisa dibuka di perangkat ini. Kalau pembuka kuncinya hilang, pulihkan dulu lewat halaman Akun.'
        return
      }

      const result = await applyBackupDocument({
        target: session,
        document: selected,
        mode: mode.value,
        nowMs: session.clock.nowMs(),
      })

      status.value = describeImportResult(result)
      // Berkas yang sama tidak boleh ter-import dua kali tanpa sengaja: pilihan dikosongkan, tombol
      // kembali mati sampai user memilih berkas (boleh berkas yang sama) lagi.
      clearSelection()
    } catch (cause) {
      error.value =
        cause instanceof BackupImportInvariantError
          ? describeImportInvariantError(cause)
          : describeImportFailure(cause)
    } finally {
      isBusy.value = false
    }
  }

  return {
    isBusy: computed(() => isBusy.value),
    error: computed(() => error.value),
    status: computed(() => status.value),
    fileName: computed(() => fileName.value),
    preview: computed(() => preview.value),
    mode,
    isReplaceConfirmed,
    canApply,
    selectFile,
    applyImport,
  }
}
