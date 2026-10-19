import { openLocalDataSession, type LocalDataSession } from '~/utils/storage/session'

import { useAuthSession } from './useAuthSession'

/**
 * Sesi data lokal untuk seluruh aplikasi.
 *
 * Tiga hal yang menentukan bentuk modul ini:
 * 1. **Sesi disimpan di variabel modul, bukan `useState`.** `useState` ikut diserialisasi ke
 *    `window.__NUXT__`, dan di dalam sesi ada bahan kunci (`dataKey`) - security.md §2 melarang data
 *    seperti itu masuk state yang ter-hidrasi. Yang masuk `useState` hanya status non-rahasia, supaya
 *    UI tetap reaktif.
 * 2. **Client-only.** Di server tidak ada IndexedDB, dan kunci memang tidak boleh dibuka di sana;
 *    `ensure()` mengembalikan `null` saat SSR sehingga pemanggil memakai daftar kosong, bukan gagal.
 * 3. **Terikat pada AKUN yang login.** Penyimpanan lokal dibuka dengan `userId` dari sesi server, dan
 *    sesi yang sudah tersimpan di memori DIBUANG begitu `userId`-nya berbeda. Tanpa ini, satu browser =
 *    satu bak data untuk semua akun: logout lalu login akun lain akan menampilkan data akun pertama.
 *    Sesi server juga dibaca lebih dulu - bukan sesudah - supaya tidak ada penyimpanan lokal yang
 *    dibuka tanpa akun yang jelas.
 */

export type LocalDataStatus = 'idle' | 'loading' | 'ready' | 'error'

export type LocalDataState = {
  readonly status: LocalDataStatus
  /** True = kunci utama baru dibuat di sesi ini, dan pembuka kunci belum diatur. */
  readonly isFreshKey: boolean
  readonly deviceId: string | null
  /** Akun yang penyimpanan lokalnya sedang dibuka. `null` = belum login / belum dibuka. */
  readonly userId: string | null
  /** Pesan ringkas untuk log/diagnostik. Bukan pesan server, dan tidak memuat data user. */
  readonly error: string | null
}

function emptyState(status: LocalDataStatus): LocalDataState {
  return { status, isFreshKey: false, deviceId: null, userId: null, error: null }
}

/** Sesi yang sedang dipegang, beserta pemiliknya - supaya pergantian akun bisa dideteksi. */
let cached: { readonly userId: string; readonly promise: Promise<LocalDataSession> } | null = null

export function useLocalData() {
  const auth = useAuthSession()

  const state = useState<LocalDataState>('localData', () => emptyState('idle'))

  /**
   * Buka sesi milik akun yang sedang login, atau `null` kalau tidak bisa / belum login.
   *
   * Kegagalan TIDAK disembunyikan: statusnya jadi `error` dan pesannya diringkas untuk log - bukan
   * ditelan, karena "data lokal tidak bisa dibuka" berarti user melihat aplikasi kosong, dan sebabnya
   * harus terlihat.
   */
  async function ensure(): Promise<LocalDataSession | null> {
    if (!import.meta.client) return null

    state.value = { ...state.value, status: 'loading' }

    try {
      // Sesi server lebih dulu: penyimpanan lokal tidak boleh dibuka tanpa akun yang jelas.
      const current = auth.session.value ?? (await auth.ensureLoaded())
      const userId = current?.user.id

      if (userId === undefined) {
        cached = null
        state.value = emptyState('idle')
        return null
      }

      if (cached !== null && cached.userId !== userId) {
        // Akun berganti (mis. login akun lain tanpa reload penuh): sesi lama dibuang, TIDAK dipakai ulang.
        cached = null
      }

      cached ??= { userId, promise: openLocalDataSession({ userId }) }
      const session = await cached.promise

      state.value = {
        status: 'ready',
        isFreshKey: session.isFreshKey,
        deviceId: session.deviceId,
        userId,
        error: null,
      }

      return session
    } catch (error) {
      // Dibiarkan bisa dicoba lagi pada muat berikutnya (mis. storage sementara tidak bisa dibuka).
      cached = null
      state.value = {
        ...emptyState('error'),
        error: error instanceof Error ? error.message : 'data lokal tidak bisa dibuka',
      }

      return null
    }
  }

  return {
    state: computed(() => state.value),
    ensure,
  }
}

/** Dipakai test untuk memastikan tidak ada sesi yang bocor antar kasus. */
export function resetLocalDataSessionForTest(): void {
  cached = null
}
