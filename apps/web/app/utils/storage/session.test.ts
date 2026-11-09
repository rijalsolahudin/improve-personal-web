// @vitest-environment node
//
// Sesi data lokal: buka kunci PERANGKAT -> kunci data -> repository (kunci hanya untuk salinan lokal).
//
// Data yang dikirim ke server disegel server; karena itu sesi tidak punya tahap unlock dan kunci
// perangkat yang hilang TIDAK berarti data hilang - salinan lokal dibuang lalu di-pull ulang.
import 'fake-indexeddb/auto'

import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it } from 'vitest'

import { createManualClock, type Todo } from '@improve-personal/core'

import { createWebKeyStore } from '../crypto/key-store'
import { openLocalDataSession } from './session'

const START_MS = 1_700_000_000_000
/** Akun uji: penyimpanan lokal dipisah per akun (lihat `account-scope.test.ts`). */
const USER_ID = '018f2c4e-0000-7000-8000-00000000000a'
const DATABASE_PREFIX = 'ip-session-test'

/**
 * Runtime test (node) tidak punya syarat browser yang diperiksa `openLocalDataSession`
 * (`isSecureContext`, `navigator.locks`). Dinyatakan di sini supaya yang diuji adalah perilaku
 * penyimpanan - bukan kelengkapan browser.
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

  it('sesi berikutnya: kunci perangkat dipakai lagi, deviceId sama, data lama terbaca', async () => {
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

    const second = await openLocalDataSession({
      userId: USER_ID,
      clock: createManualClock(START_MS),
      ...dbNames,
    })

    expect(second.deviceId).toBe(first.deviceId)

    const record = await second.repos.todo.getById(id)
    expect((record?.data as Todo | undefined)?.title).toBe('Tetap ada setelah reload')
  })

  it('database terpisah tidak saling melihat data (bukti isolasi penyimpanan)', async () => {
    const first = await openLocalDataSession({
      userId: USER_ID,
      clock: createManualClock(START_MS),
      ...names(),
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

  it('pembuka perangkat hilang: salinan lokal dibuang dan kunci baru dibuat (data tetap di server)', async () => {
    const dbNames = names()
    const first = await openLocalDataSession({
      userId: USER_ID,
      clock: createManualClock(START_MS),
      ...dbNames,
    })
    await first.writer.write({
      type: 'todo',
      data: (recordId) => todoPayload(recordId, 'Salinan lokal saja'),
    })

    // Pembuka perangkat hilang (mis. storage kunci terhapus), sementara record-nya masih ada.
    await createWebKeyStore({ databaseName: dbNames.keysDatabaseName }).remove('device')

    // Salinan lokal yang tidak bisa dibuka TIDAK boleh membuat aplikasi kosong tanpa error. Dibuang,
    // kunci baru dibuat, lalu full pull akan mengisi ulang dari server.
    const reopened = await openLocalDataSession({
      userId: USER_ID,
      clock: createManualClock(START_MS),
      ...dbNames,
    })

    expect(await reopened.repos.todo.listAll()).toEqual([])
    expect((await reopened.storage.getSyncState())?.cursor).toBe(0)
    expect(await createWebKeyStore({ databaseName: dbNames.keysDatabaseName }).has('device')).toBe(
      true,
    )
  })

  it('salinan lokal yang blob-nya tidak terbaca dibuang, cursor kembali 0 (pull ulang dari server)', async () => {
    const dbNames = names()
    const first = await openLocalDataSession({
      userId: USER_ID,
      clock: createManualClock(START_MS),
      ...dbNames,
    })
    const { id } = await first.writer.write({
      type: 'todo',
      data: (recordId) => todoPayload(recordId, 'Salinan rusak'),
    })

    const stored = await first.storage.getRecord(id)
    const entry = (await first.storage.listIndexByType('todo'))[0]
    if (stored === null || entry === undefined) throw new Error('fixture tidak lengkap')

    // Blob dibuat tidak bisa dibuka kunci sesi (mis. sisa format/kunci lama setelah upgrade).
    await first.storage.runTransaction('corrupt', async (tx) => {
      await tx.putRecord({
        sealed: { id, hlc: stored.hlc, deleted: stored.deleted, blob: 'AAAA' },
        index: entry,
        op: 'put',
        outbox: { id: 'outbox-corrupt', queuedAtMs: START_MS },
      })
    })

    const reopened = await openLocalDataSession({
      userId: USER_ID,
      clock: createManualClock(START_MS),
      ...dbNames,
    })

    expect(await reopened.repos.todo.listAll()).toEqual([])
    expect((await reopened.storage.getSyncState())?.cursor).toBe(0)
  })

  it('dua tab membuka sesi pertama bersamaan: satu kunci akhir, keduanya membaca data yang sama', async () => {
    // Regresi #113: tanpa sisip-jika-kosong yang atomik, dua tab sama-sama membuat kunci utama dan
    // yang tersimpan terakhir menang - record tab lain jadi tidak bisa dibuka lagi.
    const dbNames = names()
    const clock = createManualClock(START_MS)

    const [first, second] = await Promise.all([
      openLocalDataSession({ userId: USER_ID, clock, ...dbNames }),
      openLocalDataSession({ userId: USER_ID, clock, ...dbNames }),
    ])

    expect(Buffer.from(second.dataKey.handle as Uint8Array)).toEqual(
      Buffer.from(first.dataKey.handle as Uint8Array),
    )

    const fromFirst = await first.writer.write({
      type: 'todo',
      data: (recordId) => todoPayload(recordId, 'Ditulis tab pertama'),
    })
    const fromSecond = await second.writer.write({
      type: 'todo',
      data: (recordId) => todoPayload(recordId, 'Ditulis tab kedua'),
    })

    // Sesi ketiga (reload) memakai kunci yang tersimpan: kedua record harus tetap terbuka.
    const reopened = await openLocalDataSession({ userId: USER_ID, clock, ...dbNames })
    expect(((await reopened.repos.todo.getById(fromFirst.id))?.data as Todo).title).toBe(
      'Ditulis tab pertama',
    )
    expect(((await reopened.repos.todo.getById(fromSecond.id))?.data as Todo).title).toBe(
      'Ditulis tab kedua',
    )
  })
})
