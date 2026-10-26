/**
 * Durability penyimpanan lokal web (ARCHITECTURE.md §5: "`navigator.storage.persist()` wajib
 * dipanggil dan PWA didorong untuk di-install").
 *
 * Kenapa ini penting: IndexedDB adalah salinan kerja utama (local-first), dan kunci enkripsi hidup di
 * database IndexedDB terpisah. Tanpa status `persistent`, browser boleh membuang data origin saat
 * ruang perangkat menipis (Chrome) atau saat situs lama tidak dibuka (Safari). Data record masih bisa
 * dipulihkan lewat sync selama kunci ada - tetapi kunci yang hilang tidak bisa diunduh dari mana pun.
 *
 * Semua fungsi di sini menerima `StorageManager` secara eksplisit supaya bisa diuji tanpa browser dan
 * tidak pernah menyentuh `navigator` saat SSR.
 */

/** Ambang peringatan kuota: 75% sudah cukup dekat untuk mengajak user menyiapkan backup. */
export const QUOTA_WARN_RATIO = 0.75

const BYTES_PER_KB = 1024
const BYTES_PER_MB = BYTES_PER_KB * 1024
const BYTES_PER_GB = BYTES_PER_MB * 1024

export type StorageEstimateSnapshot = {
  /** Byte terpakai, atau `null` kalau browser tidak memberi angka. */
  readonly usage: number | null
  /** Kuota efektif origin ini, atau `null` kalau tidak diketahui. */
  readonly quota: number | null
}

/** `navigator.storage` kalau tersedia; `null` di SSR / browser lama. */
export function storageManager(): StorageManager | null {
  if (typeof navigator === 'undefined') return null

  return navigator.storage ?? null
}

function isFiniteSize(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

/** Format byte yang enak dibaca (locale id), mis. `512 B`, `1,5 KB`, `2,4 GB`. */
export function formatBytes(bytes: number): string {
  if (!isFiniteSize(bytes)) return '-'
  if (bytes < BYTES_PER_KB) return `${Math.round(bytes)} B`

  const [value, unit] =
    bytes < BYTES_PER_MB
      ? [bytes / BYTES_PER_KB, 'KB']
      : bytes < BYTES_PER_GB
        ? [bytes / BYTES_PER_MB, 'MB']
        : [bytes / BYTES_PER_GB, 'GB']

  return `${new Intl.NumberFormat('id-ID', {
    maximumFractionDigits: unit === 'GB' ? 2 : 1,
  }).format(value)} ${unit}`
}

/** Porsi kuota yang terpakai (0–1), atau `null` kalau salah satu angka tidak diketahui. */
export function storageUsageRatio(estimate: StorageEstimateSnapshot): number | null {
  const { usage, quota } = estimate
  if (!isFiniteSize(usage) || !isFiniteSize(quota) || quota === 0) return null

  return Math.min(usage / quota, 1)
}

/** Apakah pemakaian sudah melewati ambang peringatan. */
export function isStorageLow(ratio: number | null): boolean {
  return ratio !== null && ratio >= QUOTA_WARN_RATIO
}

/** Baca `usage`/`quota`; kegagalan browser tidak boleh menjatuhkan halaman Akun. */
export async function readStorageEstimate(
  manager: StorageManager | null,
): Promise<StorageEstimateSnapshot> {
  if (!manager?.estimate) return { usage: null, quota: null }

  try {
    const estimate = await manager.estimate()
    return {
      usage: isFiniteSize(estimate.usage) ? estimate.usage : null,
      quota: isFiniteSize(estimate.quota) ? estimate.quota : null,
    }
  } catch {
    return { usage: null, quota: null }
  }
}

/** Status `persisted()`: `null` = browser tidak mendukung / gagal dibaca. */
export async function isStoragePersisted(manager: StorageManager | null): Promise<boolean | null> {
  if (!manager?.persisted) return null

  try {
    return await manager.persisted()
  } catch {
    return null
  }
}

/**
 * Minta status persistent. Browser boleh menolak (Safari sering butuh interaksi user / PWA
 * ter-install); penolakan bukan error, hanya berarti data tetap bisa di-evict.
 */
export async function requestStoragePersistence(manager: StorageManager | null): Promise<boolean> {
  if (!manager?.persist) return false

  try {
    return await manager.persist()
  } catch {
    return false
  }
}

/**
 * Dipanggil sekali saat shell app dipasang: lewati permintaan kalau sudah persistent, supaya tidak
 * memanggil `persist()` berulang di setiap navigasi.
 */
export async function ensureStorageProtection(
  manager: StorageManager | null = storageManager(),
): Promise<boolean> {
  if ((await isStoragePersisted(manager)) === true) return true

  return await requestStoragePersistence(manager)
}
