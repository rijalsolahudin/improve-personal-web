/**
 * Deteksi & normalisasi error kuota penyimpanan.
 *
 * Browser melempar `QuotaExceededError` dalam beberapa bentuk: `DOMException` dengan nama itu (code 22),
 * error biasa yang menyalin namanya, atau pesan teks dari lapisan lain (fake-indexeddb, polyfill).
 * Semua bentuk itu harus dikenali supaya UI bisa memberi jalan keluar, bukan menampilkan
 * "Gagal menyimpan" generik.
 */

const QUOTA_ERROR_NAME = 'QuotaExceededError'
const QUOTA_DOM_EXCEPTION_CODE = 22

/**
 * Error ternormalisasi untuk kuota penuh.
 *
 * Pesan asli DIPERTAHANKAN (`super(cause.message)`): penanganan lama (mis. draf Memo) menampilkan
 * `error.message` apa adanya, dan test-nya mengunci teks itu. Yang berubah hanya tipe + `cause`,
 * sehingga pemanggil baru bisa membedakan kuota dari kegagalan lain tanpa memutus perilaku lama.
 */
export class StorageQuotaError extends Error {
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : 'Kuota penyimpanan penuh', { cause })
    this.name = 'StorageQuotaError'
  }
}

/** Apakah error berasal dari kuota penyimpanan yang habis. */
export function isQuotaExceededError(error: unknown): boolean {
  if (typeof DOMException !== 'undefined' && error instanceof DOMException) {
    return error.name === QUOTA_ERROR_NAME || error.code === QUOTA_DOM_EXCEPTION_CODE
  }

  if (typeof error === 'object' && error !== null) {
    const candidate = error as { name?: unknown; message?: unknown }
    if (candidate.name === QUOTA_ERROR_NAME) return true
    if (typeof candidate.message === 'string' && /quota.*exceed/i.test(candidate.message)) {
      return true
    }
  }

  return false
}

/** Bungkus error kuota jadi `StorageQuotaError`; error lain dilewatkan apa adanya. */
export function normalizeStorageError(error: unknown): unknown {
  return isQuotaExceededError(error) ? new StorageQuotaError(error) : error
}
