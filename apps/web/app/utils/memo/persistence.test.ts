// @vitest-environment node
//
// Persistensi jurnal: `Memo` (UI) <-> record `journal_entry`, lewat sesi data lokal nyata
// (IndexedDB + kripto sodium). Yang diuji adalah janji yang tidak terlihat di UI: isi jurnal
// bertahan setelah reload, satu record per tanggal, mood tanpa tulisan tetap tersimpan, dan blob
// di penyimpanan benar-benar ciphertext - bukan teks jurnal.
import 'fake-indexeddb/auto'

import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it } from 'vitest'

import { createManualClock } from '@improve-personal/core'

import { openLocalDataSession, type LocalDataSession } from '../storage/session'
import type { Memo } from '../memo'
import {
  decodeFeelingsStory,
  encodeFeelingsStory,
  fromJournalEntry,
  loadMemoRecords,
  moodFromIndex,
  moodIndex,
  persistMemo,
  removeMemoRecord,
  toJournalEntry,
} from './persistence'

const START_MS = 1_700_000_000_000
const USER_ID = '018f2c4e-0000-7000-8000-00000000000a'
const DAY = '2025-09-10'

/** Runtime node tidak punya syarat browser yang diperiksa `openLocalDataSession`. */
Object.defineProperty(globalThis, 'isSecureContext', { value: true, configurable: true })

let counter = 0

function names() {
  counter += 1
  return {
    databaseName: `ip-memo-test-${counter}`,
    keysDatabaseName: `ip-memo-test-keys-${counter}`,
  }
}

async function openSession(dbNames: ReturnType<typeof names>): Promise<LocalDataSession> {
  return openLocalDataSession({
    userId: USER_ID,
    clock: createManualClock(START_MS),
    ...dbNames,
  })
}

function memo(session: LocalDataSession, overrides: Partial<Memo> = {}): Memo {
  return {
    id: session.newId(),
    date: DAY,
    createdAt: START_MS,
    title: 'Hari tenang',
    text: 'Hari ini saya belajar banyak.',
    feelings: ['tenang'],
    paper: 'krem',
    ...overrides,
  }
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
})

describe('pemetaan memo <-> journal_entry', () => {
  it('judul jadi identityToday, isi jadi diaryMd, mood jadi enum core', () => {
    const entry = toJournalEntry(
      {
        id: '018f2c4e-0000-7000-8000-000000000001',
        date: DAY,
        createdAt: START_MS,
        title: '  Hari tenang  ',
        text: 'Isi jurnal.',
        feelings: ['tenang', 'tenang', 'semangat'],
        paper: 'krem',
      },
      4,
      START_MS + 1_000,
    )

    expect(entry).toMatchObject({
      entryDate: DAY,
      identityToday: 'Hari tenang',
      diaryMd: 'Isi jurnal.',
      mood: 'sangat_bahagia',
      createdAt: START_MS,
      updatedAt: START_MS + 1_000,
    })
    expect(fromJournalEntry(entry, 'krem')).toMatchObject({
      date: DAY,
      title: 'Hari tenang',
      text: 'Isi jurnal.',
      feelings: ['tenang', 'semangat'],
    })
  })

  it('mood dua arah, dan nilai tak dikenal jadi null (bukan crash)', () => {
    for (let index = 0; index < 5; index += 1) {
      expect(moodIndex(moodFromIndex(index))).toBe(index)
    }
    expect(moodFromIndex(9)).toBeNull()
    expect(moodFromIndex(null)).toBeNull()
    expect(moodIndex(null)).toBeNull()
  })

  it('tag perasaan disimpan dengan penanda dan tidak menimpa cerita penulis lain', () => {
    expect(encodeFeelingsStory(['tenang'])).toBe('#perasaan tenang')
    expect(decodeFeelingsStory('#perasaan tenang semangat')).toEqual(['tenang', 'semangat'])
    expect(decodeFeelingsStory('cerita perasaan bebas')).toEqual([])

    const previous = {
      id: '018f2c4e-0000-7000-8000-000000000002',
      entryDate: DAY,
      identityToday: null,
      mood: null,
      moodStoryMd: 'cerita penulis lain yang tidak boleh hilang',
      diaryMd: null,
      createdAt: START_MS,
      updatedAt: START_MS,
    } as const

    const entry = toJournalEntry(
      {
        id: previous.id,
        date: DAY,
        createdAt: START_MS,
        title: '',
        text: 'Isi baru.',
        feelings: ['tenang'],
        paper: 'krem',
      },
      null,
      START_MS + 1,
      previous,
    )
    expect(entry.moodStoryMd).toBe('cerita penulis lain yang tidak boleh hilang')
  })
})

describe('persistensi jurnal', () => {
  it('halaman bertahan setelah sesi dibuka ulang (reload)', async () => {
    const dbNames = names()
    const first = await openSession(dbNames)
    const saved = memo(first, { text: 'Tersimpan di perangkat.' })

    await persistMemo(first, saved, 3)

    const reopened = await openSession(dbNames)
    const loaded = await loadMemoRecords(reopened, 'krem')

    expect(loaded.entries).toHaveLength(1)
    expect(loaded.entries[0]).toMatchObject({
      id: saved.id,
      date: DAY,
      title: 'Hari tenang',
      text: 'Tersimpan di perangkat.',
      feelings: ['tenang'],
    })
    expect(loaded.moods[DAY]).toBe(3)
  })

  it('simpan ulang di tanggal yang sama meng-update record, bukan menambah duplikat', async () => {
    const session = await openSession(names())
    const saved = memo(session)
    await persistMemo(session, saved, null)

    await persistMemo(session, { ...saved, text: 'Versi kedua.' }, 1)

    const loaded = await loadMemoRecords(session, 'krem')
    expect(loaded.entries).toHaveLength(1)
    expect(loaded.entries[0]?.text).toBe('Versi kedua.')
    expect(loaded.moods[DAY]).toBe(1)
  })

  it('mood tanpa tulisan tetap satu record di tanggal itu', async () => {
    const session = await openSession(names())
    const moodOnly = memo(session, { title: '', text: '', feelings: [] })

    await persistMemo(session, moodOnly, 2)

    const loaded = await loadMemoRecords(session, 'krem')
    expect(loaded.moods[DAY]).toBe(2)
    expect(loaded.entries).toHaveLength(1)
    expect(loaded.entries[0]?.text).toBe('')
  })

  it('hapus jadi tombstone: hilang dari baca, tetapi record tetap ada untuk sync', async () => {
    const session = await openSession(names())
    const saved = memo(session)
    await persistMemo(session, saved, null)
    await removeMemoRecord(session, saved.id)

    expect((await loadMemoRecords(session, 'krem')).entries).toHaveLength(0)
    expect(await session.repos.journal.getById(saved.id)).toBeNull()
    expect(await session.repos.journal.listAll({ includeDeleted: true })).toHaveLength(1)
  })

  it('isi jurnal TIDAK plaintext di penyimpanan dan masuk outbox', async () => {
    const session = await openSession(names())
    const secret = 'Rahasia jurnal yang tidak boleh bocor'
    const saved = memo(session, { title: 'Judul rahasia', text: secret })

    await persistMemo(session, saved, 4)

    const [indexEntry] = await session.storage.listIndexByType('journal_entry')
    if (indexEntry === undefined) throw new Error('record jurnal tidak ditemukan di index')
    const stored = await session.storage.getRecord(indexEntry.recordId)
    if (stored === null) throw new Error('record jurnal tidak ditemukan')

    // Blob tersegel = base64 ciphertext; teks asli tidak muncul baik di string blob maupun setelah
    // di-decode sebagai byte.
    const blob = stored.blob
    const decoded = Buffer.from(blob, 'base64').toString('latin1')
    expect(blob).not.toContain(secret)
    expect(blob).not.toContain('Judul rahasia')
    expect(decoded).not.toContain(secret)
    expect(decoded).not.toContain('Judul rahasia')

    expect(await session.storage.countOutbox()).toBeGreaterThan(0)
  })
})
