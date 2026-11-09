import type { LocalDataSession } from '~/utils/storage/session'

import { useAuthSession } from './useAuthSession'

/**
 * Sesi data lokal untuk seluruh aplikasi.
 *
 * Tiga hal yang menentukan bentuk modul ini:
 * 1. **Sesi disimpan di variabel modul, bukan `useState`.** `useState` ikut diserialisasi ke
 *    `window.__NUXT__`, dan di dalam sesi ada bahan kunci (`dataKey`). Yang masuk `useState` hanya
 *    status non-rahasia, supaya UI tetap reaktif.
 * 2. **Client-only.** Di server tidak ada IndexedDB; `ensure()` mengembalikan `null` saat SSR sehingga
 *    pemanggil memakai daftar kosong, bukan gagal.
 * 3. **Terikat pada AKUN yang login.** Penyimpanan lokal dibuka dengan `userId` dari sesi server, dan
 *    sesi yang sudah tersimpan di memori DIBUANG begitu `userId`-nya berbeda.
 *
 * Tidak ada lagi tahap "unlock": kunci perangkat hanya melindungi salinan lokal, dan data di server
 * disegel server. Login yang berhasil berarti data bisa diakses.
 */

export type LocalDataStatus = 'idle' | 'loading' | 'ready' | 'error'

export type LocalDataState = {
  readonly status: LocalDataStatus
  readonly deviceId: string | null
  /** Akun yang penyimpanan lokalnya sedang dibuka. `null` = belum login / belum dibuka. */
  readonly userId: string | null
  /** Pesan ringkas untuk log/diagnostik. Bukan pesan server, dan tidak memuat data user. */
  readonly error: string | null
}

function emptyState(status: LocalDataStatus): LocalDataState {
  return { status, deviceId: null, userId: null, error: null }
}

/** Sesi yang sedang dipegang, beserta pemiliknya - supaya pergantian akun bisa dideteksi. */
let cached: { readonly userId: string; readonly promise: Promise<LocalDataSession> } | null = null

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
 * Sesi yang sudah benar-benar terbuka (hasil `cached`), atau `null`.
 *
 * Dipakai pembaca yang TIDAK boleh membuka penyimpanan sendiri - mis. indikator status sync dan
 * reload store setelah pull.
 */
let opened: LocalDataSession | null = null

export function useLocalData() {
  const auth = useAuthSession()

  const state = useState<LocalDataState>('localData', () => emptyState('idle'))

  /**
   * Buka sesi milik akun yang sedang login, atau `null` kalau tidak bisa / belum login.
   *
   * Idempoten untuk sesi yang SUDAH terbuka: pemanggil berikutnya mendapat sesi yang sama tanpa
   * menulis `status` apa pun. Dulu setiap panggilan menulis `loading`, dan plugin sync memakai status
   * itu sebagai sinyal untuk mematikan lalu memasang ulang controller.
   */
  async function ensure(): Promise<LocalDataSession | null> {
    if (!import.meta.client) return null

    // Jalur cepat: sesi akun yang sedang login sudah terbuka.
    const activeUserId = auth.session.value?.user.id
    if (activeUserId !== undefined && opened !== null && opened.userId === activeUserId) {
      return opened
    }

    state.value = { ...state.value, status: 'loading' }

    try {
      // Sesi server lebih dulu: penyimpanan lokal tidak boleh dibuka tanpa akun yang jelas.
      const current = auth.session.value ?? (await auth.ensureLoaded())
      const userId = current?.user.id

      if (userId === undefined) {
        cached = null
        opened = null
        state.value = emptyState('idle')
        return null
      }

      if (cached !== null && cached.userId !== userId) {
        // Akun berganti (mis. login akun lain tanpa reload penuh): sesi lama dibuang.
        cached = null
        opened = null
      }

      // Ditugaskan SINKRON (tanpa `await` di antara cek dan isi): dua pemanggil `ensure()` yang
      // berbarengan harus memakai satu promise sesi.
      cached ??= {
        userId,
        promise: loadSessionModule().then((module) => module.openLocalDataSession({ userId })),
      }

      const session = await cached.promise
      opened = session

      state.value = {
        status: 'ready',
        deviceId: session.deviceId,
        userId,
        error: null,
      }

      return session
    } catch (error) {
      // Dibiarkan bisa dicoba lagi pada muat berikutnya.
      cached = null
      opened = null

      state.value = {
        ...emptyState('error'),
        error: error instanceof Error ? error.message : 'data lokal tidak bisa dibuka',
      }

      return null
    }
  }

  /** Sesi yang SUDAH terbuka untuk akun yang sedang login. Tidak membuka apa pun, tidak mengubah state. */
  function current(): LocalDataSession | null {
    const userId = auth.session.value?.user.id
    if (userId === undefined || opened === null || opened.userId !== userId) return null

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
  cached = null
  opened = null
}
