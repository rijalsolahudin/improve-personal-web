/** Semua key localStorage milik app memakai prefix ini (tampilan, hiasan, sidebar, Pomodoro…). */
export const APP_STORAGE_PREFIX = 'ip-'
export const LOGIN_PATH = '/login'

/** Hapus key milik app saja; key situs lain di origin yang sama tidak disentuh. */
export function clearAppStorage(storage: Storage): void {
  const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter(
    (key): key is string => key?.startsWith(APP_STORAGE_PREFIX) ?? false,
  )
  for (const key of keys) storage.removeItem(key)
}

/**
 * Logout fase 1 - belum ada sesi server (PRD F15), jadi tidak ada request yang dipanggil.
 * Cukup bersihkan state sisi client lalu muat ulang ke halaman login: reload penuh membuang
 * semua state in-memory (data contoh, timer, popover) tanpa harus mereset tiap store satu-satu.
 * Begitu auth siap, fungsi ini yang diganti (cabut sesi di server dulu, baru bersihkan client).
 */
export function useLogout() {
  async function logout(): Promise<void> {
    try {
      clearAppStorage(localStorage)
    } catch {
      // Storage diblokir (mode privat): tidak ada yang tersimpan, lanjut saja.
    }
    await navigateTo(LOGIN_PATH, { external: true, replace: true })
  }

  return { logout }
}
