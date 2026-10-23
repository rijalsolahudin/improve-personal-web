import type { LocalDataSession } from '~/utils/storage/session'

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

/**
 * `locked` = akun ini sudah punya kunci (di server atau data lokal), tapi perangkat ini belum punya
 * pembukanya. Bukan error: jalan keluarnya adalah layar pemulihan (passkey / kode pemulihan).
 */
export type LocalDataStatus = 'idle' | 'loading' | 'ready' | 'locked' | 'error'

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

/**
 * Lapisan data lokal (adaptor IndexedDB + kripto + repository) sengaja dimuat lewat `import()`.
 *
 * Modul itu ~49 KB gzip dan hanya berguna di halaman yang benar-benar membaca data lokal; kalau
 * diimpor statis, ia ikut di `<link rel="modulepreload">` SEMUA rute - termasuk landing dan `/login`
 * yang tidak menyentuh IndexedDB (QA T16 MAYOR-1: JS awal `/` 192 KB, `/login` 170 KB). ESM sudah
 * menyimpan modul yang pernah dimuat, jadi `import()` di sini hanya sekali per sesi browser.
 */
let sessionModule: Promise<typeof import('~/utils/storage/session')> | null = null

function loadSessionModule(): Promise<typeof import('~/utils/storage/session')> {
  sessionModule ??= import('~/utils/storage/session')

  return sessionModule
}

/**
 * Sesi yang sudah benar-benar terbuka (hasil `cached`), atau `null`.
 *
 * Dipakai pembaca yang TIDAK boleh membuka penyimpanan sendiri - mis. indikator status sync. Kalau
 * mereka memanggil `ensure()`, `ensure()` menulis state (`loading`) dan pembaca lain melihat status
 * yang berkedip padahal sesinya sudah siap.
 */
let opened: LocalDataSession | null = null

/**
 * Apakah ini perangkat PERTAMA akun ini, jadi boleh membuat kunci utama baru?
 *
 * Ada envelope passkey di server = akun sudah punya kunci di perangkat lain. Membuat kunci baru di sini
 * terlihat mulus, tapi saat user mengaktifkan passkey envelope di server TERTIMPA - dan kunci lama
 * kehilangan pembuka cadangannya. Kalau server tidak terjangkau, jawabannya gagal (bukan "boleh"):
 * menebak "boleh" adalah arah yang bisa menghilangkan data.
 */
async function isFirstDeviceOfAccount(): Promise<boolean> {
  // `import()` di sini, bukan impor statis: `keys-gateway` membawa skema zod dari
  // `@improve-personal/contracts` (~28 KB gzip). Impor statis menaruhnya di graf awal SEMUA rute -
  // termasuk landing yang tidak pernah memanggil fungsi ini. Dipanggil paling banyak sekali per sesi.
  const { createKeysGateway } = await import('~/utils/crypto/keys-gateway')
  const keys = createKeysGateway((path, init) => $fetch(path, init))

  return (await keys.listEnvelopes()).length === 0
}

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
        opened = null
        state.value = emptyState('idle')
        return null
      }

      if (cached !== null && cached.userId !== userId) {
        // Akun berganti (mis. login akun lain tanpa reload penuh): sesi lama dibuang, TIDAK dipakai ulang.
        cached = null
        opened = null
      }

      // Ditugaskan SINKRON (tanpa `await` di antara cek dan isi): dua pemanggil `ensure()` yang
      // berbarengan (mis. preferensi tampilan + daftar task) harus memakai satu promise sesi. Kalau
      // tidak, dua `openLocalDataSession` bisa berjalan bersamaan dan sama-sama membuat kunci utama
      // di perangkat yang belum punya pembuka.
      cached ??= {
        userId,
        promise: loadSessionModule().then((module) =>
          module.openLocalDataSession({ userId, canCreateKey: isFirstDeviceOfAccount }),
        ),
      }

      const session = await cached.promise
      opened = session

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
      opened = null

      const LocalKeyMissingError = await loadSessionModule()
        .then((module) => module.LocalKeyMissingError)
        .catch(() => null)

      if (LocalKeyMissingError !== null && error instanceof LocalKeyMissingError) {
        state.value = { ...emptyState('locked'), userId: auth.session.value?.user.id ?? null }
        return null
      }

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
