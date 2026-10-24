import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { AUTH_SESSION_STATE_KEYS, useAuthSession } from '~/composables/useAuthSession'
import {
  AUTH_SESSION_CHANNEL_NAME,
  AUTH_SESSION_SIGNAL,
  installSessionSync,
} from '~/utils/auth/session-sync'

/**
 * Sisa risiko H1 security review #76: cookie sesi dipakai bersama semua tab, state Vue tidak. Test
 * ini mengunci perilaku yang dijanjikan `plugins/auth-session.client.ts` + `utils/auth/session-sync`:
 *
 * - tab yang identitasnya berubah memuat ulang halaman (bukan mencoba memutasi store satu-satu),
 * - tab yang identitasnya SAMA tidak melakukan apa pun,
 * - kegagalan jaringan tidak disalahartikan sebagai "akun berganti" (tidak ada reload loop),
 * - perubahan identitas DI TAB INI diumumkan ke tab lain, dan
 * - satu sinyal ditangani SATU listener, termasuk setelah pemasangan diulang (HMR).
 *
 * Jaringan dimock di batasnya (`$fetch`), sama seperti `useAuthSession.test.ts`.
 */

const { fetchSpy, navigateToMock } = vi.hoisted(() => ({
  fetchSpy: vi.fn(),
  navigateToMock: vi.fn(),
}))

mockNuxtImport('$fetch', () => fetchSpy)
mockNuxtImport('navigateTo', () => navigateToMock)

const USER_A = '018f2b3c-4d5e-7f80-9abc-def012345678'
const USER_B = '018f2b3c-4d5e-7f80-9abc-def01234567b'

const DEVICE = { id: USER_A, name: 'Chrome di Linux' }

function sessionOf(userId: string) {
  return {
    user: { id: userId, email: `${userId.slice(0, 8)}@example.com` },
    device: DEVICE,
    expiresAt: '2026-05-10T09:00:00.000Z',
  }
}

/** Tab lain di origin yang sama: kanal yang sama, pesan yang sama, tanpa payload user. */
const otherTabs: BroadcastChannel[] = []

function otherTab(): BroadcastChannel {
  const channel = new BroadcastChannel(AUTH_SESSION_CHANNEL_NAME)
  otherTabs.push(channel)
  return channel
}

function signalFromAnotherTab(): void {
  otherTab().postMessage(AUTH_SESSION_SIGNAL)
}

function httpProblem(status: number, code: string): unknown {
  return Object.assign(new Error(`HTTP ${status}`), {
    status,
    data: { error: { code, message: 'generik' } },
  })
}

async function goTo(path: string): Promise<void> {
  await useNuxtApp().$router.push(path)
}

/**
 * Pemanasan: pemuatan PERTAMA modul route `/app` memakan ~1,5 detik. Dilakukan di `beforeAll` (di
 * luar batas 5 detik per test) supaya test tidak flaky ketika seluruh suite berjalan paralel.
 */
beforeAll(async () => {
  useAuthSession().setSession(sessionOf(USER_A))
  await goTo('/app')
})

beforeEach(async () => {
  clearNuxtState(Object.values(AUTH_SESSION_STATE_KEYS))
  fetchSpy.mockReset()
  navigateToMock.mockReset()
  navigateToMock.mockResolvedValue(undefined)

  // Plugin memasang modul ini lewat `import()` (supaya tidak masuk graf awal). Test memasangnya
  // eksplisit agar tidak bergantung pada kapan chunk itu selesai dimuat.
  installSessionSync(useNuxtApp())

  await goTo('/')
  await flushPromises()
})

afterEach(() => {
  for (const channel of otherTabs.splice(0)) channel.close()
})

describe('identitas sesi berubah di tab lain', () => {
  it('akun berbeda: memuat ulang halaman supaya state akun lama dibuang', async () => {
    useAuthSession().setSession(sessionOf(USER_A))
    await goTo('/app')
    fetchSpy.mockResolvedValue({ data: sessionOf(USER_B) })

    signalFromAnotherTab()

    await vi.waitFor(() =>
      expect(navigateToMock).toHaveBeenCalledWith('/app', { external: true, replace: true }),
    )
    // Satu sinyal = satu permintaan: dua listener (mis. pemasangan ganda) akan terlihat di sini.
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(useAuthSession().session.value?.user.id).toBe(USER_B)
  })

  it('logout di tab lain (sesi jadi null): tetap memuat ulang', async () => {
    useAuthSession().setSession(sessionOf(USER_A))
    await goTo('/app')
    fetchSpy.mockRejectedValue(httpProblem(401, 'UNAUTHENTICATED'))

    signalFromAnotherTab()

    await vi.waitFor(() =>
      expect(navigateToMock).toHaveBeenCalledWith('/app', { external: true, replace: true }),
    )
    expect(useAuthSession().session.value).toBeNull()
  })

  it('identitas sama: tidak memuat ulang apa pun', async () => {
    useAuthSession().setSession(sessionOf(USER_A))
    await goTo('/app')
    fetchSpy.mockResolvedValue({ data: sessionOf(USER_A) })

    signalFromAnotherTab()

    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1))
    await flushPromises()

    // Permintaannya benar-benar berhasil (bukan gagal parse yang kebetulan tidak me-reload).
    expect(useAuthSession().error.value).toBeNull()
    expect(useAuthSession().session.value?.user.id).toBe(USER_A)
    expect(navigateToMock).not.toHaveBeenCalled()
  })

  it('server tidak terjangkau: identitas belum diketahui, jadi TIDAK memuat ulang (tidak ada loop)', async () => {
    useAuthSession().setSession(sessionOf(USER_A))
    await goTo('/app')
    fetchSpy.mockRejectedValue(
      Object.assign(new Error('fetch failed'), { cause: new Error('offline') }),
    )

    signalFromAnotherTab()

    await vi.waitFor(() => expect(useAuthSession().error.value).toBe('INTERNAL'))
    await flushPromises()

    expect(navigateToMock).not.toHaveBeenCalled()
  })

  it('pemasangan diulang (HMR): listener lama dilepas, satu sinyal tetap satu permintaan', async () => {
    useAuthSession().setSession(sessionOf(USER_A))
    await goTo('/app')
    fetchSpy.mockResolvedValue({ data: sessionOf(USER_B) })

    installSessionSync(useNuxtApp())

    signalFromAnotherTab()

    await vi.waitFor(() =>
      expect(navigateToMock).toHaveBeenCalledWith('/app', { external: true, replace: true }),
    )
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })
})

describe('perubahan identitas di tab ini diumumkan', () => {
  it('login akun mengirim sinyal ke tab lain (tanpa payload user)', async () => {
    const receiver = otherTab()
    const received: unknown[] = []
    receiver.addEventListener('message', (event) => received.push(event.data))

    useAuthSession().setSession(sessionOf(USER_A))

    await vi.waitFor(() => expect(received).toEqual([AUTH_SESSION_SIGNAL]))
  })

  it('login ulang akun yang sama tidak mengumumkan apa pun', async () => {
    const receiver = otherTab()
    const received: unknown[] = []
    receiver.addEventListener('message', (event) => received.push(event.data))

    const auth = useAuthSession()
    auth.setSession(sessionOf(USER_A))
    await vi.waitFor(() => expect(received).toHaveLength(1))

    auth.setSession(sessionOf(USER_A))
    await flushPromises()
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(received).toHaveLength(1)
  })

  it('logout mengumumkan perubahan identitas', async () => {
    const receiver = otherTab()
    const received: unknown[] = []
    receiver.addEventListener('message', (event) => received.push(event.data))

    const auth = useAuthSession()
    auth.setSession(sessionOf(USER_A))
    await vi.waitFor(() => expect(received).toHaveLength(1))

    auth.clear()

    await vi.waitFor(() => expect(received).toHaveLength(2))
    expect(received).toEqual([AUTH_SESSION_SIGNAL, AUTH_SESSION_SIGNAL])
  })
})
