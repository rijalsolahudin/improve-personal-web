import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AUTH_SESSION_STATE_KEYS, useAuthSession } from './useAuthSession'

// Jaringan dimock di BATAS (`$fetch` Nuxt dipakai gateway default di `useAuthSession`), bukan dengan
// mem-mock composable-nya.
const { fetchSpy } = vi.hoisted(() => ({ fetchSpy: vi.fn() }))
mockNuxtImport('$fetch', () => fetchSpy)

const SESSION = {
  user: { id: '018f2b3c-4d5e-7f80-9abc-def012345678', email: 'kamu@email.com' },
  device: { id: '018f2b3c-4d5e-7f80-9abc-def012345678', name: 'Chrome di Linux' },
  expiresAt: '2026-05-10T09:00:00.000Z',
}

/** Kegagalan `$fetch` berbentuk amplop error kontrak (mis. 401 = belum ada sesi). */
function httpProblem(status: number, code: string): unknown {
  return Object.assign(new Error(`HTTP ${status}`), {
    status,
    data: { error: { code, message: 'generik' } },
  })
}

describe('useAuthSession', () => {
  beforeEach(() => {
    fetchSpy.mockReset()
    clearNuxtState(Object.values(AUTH_SESSION_STATE_KEYS))
  })

  it('ensureLoaded: satu request dibagi semua pemanggil, hasilnya sesi yang sama', async () => {
    let resolveFetch: (value: unknown) => void = () => {}
    fetchSpy.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve
        }),
    )

    const { session, pending, ensureLoaded } = useAuthSession()
    const first = ensureLoaded()
    const second = ensureLoaded()

    expect(pending.value).toBe(true)

    // Gateway HTTP dimuat lewat `import()` (lihat `useAuthSession`), jadi request pertama baru
    // terlihat setelah modulnya selesai dimuat - bukan seketika seperti saat impor statis.
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1))

    resolveFetch({ data: SESSION })

    await expect(first).resolves.toEqual(SESSION)
    await expect(second).resolves.toEqual(SESSION)
    expect(session.value).toEqual(SESSION)
    expect(pending.value).toBe(false)
  })

  it('ensureLoaded: sesi yang sudah ada tidak memicu request baru (guard jalan tiap navigasi)', async () => {
    fetchSpy.mockResolvedValue({ data: SESSION })

    const { ensureLoaded } = useAuthSession()
    await ensureLoaded()
    await expect(ensureLoaded()).resolves.toEqual(SESSION)

    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('refresh: 401 → sesi null, bukan error (belum login itu keadaan normal)', async () => {
    fetchSpy.mockRejectedValue(httpProblem(401, 'UNAUTHENTICATED'))

    const { session, error, refresh } = useAuthSession()

    await expect(refresh()).resolves.toBeNull()
    expect(session.value).toBeNull()
    expect(error.value).toBeNull()
  })

  it('refresh: kegagalan jaringan tercatat sebagai kode kontrak tanpa menjatuhkan UI', async () => {
    fetchSpy.mockRejectedValue(
      Object.assign(new Error('fetch failed'), { cause: new Error('offline') }),
    )

    const { session, error, refresh } = useAuthSession()

    await expect(refresh()).resolves.toBeNull()
    expect(session.value).toBeNull()
    expect(error.value).toBe('INTERNAL')
  })

  it('setSession: hasil login langsung tercermin tanpa request tambahan', () => {
    const { session, setSession } = useAuthSession()

    setSession({ ...SESSION, client: 'web' })

    expect(session.value).toEqual(SESSION)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('clear: dipakai logout untuk membuang sesi dari state client', async () => {
    fetchSpy.mockResolvedValue({ data: SESSION })

    const { session, clear, ensureLoaded } = useAuthSession()
    await ensureLoaded()

    clear()

    expect(session.value).toBeNull()
  })
})
