import { AppState, type AppStateStatus } from 'react-native'

/**
 * Siklus hidup app (port `Scheduler` mobile memakai ini; ARCHITECTURE.md §5).
 *
 * Keputusan #181 (2026-11-24): kunci DB terikat biometrik, jadi sync/backup latar menunggu app dibuka.
 * Modul ini yang memberi tahu "app baru dibuka lagi" (kunci app + picu sync) dan "app ke latar"
 * (hentikan kerja yang butuh kunci).
 *
 * iOS melewati `inactive` untuk interupsi singkat (Control Center, panggilan masuk); itu bukan
 * "ke latar", jadi tidak memicu `onBackground` - kalau dipicu, app terkunci tiap user menarik
 * Control Center.
 */

export type AppLifecycleListener = {
  /** Dari `background` kembali ke `active`. Tidak terpanggil saat subscribe. */
  readonly onForeground?: () => void
  /** Masuk `background`. */
  readonly onBackground?: () => void
}

export function isAppInForeground(): boolean {
  return AppState.currentState === 'active'
}

/** Mengembalikan fungsi berhenti berlangganan. */
export function subscribeAppLifecycle(listener: AppLifecycleListener): () => void {
  let wasInBackground = AppState.currentState === 'background'

  const subscription = AppState.addEventListener('change', (next: AppStateStatus) => {
    if (next === 'background') {
      if (!wasInBackground) listener.onBackground?.()
      wasInBackground = true
      return
    }
    if (next === 'active' && wasInBackground) {
      wasInBackground = false
      listener.onForeground?.()
    }
  })

  return () => subscription.remove()
}
