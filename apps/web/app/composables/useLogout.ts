import { TECH_IDENTITY } from '#shared/tech-identity'
import { INSTALLATION_ID_STORAGE_KEY } from '~/utils/device-installation'
import { LOGIN_PATH } from '~/utils/features'

import type { AuthGateway } from './auth/gateway'
import { useAuthGateway } from './auth/http-gateway'
import { useAuthSession } from './useAuthSession'

/** Semua key localStorage milik app memakai prefix ini (tampilan, hiasan, sidebar, Pomodoro…). */
export const APP_STORAGE_PREFIX = TECH_IDENTITY.storagePrefix

/**
 * Key yang SENGAJA tidak ikut disapu: id instalasi browser (`utils/device-installation.ts`).
 *
 * Logout (dan hapus akun) menghapus data per-akun, sedangkan id instalasi bukan milik akun mana pun -
 * ia menandai BROWSER ini. Kalau ikut terhapus, login berikutnya di perangkat yang sama terlihat
 * seperti instalasi baru: daftar Perangkat menumpuk baris "Chrome di Linux" yang sama dan jatah
 * `MAX_ACTIVE_DEVICES_PER_USER` terpakai habis (Ergonio #80). Nilainya acak dan bukan PII.
 */
const PRESERVED_STORAGE_KEYS: ReadonlySet<string> = new Set([INSTALLATION_ID_STORAGE_KEY])

/** Hapus key milik app saja; key situs lain di origin yang sama tidak disentuh. */
export function clearAppStorage(storage: Storage): void {
  const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter(
    (key): key is string =>
      key?.startsWith(APP_STORAGE_PREFIX) === true && !PRESERVED_STORAGE_KEYS.has(key),
  )
  for (const key of keys) storage.removeItem(key)
}

/**
 * Logout: cabut sesi di SERVER dulu, baru bersihkan state client.
 *
 * Urutannya mengikat - kalau state lokal dibuang lebih dulu dan pencabutan gagal, tidak ada lagi yang
 * bisa mengulang permintaan itu. Kegagalan jaringan tetap dilanjutkan (user tidak boleh terjebak di
 * app hanya karena offline), dan itulah trade-off yang disadari: cookie sesi di browser MASIH SAH
 * sampai server mencabutnya sendiri saat kedaluwarsa. Jadi "sudah logout" tidak pernah disimpulkan di
 * client: request berikutnya tetap diverifikasi server.
 *
 * Reload penuh (`external`) dipakai seperti sebelumnya: membuang semua state in-memory (data contoh,
 * timer, popover) tanpa harus mereset tiap store satu-satu.
 */
export function useLogout(gateway: AuthGateway = useAuthGateway()) {
  const { clear } = useAuthSession(gateway)

  async function logout(): Promise<void> {
    try {
      await gateway.signOut()
    } catch {
      // Best-effort (konsekuensinya di catatan atas): sesi server bisa masih hidup sampai kedaluwarsa.
    }

    clear()
    try {
      clearAppStorage(localStorage)
    } catch {
      // Storage diblokir (mode privat): tidak ada yang tersimpan, lanjut saja.
    }
    await navigateTo(LOGIN_PATH, { external: true, replace: true })
  }

  return { logout }
}
