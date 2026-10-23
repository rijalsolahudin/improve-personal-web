import 'fake-indexeddb/auto'

import { IDBFactory } from 'fake-indexeddb'
import { journalEntrySchema } from '@improve-personal/core'
import { createManualClock, type ManualClock } from '@improve-personal/core'
import { flushPromises } from '@vue/test-utils'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { MEMO_DRAFT_PREFIX, useMemoDraft } from './useMemoDraft'
import { resetMemosHydrationForTest, useMemos } from './useMemos'
import { MEMO_TEXT_MAX, type Memo, type MoodByDate } from '~/utils/memo'
import { loadMemoRecords, persistMemo } from '~/utils/memo/persistence'
import { resetSchedulesHydrationForTest } from '~/composables/useSchedules'
import type { JournalDay } from '~/utils/journal'
import type { Schedule } from '~/utils/schedule'
import { openLocalDataSession, type LocalDataSession } from '~/utils/storage/session'
import { fromIsoDate } from '~/utils/time'

import MemoPage from '~/pages/app/memo.vue'

/**
 * QA #65 - persistensi jurnal TERENKRIPSI, dibuktikan sendiri (bukan hanya percaya test developer).
 *
 * Semua kasus di sini memakai sesi data lokal SUNGGUHAN: IndexedDB (fake-indexeddb) + kripto sodium
 * asli, jadi yang diperiksa adalah blob yang benar-benar ditulis ke disk - bukan provider palsu.
 *
 * Yang dibuktikan:
 * a. simpan -> sesi baru (relogin/reload) -> judul, isi, mood, tag perasaan, mention tetap ada;
 * b. isi penyimpanan: blob ciphertext + baris outbox, TIDAK ada judul/isi/mood plaintext;
 * c. satu record per tanggal: simpan ulang = update, `createdAt` & id dipertahankan;
 * d. mood tanpa tulisan bertahan dan tidak muncul sebagai halaman kosong;
 * e. hapus tulisan mempertahankan mood;
 * f. hapus tanpa mood = tombstone (record tetap ada untuk sync);
 * g. R2: reload di tengah draf + catatan penulis luar -> dua-duanya selamat; draf format lama terbaca;
 * h. R1: append di batas 5.000 memotong teks user dulu, catatan eksternal utuh.
 */

/** Runtime test tidak punya syarat browser yang diperiksa `openLocalDataSession`. */
Object.defineProperty(globalThis, 'isSecureContext', { value: true, configurable: true })
Object.defineProperty(globalThis.navigator, 'locks', {
  value: { request: (_name: string, work: () => unknown) => work() },
  configurable: true,
})

const USER_ID = '018f2c4e-0000-7000-8000-00000000000a'
/** Tanggal "kemarin": `createdAt` halaman lampau = jam 20:00 tanggal itu (deterministik). */
const DAY = '2025-09-09'
const OTHER_DAY = '2025-09-08'
const START_MS = fromIsoDate(DAY).getTime() + 21 * 3_600_000

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
    databaseName: `ip-memo65-db-${counter}`,
    keysDatabaseName: `ip-memo65-keys-${counter}`,
  }
}

type TestSession = LocalDataSession & { readonly clock: ManualClock }

/** Sesi nyata: IndexedDB + sodium. `startMs` berbeda = jam perangkat maju (sesi/tab lain). */
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

function clearMemoState(): void {
  clearNuxtState([...MEMO_STATES])
  resetMemosHydrationForTest()
}

/** Semua baris semua object store, apa adanya (blob masih ciphertext). */
async function dumpDatabase(name: string): Promise<string> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

  const dump: Record<string, unknown[]> = {}
  for (const store of Array.from(db.objectStoreNames)) {
    dump[store] = await new Promise<unknown[]>((resolve, reject) => {
      const transaction = db.transaction(store, 'readonly')
      const request = transaction.objectStore(store).getAll()
      request.onsuccess = () => resolve(request.result as unknown[])
      request.onerror = () => reject(request.error)
    })
  }
  db.close()
  return JSON.stringify(dump)
}

beforeEach(() => {
  // IndexedDB baru tiap kasus: tidak ada record/kunci yang saling mewarisi.
  globalThis.indexedDB = new IDBFactory()
  localStorage.clear()
  clearNuxtState([...MEMO_STATES])
  resetMemosHydrationForTest()
  resetSchedulesHydrationForTest()
})

describe('QA #65 jurnal persist & terenkripsi (sesi nyata)', () => {
  it('(a) simpan lalu sesi baru: judul, isi, mood, tag perasaan, dan mention tetap ada', async () => {
    const dbNames = names()
    const first = await open(dbNames)
    const before = useMemos({ session: async () => first })
    await before.hydrate()
    expect(before.status.value).toBe('ready')

    before.setMood(DAY, 4)
    const saved = before.save({
      date: DAY,
      title: '  Hari tenang  ',
      text: 'Pagi ikut @[sched-1], sore lanjut #[goal-1].',
      feelings: ['tenang', 'semangat'],
      paper: 'krem',
    })
    if (saved === null) throw new Error('simpan jurnal gagal')

    await vi.waitFor(async () => {
      const loaded = await loadMemoRecords(first, 'krem')
      expect(loaded.entries).toHaveLength(1)
      expect(loaded.moods[DAY]).toBe(4)
    })

    // Reload penuh: state Nuxt dibuang, sesi lokal dibuka lagi dari nol (kunci dibuka ulang).
    clearMemoState()
    const second = await open(dbNames, START_MS + 3_600_000)
    const after = useMemos({ session: async () => second })
    await after.hydrate()

    expect(after.status.value).toBe('ready')
    expect(after.memoOn(DAY)).toMatchObject({
      id: saved.id,
      date: DAY,
      title: 'Hari tenang',
      text: 'Pagi ikut @[sched-1], sore lanjut #[goal-1].',
      feelings: ['tenang', 'semangat'],
    })
    expect(after.moodOn(DAY)).toBe(4)
    // `createdAt` halaman lampau = 20:00 tanggal itu, bukan waktu tulis.
    expect(new Date(saved.createdAt).getHours()).toBe(20)
  })

  it('(b) penyimpanan: blob ciphertext + outbox, tanpa judul/isi/mood plaintext', async () => {
    const dbNames = names()
    const session = await open(dbNames)
    const memos = useMemos({ session: async () => session })
    await memos.hydrate()

    const secretTitle = 'Judul rahasia QA 65'
    const secretText = 'Isi jurnal rahasia QA 65 yang tidak boleh plaintext'
    const saved = memos.save({
      date: DAY,
      title: secretTitle,
      text: secretText,
      feelings: ['cemas'],
      paper: 'krem',
    })
    if (saved === null) throw new Error('simpan jurnal gagal')
    memos.setMood(DAY, 1)

    await vi.waitFor(async () => {
      const loaded = await loadMemoRecords(session, 'krem')
      expect(loaded.entries[0]?.text).toBe(secretText)
      expect(loaded.moods[DAY]).toBe(1)
    })

    const dump = await dumpDatabase(dbNames.databaseName)
    // Metadata yang memang boleh plaintext (server butuh untuk LWW, bukan isi).
    expect(dump).toContain('journal_entry')
    expect(dump).toContain(saved.id)
    // Isi jurnal: judul, teks, tag perasaan, dan enum mood TIDAK boleh muncul.
    for (const secret of [secretTitle, secretText, 'cemas', 'sedih', 'sangat_sedih']) {
      expect(dump).not.toContain(secret)
    }

    const index = await session.storage.listIndexByType('journal_entry')
    expect(index).toHaveLength(1)
    const recordId = index[0]?.recordId
    if (recordId === undefined) throw new Error('record jurnal tidak ada di index')
    const stored = await session.storage.getRecord(recordId)
    if (stored === null) throw new Error('record jurnal tidak ada')

    // Bentuk blob: base64(nonce24 || ciphertext||tag). Bukan base64 dari JSON/teks.
    const raw = Buffer.from(stored.blob, 'base64')
    expect(raw.length).toBeGreaterThan(24 + secretText.length)
    const body = raw.subarray(24).toString('latin1')
    expect(body).not.toContain(secretText)
    expect(body.startsWith('{')).toBe(false)
    expect(Buffer.from(stored.blob, 'base64').subarray(0, 24)).toHaveLength(24)

    // Baris outbox ada dan menunjuk record yang sama (tulis lokal dulu, sinkron belakangan).
    const outbox = await session.storage.listOutbox(10)
    expect(outbox.some((row) => row.recordId === recordId && row.op === 'put')).toBe(true)

    // Index menyimpan awal hari lokal (bukan null) supaya query per periode tidak memindai semua record.
    expect(index[0]?.rangeStartMs).toBe(fromIsoDate(DAY).getTime())

    // localStorage tidak menyimpan isi jurnal yang sudah disimpan.
    for (let position = 0; position < localStorage.length; position += 1) {
      const key = localStorage.key(position) ?? ''
      const value = localStorage.getItem(key) ?? ''
      expect(`${key} ${value}`).not.toContain(secretText)
      expect(`${key} ${value}`).not.toContain(secretTitle)
      expect(key.startsWith(MEMO_DRAFT_PREFIX)).toBe(false)
    }
  })

  it('(c) satu record per tanggal: simpan ulang = update, id & createdAt tetap', async () => {
    const dbNames = names()
    const session = await open(dbNames)
    const memos = useMemos({ session: async () => session })
    await memos.hydrate()

    const firstSave = memos.save({
      date: DAY,
      title: 'Judul satu',
      text: 'Versi pertama',
      feelings: ['tenang'],
      paper: 'krem',
    })
    if (firstSave === null) throw new Error('simpan pertama gagal')
    await vi.waitFor(async () => {
      expect((await loadMemoRecords(session, 'krem')).entries).toHaveLength(1)
    })

    session.clock.advance(60_000)
    memos.save({
      date: DAY,
      title: 'Judul dua',
      text: 'Versi kedua',
      feelings: ['bangga'],
      paper: 'krem',
    })

    await vi.waitFor(async () => {
      expect((await loadMemoRecords(session, 'krem')).entries[0]?.text).toBe('Versi kedua')
    })

    const records = await session.repos.journal.listAll({ includeDeleted: false })
    expect(records).toHaveLength(1)
    const [record] = records
    if (record === undefined) throw new Error('record jurnal tidak ada')
    const entry = journalEntrySchema.parse(record.data)
    expect(entry.id).toBe(firstSave.id)
    expect(entry.createdAt).toBe(firstSave.createdAt)
    expect(entry.updatedAt).toBeGreaterThan(entry.createdAt)
    expect(entry.identityToday).toBe('Judul dua')
    expect(entry.diaryMd).toBe('Versi kedua')

    // Dua tulisan untuk record yang sama = dua baris outbox, bukan record kedua.
    await vi.waitFor(async () => {
      const outbox = await session.storage.listOutbox(20)
      expect(outbox.filter((row) => row.recordId === firstSave.id)).toHaveLength(2)
    })
  })

  it('(d) mood tanpa tulisan: satu record mood-saja, bertahan, bukan halaman jurnal', async () => {
    const dbNames = names()
    const session = await open(dbNames)
    const memos = useMemos({ session: async () => session })
    await memos.hydrate()

    memos.setMood(DAY, 2)
    await vi.waitFor(async () => {
      expect((await loadMemoRecords(session, 'krem')).moods[DAY]).toBe(2)
    })

    const records = await session.repos.journal.listAll({ includeDeleted: false })
    expect(records).toHaveLength(1)
    const [record] = records
    if (record === undefined) throw new Error('record mood tidak ada')
    // Mood tersimpan sebagai enum core di dalam blob; judul & diary dibiarkan null.
    expect(journalEntrySchema.parse(record.data)).toMatchObject({
      entryDate: DAY,
      identityToday: null,
      diaryMd: null,
      mood: 'netral',
    })

    clearMemoState()
    const reopened = await open(dbNames, START_MS + 60_000)
    const after = useMemos({ session: async () => reopened })
    await after.hydrate()

    expect(after.moodOn(DAY)).toBe(2)
    expect(after.memoOn(DAY)).toBeNull()
    expect(after.memos.value).toHaveLength(0)
  })

  it('(e) hapus tulisan mempertahankan mood: record tetap ada dengan teks kosong', async () => {
    const dbNames = names()
    const session = await open(dbNames)
    const memos = useMemos({ session: async () => session })
    await memos.hydrate()

    memos.setMood(DAY, 3)
    const saved = memos.save({
      date: DAY,
      title: 'Hari dengan mood',
      text: 'Tulisan yang akan dihapus.',
      feelings: ['bersyukur'],
      paper: 'krem',
    })
    if (saved === null) throw new Error('simpan jurnal gagal')

    await vi.waitFor(async () => {
      const loaded = await loadMemoRecords(session, 'krem')
      expect(loaded.entries[0]?.text).toBe('Tulisan yang akan dihapus.')
    })

    memos.remove(saved.id)
    expect(memos.moodOn(DAY)).toBe(3)
    expect(memos.memos.value).toHaveLength(0)

    await vi.waitFor(async () => {
      const loaded = await loadMemoRecords(session, 'krem')
      expect(loaded.moods[DAY]).toBe(3)
      expect(loaded.entries).toHaveLength(1)
      expect(loaded.entries[0]).toMatchObject({ id: saved.id, title: '', text: '' })
    })

    // Setelah reload mood tetap ada dan halaman kosong itu tidak tampil sebagai jurnal.
    clearMemoState()
    const reopened = await open(dbNames, START_MS + 120_000)
    const after = useMemos({ session: async () => reopened })
    await after.hydrate()
    expect(after.moodOn(DAY)).toBe(3)
    expect(after.memos.value).toHaveLength(0)
  })

  it('(f) hapus tanpa mood = tombstone: hilang dari baca, record tetap tersimpan untuk sync', async () => {
    const dbNames = names()
    const session = await open(dbNames)
    const memos = useMemos({ session: async () => session })
    await memos.hydrate()

    const saved = memos.save({
      date: DAY,
      title: '',
      text: 'Akan dihapus tanpa mood.',
      feelings: [],
      paper: 'krem',
    })
    if (saved === null) throw new Error('simpan jurnal gagal')
    await vi.waitFor(async () => {
      expect((await loadMemoRecords(session, 'krem')).entries).toHaveLength(1)
    })

    memos.remove(saved.id)

    await vi.waitFor(async () => {
      expect(await session.repos.journal.getById(saved.id)).toBeNull()
    })
    const all = await session.repos.journal.listAll({ includeDeleted: true })
    expect(all).toHaveLength(1)
    expect(all[0]?.deleted).toBe(true)
    // Isinya tetap ciphertext (tombstone tidak berubah jadi plaintext).
    expect(await session.storage.getRecord(saved.id)).toMatchObject({ deleted: true })
    const outbox = await session.storage.listOutbox(20)
    expect(outbox.some((row) => row.recordId === saved.id && row.op === 'delete')).toBe(true)

    clearMemoState()
    const reopened = await open(dbNames, START_MS + 60_000)
    const after = useMemos({ session: async () => reopened })
    await after.hydrate()
    expect(after.memos.value).toHaveLength(0)
  })

  it('(g) R2: reload di tengah draf + catatan luar -> dua-duanya selamat; draf format lama terbaca', async () => {
    const dbNames = names()
    const session = await open(dbNames)
    const memos = useMemos({ session: async () => session })
    await memos.hydrate()

    memos.save({
      date: DAY,
      title: '',
      text: 'Tulisan awal.',
      feelings: [],
      paper: 'krem',
    })
    await vi.waitFor(async () => {
      expect((await loadMemoRecords(session, 'krem')).entries[0]?.text).toBe('Tulisan awal.')
    })

    // Editor terbuka; user mengetik tapi belum menyimpan.
    const editor = useMemoDraft()
    editor.showDay(DAY, memos.memoOn(DAY))
    editor.draft.value.text = 'Tulisan awal.\n\nDraf saya yang belum disimpan'
    expect(localStorage.getItem(MEMO_DRAFT_PREFIX + DAY)).not.toBeNull()

    // Penulis lain (kartu review goal) menambah catatan ke halaman yang sama.
    memos.append(DAY, 'Catatan review goal')
    await vi.waitFor(async () => {
      expect((await loadMemoRecords(session, 'krem')).entries[0]?.text).toContain(
        'Catatan review goal',
      )
    })

    // Reload penuh: draf dari localStorage + repository terenkripsi.
    clearMemoState()
    const reopened = await open(dbNames, START_MS + 180_000)
    const after = useMemos({ session: async () => reopened })
    await after.hydrate()
    const page = after.memoOn(DAY)

    const editorAfter = useMemoDraft()
    editorAfter.showDay(DAY, page)
    const values = editorAfter.prepareSave(DAY, page)

    expect(values.text).toContain('Catatan review goal')
    expect(values.text).toContain('Draf saya yang belum disimpan')
    expect(values.text.length).toBeLessThanOrEqual(MEMO_TEXT_MAX)
    // Catatan luar tidak terduplikasi oleh penggabungan.
    expect(values.text.match(/Catatan review goal/g)).toHaveLength(1)

    // Draf format lama (tanpa pembungkus `base`) tetap terbaca, tidak dibuang.
    localStorage.setItem(
      MEMO_DRAFT_PREFIX + OTHER_DAY,
      JSON.stringify({ title: 'Judul lama', text: 'Draf format lama', feelings: ['tenang'] }),
    )
    clearNuxtState(['memo-draft', 'memo-draft-day', 'memo-draft-saved', 'memo-draft-held'])
    const legacy = useMemoDraft()
    legacy.showDay(OTHER_DAY, null)
    expect(legacy.draft.value).toEqual({
      title: 'Judul lama',
      text: 'Draf format lama',
      feelings: ['tenang'],
    })
  })

  it('(h) R1: append di batas 5.000 memotong teks user dulu, catatan eksternal utuh', async () => {
    const dbNames = names()
    const session = await open(dbNames)
    const memos = useMemos({ session: async () => session })
    await memos.hydrate()

    const external = 'Catatan review goal yang harus utuh'
    const userText = 'U'.repeat(MEMO_TEXT_MAX)
    memos.save({ date: DAY, title: '', text: userText, feelings: [], paper: 'krem' })
    await vi.waitFor(async () => {
      expect((await loadMemoRecords(session, 'krem')).entries).toHaveLength(1)
    })

    const page = memos.append(DAY, external)
    if (page === null) throw new Error('append gagal')

    expect(page.text).toHaveLength(MEMO_TEXT_MAX)
    expect(page.text.endsWith(external)).toBe(true)
    expect(page.text.startsWith(external)).toBe(false)
    // Yang dipotong adalah ekor teks user, bukan catatan eksternal.
    expect(page.text).not.toBe(userText)
    expect(userText.startsWith(page.text.slice(0, 10))).toBe(true)

    await vi.waitFor(async () => {
      const stored = (await loadMemoRecords(session, 'krem')).entries[0]?.text ?? ''
      expect(stored.endsWith(external)).toBe(true)
      expect(stored).toHaveLength(MEMO_TEXT_MAX)
    })
  })

  it('(i) tulis saat hydrate belum selesai tidak hilang dan tidak menduplikasi tanggal', async () => {
    const dbNames = names()
    const seed = await open(dbNames)
    await persistMemo(
      seed,
      {
        id: seed.newId(),
        date: OTHER_DAY,
        createdAt: fromIsoDate(OTHER_DAY).getTime() + 20 * 3_600_000,
        title: '',
        text: 'Halaman lama di penyimpanan',
        feelings: [],
        paper: 'krem',
      },
      null,
    )

    const session = await open(dbNames, START_MS + 60_000)
    // Placeholder no-op: executor Promise dijalankan sinkron, jadi `release` sudah terisi di baris berikutnya.
    let release = (): void => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })

    // Sesi sengaja lambat dibuka: user menekan "simpan" sebelum dekripsi selesai.
    const memos = useMemos({
      session: async () => {
        await gate
        return session
      },
    })
    const hydration = memos.hydrate()
    expect(
      memos.save({
        date: DAY,
        title: '',
        text: 'Ditulis saat hydrate',
        feelings: [],
        paper: 'krem',
      }),
    ).not.toBeNull()

    release()
    await hydration

    await vi.waitFor(async () => {
      const loaded = await loadMemoRecords(session, 'krem')
      expect(loaded.entries).toHaveLength(2)
    })

    expect(memos.memos.value.map((memo) => memo.date).sort()).toEqual([DAY, OTHER_DAY].sort())
    expect(memos.memoOn(DAY)?.text).toBe('Ditulis saat hydrate')
    expect(memos.memoOn(OTHER_DAY)?.text).toBe('Halaman lama di penyimpanan')
    // Satu record per tanggal tetap dipegang walau tulisan terjadi di tengah hydrate.
    const loaded = await loadMemoRecords(session, 'krem')
    expect(new Set(loaded.entries.map((entry) => entry.date)).size).toBe(loaded.entries.length)
  })
})

describe('QA #65 mood tanpa tulisan di UI', () => {
  const TODAY = '2025-09-09'
  const NOW = new Date(2025, 8, 9, 21, 0, 0).getTime()

  interface MemoStore {
    memos: Memo[]
    moods: MoodByDate
  }

  it('(d-UI) mood tanpa tulisan tidak dirender sebagai halaman kosong', async () => {
    useState<number>('now').value = NOW
    useState<Schedule[]>('schedules').value = []
    useState('goals').value = []
    useState<MemoStore>('memos').value = {
      memos: [
        {
          id: 'mood-only',
          date: TODAY,
          createdAt: NOW,
          title: '',
          text: '',
          feelings: [],
          paper: 'krem',
        },
      ],
      moods: { [TODAY]: 3 },
    }
    useState<Record<string, JournalDay>>('journal-days').value = {}
    useState<string>('memo-selected').value = TODAY
    useState('memo-draft').value = { title: '', text: '', feelings: [] }
    useState<string>('memo-draft-day').value = ''
    useState('memo-draft-saved').value = { title: '', text: '', feelings: [] }

    const wrapper = await mountSuspended(MemoPage)
    await flushPromises()

    // Tidak ada kartu jurnal kosong; yang tampil hanya mood-nya.
    expect(wrapper.findAll('.pages > .entry')).toHaveLength(0)
    expect(wrapper.find('.pages > .empty').exists()).toBe(true)
    expect(wrapper.find('.moods .mood[aria-pressed="true"]').text()).toContain('🙂')

    wrapper.unmount()
  })
})
