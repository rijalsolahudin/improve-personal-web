import { flushPromises } from '@vue/test-utils'
import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

import { useAuthSession, AUTH_SESSION_STATE_KEYS } from '~/composables/useAuthSession'
import { resetLocalDataSessionForTest, useLocalData } from '~/composables/useLocalData'
import { stopSync } from '~/utils/sync/controller'
import { LOCAL_WRITE_EVENT } from '~/utils/sync/events'

import {
  TEST_USER_A,
  TEST_USER_B,
  createMemoryLocalSession,
  signIn,
} from '../../tests/nuxt/local-session'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
// Klaim identitas kunci (`PUT /v1/keys/identity`) berjalan sebelum `ready`; jaringan dimock di batas.
mockNuxtImport('$fetch', () => async () => ({
  data: {
    kid: 'LBaTVGaXKfW710NOCIXptA',
    claimedAt: '2026-10-27T00:00:00.000Z',
    claimedByDeviceLabel: null,
  },
}))

/**
 * Plugin `sync.client.ts` memutuskan KAPAN controller sync hidup - bagian yang paling mudah salah
 * tanpa terlihat: controller yang tertinggal setelah akun berganti tetap mengirim batch akun lama
 * dengan cookie akun baru. Tidak ada test untuk berkas itu sebelum ini; yang diuji di sini adalah
 * perilaku plugin di dalam aplikasi sungguhan (plugin-nya memang dipasang oleh lingkungan Nuxt),
 * dengan controller ASLI - hanya jaringan yang diganti di batasnya.
 */

const createSyncHttpClient = vi.hoisted(() => vi.fn())

vi.mock('~/utils/sync/client', () => ({ createSyncHttpClient }))

const openSession = vi.hoisted(() => vi.fn())

vi.mock('~/utils/storage/session', () => ({
  LocalKeyMissingError: class LocalKeyMissingError extends Error {},
  openLocalDataSession: openSession,
}))

type FakeClient = {
  readonly postJson: ReturnType<typeof vi.fn>
  readonly getJson: ReturnType<typeof vi.fn>
}

const clients: FakeClient[] = []

/** Jaringan palsu: satu batch kosong, satu pull kosong - cukup untuk menghitung permintaan. */
function fakeClient(): FakeClient {
  return {
    postJson: vi.fn(async () => ({ results: [] })),
    getJson: vi.fn(async () => ({ records: [], nextCursor: 0 })),
  }
}

function lastClient(): FakeClient {
  const last = clients.at(-1)
  if (last === undefined) throw new Error('controller sync belum dipasang')
  return last
}

function requestCount(client: FakeClient): number {
  return client.postJson.mock.calls.length + client.getJson.mock.calls.length
}

/** Tab dianggap sudah "diam" saat identitas dan datanya siap untuk akun itu. */
async function openAccount(userId: string): Promise<void> {
  signIn(userId)
  const opened = await useLocalData().ensure()
  expect(opened?.userId).toBe(userId)
}

async function openApp(): Promise<void> {
  await useNuxtApp().$router.push('/app')
  // `attach()` memuat controller lewat `import()`; di test pertama modul itu belum ada di cache.
  await vi.waitFor(() => expect(createSyncHttpClient).toHaveBeenCalled(), { timeout: 2_000 })
  await settle()
}

async function goToLanding(): Promise<void> {
  await useNuxtApp().$router.push('/')
}

/** Watcher Vue jalan di microtask; `flushPromises` cukup karena timer palsu hanya `setInterval`. */
async function settle(): Promise<void> {
  await flushPromises()
  await flushPromises()
}

/** Jaringan & sesi palsu. Dipakai juga oleh pemanasan di `beforeAll`. */
function configureMocks(): void {
  createSyncHttpClient.mockReset()
  createSyncHttpClient.mockImplementation(() => {
    const client = fakeClient()
    clients.push(client)
    return client
  })
  openSession.mockReset()
  openSession.mockImplementation(async (options: { userId: string }) =>
    createMemoryLocalSession(options.userId),
  )
}

/**
 * Pemanasan: pemuatan PERTAMA modul route `/app` beserta chunk storage bisa memakan beberapa detik.
 * Dilakukan di `beforeAll` (di luar batas 5 detik per test) supaya test tidak flaky ketika seluruh
 * suite berjalan paralel. Controller yang sempat terpasang dimatikan `stopSync()` di `beforeEach`.
 */
beforeAll(async () => {
  configureMocks()
  signIn(TEST_USER_A)
  await useLocalData().ensure()
  await openApp()
})

beforeEach(async () => {
  // Sisa pemanasan memakai timer NYATA: matikan sebelum `useFakeTimers` mengganti implementasinya.
  stopSync()
  // Hanya interval yang dipalsukan: itulah timer milik controller yang dihitung `getTimerCount()`.
  // `setTimeout` dibiarkan nyata supaya utilitas test (flush, timeout, waitFor) tetap bekerja.
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
  clearNuxtState([
    ...Object.values(AUTH_SESSION_STATE_KEYS),
    'localData',
    'now',
    'goals',
    'goalLinks',
    'tasks',
    'schedules',
    'habits',
    'pending',
  ])
  resetLocalDataSessionForTest()
  clients.length = 0
  configureMocks()

  // Kembali ke keadaan "belum ada akun" seperti saat aplikasi baru dimuat.
  signIn(TEST_USER_A)
  useAuthSession().clear()
  await goToLanding()
  await settle()
})

afterEach(async () => {
  // Matikan controller yang mungkin masih hidup lewat jalur plugin (bukan `stopSync()` langsung):
  // state data lokal yang tidak siap adalah salah satu kondisi stop yang diuji.
  useState('localData').value = {
    status: 'idle',
    isFreshKey: false,
    deviceId: null,
    userId: null,
    error: null,
  }
  await settle()
  resetLocalDataSessionForTest()
  vi.clearAllTimers()
  vi.useRealTimers()
})

describe('plugin sync.client: pemasangan controller', () => {
  it('dipasang sekali per akun walau watcher terpicu berulang', async () => {
    await openAccount(TEST_USER_A)
    await openApp()
    await settle()

    expect(createSyncHttpClient).toHaveBeenCalledTimes(1)
    expect(createSyncHttpClient).toHaveBeenCalledWith(
      expect.objectContaining({ expectedUserId: TEST_USER_A }),
    )

    // Tiap perubahan `localData.state` memicu watcher plugin (getter-nya selalu mengembalikan array
    // baru), tetapi akun yang sama tidak boleh memasang controller kedua.
    for (let index = 0; index < 3; index += 1) {
      const current = useState('localData').value as Record<string, unknown>
      useState('localData').value = { ...current, error: index === 0 ? null : current.error }
      await settle()
    }

    expect(createSyncHttpClient).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(1)
  })

  it('tidak memasang apa pun di rute di luar /app', async () => {
    await openAccount(TEST_USER_A)
    await goToLanding()
    await settle()

    expect(createSyncHttpClient).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('plugin sync.client: penghentian controller', () => {
  it('status data lokal bukan "ready" menghentikan controller dan membuang timer', async () => {
    await openAccount(TEST_USER_A)
    await openApp()
    await settle()
    expect(vi.getTimerCount()).toBe(1)

    const client = lastClient()
    const before = requestCount(client)

    useState('localData').value = {
      status: 'locked',
      isFreshKey: false,
      deviceId: null,
      userId: TEST_USER_A,
      error: null,
    }
    await settle()

    expect(vi.getTimerCount()).toBe(0)

    // Setelah stop tidak ada request apa pun, termasuk setelah pemicu berkala/pull waktunya tiba.
    window.dispatchEvent(new Event(LOCAL_WRITE_EVENT))
    vi.advanceTimersByTime(10 * 60_000)
    await settle()
    expect(requestCount(client)).toBe(before)
  })

  it('pindah rute keluar /app menghentikan controller', async () => {
    await openAccount(TEST_USER_A)
    await openApp()
    await settle()
    expect(vi.getTimerCount()).toBe(1)

    const client = lastClient()
    const before = requestCount(client)

    await goToLanding()
    await settle()

    expect(vi.getTimerCount()).toBe(0)
    vi.advanceTimersByTime(10 * 60_000)
    await settle()
    expect(requestCount(client)).toBe(before)
  })

  it('sesi data lokal sudah tidak terbuka (current() null) menghentikan controller', async () => {
    await openAccount(TEST_USER_A)
    await openApp()
    await settle()
    expect(vi.getTimerCount()).toBe(1)

    const client = lastClient()
    const before = requestCount(client)

    // Sesi data lokal dibuang oleh jalur lain (`useLocalData` membuangnya saat akun berganti),
    // sedangkan state masih mengaku `ready`. `current()` menolak memberi sesi, jadi controller tidak
    // boleh terus memakai sesi yang sudah tidak dipegang aplikasi.
    resetLocalDataSessionForTest()
    useState('localData').value = {
      status: 'ready',
      isFreshKey: false,
      deviceId: null,
      userId: TEST_USER_A,
      error: null,
    }
    await settle()

    expect(useLocalData().current()).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
    vi.advanceTimersByTime(10 * 60_000)
    await settle()
    expect(requestCount(client)).toBe(before)
  })

  it('identitas auth berubah menghentikan controller sebelum request berikutnya', async () => {
    await openAccount(TEST_USER_A)
    await openApp()
    await settle()
    expect(vi.getTimerCount()).toBe(1)

    const client = lastClient()
    const before = requestCount(client)

    // Tab ini login akun B tanpa reload: state data lokal masih A, cookie di browser sudah B.
    signIn(TEST_USER_B)
    await settle()

    expect(vi.getTimerCount()).toBe(0)
    vi.advanceTimersByTime(10 * 60_000)
    await settle()
    window.dispatchEvent(new Event(LOCAL_WRITE_EVENT))
    await settle()

    expect(requestCount(client)).toBe(before)
    expect(createSyncHttpClient).toHaveBeenCalledTimes(1)
  })
})
