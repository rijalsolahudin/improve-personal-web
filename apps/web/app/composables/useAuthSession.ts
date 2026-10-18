import type { CurrentSessionResult, ErrorCode, WebSessionDto } from '@improve-personal/contracts'

import { AuthRequestError, type AuthGateway } from './auth/gateway'
import { useAuthGateway } from './auth/http-gateway'

/**
 * Kunci `useState` state sesi. Dikumpulkan di satu tempat supaya guard, komponen, dan test menyebut
 * key yang sama (salah ketik key = state yang berbeda diam-diam).
 */
export const AUTH_SESSION_STATE_KEYS = {
  session: 'auth-session',
  pending: 'auth-session-pending',
  error: 'auth-session-error',
} as const

/**
 * Request sesi yang sedang in-flight, dibagi SEMUA pemanggil (di level modul, bukan per-instance).
 *
 * Ini yang mencegah request ganda: guard dan komponen bisa memanggil `ensureLoaded()` bersamaan saat
 * halaman dimuat, dan hanya satu request ke `/v1/auth/session` yang jalan.
 */
let inFlight: Promise<CurrentSessionResult | null> | null = null

/**
 * Satu sumber kebenaran state sesi di client.
 *
 * `useState`, bukan Pinia: isinya satu snapshot kecil (DTO non-sensitif) yang perlu dibaca guard,
 * halaman login, dan kartu akun tanpa menyentuh store. Yang disimpan hanya `user`/`device`/`expiresAt`:
 * token TIDAK ADA di sini karena web memakai cookie `HttpOnly`, jadi JavaScript memang tidak pernah
 * memegang token (security.md §7). `error` juga disimpan sebagai KODE kontrak, bukan instance `Error`,
 * supaya state tetap serializable kalau nanti dipakai di halaman SSR.
 */
export function useAuthSession(gateway: AuthGateway = useAuthGateway()) {
  const session = useState<CurrentSessionResult | null>(AUTH_SESSION_STATE_KEYS.session, () => null)
  const pending = useState<boolean>(AUTH_SESSION_STATE_KEYS.pending, () => false)
  const error = useState<ErrorCode | null>(AUTH_SESSION_STATE_KEYS.error, () => null)

  /** Baca sesi dari server. 401 → `null` (belum login); kegagalan lain tercatat sebagai kode. */
  async function load(): Promise<CurrentSessionResult | null> {
    pending.value = true
    try {
      const current = await gateway.currentSession()
      session.value = current
      error.value = null
      return current
    } catch (caught) {
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

    inFlight ??= load().finally(() => {
      inFlight = null
    })
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
