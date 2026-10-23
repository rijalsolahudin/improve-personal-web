import 'fake-indexeddb/auto'

import { IDBFactory } from 'fake-indexeddb'
import { createManualClock, type ManualClock } from '@improve-personal/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Memo } from '~/utils/memo'
import { loadMemoRecords, persistMemo } from '~/utils/memo/persistence'
import { openLocalDataSession, type LocalDataSession } from '~/utils/storage/session'
import type { RecordWriter } from '~/utils/storage/record-writer'

import { MEMO_DRAFT_PREFIX, useMemoDraft } from './useMemoDraft'
import { resetMemosHydrationForTest, useMemos } from './useMemos'

/**
 * QA #71 - dua bug data-loss dari QA #65, dibuktikan di atas sesi data lokal SUNGGUHAN
 * (fake-indexeddb + kripto sodium asli), bukan provider palsu:
 *
 * a. BUG-65-01: tulis gagal (quota penuh) -> draf TETAP ada, error terlihat, retry berhasil begitu
 *    penyimpanan pulih; sukses -> draf baru dibuang.
 * b. RISK-65-02: tab B menyimpan dari salinan basi -> catatan tab A tidak hilang (bukan LWW buta).
 * c. hydrate setelah gagal tidak menghapus halaman yang belum tersimpan.
 */

/** Runtime test tidak punya syarat browser yang diperiksa `openLocalDataSession`. */
Object.defineProperty(globalThis, 'isSecureContext', { value: true, configurable: true })
Object.defineProperty(globalThis.navigator, 'locks', {
  value: { request: (_name: string, work: () => unknown) => work() },
  configurable: true,
})

const USER_ID = '018f2c4e-0000-7000-8000-00000000000a'
const DAY = '2025-09-09'
const START_MS = new Date(2025, 8, 9, 21, 0, 0).getTime()
const DRAFT_KEY = MEMO_DRAFT_PREFIX + DAY

const MEMO_STATES = [
  'memos',
  'memosStatus',
  'memosError',
  'memosUnsaved',
  'memo-paper',
  'memo-draft',
  'memo-draft-day',
  'memo-draft-saved',
  'memo-draft-held',
] as const

let counter = 0

function names(): { databaseName: string; keysDatabaseName: string } {
  counter += 1
  return {
    databaseName: `ip-memo71-db-${counter}`,
    keysDatabaseName: `ip-memo71-keys-${counter}`,
  }
}

type TestSession = LocalDataSession & { readonly clock: ManualClock }

/** Sesi nyata: IndexedDB + sodium. `startMs` berbeda = jam perangkat tab lain. */
async function open(dbNames: ReturnType<typeof names>, startMs = START_MS): Promise<TestSession> {
  const clock = createManualClock(startMs)
  const session = await openLocalDataSession({
    userId: USER_ID,
    clock,
    databaseName: dbNames.databaseName,
    keysDatabaseName: dbNames.keysDatabaseName,
  })
  return { ...session, clock }
}

function resetMemoState(): void {
  clearNuxtState([...MEMO_STATES])
  resetMemosHydrationForTest()
}

/**
 * Sesi dengan penyimpanan yang menolak menulis (QuotaExceededError / IndexedDB diblokir) sampai
 * `allowWrites()` dipanggil. Yang diganti hanya batas penyimpanan - repository & kripto tetap nyata.
 */
function blockedWrites(session: LocalDataSession): {
  session: LocalDataSession
  allowWrites: () => void
} {
  let blocked = true
  const writer: RecordWriter = {
    ...session.writer,
    write: async (input) => {
      if (blocked) throw new Error('QuotaExceededError: storage penuh')
      return session.writer.write(input)
    },
  }

  return {
    session: { ...session, writer },
    allowWrites: () => {
      blocked = false
    },
  }
}

const memo = (session: LocalDataSession, overrides: Partial<Memo> = {}): Memo => ({
  id: session.newId(),
  date: DAY,
  createdAt: START_MS,
  title: '',
  text: '',
  feelings: [],
  paper: 'krem',
  ...overrides,
})

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  localStorage.clear()
  resetMemoState()
})

describe('QA #71 BUG-65-01 tulis gagal tidak menghilangkan tulisan', () => {
  it('(a) storage penuh: draf & halaman bertahan, error terlihat, retry berhasil setelah pulih', async () => {
    const dbNames = names()
    const base = await open(dbNames)
    const gate = blockedWrites(base)
    const memos = useMemos({ session: async () => gate.session })
    await memos.hydrate()

    // Editor: user mengetik, lalu menekan simpan (alur MemoEditor: hold -> save -> waitForSave).
    const editor = useMemoDraft()
    editor.showDay(DAY, null)
    editor.draft.value.text = 'Tulisan yang tidak boleh hilang.'
    editor.hold(DAY)
    expect(localStorage.getItem(DRAFT_KEY)).not.toBeNull()

    const page = memos.save({ date: DAY, ...editor.draft.value, paper: 'krem' })
    if (page === null) throw new Error('simpan tidak diantrekan')
    expect(await memos.waitForSave(page.id)).toBe(false)

    // Gagal = terlihat, bukan silent: pesan error tersedia untuk UI, tanggal ditandai belum tersimpan.
    expect(memos.error.value).toContain('QuotaExceededError')
    expect(memos.hasUnsaved(DAY)).toBe(true)
    // Draf TIDAK dihapus: ini satu-satunya salinan tulisan user.
    expect(localStorage.getItem(DRAFT_KEY)).toContain('Tulisan yang tidak boleh hilang.')
    // Halaman tetap di memori walau penyimpanan kosong.
    expect(memos.memoOn(DAY)?.text).toBe('Tulisan yang tidak boleh hilang.')
    expect(await loadMemoRecords(base, 'krem')).toMatchObject({ entries: [] })

    // Storage pulih -> tombol "coba lagi" memakai jalur simpan yang sama.
    gate.allowWrites()
    const retry = memos.save({ date: DAY, ...editor.draft.value, paper: 'krem' })
    if (retry === null) throw new Error('retry tidak diantrekan')
    expect(await memos.waitForSave(retry.id)).toBe(true)
    expect(memos.hasUnsaved(DAY)).toBe(false)
    expect(memos.error.value).toBeNull()

    // Sukses = draf baru dibuang, setelah editor memuat halaman yang benar-benar tersimpan.
    const written = memos.memoOn(DAY)
    if (written === null) throw new Error('halaman hasil retry tidak ada')
    editor.load(written)
    editor.release(DAY)
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull()

    await vi.waitFor(async () => {
      const stored = await loadMemoRecords(base, 'krem')
      expect(stored.entries).toHaveLength(1)
      expect(stored.entries[0]?.text).toBe('Tulisan yang tidak boleh hilang.')
      expect(stored.entries[0]?.id).toBe(page.id)
    })
  })

  it('(a2) kegagalan tulis tidak mengubah status hydrate: halaman tidak hilang dari memori', async () => {
    const dbNames = names()
    const base = await open(dbNames)
    const gate = blockedWrites(base)
    const memos = useMemos({ session: async () => gate.session })
    await memos.hydrate()
    expect(memos.status.value).toBe('ready')

    const page = memos.save({
      date: DAY,
      title: '',
      text: 'Halaman yang gagal ditulis.',
      feelings: [],
      paper: 'krem',
    })
    if (page === null) throw new Error('simpan tidak diantrekan')
    expect(await memos.waitForSave(page.id)).toBe(false)

    // Dulu `status` diubah jadi 'error' di sini, sehingga hydrate berikutnya menimpa store.
    expect(memos.status.value).toBe('ready')
    expect(memos.memos.value).toHaveLength(1)
  })

  it('(c) tulis sukses: draf dibuang hanya setelah tulis terkonfirmasi', async () => {
    const dbNames = names()
    const session = await open(dbNames)
    const memos = useMemos({ session: async () => session })
    await memos.hydrate()

    const editor = useMemoDraft()
    editor.showDay(DAY, null)
    editor.draft.value.text = 'Hari ini tenang.'
    editor.hold(DAY)

    const page = memos.save({ date: DAY, ...editor.draft.value, paper: 'krem' })
    if (page === null) throw new Error('simpan tidak diantrekan')
    expect(await memos.waitForSave(page.id)).toBe(true)

    editor.load(memos.memoOn(DAY) ?? page)
    editor.release(DAY)

    expect(localStorage.getItem(DRAFT_KEY)).toBeNull()
    await vi.waitFor(async () => {
      expect((await loadMemoRecords(session, 'krem')).entries[0]?.text).toBe('Hari ini tenang.')
    })
  })

  it('(d) hydrate setelah tulis gagal tidak menghapus halaman yang belum tersimpan', async () => {
    const dbNames = names()
    const base = await open(dbNames)
    const gate = blockedWrites(base)
    const memos = useMemos({ session: async () => gate.session })
    await memos.hydrate()

    const page = memos.save({
      date: DAY,
      title: 'Judul',
      text: 'Belum tersimpan, tapi tidak boleh hilang.',
      feelings: ['tenang'],
      paper: 'krem',
    })
    if (page === null) throw new Error('simpan tidak diantrekan')
    expect(await memos.waitForSave(page.id)).toBe(false)

    // Hydrate berikutnya (mis. sesi lokal dibuka ulang di halaman yang sama): store TIDAK dibuang,
    // hanya status hydrate yang direset.
    clearNuxtState(['memosStatus', 'memosError'])
    resetMemosHydrationForTest()
    const after = useMemos({ session: async () => gate.session })
    await after.hydrate()

    expect(after.status.value).toBe('ready')
    expect(after.memoOn(DAY)).toMatchObject({
      id: page.id,
      title: 'Judul',
      text: 'Belum tersimpan, tapi tidak boleh hilang.',
      feelings: ['tenang'],
    })
    // Penyimpanan memang masih kosong: yang dipertahankan adalah versi lokal yang belum tersimpan.
    expect((await loadMemoRecords(base, 'krem')).entries).toHaveLength(0)
  })
})

describe('QA #71 RISK-65-02 dua tab tidak saling menimpa', () => {
  it('(b) simpan di tab basi menggabungkan catatan tab lain, bukan menghapusnya', async () => {
    const dbNames = names()
    const tabA = await open(dbNames)
    const tabB = await open(dbNames, START_MS + 60_000)

    // Halaman awal sudah ada di penyimpanan (ditulis tab A).
    const seed = memo(tabA, { text: 'Tulisan awal.' })
    await persistMemo(tabA, seed, null)

    // Tab B membuka halaman itu: salinan di memori B berhenti di "Tulisan awal.".
    const memosB = useMemos({ session: async () => tabB })
    await memosB.hydrate()
    expect(memosB.memoOn(DAY)?.text).toBe('Tulisan awal.')

    // Tab A menambah catatan SETELAH B membaca. Ditulis langsung ke sesi A = memori B tidak tahu.
    await persistMemo(tabA, { ...seed, text: 'Tulisan awal.\n\nCatatan penting dari tab A' }, null)

    // Tab B menyimpan drafnya yang dibuat dari versi basi.
    const page = memosB.save({
      date: DAY,
      title: '',
      text: 'Tulisan awal.\n\nTambahan dari tab B',
      feelings: [],
      paper: 'krem',
    })
    if (page === null) throw new Error('simpan tab B tidak diantrekan')
    expect(await memosB.waitForSave(page.id)).toBe(true)

    const stored = (await loadMemoRecords(tabB, 'krem')).entries[0]
    expect(stored?.text).toContain('Catatan penting dari tab A')
    expect(stored?.text).toContain('Tambahan dari tab B')
    // Satu halaman per tanggal & tidak ada duplikasi catatan luar.
    expect((await loadMemoRecords(tabB, 'krem')).entries).toHaveLength(1)
    expect(stored?.text.match(/Catatan penting dari tab A/g)).toHaveLength(1)
    // State tab B langsung memakai versi gabungan yang benar-benar ditulis.
    expect(memosB.memoOn(DAY)?.text).toBe(stored?.text)
  })

  it('(b2) tab yang tidak basi tetap menulis apa adanya (tanpa menduplikasi isi)', async () => {
    const dbNames = names()
    const session = await open(dbNames)
    const seed = memo(session, { text: 'Tulisan awal.' })
    await persistMemo(session, seed, null)

    const memos = useMemos({ session: async () => session })
    await memos.hydrate()

    const page = memos.save({
      date: DAY,
      title: '',
      text: 'Tulisan awal.\n\nRevisi saya.',
      feelings: [],
      paper: 'krem',
    })
    if (page === null) throw new Error('simpan tidak diantrekan')
    expect(await memos.waitForSave(page.id)).toBe(true)

    const stored = (await loadMemoRecords(session, 'krem')).entries[0]
    expect(stored?.text).toBe('Tulisan awal.\n\nRevisi saya.')
  })
})
