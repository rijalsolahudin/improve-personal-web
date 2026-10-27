import type { HttpClient, StorageAdapter, StoredSyncState } from '@improve-personal/core'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { runSync, startSync, stopSync } from './controller'
import { clearQuarantineForTest, isQuarantined, quarantinedCount } from './quarantine'

import type { LocalDataSession } from '../storage/session'
import { TEST_KID_WIRE, TEST_V2_BLOB } from '../../../tests/nuxt/record-key'

/**
 * QA T78 putaran 2 - bentuk data lain di sekitar pemulihan record gagal-dekripsi (AC #2).
 *
 * Putaran 1 membuktikan record rusak yang sendirian di halamannya tidak pernah dikarantina. Perbaikan
 * sekarang memakai bukti LEVEL SESI: kunci data yang dibuka dari envelope perangkat yang sudah ada
 * (`isFreshKey === false`) sudah terautentikasi lewat unwrap AES-KW, jadi bukti itu tahan reload dan
 * berlaku sejak halaman pertama. Berkas ini memeriksa bentuk halaman yang diminta pada putaran 2
 * (B3, B4) dan pagar A1: bukti kunci milik satu generasi tidak boleh diwarisi generasi berikutnya.
 */

const USER_A = '11111111-1111-4111-8111-111111111111'
const USER_B = '22222222-2222-4222-8222-222222222222'
const ID_PREFIX = '018f2c4e-0000-7000-8000-'
/** Digit pertama grup terakhir UUID: `1` = record sehat, `2` = record rusak. */
const GOOD_MARK = '1'
const BAD_MARK = '2'

/** Id deterministik supaya kegagalan mudah dibaca; grup terakhir tetap 12 karakter. */
function recordId(mark: string, index: number): string {
  return `${ID_PREFIX}${mark}${String(index).padStart(11, '0')}`
}

function goodId(index: number): string {
  return recordId(GOOD_MARK, index)
}

function badId(index: number): string {
  return recordId(BAD_MARK, index)
}

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

type Page = {
  readonly records: readonly {
    readonly id: string
    readonly hlc: string
    readonly deleted: boolean
    readonly blob: string
    readonly serverSeq: number
  }[]
  readonly nextCursor: number
}

function pageOf(ids: readonly string[], nextCursor: number): Page {
  return {
    records: ids.map((id, index) => ({
      id,
      hlc: `${1_000 + index}-0-deviceb`,
      deleted: false,
      blob: TEST_V2_BLOB,
      serverSeq: nextCursor,
    })),
    nextCursor,
  }
}

type PulledWrite = {
  readonly sealed: { readonly id: string; readonly blob: string }
  readonly index: unknown
}

/** Opsi tambahan untuk bentuk data yang diuji - bukan bagian API controller. */
type FakeSessionOptions = {
  /** Pemilik sesi. Default `USER_A`; test pergantian sesi memakai akun lain. */
  readonly userId?: string
  /**
   * `LocalDataSession.isFreshKey`. `false` (default) = kunci data dibuka dari envelope yang sudah ada
   * di perangkat, jadi kunci akun sudah terbukti. `true` = kunci baru dibuat di perangkat ini.
   */
  readonly isFreshKey?: boolean
  /** Ditahan sebelum blob dibuka - mensimulasikan dekripsi yang selesai setelah sesi berganti. */
  readonly gate?: Promise<void>
  /** Dipanggil saat blob mulai dibuka, supaya test bisa menunggu titik itu (bukan menebak waktu). */
  readonly onOpen?: (recordId: string) => void
}

/** Sesi data lokal dengan kunci yang selalu bisa dibuka; `isBad` menentukan blob yang rusak. */
function fakeSession(
  isBad: (recordId: string) => boolean,
  onWrite?: (write: PulledWrite) => void,
  options: FakeSessionOptions = {},
): LocalDataSession {
  let state: StoredSyncState = {
    deviceId: 'device-a',
    cursor: 0,
    status: 'offline',
    lastPullAtMs: null,
    lastPushAtMs: null,
  }

  return {
    userId: options.userId ?? USER_A,
    kid: TEST_KID_WIRE,
    isFreshKey: options.isFreshKey ?? false,
    storage: {
      listOutbox: vi.fn(async () => []),
      countOutbox: vi.fn(async () => 0),
      getRecords: vi.fn(async () => []),
      getSyncState: vi.fn(async () => state),
      runTransaction: vi.fn(async (_label: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          label: 'test',
          putRecord: async (write: PulledWrite) => onWrite?.(write),
          deleteOutboxRows: async () => undefined,
          patchSyncState: async (patch: Partial<StoredSyncState>) => {
            state = { ...state, ...patch }
          },
        }),
      ),
    } as unknown as StorageAdapter,
    clock: { nowMs: () => 1_000 },
    hlc: { tick: () => '1000-0-device-a', observe: vi.fn() },
    provider: {
      openRecord: async ({ recordId }: { recordId: string }) => {
        options.onOpen?.(recordId)
        if (options.gate !== undefined) await options.gate
        if (isBad(recordId)) throw new Error('blob rusak')
        return todoPayload(recordId)
      },
    },
    dataKey: {},
  } as unknown as LocalDataSession
}

function pagedHttp(pages: readonly Page[]): HttpClient {
  return {
    postJson: vi.fn(async () => ({ results: [] })),
    getJson: vi.fn(async (url: string) => {
      const cursor = Number(/cursor=(\d+)/.exec(url)?.[1] ?? '0')
      return pages[cursor] ?? { records: [], nextCursor: cursor }
    }),
  } as unknown as HttpClient
}

async function cycles(count: number): Promise<void> {
  for (let index = 0; index < count; index += 1) await runSync({ pull: true })
  await vi.waitFor(() => expect(true).toBe(true))
}

afterEach(() => {
  stopSync()
  clearQuarantineForTest()
})

describe('QA T78/2: halaman parkir yang tetap sembuh', () => {
  it('kunci terbukti lalu halaman berisi TIGA record rusak: semuanya dikarantina, cursor maju', async () => {
    const bad = [badId(1), badId(2), badId(3)]
    const http = pagedHttp([pageOf([goodId(0)], 1), pageOf(bad, 2)])
    const writes: PulledWrite[] = []
    const session = fakeSession(
      (id) => bad.includes(id),
      (write) => writes.push(write),
    )

    startSync(session, 'https://app.test', { http, autoStart: false })
    await cycles(5)

    for (const id of bad) expect(isQuarantined(USER_A, id)).toBe(true)
    await expect(session.storage.getSyncState()).resolves.toMatchObject({
      cursor: 2,
      status: 'synced',
    })
    // Record rusak tetap ditulis dengan index `keep` - tidak ada data yang dibuang.
    for (const id of bad) {
      expect(writes.find((write) => write.sealed.id === id)?.index).toBe('keep')
    }
  })

  it('record rusak adalah record TERTUA di halaman yang juga berisi record sehat', async () => {
    const http = pagedHttp([pageOf([badId(0), goodId(1), goodId(2)], 1)])
    const session = fakeSession((id) => id === badId(0))

    startSync(session, 'https://app.test', { http, autoStart: false })
    await cycles(5)

    expect(isQuarantined(USER_A, badId(0))).toBe(true)
    await expect(session.storage.getSyncState()).resolves.toMatchObject({
      cursor: 1,
      status: 'synced',
    })
  })
})

describe('QA T78/2: bukti kunci dari sesi (B3 & B4)', () => {
  it('record rusak di halaman PERTAMA, halaman berikutnya sehat: pulih tanpa menyimpulkan kunci salah', async () => {
    // Kursor 0, halaman 0 hanya berisi record rusak, halaman 1 sehat. Kunci sesi sudah benar (dibuka
    // dari envelope perangkat yang terautentikasi), jadi BUKTI kunci tidak boleh menunggu record hasil
    // pull yang berhasil - halaman 1 tidak akan pernah diminta selama merge halaman 0 ditolak (B4).
    const http = pagedHttp([pageOf([badId(0)], 1), pageOf([goodId(1)], 2)])
    const writes: PulledWrite[] = []
    const session = fakeSession(
      (id) => id === badId(0),
      (write) => writes.push(write),
    )

    startSync(session, 'https://app.test', { http, autoStart: false })
    await cycles(6)

    expect(isQuarantined(USER_A, badId(0))).toBe(true)
    await vi.waitFor(async () => {
      await expect(session.storage.getSyncState()).resolves.toMatchObject({
        cursor: 2,
        status: 'synced',
      })
    })
    // Record sehat di halaman berikutnya benar-benar masuk, dan record rusak tetap disimpan.
    expect(writes.some((write) => write.sealed.id === goodId(1))).toBe(true)
    expect(writes.find((write) => write.sealed.id === badId(0))?.index).toBe('keep')
  })

  it('bukti kunci bertahan setelah reload - cursor parkir di halaman rusak terakhir', async () => {
    // Bentuk paling mungkin di lapangan: halaman sehat diterapkan (cursor 1), record terbaru rusak
    // sehingga siklus berhenti di halaman 1. User melihat "Gagal sinkron" lalu memuat ulang app.
    // Bukti kunci sekarang berasal dari SESI (`isFreshKey === false`), bukan dari keberhasilan
    // dekripsi di proses berjalan, jadi reload tidak menghapusnya (B3).
    const http = pagedHttp([pageOf([goodId(0)], 1), pageOf([badId(0)], 2)])
    const session = fakeSession((id) => id === badId(0))

    startSync(session, 'https://app.test', { http, autoStart: false })
    await runSync({ pull: true })
    await expect(session.storage.getSyncState()).resolves.toMatchObject({ cursor: 1 })

    // Reload: controller baru untuk sesi yang sama, cursor tersimpan di storage.
    stopSync()
    startSync(session, 'https://app.test', { http, autoStart: false })

    expect(isQuarantined(USER_A, badId(0))).toBe(false)

    await cycles(6)

    expect(isQuarantined(USER_A, badId(0))).toBe(true)
    await vi.waitFor(async () => {
      await expect(session.storage.getSyncState()).resolves.toMatchObject({
        cursor: 2,
        status: 'synced',
      })
    })
  })
})

describe('QA T78/2 A1: bukti kunci tidak diwarisi siklus basi', () => {
  it('dekripsi generasi lama yang selesai setelah ganti sesi tidak membuat sesi baru mengarantina', async () => {
    // Siklus akun A ditahan tepat sebelum blob-nya dibuka, lalu sesi B (kunci BARU, `isFreshKey: true`)
    // dipasang. Sesudah itu dekripsi A diselesaikan. Bukti kunci milik A tidak boleh berpindah ke
    // generasi B: kalau bocor, record rusak B akan dikarantina padahal kunci B belum membuktikan apa
    // pun - tepat kelas kehilangan tampilan yang dijaga pagar fail-closed.
    let releaseA: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      releaseA = resolve
    })
    const openedByA: string[] = []

    const httpA = pagedHttp([pageOf([goodId(0)], 1)])
    const sessionA = fakeSession(() => false, undefined, {
      isFreshKey: false,
      gate,
      onOpen: (recordId) => openedByA.push(recordId),
    })

    startSync(sessionA, 'https://app.test', { http: httpA, autoStart: false })
    const runA = runSync({ pull: true })
    await vi.waitFor(() => expect(openedByA).toEqual([goodId(0)]))

    // Akun/perangkat berikutnya: kunci dibuat di perangkat ini, jadi belum ada bukti apa pun.
    const httpB = pagedHttp([pageOf([badId(9)], 1)])
    const sessionB = fakeSession(() => true, undefined, { userId: USER_B, isFreshKey: true })

    startSync(sessionB, 'https://app.test', { http: httpB, autoStart: false })

    // Dekripsi generasi A baru selesai SEKARANG - setelah controller B mengambil alih.
    releaseA()
    await expect(runA).resolves.toBeNull()

    await cycles(5)

    // Tanpa pagar generasi, tiga siklus sudah cukup untuk mengarantina record rusak B lewat bukti A.
    expect(isQuarantined(USER_B, badId(9))).toBe(false)
    expect(quarantinedCount(USER_B)).toBe(0)
    await expect(sessionB.storage.getSyncState()).resolves.toMatchObject({
      cursor: 0,
      status: 'error',
    })
  })
})

describe('QA T78/2: karantina penuh (200 per pemilik)', () => {
  it('batas 200 dihormati; halaman dengan 201 record rusak berputar dan pull tidak maju (sisa risiko L2)', async () => {
    // Halaman ini hanya bisa terjadi kalau server mengirim lebih banyak record daripada `limit`
    // (normalnya 200), jadi ini input abnormal - sisa risiko L2 review keamanan, bukan AC task.
    // Invarian yang dijaga: batas per pemilik tidak pernah terlampaui, dan pull TIDAK PERNAH maju
    // selama ada record rusak yang belum terkarantina. Karena kapasitas 200 < 201, selalu ada satu
    // yang terevakuasi dan gagal lagi -> halaman ini tidak pernah bisa dilewati.
    const bad = Array.from({ length: 201 }, (_value, index) => badId(index))
    const http = pagedHttp([pageOf([goodId(1), ...bad], 1)])
    const session = fakeSession((id) => id.startsWith(`${ID_PREFIX}${BAD_MARK}`))

    startSync(session, 'https://app.test', { http, autoStart: false })
    await cycles(20)

    expect(quarantinedCount(USER_A)).toBe(200)
    // Daftar berputar: setidaknya satu id yang pernah dikarantina sudah terevakuasi lagi.
    const evicted = bad.slice(0, 11).filter((id) => !isQuarantined(USER_A, id))
    expect(evicted.length).toBeGreaterThan(0)
    await expect(session.storage.getSyncState()).resolves.toMatchObject({ cursor: 0 })
  })
})
