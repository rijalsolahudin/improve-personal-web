// @vitest-environment node
//
// Sesi data lokal: rangkaian "buka kunci perangkat -> kunci data -> repository" (ARCHITECTURE §5 & §7).
//
// Ini juga yang membuktikan tujuan awalnya: data yang ditulis di satu sesi tetap ada di sesi
// berikutnya, tanpa kunci utama disimpan di mana pun.
import 'fake-indexeddb/auto'

import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it } from 'vitest'

import { createManualClock, type Todo } from '@improve-personal/core'

import { createWebKeyStore } from '../crypto/key-store'
import { deriveDataKey } from '../crypto/master-key'
import { loadSodium } from '../crypto/sodium'
import { LocalKeyMissingError, openLocalDataSession } from './session'

const START_MS = 1_700_000_000_000
/** Akun uji: penyimpanan lokal sekarang dipisah per akun (lihat `account-scope.test.ts`). */
const USER_ID = '018f2c4e-0000-7000-8000-00000000000a'
const DATABASE_PREFIX = 'ip-session-test'

/**
 * Runtime test (node) tidak punya syarat browser yang diperiksa `openLocalDataSession`
 * (`isSecureContext`, `navigator.locks`). Dinyatakan di sini supaya yang diuji adalah perilaku
 * penyimpanan - bukan kelengkapan browser. Pemeriksaan syaratnya sendiri diuji di
 * `environment.test.ts`.
 */
Object.defineProperty(globalThis, 'isSecureContext', { value: true, configurable: true })

let counter = 0

function names() {
  counter += 1
  return {
    databaseName: `${DATABASE_PREFIX}-${counter}`,
    keysDatabaseName: `${DATABASE_PREFIX}-keys-${counter}`,
  }
}

type TodoData = {
  id: string
  title: string
  note: null
  deadlineAt: number | null
  priority: 'low' | 'medium' | 'urgent'
  isDone: boolean
  completedAt: number | null
  scheduleId: null
  scheduleOccurrenceAt: null
  createdAt: number
  updatedAt: number
}

function todoPayload(id: string, title: string): TodoData {
  return {
    id,
    title,
    note: null,
    deadlineAt: null,
    priority: 'medium',
    isDone: false,
    completedAt: null,
    scheduleId: null,
    scheduleOccurrenceAt: null,
    createdAt: START_MS,
    updatedAt: START_MS,
  }
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
})

describe('sesi data lokal', () => {
  it('sesi pertama: kunci dibuat, deviceId disiapkan, dan repository langsung bisa dipakai', async () => {
    const session = await openLocalDataSession({
      userId: USER_ID,
      clock: createManualClock(START_MS),
      ...names(),
    })

    // Penanda untuk UI: recovery key BELUM diatur - ini yang harus memunculkan peringatan.
    expect(session.isFreshKey).toBe(true)
    expect(session.deviceId).toMatch(/^[0-9a-f-]{36}$/)

    const { id } = await session.writer.write({
      type: 'todo',
      data: (recordId) => todoPayload(recordId, 'Dari sesi pertama'),
    })

    const record = await session.repos.todo.getById(id)
    expect((record?.data as Todo | undefined)?.title).toBe('Dari sesi pertama')

    // `sync_state` disiapkan dengan nilai yang jujur: belum pernah sync.
    const state = await session.storage.getSyncState()
    expect(state?.deviceId).toBe(session.deviceId)
    expect(state?.cursor).toBe(0)
    expect(state?.status).toBe('offline')
  })

  it('sesi berikutnya: kunci dibuka ulang dari perangkat, deviceId sama, data lama terbaca', async () => {
    const dbNames = names()

    const first = await openLocalDataSession({
      userId: USER_ID,
      clock: createManualClock(START_MS),
      ...dbNames,
    })
    const { id } = await first.writer.write({
      type: 'todo',
      data: (recordId) => todoPayload(recordId, 'Tetap ada setelah reload'),
    })

    // Sesi baru: tidak ada satu pun objek dari sesi pertama yang dipakai ulang.
    const second = await openLocalDataSession({
      userId: USER_ID,
      clock: createManualClock(START_MS),
      ...dbNames,
    })

    expect(second.isFreshKey).toBe(false)
    expect(second.deviceId).toBe(first.deviceId)

    const record = await second.repos.todo.getById(id)
    expect((record?.data as Todo | undefined)?.title).toBe('Tetap ada setelah reload')
  })

  it('database terpisah tidak saling melihat data (bukti isolasi penyimpanan)', async () => {
    const firstNames = names()
    const first = await openLocalDataSession({
      userId: USER_ID,
      clock: createManualClock(START_MS),
      ...firstNames,
    })

    await first.writer.write({
      type: 'todo',
      data: (recordId) => todoPayload(recordId, 'Punya DB pertama'),
    })

    const second = await openLocalDataSession({
      userId: USER_ID,
      clock: createManualClock(START_MS),
      ...names(),
    })

    expect(await second.repos.todo.listAll()).toEqual([])
  })

  it('MENOLAK membuat kunci baru kalau data sudah ada tapi pembuka perangkat hilang', async () => {
    const dbNames = names()
    const first = await openLocalDataSession({
      userId: USER_ID,
      clock: createManualClock(START_MS),
      ...dbNames,
    })
    await first.writer.write({
      type: 'todo',
      data: (recordId) => todoPayload(recordId, 'Data yang tidak boleh terlantar'),
    })

    // Pembuka perangkat hilang (mis. storage kunci terhapus), sementara record-nya masih ada.
    await createWebKeyStore({ databaseName: dbNames.keysDatabaseName }).remove('device')

    // Membuat kunci baru di sini akan menghasilkan kunci data baru: semua record lama jadi tidak bisa
    // dibuka, dan user hanya melihat aplikasi kosong tanpa error. Jadi harus gagal, dengan jalan keluar.
    await expect(
      openLocalDataSession({ userId: USER_ID, clock: createManualClock(START_MS), ...dbNames }),
    ).rejects.toBeInstanceOf(LocalKeyMissingError)
  })

  it('withMasterKey membuka kunci utama dari perangkat dan mengosongkannya lagi', async () => {
    const session = await openLocalDataSession({
      userId: USER_ID,
      clock: createManualClock(START_MS),
      ...names(),
    })

    const fromDevice = await session.withMasterKey(async (masterKey) => {
      // Kunci yang dibuka harus kunci yang sama dengan yang dipakai sesi ini: kunci data turunannya
      // harus identik, kalau tidak, seluruh data akan tampak rusak.
      const sodium = await loadSodium()
      const dataKey = deriveDataKey(sodium, masterKey)

      return Buffer.from(dataKey.handle as Uint8Array)
    })

    const sessionDataKey = Buffer.from(session.dataKey.handle as Uint8Array)
    expect(fromDevice).toEqual(sessionDataKey)
  })
})
