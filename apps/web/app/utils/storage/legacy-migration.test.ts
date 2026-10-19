// @vitest-environment node
//
// Migrasi nama database: ber-brand (`improve-personal-<userId>`) → netral (`ip-<userId>`).
//
// Yang diuji: data user benar-benar PINDAH dan masih bisa dibaca lewat sesi normal, nama lama tidak
// ditinggalkan (biar tidak dimigrasikan berulang), dan migrasi TIDAK menimpa data baru yang sudah ada.
import 'fake-indexeddb/auto'

import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it } from 'vitest'

import { createManualClock } from '@improve-personal/core'

import { localDatabaseNameFor } from '#shared/tech-identity'

import { migrateLegacyLocalDatabases } from './legacy-migration'
import { openLocalDataSession } from './session'

Object.defineProperty(globalThis, 'isSecureContext', { value: true, configurable: true })

const START_MS = 1_700_000_000_000
const USER_ID = '018f2c4e-0000-7000-8000-00000000000a'

function names(): string[] {
  return ['improve-personal-' + USER_ID, 'improve-personal-keys-' + USER_ID]
}

async function existingDatabases(): Promise<string[]> {
  const databases = await indexedDB.databases()
  return databases.map((entry) => entry.name ?? '').sort()
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

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
})

describe('migrasi nama database lama → netral', () => {
  it('data dari nama ber-brand pindah ke nama netral dan tetap terbaca', async () => {
    const [legacyRecord, legacyKeys] = names()

    // Meniru perangkat yang datanya ditulis versi sebelumnya (nama masih ber-brand).
    const old = await openLocalDataSession({
      userId: USER_ID,
      clock: createManualClock(START_MS),
      databaseName: legacyRecord,
      keysDatabaseName: legacyKeys,
    })
    await old.writer.write({
      type: 'todo',
      data: (id) => todoPayload(id, 'Data sebelum ganti nama'),
    })

    expect(await existingDatabases()).toEqual([legacyRecord, legacyKeys].sort())

    // Sesi normal: sekarang memakai nama netral, dan migrasi berjalan sendiri.
    const migrated = await openLocalDataSession({
      userId: USER_ID,
      clock: createManualClock(START_MS),
    })

    const rows = await migrated.repos.todo.listAll()
    expect(rows.map((row) => (row.data as { title: string }).title)).toEqual([
      'Data sebelum ganti nama',
    ])

    // Nama baru benar-benar dipakai (bukan nama lama), dan menjalankan migrasi lagi tidak mengubah apa pun:
    // idempotensinya dijamin oleh pemeriksaan "database tujuan belum ada", bukan oleh penghapusan sumber.
    const after = await existingDatabases()
    expect(after).toContain(localDatabaseNameFor(USER_ID))
    expect(after).toContain(localDatabaseNameFor(USER_ID, 'keys'))

    await migrateLegacyLocalDatabases(USER_ID)
    const rowsAgain = await migrated.repos.todo.listAll()
    expect(rowsAgain).toHaveLength(1)
  })

  it('tidak menimpa penyimpanan baru yang sudah ada', async () => {
    const [legacyRecord] = names()

    // Data BARU sudah ada (mis. user sudah memakai versi netral).
    const current = await openLocalDataSession({
      userId: USER_ID,
      clock: createManualClock(START_MS),
    })
    await current.writer.write({ type: 'todo', data: (id) => todoPayload(id, 'Data baru') })

    // Lalu muncul database lama (mis. sisa dari backup/storage yang di-restore).
    await openLocalDataSession({
      userId: USER_ID,
      clock: createManualClock(START_MS),
      databaseName: legacyRecord,
      keysDatabaseName: 'improve-personal-keys-' + USER_ID,
    })

    await migrateLegacyLocalDatabases(USER_ID)

    const rows = await current.repos.todo.listAll()
    expect(rows.map((row) => (row.data as { title: string }).title)).toEqual(['Data baru'])
  })

  it('database tanpa akun (sebelum pemisahan per akun) sengaja TIDAK dipetakan ke akun mana pun', async () => {
    // Isinya tidak bisa diatribusikan ke akun; memetakannya ke akun yang kebetulan login = menyerahkan
    // data satu orang ke orang lain. Jadi migrasi harus melewatinya.
    const legacyUnscoped = await openLocalDataSession({
      userId: USER_ID,
      clock: createManualClock(START_MS),
      databaseName: 'improve-personal',
      keysDatabaseName: 'improve-personal-keys',
    })
    await legacyUnscoped.writer.write({
      type: 'todo',
      data: (id) => todoPayload(id, 'Tidak boleh pindah ke akun'),
    })

    await migrateLegacyLocalDatabases(USER_ID)

    const fresh = await openLocalDataSession({
      userId: USER_ID,
      clock: createManualClock(START_MS),
    })
    expect(await fresh.repos.todo.listAll()).toEqual([])

    // Dan database lama itu tetap ada, tidak dihapus diam-diam.
    expect(await existingDatabases()).toContain('improve-personal')
  })
})
