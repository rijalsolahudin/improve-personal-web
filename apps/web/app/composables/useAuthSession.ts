import type { CurrentSessionResult, ErrorCode, WebSessionDto } from '@improve-personal/contracts'

import { AuthRequestError, type AuthGateway } from './auth/gateway'

/**
 * Kunci `useState` state sesi. Dikumpulkan di satu tempat supaya guard, komponen, dan test menyebut
 * key yang sama (salah ketik key = state yang berbeda diam-diam).
 */
export const AUTH_SESSION_STATE_KEYS = {
  session: 'auth-session',
  pending: 'auth-session-pending',
  error: 'auth-session-error',
} as const

type NuxtApplication = ReturnType<typeof useNuxtApp>

/**
 * Request sesi yang sedang in-flight, dibagi SEMUA pemanggil dalam satu aplikasi Nuxt.
 *
 * Ini yang mencegah request ganda: guard dan komponen bisa memanggil `ensureLoaded()` bersamaan saat
 * halaman dimuat, dan hanya satu request ke `/v1/auth/session` yang jalan.
 *
 * Disimpan per instance Nuxt (`WeakMap`), BUKAN satu variabel modul: di SSR tiap request punya
 * instance sendiri, dan satu promise yang dibagi lintas request bisa membuat request user A menunggu
 * hasil request user B - lalu menulis sesi A ke state request B. Di client hanya ada satu instance,
 * jadi dedupe-nya tetap sama.
 */
const inFlightByApp = new WeakMap<NuxtApplication, Promise<CurrentSessionResult | null>>()

/**
 * Satu sumber kebenaran state sesi di client.
 *
 * `useState`, bukan Pinia: isinya satu snapshot kecil (DTO non-sensitif) yang perlu dibaca guard,
 * halaman login, dan kartu akun tanpa menyentuh store. Yang disimpan hanya `user`/`device`/`expiresAt`:
 * token TIDAK ADA di sini karena web memakai cookie `HttpOnly`, jadi JavaScript memang tidak pernah
 * memegang token (security.md §7). `error` juga disimpan sebagai KODE kontrak, bukan instance `Error`,
 * supaya state tetap serializable kalau nanti dipakai di halaman SSR.
 */
export function useAuthSession(gateway?: AuthGateway) {
  const session = useState<CurrentSessionResult | null>(AUTH_SESSION_STATE_KEYS.session, () => null)
  const pending = useState<boolean>(AUTH_SESSION_STATE_KEYS.pending, () => false)
  const error = useState<ErrorCode | null>(AUTH_SESSION_STATE_KEYS.error, () => null)

  /**
   * Gateway HTTP dimuat lewat `import()`, bukan impor statis.
   *
   * `useAuthSession()` dipanggil `app.vue` dan `middleware/auth.global.ts` di SETIAP rute - termasuk
   * landing yang tidak pernah bicara ke server auth (middleware melewati rute publik). Impor statis
   * menyeret `http-gateway` + skema zod kontrak ke JS awal landing (~4 KB chunk gateway + 28 KB zod)
   * hanya untuk dibaca saat render pertama, padahal state sesi di landing cuma `null`.
   *
   * `setSession`/`clear`/state tetap tidak menyentuh gateway sama sekali: hanya `load()` (dipakai
   * `refresh`/`ensureLoaded`) yang memuatnya, sekali per instance composable. Modulnya sendiri
   * di-cache bundler, jadi pemanggilan berikutnya tidak mengunduh apa pun lagi.
   *
   * `runWithContext` diperlukan karena `useAuthGateway()` memakai `useRequestFetch()` yang di SSR
   * membaca event request; setelah `await import()` konteks Nuxt tidak lagi otomatis aktif.
   */
  const nuxtApp = useNuxtApp()
  let gatewayPromise: Promise<AuthGateway> | null = null

  function resolveGateway(): Promise<AuthGateway> {
    if (gateway) return Promise.resolve(gateway)

    gatewayPromise ??= import('./auth/http-gateway').then((module) =>
      nuxtApp.runWithContext(() => module.useAuthGateway()),
    )
    return gatewayPromise
  }

  /**
   * Baca sesi dari server. 401 → `null` (belum login); kegagalan lain tercatat sebagai kode.
   *
   * Hasil bacaan hanya ditulis kalau state belum berubah selama request berjalan. Tanpa penjagaan
   * ini, bacaan yang berangkat SEBELUM login bisa mendarat SESUDAHNYA dan mengosongkan sesi yang baru
   * diterbitkan (guard `/app` lalu memantulkan user ke `/login`). Nilai `session.value` dipakai sebagai
   * penanda versi: `setSession`/`clear` selalu menggantinya, jadi hasil lama terdeteksi basi.
   */
  async function load(): Promise<CurrentSessionResult | null> {
    const before = session.value
    pending.value = true
    try {
      const current = await (await resolveGateway()).currentSession()
      if (session.value !== before) return session.value

      session.value = current
      error.value = null
      return current
    } catch (caught) {
      if (session.value !== before) return session.value

      error.value = caught instanceof AuthRequestError ? caught.code : 'INTERNAL'
      session.value = null
      return null
    } finally {
      pending.value = false
    }
  }

  /** Paksa baca ulang dari server (dipakai setelah aksi yang mengubah sesi). */
  function refresh(): Promise<CurrentSessionResult | null> {
    return load()
  }

  /**
   * Baca sekali, pakai hasilnya untuk semua pemanggil.
   *
   * Dua hal yang membuat ini aman dipanggil dari guard di tiap navigasi: sesi yang sudah ada tidak
   * memicu request lagi, dan request yang sedang jalan dibagi lewat `inFlight` (bukan menumpuk satu
   * request per pemanggil).
   */
  function ensureLoaded(): Promise<CurrentSessionResult | null> {
    if (session.value) return Promise.resolve(session.value)

    const existing = inFlightByApp.get(nuxtApp)
    if (existing) {
      // Request lama bisa saja masih jalan sementara state-nya direset pemanggil lain (mis.
      // `clearNuxtState`): pending harus tetap jujur selama request belum selesai.
      pending.value = true
      return existing
    }

    const inFlight = load().finally(() => {
      inFlightByApp.delete(nuxtApp)
    })
    inFlightByApp.set(nuxtApp, inFlight)
    return inFlight
  }

  /**
   * Hasil login (OTP/Google) langsung jadi state sesi: guard & kartu akun tidak perlu request
   * tambahan ke `/v1/auth/session` setelah user baru masuk.
   *
   * Hanya field `CurrentSessionResult` yang disimpan: DTO login web punya `client`, dan state di sini
   * sengaja dibuat sama persis dengan sesi yang dibaca dari server (satu bentuk, bukan dua).
   */
  function setSession(dto: CurrentSessionResult | WebSessionDto): void {
    session.value = { user: dto.user, device: dto.device, expiresAt: dto.expiresAt }
    error.value = null
  }

  /** Dipakai logout: sesi di CLIENT dibuang. Sesi di server dicabut lewat `signOut()`, bukan di sini. */
  function clear(): void {
    session.value = null
    error.value = null
  }

  return {
    session: readonly(session),
    pending: readonly(pending),
    error: readonly(error),
    refresh,
    ensureLoaded,
    setSession,
    clear,
  }
}
