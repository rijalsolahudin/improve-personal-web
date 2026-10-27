// @vitest-environment node
//
// QA #113 - adversarial: balapan dua (atau lebih) tab saat membuat kunci utama pertama.
// Memakai Web Locks asli Node (eksklusif) + fake-indexeddb, sama seperti `session.test.ts`.
import 'fake-indexeddb/auto'

import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createManualClock, type Todo } from '@improve-personal/core'

import { DeviceSlotOccupiedError, saveDeviceUnlock } from '../crypto/device-slot'
import { createWebKeyStore } from '../crypto/key-store'
import { createMasterKey } from '../crypto/master-key'
import { loadSodium } from '../crypto/sodium'
import { openLocalDataSession } from './session'

// Rekam tiap kandidat kunci utama yang dibuat, tanpa mengubah perilakunya.
const candidates = vi.hoisted(() => [] as Uint8Array[])

vi.mock('../crypto/master-key', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../crypto/master-key')>()
  return {
    ...actual,
    createMasterKey: (...args: Parameters<typeof actual.createMasterKey>) => {
      const key = actual.createMasterKey(...args)
      candidates.push(key)
      return key
    },
  }
})

const START_MS = 1_700_000_000_000
const USER_ID = '018f2c4e-0000-7000-8000-00000000000a'
let counter = 0

function names() {
  counter += 1
  return { databaseName: `ip-qa-race-${counter}`, keysDatabaseName: `ip-qa-race-keys-${counter}` }
}

function todoPayload(id: string, title: string) {
  return {
    id,
    title,
    note: null,
    deadlineAt: null,
    priority: 'medium' as const,
    isDone: false,
    completedAt: null,
    scheduleId: null,
    scheduleOccurrenceAt: null,
    createdAt: START_MS,
    updatedAt: START_MS,
  }
}

function isAllZero(bytes: Uint8Array): boolean {
  return bytes.every((byte) => byte === 0)
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  candidates.length = 0
  Object.defineProperty(globalThis, 'isSecureContext', { value: true, configurable: true })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('QA #113: balapan kunci pertama', () => {
  it('lima tab bersamaan: tepat satu isFreshKey, satu kunci data, semua kandidat dikosongkan', async () => {
    const dbNames = names()
    const clock = createManualClock(START_MS)
    const logSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((level) =>
      vi.spyOn(console, level).mockImplementation(() => undefined),
    )

    const sessions = await Promise.all(
      Array.from({ length: 5 }, () => openLocalDataSession({ userId: USER_ID, clock, ...dbNames })),
    )

    expect(sessions.filter((session) => session.isFreshKey)).toHaveLength(1)
    const firstKey = Buffer.from(sessions[0]!.dataKey.handle as Uint8Array)
    for (const session of sessions) {
      expect(Buffer.from(session.dataKey.handle as Uint8Array)).toEqual(firstKey)
    }

    // Tiap tab membuat kandidat; setelah sesi terbuka tidak ada kunci utama polos tersisa di memori.
    expect(candidates.length).toBeGreaterThanOrEqual(5)
    expect(candidates.every(isAllZero)).toBe(true)
    // Tidak ada log sama sekali di jalur ini (kunci tidak boleh bocor lewat console).
    for (const spy of logSpies) expect(spy).not.toHaveBeenCalled()

    // Tiap tab menulis; sesi baru membaca SEMUA record.
    const written = await Promise.all(
      sessions.map((session, index) =>
        session.writer.write({
          type: 'todo',
          data: (recordId) => todoPayload(recordId, `tab-${index}`),
        }),
      ),
    )
    const reopened = await openLocalDataSession({ userId: USER_ID, clock, ...dbNames })
    expect(reopened.isFreshKey).toBe(false)
    for (const [index, record] of written.entries()) {
      expect(((await reopened.repos.todo.getById(record.id))?.data as Todo).title).toBe(
        `tab-${index}`,
      )
    }
  })

  it('canCreateKey lolos di dua tab (lock tidak menutupinya): tetap satu pemenang, tab lambat mengadopsi dan membaca record pemenang', async () => {
    const dbNames = names()
    const clock = createManualClock(START_MS)

    let releaseSlowTab!: () => void
    const gate = new Promise<void>((resolve) => {
      releaseSlowTab = resolve
    })

    const slowTab = openLocalDataSession({
      userId: USER_ID,
      clock,
      ...dbNames,
      canCreateKey: async () => {
        await gate
        return true
      },
    })

    // Tab cepat selesai penuh dan menulis record sebelum tab lambat melanjutkan.
    const fastTab = await openLocalDataSession({
      userId: USER_ID,
      clock,
      ...dbNames,
      canCreateKey: async () => true,
    })
    expect(fastTab.isFreshKey).toBe(true)
    const record = await fastTab.writer.write({
      type: 'todo',
      data: (recordId) => todoPayload(recordId, 'ditulis pemenang'),
    })

    releaseSlowTab()
    const slow = await slowTab

    expect(slow.isFreshKey).toBe(false)
    expect(Buffer.from(slow.dataKey.handle as Uint8Array)).toEqual(
      Buffer.from(fastTab.dataKey.handle as Uint8Array),
    )
    expect(((await slow.repos.todo.getById(record.id))?.data as Todo).title).toBe(
      'ditulis pemenang',
    )
    // Kandidat tab lambat (yang kalah) sudah dikosongkan.
    expect(candidates.every(isAllZero)).toBe(true)
  })

  it('dua akun berbeda bersamaan (nama lock global): keduanya selesai, kunci terpisah, tanpa deadlock', async () => {
    const clock = createManualClock(START_MS)
    const [a, b] = await Promise.all([
      openLocalDataSession({
        userId: USER_ID,
        clock,
        databaseName: 'ip-qa-a',
        keysDatabaseName: 'ip-qa-a-keys',
      }),
      openLocalDataSession({
        userId: '018f2c4e-0000-7000-8000-00000000000b',
        clock,
        databaseName: 'ip-qa-b',
        keysDatabaseName: 'ip-qa-b-keys',
      }),
    ])

    expect(a.isFreshKey).toBe(true)
    expect(b.isFreshKey).toBe(true)
    expect(Buffer.from(a.dataKey.handle as Uint8Array)).not.toEqual(
      Buffer.from(b.dataKey.handle as Uint8Array),
    )
  })

  it('slot terisi tidak bisa ditimpa: DeviceSlotOccupiedError dan kunci lama tetap', async () => {
    const sodium = await loadSodium()
    const keyStore = createWebKeyStore({ databaseName: 'ip-qa-occupied' })
    await saveDeviceUnlock(keyStore, createMasterKey(sodium))

    await expect(saveDeviceUnlock(keyStore, createMasterKey(sodium))).rejects.toBeInstanceOf(
      DeviceSlotOccupiedError,
    )
  })

  it.each([
    ['undefined', undefined],
    ['null', null],
  ])(
    'navigator.locks = %s: melempar error jelas dan slot TIDAK ditulis (tanpa fallback)',
    async (_label, locks) => {
      const sodium = await loadSodium()
      const keyStore = createWebKeyStore({ databaseName: `ip-qa-nolocks-${String(locks)}` })
      vi.stubGlobal('navigator', { locks })

      await expect(saveDeviceUnlock(keyStore, createMasterKey(sodium))).rejects.toThrow(
        /Web Locks API tidak tersedia/,
      )

      vi.unstubAllGlobals()
      expect(await keyStore.has('device')).toBe(false)
    },
  )

  it('navigator.locks hilang di tengah sesi pertama: openLocalDataSession gagal, tidak ada kunci tersimpan', async () => {
    const dbNames = names()
    vi.stubGlobal('navigator', { locks: undefined })

    await expect(
      openLocalDataSession({
        userId: USER_ID,
        clock: createManualClock(START_MS),
        ...dbNames,
        environment: { isSecureContext: true, locks: {}, subtle: {} } as never,
      }),
    ).rejects.toThrow()

    vi.unstubAllGlobals()
    expect(await createWebKeyStore({ databaseName: dbNames.keysDatabaseName }).has('device')).toBe(
      false,
    )
    // Kandidat yang sudah dibuat tidak boleh tertinggal sebagai kunci polos.
    expect(candidates.every(isAllZero)).toBe(true)
  })
})
