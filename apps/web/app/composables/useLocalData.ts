import { LOCAL_PROFILE_ID } from '~/utils/storage/database-names'
import type { LocalDataSession } from '~/utils/storage/session'

/**
 * Sesi data lokal untuk seluruh aplikasi.
 *
 * Tiga hal yang menentukan bentuk modul ini:
 * 1. **Sesi disimpan di variabel modul, bukan `useState`.** `useState` ikut diserialisasi ke
 *    `window.__NUXT__`, dan di dalam sesi ada bahan kunci (`dataKey`). Yang masuk `useState` hanya
 *    status non-rahasia, supaya UI tetap reaktif.
 * 2. **Client-only.** Di server tidak ada IndexedDB; `ensure()` mengembalikan `null` saat SSR sehingga
 *    pemanggil memakai daftar kosong, bukan gagal.
 * 3. **Satu profil lokal (ADR 15).** Tidak ada akun server; penyimpanan dibuka dengan
 *    `LOCAL_PROFILE_ID`. Field `userId` di state tetap ada karena dipakai sebagai identitas sesi oleh
 *    komposabel yang memuat ulang data setelah import/transfer.
 */

export type LocalDataStatus = 'idle' | 'loading' | 'ready' | 'error'

export type LocalDataState = {
  readonly status: LocalDataStatus
  readonly deviceId: string | null
  /** Profil yang penyimpanan lokalnya sedang dibuka. `null` = belum dibuka. */
  readonly userId: string | null
  /** Pesan ringkas untuk log/diagnostik. Tidak memuat data user. */
  readonly error: string | null
}

function emptyState(status: LocalDataStatus): LocalDataState {
  return { status, deviceId: null, userId: null, error: null }
}

/** Promise pembukaan sesi; dipakai bersama supaya dua `ensure()` berbarengan membuka satu sesi. */
let pending: Promise<LocalDataSession> | null = null

/**
 * Lapisan data lokal (adaptor IndexedDB + kripto + repository) dimuat lewat `import()`: rute yang
 * tidak pernah menyentuh data lokal tidak perlu membayarnya.
 */
let sessionModule: Promise<typeof import('~/utils/storage/session')> | null = null

function loadSessionModule(): Promise<typeof import('~/utils/storage/session')> {
  sessionModule ??= import('~/utils/storage/session')

  return sessionModule
}

/**
 * Sesi yang sudah benar-benar terbuka (hasil `pending`), atau `null`.
 *
 * Dipakai pembaca yang TIDAK boleh membuka penyimpanan sendiri - mis. reload store setelah data lokal
 * berubah (import/restore).
 */
let opened: LocalDataSession | null = null

export function useLocalData() {
  const state = useState<LocalDataState>('localData', () => emptyState('idle'))

  /** Buka sesi profil lokal, atau `null` kalau tidak bisa. Idempoten untuk sesi yang sudah terbuka. */
  async function ensure(): Promise<LocalDataSession | null> {
    if (!import.meta.client) return null
    if (opened !== null) return opened

    state.value = { ...state.value, status: 'loading' }

    try {
      // Ditugaskan SINKRON (tanpa `await` di antara cek dan isi): dua pemanggil `ensure()` yang
      // berbarengan harus memakai satu promise sesi.
      pending ??= loadSessionModule().then((module) =>
        module.openLocalDataSession({ userId: LOCAL_PROFILE_ID }),
      )

      const session = await pending
      opened = session

      state.value = {
        status: 'ready',
        deviceId: session.deviceId,
        userId: session.userId,
        error: null,
      }

      return session
    } catch (error) {
      // Dibiarkan bisa dicoba lagi pada muat berikutnya.
      pending = null
      opened = null

      state.value = {
        ...emptyState('error'),
        error: error instanceof Error ? error.message : 'data lokal tidak bisa dibuka',
      }

      return null
    }
  }

  /** Sesi yang SUDAH terbuka. Tidak membuka apa pun, tidak mengubah state. */
  function current(): LocalDataSession | null {
    return opened
  }

  return {
    state: computed(() => state.value),
    ensure,
    current,
  }
}

/** Dipakai test untuk memastikan tidak ada sesi yang bocor antar kasus. */
export function resetLocalDataSessionForTest(): void {
  pending = null
  opened = null
}
