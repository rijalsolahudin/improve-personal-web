import type { HttpClient, StorageAdapter, StoredSyncState } from '@improve-personal/core'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { LOCAL_WRITE_EVENT, SYNC_REMOTE_APPLIED_EVENT } from './events'
import { runSync, startSync, stopSync } from './controller'
import { clearQuarantineForTest, isQuarantined, quarantinedCount } from './quarantine'
import { resetStorageQuotaForTest, storageQuotaState } from '../storage/pressure'

import type { LocalDataSession } from '../storage/session'

const USER_A = '11111111-1111-4111-8111-111111111111'
const USER_B = '22222222-2222-4222-8222-222222222222'
const RECORD_ID = '018f2c4e-0000-7000-8000-00000000000b'

/** Record pull yang lolos `syncPullResultSchema` (hlc & base64-nya harus sah). */
function remoteRecord() {
  return { id: RECORD_ID, hlc: '1000-0-deviceb', deleted: false, blob: 'AAAA', serverSeq: 1 }
}

/** Satu record tersegel lokal - dipakai test yang perlu push benar-benar menembak jaringan. */
const STORED_RECORD = {
  id: RECORD_ID,
  hlc: '1000-0-devicea',
  deleted: false,
  blob: 'AAAA',
  createdAtMs: 1_000,
  updatedAtMs: 1_000,
}

type FakeSessionOptions = {
  readonly userId?: string
  /** Pembuka blob; default melempar supaya tes yang tidak peduli index tidak "berhasil" diam-diam. */
  readonly openRecord?: (input: {
    readonly recordId: string
    readonly blob: string
  }) => Promise<string>
  /** Isi tabel `record` lokal (dipakai push). */
  readonly storedRecords?: readonly (typeof STORED_RECORD)[]
  /** Baris outbox yang menunggu dikirim (dipakai push). */
  readonly outbox?: readonly { readonly id: string; readonly recordId: string }[]
  /** Menangkap `putRecord` hasil pull - untuk memeriksa keputusan `index`. */
  readonly onWrite?: (write: unknown) => void
}

function fakeSession(options: FakeSessionOptions = {}): LocalDataSession {
  let state: StoredSyncState = {
    deviceId: 'device-a',
    cursor: 0,
    status: 'offline',
    lastPullAtMs: null,
    lastPushAtMs: null,
  }

  // Bisa menyusut: `deleteOutboxRows` benar-benar membuang barisnya, supaya loop push berhenti
  // seperti adapter nyata (bukan 100 batch palsu).
  let outbox = [...(options.outbox ?? [])]

  return {
    userId: options.userId ?? USER_A,
    storage: {
      listOutbox: vi.fn(async () => outbox),
      countOutbox: vi.fn(async () => outbox.length),
      getRecords: vi.fn(async () => options.storedRecords ?? []),
      getSyncState: vi.fn(async () => state),
      runTransaction: vi.fn(async (_label: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          label: 'test',
          putRecord: async (write: unknown) => options.onWrite?.(write),
          deleteOutboxRows: async (ids: readonly string[]) => {
            outbox = outbox.filter((row) => !ids.includes(row.id))
          },
          patchSyncState: async (patch: Partial<StoredSyncState>) => {
            state = { ...state, ...patch }
          },
        }),
      ),
    } as unknown as StorageAdapter,
    clock: { nowMs: () => 1_000 },
    hlc: { tick: () => '1000-0-device-a', observe: vi.fn() },
    provider: {
      openRecord:
        options.openRecord ??
        (async () => {
          throw new Error('test tidak menyiapkan pembuka blob')
        }),
    },
    dataKey: {},
  } as unknown as LocalDataSession
}

function httpOf(overrides: Partial<HttpClient> = {}): HttpClient {
  return {
    postJson: vi.fn(async () => ({ results: [] })),
    getJson: vi.fn(async () => ({ records: [], nextCursor: 0 })),
    ...overrides,
  } as unknown as HttpClient
}

/** Jaringan yang tidak pernah menjawab - mensimulasikan request yang menggantung. */
function hangingJson(onSignal: (signal: AbortSignal | undefined) => void = () => undefined) {
  return vi.fn((_url: string, init?: { readonly signal?: AbortSignal }) => {
    onSignal(init?.signal)
    return new Promise<never>(() => undefined)
  })
}

function within<T>(promise: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_resolve, reject) => {
      setTimeout(() => reject(new Error(`timeout: ${label}`)), 1_000)
    }),
  ])
}

afterEach(() => {
  stopSync()
  clearQuarantineForTest()
  resetStorageQuotaForTest()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('sync controller', () => {
  it('siklus app_open melakukan push lalu pull', async () => {
    const http = httpOf()

    startSync(fakeSession(), 'https://app.test', {
      http,
      autoStart: false,
    })
    await runSync({ pull: true })

    expect(http.postJson).not.toHaveBeenCalled()
    expect(http.getJson).toHaveBeenCalledTimes(1)
    expect(http.getJson).toHaveBeenCalledWith(
      'https://app.test/v1/sync/pull?cursor=0&limit=200',
      expect.anything(),
    )
  })

  it('tulis lokal memicu push setelah debounce, tanpa pull tambahan', async () => {
    vi.useFakeTimers()

    const http = httpOf()
    const session = fakeSession()
    startSync(session, 'https://app.test', {
      http,
      autoStart: false,
    })

    await runSync({ pull: true })
    expect(http.getJson).toHaveBeenCalledTimes(1)

    window.dispatchEvent(new Event(LOCAL_WRITE_EVENT))
    await vi.advanceTimersByTimeAsync(1_999)
    expect(session.storage.listOutbox).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1)
    expect(session.storage.listOutbox).toHaveBeenCalledTimes(2)
    expect(http.getJson).toHaveBeenCalledTimes(1)
  })
})

describe('sync controller: pergantian sesi (regresi QA T76 B1)', () => {
  it('stopSync membatalkan request yang sedang berjalan, tidak membiarkannya selesai', async () => {
    let signal: AbortSignal | undefined
    const http = httpOf({
      getJson: vi.fn((url: string, init?: { readonly signal?: AbortSignal }) => {
        signal = init?.signal
        return new Promise<never>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), {
            once: true,
          })
        })
      }) as unknown as HttpClient['getJson'],
    })

    const session = fakeSession()
    startSync(session, 'https://app.test', { http, autoStart: false })

    const running = runSync({ pull: true })
    await vi.waitFor(() => expect(http.getJson).toHaveBeenCalledTimes(1))

    stopSync()

    // Siklus yang dibatalkan tidak mengaku selesai, dan request-nya benar-benar di-abort.
    await expect(running).resolves.toBeNull()
    expect(signal?.aborted).toBe(true)
  })

  it('start untuk akun B tidak menunggu - dan tidak memakai - siklus akun A', async () => {
    let signalA: AbortSignal | undefined
    const httpA = httpOf({
      getJson: hangingJson((signal) => {
        signalA = signal
      }) as unknown as HttpClient['getJson'],
    })
    const httpB = httpOf()

    const sessionA = fakeSession({ userId: USER_A })
    const sessionB = fakeSession({ userId: USER_B })

    startSync(sessionA, 'https://app.test', { http: httpA, autoStart: false })
    const runA = runSync({ pull: true })
    await vi.waitFor(() => expect(httpA.getJson).toHaveBeenCalledTimes(1))

    const cursorReadsOnA = vi.mocked(sessionA.storage.getSyncState).mock.calls.length

    startSync(sessionB, 'https://app.test', { http: httpB, autoStart: false })
    const runB = runSync({ pull: true })

    // Kalau B mewarisi `inFlight` A, promise ini tidak akan pernah selesai.
    await expect(within(runB, 'siklus akun B')).resolves.toMatchObject({ pulled: 0 })
    expect(runB).not.toBe(runA)
    expect(httpB.getJson).toHaveBeenCalledTimes(1)

    // A dibatalkan, dan siklus B tidak menyentuh storage akun A.
    expect(signalA?.aborted).toBe(true)
    expect(vi.mocked(sessionA.storage.getSyncState).mock.calls.length).toBe(cursorReadsOnA)
  })

  it('client bawaan controller mengirim identitas pemilik sesi ke server', async () => {
    const calls: { readonly url: string; readonly headers: Record<string, string> }[] = []

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: { readonly headers: Record<string, string> }) => {
        calls.push({ url, headers: init.headers })
        return {
          ok: true,
          status: 200,
          json: async () => ({ data: { records: [], nextCursor: 0 } }),
        }
      }),
    )

    const session = fakeSession()
    startSync(session, 'https://app.test', { autoStart: false })
    await runSync({ pull: true })

    expect(calls).toHaveLength(1)
    expect(calls[0]?.headers['x-expected-user-id']).toBe(session.userId)
  })

  it('stopSync idempoten: siklus berikutnya tetap jalan normal', async () => {
    const http = httpOf()
    const session = fakeSession()

    startSync(session, 'https://app.test', { http, autoStart: false })
    stopSync()
    stopSync()

    startSync(session, 'https://app.test', { http, autoStart: false })
    await expect(runSync({ pull: true })).resolves.toMatchObject({ status: 'synced' })
    expect(http.getJson).toHaveBeenCalledTimes(1)
  })
})

describe('sync controller: keputusan index hasil pull (regresi QA T76 B2)', () => {
  it('kunci tidak cocok: pull BERHENTI sebelum menulis apa pun, status jadi error', async () => {
    const writes: unknown[] = []
    const session = fakeSession({
      openRecord: async () => {
        throw new Error('kunci tidak cocok')
      },
      onWrite: (write) => writes.push(write),
    })
    const http = httpOf({
      getJson: vi.fn(async () => ({
        records: [remoteRecord()],
        nextCursor: 9,
      })) as unknown as HttpClient['getJson'],
    })

    startSync(session, 'https://app.test', { http, autoStart: false })
    const outcome = await runSync({ pull: true })

    // Cursor tidak boleh maju di atas halaman yang tidak bisa dibuka - data akan hilang diam-diam.
    expect(writes).toEqual([])
    expect(await session.storage.getSyncState()).toMatchObject({ cursor: 0, status: 'error' })
    expect(outcome).toMatchObject({ pulled: 0, status: 'error' })
  })

  it('payload dari versi app lebih baru: indeks `keep`, bukan menghapus index lama', async () => {
    const writes: { readonly index?: unknown }[] = []
    const session = fakeSession({
      openRecord: async () => JSON.stringify({ type: 'todo', schemaVersion: 99, data: {} }),
      onWrite: (write) => writes.push(write as { readonly index?: unknown }),
    })
    const http = httpOf({
      getJson: vi.fn(async () => ({
        records: [remoteRecord()],
        nextCursor: 0,
      })) as unknown as HttpClient['getJson'],
    })

    startSync(session, 'https://app.test', { http, autoStart: false })
    const outcome = await runSync({ pull: true })

    expect(writes).toHaveLength(1)
    expect(writes[0]?.index).toBe('keep')
    // Record tetap diterapkan (bukan error): yang tidak bisa dibangun hanya index-nya.
    expect(outcome).toMatchObject({ pulled: 1 })
  })
})

describe('sync controller: push', () => {
  it('meneruskan sinyal abort ke request push', async () => {
    let signal: AbortSignal | undefined
    const http = httpOf({
      postJson: vi.fn(async (_url: string, _body: unknown, init?: { signal?: AbortSignal }) => {
        signal = init?.signal
        return { results: [{ id: RECORD_ID, status: 'applied', serverSeq: 1 }] }
      }) as unknown as HttpClient['postJson'],
    })
    const session = fakeSession({
      storedRecords: [STORED_RECORD],
      outbox: [{ id: 'outbox-1', recordId: RECORD_ID }],
    })

    startSync(session, 'https://app.test', { http, autoStart: false })
    await runSync({ pull: false })

    expect(signal).toBeInstanceOf(AbortSignal)
    expect(signal?.aborted).toBe(false)
  })
})

describe('sync controller: pull menerapkan data perangkat lain (AC T77)', () => {
  /** Pendengar nyata: yang diuji adalah event yang benar-benar sampai ke jendela. */
  function listenForRemoteApplied(): { readonly count: () => number; readonly stop: () => void } {
    const handler = vi.fn()
    window.addEventListener(SYNC_REMOTE_APPLIED_EVENT, handler)
    return {
      count: () => handler.mock.calls.length,
      stop: () => window.removeEventListener(SYNC_REMOTE_APPLIED_EVENT, handler),
    }
  }

  it('pull yang menerapkan record memicu event muat ulang store', async () => {
    const listener = listenForRemoteApplied()
    const session = fakeSession({
      openRecord: async () => JSON.stringify({ type: 'todo', schemaVersion: 1, data: {} }),
    })
    const http = httpOf({
      getJson: vi.fn(async () => ({
        records: [remoteRecord()],
        nextCursor: 0,
      })) as unknown as HttpClient['getJson'],
    })

    try {
      startSync(session, 'https://app.test', { http, autoStart: false })
      const outcome = await runSync({ pull: true })

      expect(outcome).toMatchObject({ pulled: 1 })
      expect(listener.count()).toBe(1)
    } finally {
      listener.stop()
    }
  })

  it('kuota penuh saat merge pull: banner aktif dan siklus ditandai error', async () => {
    const session = fakeSession({
      openRecord: async () => JSON.stringify({ type: 'todo', schemaVersion: 1, data: {} }),
    })
    const base = session.storage as unknown as {
      runTransaction: (label: string, fn: (tx: unknown) => Promise<unknown>) => Promise<unknown>
    }

    const quotaSession = {
      ...session,
      storage: {
        ...session.storage,
        runTransaction: (label: string, fn: (tx: unknown) => Promise<unknown>) =>
          label === 'sync.pull.merge'
            ? Promise.reject(new DOMException('penuh', 'QuotaExceededError'))
            : base.runTransaction(label, fn),
      },
    } as LocalDataSession

    const http = httpOf({
      getJson: vi.fn(async () => ({
        records: [remoteRecord()],
        nextCursor: 0,
      })) as unknown as HttpClient['getJson'],
    })

    startSync(quotaSession, 'https://app.test', { http, autoStart: false })
    const outcome = await runSync({ pull: true })

    expect(outcome).toMatchObject({ status: 'error' })
    expect(storageQuotaState()).not.toBeNull()
  })

  it('pull kosong tidak memicu muat ulang (tidak ada kerja tambahan tiap 5 menit)', async () => {
    const listener = listenForRemoteApplied()

    try {
      startSync(fakeSession(), 'https://app.test', { http: httpOf(), autoStart: false })
      const outcome = await runSync({ pull: true })

      expect(outcome).toMatchObject({ pulled: 0 })
      expect(listener.count()).toBe(0)
    } finally {
      listener.stop()
    }
  })

  it('siklus yang sudah basi (stopSync saat pull berjalan) tidak memicu muat ulang', async () => {
    const listener = listenForRemoteApplied()
    let signal: AbortSignal | undefined

    const http = httpOf({
      getJson: vi.fn((_url: string, init?: { readonly signal?: AbortSignal }) => {
        signal = init?.signal
        return new Promise<never>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), {
            once: true,
          })
        })
      }) as unknown as HttpClient['getJson'],
    })

    try {
      startSync(fakeSession(), 'https://app.test', { http, autoStart: false })
      const running = runSync({ pull: true })
      await vi.waitFor(() => expect(http.getJson).toHaveBeenCalledTimes(1))

      stopSync()

      await expect(running).resolves.toBeNull()
      expect(signal?.aborted).toBe(true)
      expect(listener.count()).toBe(0)
    } finally {
      listener.stop()
    }
  })
})

/**
 * Satu record yang gagal didekripsi tidak boleh menghentikan pull SELAMANYA.
 *
 * Aturan yang dijaga ketat: cursor tidak pernah maju di atas record yang belum tentu terbaca, KECUALI
 * record itu sudah dinyatakan rusak (3 siklus gagal berturut-turut dengan record lain berhasil). Kunci
 * yang salah tidak pernah dikarantina - itu akan menyembunyikan seluruh data sebagai "satu record
 * rusak".
 */
describe('sync controller: karantina record gagal didekripsi', () => {
  const BAD_ID = '018f2c4e-0000-7000-8000-0000000000b1'
  const GOOD_ID = '018f2c4e-0000-7000-8000-0000000000b2'

  /** Payload `todo` yang SAH - harus benar-benar terdekripsi, bukan cuma gagal dengan rapi. */
  function todoPayload(id: string): string {
    return JSON.stringify({
      type: 'todo',
      schemaVersion: 1,
      data: {
        id,
        title: 'Tugas dari perangkat lain',
        note: null,
        deadlineAt: null,
        priority: 'medium',
        isDone: false,
        completedAt: null,
        scheduleId: null,
        scheduleOccurrenceAt: null,
        createdAt: 1_000,
        updatedAt: 1_000,
      },
    })
  }

  const GOOD_PAYLOAD = todoPayload(GOOD_ID)

  /** Satu halaman berisi record rusak + record sehat, dengan cursor berikutnya tetap. */
  function page(): {
    readonly records: readonly {
      readonly id: string
      readonly hlc: string
      readonly deleted: boolean
      readonly blob: string
      readonly serverSeq: number
    }[]
    readonly nextCursor: number
  } {
    return {
      records: [BAD_ID, GOOD_ID].map((id, index) => ({
        id,
        hlc: `${1_000 + index}-0-deviceb`,
        deleted: false,
        blob: 'AAAA',
        serverSeq: index + 1,
      })),
      nextCursor: 9,
    }
  }

  type PulledWrite = {
    readonly sealed: { readonly id: string; readonly blob: string }
    readonly index: unknown
  }

  it('satu record rusak + record lain sukses: setelah 3 siklus dikarantina dan pull mau maju', async () => {
    const writes: PulledWrite[] = []
    const session = fakeSession({
      openRecord: async ({ recordId }) => {
        if (recordId === BAD_ID) throw new Error('blob rusak')
        return GOOD_PAYLOAD
      },
      onWrite: (write) => writes.push(write as PulledWrite),
    })
    const http = httpOf({
      getJson: vi.fn(async () => page()) as unknown as HttpClient['getJson'],
    })

    startSync(session, 'https://app.test', { http, autoStart: false })

    // Dua siklus pertama: belum cukup bukti, pull berhenti dan TIDAK menulis apa pun.
    for (let cycle = 0; cycle < 2; cycle += 1) {
      const outcome = await runSync({ pull: true })

      expect(outcome).toMatchObject({ pulled: 0, status: 'error' })
      await expect(session.storage.getSyncState()).resolves.toMatchObject({
        cursor: 0,
        status: 'error',
      })
      expect(writes).toEqual([])
      expect(isQuarantined(USER_A, BAD_ID)).toBe(false)
    }

    // Siklus ketiga: record dinyatakan rusak, lalu siklus susulan langsung dijalankan.
    await runSync({ pull: true })

    await vi.waitFor(async () => {
      await expect(session.storage.getSyncState()).resolves.toMatchObject({
        cursor: 9,
        status: 'synced',
      })
    })

    expect(isQuarantined(USER_A, BAD_ID)).toBe(true)
    expect(quarantinedCount(USER_A)).toBe(1)

    // Blob record rusak TETAP ditulis (tidak ada data yang dibuang), index lamanya tidak disentuh.
    const bad = writes.find((write) => write.sealed.id === BAD_ID)
    expect(bad?.sealed.blob).toBe('AAAA')
    expect(bad?.index).toBe('keep')

    const good = writes.find((write) => write.sealed.id === GOOD_ID)
    expect(good).toBeDefined()
    expect(good?.index).not.toBe('keep')
  })

  it('SEMUA record gagal (kunci salah): tanpa karantina, status error, cursor tetap', async () => {
    const writes: unknown[] = []
    const session = fakeSession({
      openRecord: async () => {
        throw new Error('kunci tidak cocok')
      },
      onWrite: (write) => writes.push(write),
    })
    const http = httpOf({
      getJson: vi.fn(async () => page()) as unknown as HttpClient['getJson'],
    })

    startSync(session, 'https://app.test', { http, autoStart: false })

    // Lebih dari ambang karantina: kalau penghitung jalan tanpa melihat record yang sukses, record ini
    // akan salah dinyatakan rusak dan pull melewati data yang cuma tidak terbaca karena kunci salah.
    for (let cycle = 0; cycle < 4; cycle += 1) {
      const outcome = await runSync({ pull: true })

      expect(outcome).toMatchObject({ pulled: 0, status: 'error' })
      await expect(session.storage.getSyncState()).resolves.toMatchObject({
        cursor: 0,
        status: 'error',
      })
    }

    expect(writes).toEqual([])
    expect(quarantinedCount(USER_A)).toBe(0)
    expect(isQuarantined(USER_A, BAD_ID)).toBe(false)
    expect(isQuarantined(USER_A, GOOD_ID)).toBe(false)
  })

  it('record berhasil setelah gagal: penghitung berturut-turut direset', async () => {
    let badShouldFail = true
    const session = fakeSession({
      openRecord: async ({ recordId }) => {
        if (recordId === BAD_ID && badShouldFail) throw new Error('blob rusak')
        return GOOD_PAYLOAD
      },
    })
    const http = httpOf({
      getJson: vi.fn(async () => page()) as unknown as HttpClient['getJson'],
    })

    startSync(session, 'https://app.test', { http, autoStart: false })

    // Gagal #1.
    await runSync({ pull: true })
    expect(isQuarantined(USER_A, BAD_ID)).toBe(false)

    // Berhasil: rangkaian putus, jadi kegagalan berikutnya mulai dari nol lagi.
    badShouldFail = false
    await runSync({ pull: true })
    expect(isQuarantined(USER_A, BAD_ID)).toBe(false)

    // Gagal #1 dan #2 SETELAH reset. Kalau penghitung lama tidak direset, ini sudah cukup untuk
    // mengarantina.
    badShouldFail = true
    await runSync({ pull: true })
    await runSync({ pull: true })
    expect(isQuarantined(USER_A, BAD_ID)).toBe(false)

    // Gagal #3 berturut-turut setelah reset.
    await runSync({ pull: true })
    expect(isQuarantined(USER_A, BAD_ID)).toBe(true)
  })

  it('ganti sesi: karantina & penghitung akun lama tidak bocor ke akun berikutnya', async () => {
    function failingSession(userId: string, attempts: string[]): LocalDataSession {
      return fakeSession({
        userId,
        openRecord: async ({ recordId }) => {
          attempts.push(recordId)
          if (recordId === BAD_ID) throw new Error('blob rusak')
          return GOOD_PAYLOAD
        },
      })
    }

    const attemptsOnA: string[] = []
    const sessionA = failingSession(USER_A, attemptsOnA)
    const httpA = httpOf({
      getJson: vi.fn(async () => page()) as unknown as HttpClient['getJson'],
    })

    startSync(sessionA, 'https://app.test', {
      http: httpA,
      autoStart: false,
    })

    for (let cycle = 0; cycle < 3; cycle += 1) await runSync({ pull: true })
    expect(isQuarantined(USER_A, BAD_ID)).toBe(true)
    expect(quarantinedCount(USER_A)).toBe(1)

    // Tunggu siklus susulan akun A selesai supaya pergantian sesi terjadi di titik yang pasti.
    await vi.waitFor(async () => {
      await expect(sessionA.storage.getSyncState()).resolves.toMatchObject({ cursor: 9 })
    })

    // Akun B menerima record dengan id YANG SAMA. Kalau daftar/penghitung akun A bocor, record ini
    // dilewati tanpa dicoba atau langsung dikarantina pada siklus pertama.
    const attemptsOnB: string[] = []
    const httpB = httpOf({
      getJson: vi.fn(async () => page()) as unknown as HttpClient['getJson'],
    })

    startSync(failingSession(USER_B, attemptsOnB), 'https://app.test', {
      http: httpB,
      autoStart: false,
    })

    const outcome = await runSync({ pull: true })

    expect(attemptsOnB).toContain(BAD_ID)
    expect(outcome).toMatchObject({ pulled: 0, status: 'error' })
    // Daftar akun A tetap utuh (tidak dihapus saat akun B membuka sesi), tetapi akun B tidak mewarisinya.
    expect(isQuarantined(USER_B, BAD_ID)).toBe(false)
    expect(quarantinedCount(USER_B)).toBe(0)
    expect(quarantinedCount(USER_A)).toBe(1)
  })
})
