import { reportStorageQuotaError } from './pressure'
import { isQuotaExceededError, StorageQuotaError } from './quota'

/**
 * Bungkus satu commit tulis lokal: kalau gagal karena kuota, kirim sinyal ke shell dan lempar ulang
 * sebagai `StorageQuotaError`.
 *
 * Kenapa di sini, bukan di tiap composable: semua fitur menulis lewat `RecordWriter`, jadi satu
 * pembungkus sudah menutup to-do, habit, goal, jurnal, memo, countdown, dan import. Fitur tidak perlu
 * tahu bahwa kuota itu kasus khusus - mereka tetap menangani error seperti biasa (draf/error banner).
 *
 * `atMs` dipakai untuk `StorageQuotaState`; tidak dibaca dari jam sistem di dalam modul supaya
 * perilakunya deterministik di test.
 */
export async function guardStorageWrite<T>(work: () => Promise<T>, atMs: number): Promise<T> {
  try {
    return await work()
  } catch (error) {
    if (isQuotaExceededError(error)) {
      reportStorageQuotaError(atMs)
      throw new StorageQuotaError(error)
    }

    throw error
  }
}
