import 'fake-indexeddb/auto'

import { IDBFactory } from 'fake-indexeddb'
import { createManualClock, type ManualClock } from '@improve-personal/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Memo } from '~/utils/memo'
import { loadMemoRecords, persistMemo } from '~/utils/memo/persistence'
import { openLocalDataSession, type LocalDataSession } from '~/utils/storage/session'

import { MEMO_DRAFT_PREFIX, useMemoDraft } from './useMemoDraft'
import { resetMemosHydrationForTest, useMemos } from './useMemos'

/**
 * QA #71 - verifikasi independen BUG-65-01 & RISK-65-02 di atas sesi data lokal SUNGGUHAN
 * (fake-indexeddb + kripto sodium asli). Yang diganti hanya batas penyimpanan (`session.writer`),
 * supaya kegagalan tulisnya realistis (quota penuh / IndexedDB diblokir) tanpa memalsukan
 * composable, repository, atau enkripsi.
 *
 * Bukti yang dicari:
 * a. tulis gagal -> draf TETAP ada, tanggal ditandai belum tersimpan, halaman tetap di memori;
 *    retry setelah storage pulih -> tersimpan, lalu draf baru dibuang (d).
 * b. kegagalan tulis tidak mengubah `status` hydrate (regresi penyebab halaman hilang).
 * c. dua tab: simpan dari salinan basi menggabungkan catatan tab lain, bukan menghapusnya;
 *    satu record per tanggal.
 * e. pindah tanggal selama tulisan berjalan tidak menghapus/menimpa draf tanggal lain.
 * f. hapus entri tidak dihidupkan lagi oleh hydrate/merge, termasuk saat hydrate berjalan bersamaan.
 */

Object.defineProperty(globalThis, 'isSecureContext', { value: true, configurable: true })
Object.defineProperty(globalThis.navigator, 'locks', {
  value: { request: (_name: string, work: () => unknown) => work() },
  configurable: true,
})

const USER_ID = '018f2c4e-0000-7000-8000-00000000000a'
const DAY = '2025-09-09'
const OTHER_DAY = '2025-09-08'
const START_MS = new Date(2025, 8, 9, 21, 0, 0).getTime()
const DRAFT_KEY = MEMO_DRAFT_PREFIX + DAY
const OTHER_DRAFT_KEY = MEMO_DRAFT_PREFIX + OTHER_DAY

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

const PAPER = 'krem'

let counter = 0

function names(): string {
  counter += 1
  return `ip-memo71-qa-${counter}`
}

type TestSession = LocalDataSession & { readonly clock: ManualClock }

async function open(databaseName: string, startMs = START_MS): Promise<TestSession> {
  const clock = createManualClock(startMs)
  const session = await openLocalDataSession({
    userId: USER_ID,
    clock,
    databaseName,
    keysDatabaseName: `${databaseName}-keys`,
  })
  return { ...session, clock }
}

type Gate = {
  readonly session: TestSession
  /** Storage pulih: tulisan berikutnya benar-benar sampai ke IndexedDB. */
  allow: () => void
  /** Tahan tulisan (storage lambat) sampai fungsi yang dikembalikan dipanggil. */
  hold: () => () => void
}

/**
 * Penyimpanan yang menolak menulis (QuotaExceededError) atau menunda tulisan.
 * `writer` adalah batas penyimpanan yang dipakai seluruh jalur tulis record, jadi kegagalannya
 * terjadi setelah enkripsi - persis seperti IndexedDB penuh, bukan seperti composable yang di-mock.
 */
function gated(session: TestSession): Gate {
  let blocked = true
  let pending: Promise<void> | null = null
  let release: (() => void) | null = null

  const beforeWrite = async (): Promise<void> => {
    if (blocked) throw new Error('QuotaExceededError: storage penuh')
    if (pending !== null) await pending
  }

  const writer = {
    ...session.writer,
    write: async (input: Parameters<typeof session.writer.write>[0]) => {
      await beforeWrite()
      return session.writer.write(input)
    },
    remove: async (input: Parameters<typeof session.writer.remove>[0]) => {
      await beforeWrite()
      return session.writer.remove(input)
    },
  }

  return {
    session: { ...session, writer },
    allow: () => {
      blocked = false
    },
    hold: () => {
      pending = new Promise<void>((resolve) => {
        release = () => {
          pending = null
          resolve()
        }
      })
      return () => release?.()
    },
  }
}

function resetMemoState(): void {
  clearNuxtState([...MEMO_STATES])
  resetMemosHydrationForTest()
}

function memo(id: string, overrides: Partial<Memo> = {}): Memo {
  return {
    id,
    date: DAY,
    createdAt: START_MS,
    title: '',
    text: '',
    feelings: [],
    paper: PAPER,
    ...overrides,
  }
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  localStorage.clear()
  resetMemoState()
})

describe('QA #71 (a) tulis gagal: draf & halaman bertahan, error terlihat, retry menyimpan', () => {
  it('storage penuh: draf utuh + tanda belum tersimpan, retry setelah pulih tersimpan lalu draf dibuang', async () => {
    const base = await open(names())
    const gate = gated(base)
    const memos = useMemos({ session: async () => gate.session })
    await memos.hydrate()

    // Alur MemoEditor.save(): tampilkan hari, ketik, tahan draf, simpan, tunggu konfirmasi.
    const editor = useMemoDraft()
    editor.showDay(DAY, memos.memoOn(DAY))
    editor.draft.value.text = 'Tulisan yang tidak boleh hilang.'
    editor.hold(DAY)
    expect(localStorage.getItem(DRAFT_KEY)).toContain('Tulisan yang tidak boleh hilang.')

    const page = memos.save({
      date: DAY,
      ...editor.prepareSave(DAY, memos.memoOn(DAY)),
      paper: PAPER,
    })
    if (page === null) throw new Error('simpan tidak diantrekan')

    expect(await memos.waitForSave(page.id)).toBe(false)

    // Gagal itu TERLIHAT: error terisi, tanggal masuk daftar belum tersimpan.
    expect(memos.error.value).toContain('QuotaExceededError')
    expect(memos.hasUnsaved(DAY)).toBe(true)
    // Draf adalah satu-satunya salinan tulisan user: tidak boleh dihapus.
    expect(localStorage.getItem(DRAFT_KEY)).toContain('Tulisan yang tidak boleh hilang.')
    // Halaman tetap hidup di memori walau penyimpanan benar-benar kosong.
    expect(memos.memoOn(DAY)?.text).toBe('Tulisan yang tidak boleh hilang.')
    expect((await loadMemoRecords(base, PAPER)).entries).toHaveLength(0)

    // Watcher editor melihat halaman optimistis yang isinya sama dengan draf: TETAP tidak dihapus
    // karena tanggalnya ditahan (`hold`).
    editor.showDay(DAY, memos.memoOn(DAY))
    expect(localStorage.getItem(DRAFT_KEY)).toContain('Tulisan yang tidak boleh hilang.')

    // "Coba lagi" memakai jalur simpan yang sama setelah storage pulih.
    gate.allow()
    const retry = memos.save({
      date: DAY,
      ...editor.prepareSave(DAY, memos.memoOn(DAY)),
      paper: PAPER,
    })
    if (retry === null) throw new Error('retry tidak diantrekan')
    expect(await memos.waitForSave(retry.id)).toBe(true)
    expect(memos.hasUnsaved(DAY)).toBe(false)
    expect(memos.error.value).toBeNull()

    // Sukses: editor memuat halaman yang benar-benar tersimpan, baru draf dilepas.
    editor.load(memos.memoOn(DAY) ?? retry, DAY)
    editor.release(DAY)
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull()

    const stored = (await loadMemoRecords(base, PAPER)).entries
    expect(stored).toHaveLength(1)
    expect(stored[0]?.id).toBe(page.id)
    expect(stored[0]?.text).toBe('Tulisan yang tidak boleh hilang.')
  })

  it('setelah gagal, reload (state memori hilang) tetap memulihkan tulisan dari draf', async () => {
    const base = await open(names())
    const gate = gated(base)
    const memos = useMemos({ session: async () => gate.session })
    await memos.hydrate()

    const editor = useMemoDraft()
    editor.showDay(DAY, null)
    editor.draft.value.text = 'Tulisan dari sesi yang gagal.'
    editor.hold(DAY)

    const page = memos.save({
      date: DAY,
      ...editor.prepareSave(DAY, memos.memoOn(DAY)),
      paper: PAPER,
    })
    if (page === null) throw new Error('simpan tidak diantrekan')
    expect(await memos.waitForSave(page.id)).toBe(false)
    expect(localStorage.getItem(DRAFT_KEY)).toContain('Tulisan dari sesi yang gagal.')

    // Reload penuh: state memori (`useState`) hilang, penyimpanan perangkat masih kosong.
    clearNuxtState([...MEMO_STATES])
    resetMemosHydrationForTest()
    const reloaded = useMemos({ session: async () => gate.session })
    await reloaded.hydrate()
    expect(reloaded.memoOn(DAY)).toBeNull()

    const reopened = useMemoDraft()
    reopened.showDay(DAY, reloaded.memoOn(DAY))
    expect(reopened.draft.value.text).toBe('Tulisan dari sesi yang gagal.')
  })
})

describe('QA #71 (b) status hydrate tidak berubah jadi error', () => {
  it('kegagalan tulis tidak mengubah status dan halaman tidak hilang saat hydrate berikutnya', async () => {
    const base = await open(names())
    const gate = gated(base)
    const memos = useMemos({ session: async () => gate.session })
    await memos.hydrate()
    expect(memos.status.value).toBe('ready')

    const page = memos.save({
      date: DAY,
      title: 'Judul',
      text: 'Belum tersimpan, tapi tidak boleh hilang.',
      feelings: ['tenang'],
      paper: PAPER,
    })
    if (page === null) throw new Error('simpan tidak diantrekan')
    expect(await memos.waitForSave(page.id)).toBe(false)

    // Inti regresi lama: status dulu jadi 'error', sehingga hydrate berikutnya mengganti store
    // dengan snapshot storage (kosong) dan halaman ini lenyap dari memori.
    expect(memos.status.value).toBe('ready')
    expect(memos.memos.value).toHaveLength(1)

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
    expect((await loadMemoRecords(base, PAPER)).entries).toHaveLength(0)
  })

  it('hydrate dengan tulisan tertunda tidak menghapus banner "belum tersimpan"', async () => {
    const base = await open(names())
    const gate = gated(base)
    const memos = useMemos({ session: async () => gate.session })
    await memos.hydrate()

    const page = memos.save({
      date: DAY,
      title: '',
      text: 'Masih menunggu penyimpanan.',
      feelings: [],
      paper: PAPER,
    })
    if (page === null) throw new Error('simpan tidak diantrekan')
    expect(await memos.waitForSave(page.id)).toBe(false)

    clearNuxtState(['memosStatus'])
    resetMemosHydrationForTest()
    const after = useMemos({ session: async () => gate.session })
    await after.hydrate()

    expect(after.status.value).toBe('ready')
    expect(after.hasUnsaved(DAY)).toBe(true)
    // Pesan kegagalan tulis tidak dibersihkan oleh hydrate yang sukses.
    expect(after.error.value).toContain('QuotaExceededError')
  })
})

describe('QA #71 (c) dua tab tidak saling menimpa', () => {
  it('tab basi menyimpan: catatan tab lain tetap ada, satu record per tanggal', async () => {
    const databaseName = names()
    const tabA = await open(databaseName)
    const tabB = await open(databaseName, START_MS + 60_000)

    const seedId = tabA.newId()
    const seed = memo(seedId, { text: 'Tulisan awal.' })
    await persistMemo(tabA, seed, null)

    // Tab B membuka halaman: salinannya berhenti di "Tulisan awal.".
    const memosB = useMemos({ session: async () => tabB })
    await memosB.hydrate()
    expect(memosB.memoOn(DAY)?.text).toBe('Tulisan awal.')

    // Tab A menyunting & menulis lebih dulu (memori tab B tidak tahu apa-apa).
    const aVersion = 'Tulisan awal.\n\nCatatan penting dari tab A.'
    await persistMemo(tabA, { ...seed, text: aVersion }, null)

    // Tab B menyimpan dari salinan basi.
    const page = memosB.save({
      date: DAY,
      title: '',
      text: 'Tulisan awal.\n\nTambahan dari tab B.',
      feelings: [],
      paper: PAPER,
    })
    if (page === null) throw new Error('simpan tab B tidak diantrekan')
    expect(await memosB.waitForSave(page.id)).toBe(true)

    const stored = (await loadMemoRecords(tabB, PAPER)).entries
    expect(stored).toHaveLength(1)
    expect(stored[0]?.text).toContain('Catatan penting dari tab A')
    expect(stored[0]?.text).toContain('Tambahan dari tab B')
    // Tidak menduplikasi catatan luar & state tab B memakai versi gabungan yang ditulis.
    expect(stored[0]?.text.match(/Catatan penting dari tab A/g)).toHaveLength(1)
    expect(memosB.memoOn(DAY)?.text).toBe(stored[0]?.text)
    expect(memosB.hasUnsaved(DAY)).toBe(false)
  })

  it('tab yang tidak basi tidak menduplikasi isinya sendiri', async () => {
    const session = await open(names())
    const seed = memo(session.newId(), { text: 'Tulisan awal.' })
    await persistMemo(session, seed, null)

    const memos = useMemos({ session: async () => session })
    await memos.hydrate()

    const page = memos.save({
      date: DAY,
      title: '',
      text: 'Tulisan awal.\n\nRevisi saya.',
      feelings: [],
      paper: PAPER,
    })
    if (page === null) throw new Error('simpan tidak diantrekan')
    expect(await memos.waitForSave(page.id)).toBe(true)

    const stored = (await loadMemoRecords(session, PAPER)).entries
    expect(stored).toHaveLength(1)
    expect(stored[0]?.text).toBe('Tulisan awal.\n\nRevisi saya.')
  })

  it('dua tab menambah catatan berbeda berturut-turut: keduanya bertahan', async () => {
    const databaseName = names()
    const tabA = await open(databaseName)
    const tabB = await open(databaseName, START_MS + 60_000)

    const seed = memo(tabA.newId(), { text: 'Halaman bersama.' })
    await persistMemo(tabA, seed, null)

    const memosB = useMemos({ session: async () => tabB })
    await memosB.hydrate()

    await persistMemo(tabA, { ...seed, text: 'Halaman bersama.\n\nDari A.' }, null)
    const pageB = memosB.save({
      date: DAY,
      title: '',
      text: 'Halaman bersama.\n\nDari B.',
      feelings: [],
      paper: PAPER,
    })
    if (pageB === null) throw new Error('simpan B tidak diantrekan')
    expect(await memosB.waitForSave(pageB.id)).toBe(true)

    // Tab A menyimpan lagi dari versinya sendiri (yang tidak memuat catatan B).
    await persistMemo(
      tabA,
      { ...seed, text: 'Halaman bersama.\n\nDari A.\n\nDari A lagi.' },
      null,
      { base: { ...seed, text: 'Halaman bersama.\n\nDari A.' } },
    )

    const stored = await loadMemoRecords(tabA, PAPER)
    expect(stored.entries).toHaveLength(1)
    expect(stored.entries[0]?.text).toContain('Dari A lagi.')
    // Catatan B tetap ada: merge tiga arah memakai isi penyimpanan sebagai `current`, jadi catatan
    // tab B (yang tidak terlihat tab A) tidak boleh hilang. Assertion harus tegas - `A || B` akan
    // lolos walau catatan tab B benar-benar hilang, karena 'Dari A lagi.' selalu ada.
    const text = stored.entries[0]?.text ?? ''
    expect(text).toContain('Dari B')
    expect(text).toContain('Dari A lagi.')
  })
})

describe('QA #71 temuan QA: sesi data lokal tidak tersedia', () => {
  it('simpan saat sesi lokal hilang GAGAL: draf dipertahankan, lalu retry setelah sesi pulih menulis', async () => {
    const base = await open(names())
    let available = true
    // Sesi lokal hilang di tengah sesi: kunci terkunci, sesi auth kedaluwarsa, atau storage gagal
    // dibuka - `useLocalData.ensure()` mengembalikan `null` untuk semuanya.
    const memos = useMemos({ session: async () => (available ? base : null) })
    await memos.hydrate()
    expect(memos.status.value).toBe('ready')

    const editor = useMemoDraft()
    editor.showDay(DAY, null)
    editor.draft.value.text = 'Tulisan saat kunci lokal tidak bisa dibuka.'
    editor.hold(DAY)

    available = false
    const page = memos.save({
      date: DAY,
      ...editor.prepareSave(DAY, memos.memoOn(DAY)),
      paper: PAPER,
    })
    if (page === null) throw new Error('simpan tidak diantrekan')

    // BUG-71-01: tidak ada satu byte pun yang tertulis, jadi ini KEGAGALAN - bukan sukses. Draf
    // adalah satu-satunya salinan tulisan user dan tidak boleh dihapus pemanggil.
    expect(await memos.waitForSave(page.id)).toBe(false)
    expect(memos.hasUnsaved(DAY)).toBe(true)
    expect(memos.error.value).not.toBeNull()
    expect(localStorage.getItem(DRAFT_KEY)).toContain('Tulisan saat kunci lokal tidak bisa dibuka.')
    expect(memos.memoOn(DAY)?.text).toBe('Tulisan saat kunci lokal tidak bisa dibuka.')
    expect((await loadMemoRecords(base, PAPER)).entries).toHaveLength(0)

    // Sesi pulih -> "Coba lagi" memakai jalur simpan yang sama, antrean tidak dibuang.
    available = true
    const retry = memos.save({
      date: DAY,
      ...editor.prepareSave(DAY, memos.memoOn(DAY)),
      paper: PAPER,
    })
    if (retry === null) throw new Error('retry tidak diantrekan')
    expect(await memos.waitForSave(retry.id)).toBe(true)
    expect(memos.hasUnsaved(DAY)).toBe(false)
    expect(memos.error.value).toBeNull()

    editor.load(memos.memoOn(DAY) ?? retry, DAY)
    editor.release(DAY)
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull()

    const stored = (await loadMemoRecords(base, PAPER)).entries
    expect(stored).toHaveLength(1)
    expect(stored[0]?.text).toBe('Tulisan saat kunci lokal tidak bisa dibuka.')
  })

  it('append & setMood saat sesi lokal hilang juga gagal, bukan pura-pura tersimpan', async () => {
    const base = await open(names())
    const MOOD_DAY = '2025-09-07'
    let available = true
    const memos = useMemos({ session: async () => (available ? base : null) })
    await memos.hydrate()
    available = false

    // Jalur penulis lain (kartu review goal) memakai `append` -> `save` -> antrean yang sama.
    const appended = memos.append(DAY, 'Catatan dari kartu review.')
    if (appended === null) throw new Error('append tidak diantrekan')
    expect(await memos.waitForSave(appended.id)).toBe(false)
    expect(memos.hasUnsaved(DAY)).toBe(true)
    expect(memos.error.value).not.toBeNull()

    // Mood tanpa tulisan juga menulis record: kegagalannya harus terlihat, bukan hilang diam-diam.
    memos.setMood(MOOD_DAY, 3)
    await vi.waitFor(() => {
      expect(memos.hasUnsaved(MOOD_DAY)).toBe(true)
    })
    expect((await loadMemoRecords(base, PAPER)).moods[MOOD_DAY]).toBeUndefined()
  })
})

describe('QA #71 temuan QA: hapus halaman membersihkan tulisan tertunda', () => {
  it('halaman yang gagal ditulis lalu dihapus: unsaved/error bersih, tulisan basi tidak dihidupkan', async () => {
    const base = await open(names())
    const gate = gated(base)
    const memos = useMemos({ session: async () => gate.session })
    await memos.hydrate()

    const page = memos.save({
      date: DAY,
      title: '',
      text: 'Tulisan yang gagal lalu dihapus.',
      feelings: [],
      paper: PAPER,
    })
    if (page === null) throw new Error('simpan tidak diantrekan')
    expect(await memos.waitForSave(page.id)).toBe(false)
    expect(memos.hasUnsaved(DAY)).toBe(true)
    expect(memos.error.value).not.toBeNull()

    // Storage pulih, lalu user menghapus halaman itu (BUG-71-02).
    gate.allow()
    memos.remove(page.id)

    expect(memos.hasUnsaved(DAY)).toBe(false)
    expect(memos.error.value).toBeNull()
    expect(memos.memoOn(DAY)).toBeNull()
    await vi.waitFor(async () => {
      expect((await loadMemoRecords(base, PAPER)).entries).toHaveLength(0)
    })
    // Tidak ada tulisan basi yang menunggu: menunggu id lama tidak menulis apa pun lagi.
    expect(await memos.waitForSave(page.id)).toBe(true)
    expect((await loadMemoRecords(base, PAPER)).entries).toHaveLength(0)
  })

  it('halaman dikosongkan (mood tetap) yang gagal ditulis: "Coba lagi" mengulang tulisan kosong', async () => {
    const base = await open(names())
    let current: TestSession | null = base
    const memos = useMemos({ session: async () => current })
    await memos.hydrate()

    memos.setMood(DAY, 2)
    const page = memos.save({
      date: DAY,
      title: '',
      text: 'Tulisan yang akan dikosongkan.',
      feelings: [],
      paper: PAPER,
    })
    if (page === null) throw new Error('simpan tidak diantrekan')
    expect(await memos.waitForSave(page.id)).toBe(true)

    // Pengosongan (hapus dengan mood tetap) gagal ditulis.
    const gate = gated(base)
    current = gate.session
    memos.remove(page.id)
    expect(await memos.waitForSave(page.id)).toBe(false)
    expect(memos.hasUnsaved(DAY)).toBe(true)

    // "Coba lagi" dari editor mengirim draf kosong: tulisan kosong yang tertunda diulang, bukan
    // ditinggalkan bersama banner yang tidak bisa dibersihkan.
    gate.allow()
    const retried = memos.save({ date: DAY, title: '', text: '', feelings: [], paper: PAPER })
    if (retried === null) throw new Error('tulisan kosong tertunda tidak diulang')
    expect(await memos.waitForSave(retried.id)).toBe(true)
    expect(memos.hasUnsaved(DAY)).toBe(false)
    expect(memos.error.value).toBeNull()

    const stored = (await loadMemoRecords(base, PAPER)).entries
    expect(stored).toHaveLength(1)
    expect(stored[0]?.text).toBe('')
    expect(memos.moodOn(DAY)).toBe(2)
  })
})

describe('QA #71 (d) draf hanya dibuang setelah tulis terkonfirmasi', () => {
  it('selama tulisan berjalan (storage lambat) draf masih ada; setelah konfirmasi baru dibuang', async () => {
    const base = await open(names())
    const gate = gated(base)
    const memos = useMemos({ session: async () => gate.session })
    await memos.hydrate()

    const editor = useMemoDraft()
    editor.showDay(DAY, null)
    editor.draft.value.text = 'Tulisan yang sedang disimpan.'
    editor.hold(DAY)

    const finish = gate.hold()
    const page = memos.save({
      date: DAY,
      ...editor.prepareSave(DAY, memos.memoOn(DAY)),
      paper: PAPER,
    })
    if (page === null) throw new Error('simpan tidak diantrekan')

    // Tulisan belum selesai: halaman optimistis sudah ada di memori, draf TIDAK boleh hilang.
    editor.showDay(DAY, memos.memoOn(DAY))
    await Promise.resolve()
    expect(localStorage.getItem(DRAFT_KEY)).toContain('Tulisan yang sedang disimpan.')

    gate.allow()
    finish()
    expect(await memos.waitForSave(page.id)).toBe(true)
    // Konfirmasi datang -> load + release, draf baru hilang.
    editor.load(memos.memoOn(DAY) ?? page, DAY)
    editor.release(DAY)
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull()
    expect((await loadMemoRecords(base, PAPER)).entries[0]?.text).toBe(
      'Tulisan yang sedang disimpan.',
    )
  })
})

describe('QA #71 (e) pindah tanggal saat menyimpan', () => {
  it('tulisan selesai setelah pindah tanggal tidak menghapus/menimpa draf tanggal lain', async () => {
    const base = await open(names())
    const gate = gated(base)
    const memos = useMemos({ session: async () => gate.session })
    await memos.hydrate()

    const editor = useMemoDraft()
    editor.showDay(DAY, null)
    editor.draft.value.text = 'Tulisan hari pertama.'
    editor.hold(DAY)

    const finish = gate.hold()
    const page = memos.save({
      date: DAY,
      ...editor.prepareSave(DAY, memos.memoOn(DAY)),
      paper: PAPER,
    })
    if (page === null) throw new Error('simpan tidak diantrekan')

    // User pindah tanggal dan mengetik halaman lain sebelum tulisan pertama selesai.
    editor.showDay(OTHER_DAY, null)
    editor.draft.value.text = 'Tulisan hari kedua.'
    expect(localStorage.getItem(OTHER_DRAFT_KEY)).toContain('Tulisan hari kedua.')

    gate.allow()
    finish()
    expect(await memos.waitForSave(page.id)).toBe(true)
    editor.load(memos.memoOn(DAY) ?? page, DAY)
    editor.release(DAY)

    expect(localStorage.getItem(OTHER_DRAFT_KEY)).toContain('Tulisan hari kedua.')
    expect(editor.draft.value.text).toBe('Tulisan hari kedua.')
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull()
    const stored = (await loadMemoRecords(base, PAPER)).entries
    expect(stored.map((entry) => entry.date)).toEqual([DAY])
    expect(stored[0]?.text).toBe('Tulisan hari pertama.')
  })
})

describe('QA #71 (f) hapus entri tidak dihidupkan lagi', () => {
  it('hapus tanpa mood: tombstone, hydrate ulang tidak mengembalikan halaman', async () => {
    const base = await open(names())
    const memos = useMemos({ session: async () => base })
    await memos.hydrate()

    const page = memos.save({
      date: DAY,
      title: '',
      text: 'Tulisan yang mau dihapus.',
      feelings: [],
      paper: PAPER,
    })
    if (page === null) throw new Error('simpan tidak diantrekan')
    expect(await memos.waitForSave(page.id)).toBe(true)

    memos.remove(page.id)
    await vi.waitFor(async () => {
      expect((await loadMemoRecords(base, PAPER)).entries).toHaveLength(0)
    })
    expect(memos.memoOn(DAY)).toBeNull()

    clearNuxtState([...MEMO_STATES])
    resetMemosHydrationForTest()
    const after = useMemos({ session: async () => base })
    await after.hydrate()
    expect(after.memoOn(DAY)).toBeNull()
    expect(after.memos.value).toHaveLength(0)

    // Merge tidak menghidupkan kembali: penyimpanan pun tidak punya halaman itu lagi.
    expect((await loadMemoRecords(base, PAPER)).entries).toHaveLength(0)
  })

  it('hapus saat hydrate berjalan: hasil hydrate tidak menghidupkan halaman yang dihapus', async () => {
    const base = await open(names())
    const first = useMemos({ session: async () => base })
    await first.hydrate()
    const page = first.save({
      date: DAY,
      title: '',
      text: 'Halaman yang dihapus saat hydrate.',
      feelings: [],
      paper: PAPER,
    })
    if (page === null) throw new Error('simpan tidak diantrekan')
    expect(await first.waitForSave(page.id)).toBe(true)

    // Hydrate kedua di atas store yang SUDAH memuat halaman (situasi setelah pindah halaman).
    clearNuxtState(['memosStatus'])
    resetMemosHydrationForTest()
    const racing = useMemos({ session: async () => base })
    const hydration = racing.hydrate()
    racing.remove(page.id)
    await hydration

    expect(racing.memoOn(DAY)).toBeNull()
    expect(racing.memos.value).toHaveLength(0)
    await vi.waitFor(async () => {
      expect((await loadMemoRecords(base, PAPER)).entries).toHaveLength(0)
    })
  })

  it('isi halaman dikosongkan (mood tetap): merge tidak mengembalikan teks lama', async () => {
    const base = await open(names())
    const memos = useMemos({ session: async () => base })
    await memos.hydrate()

    memos.setMood(DAY, 2)
    const page = memos.save({
      date: DAY,
      title: '',
      text: 'Tulisan yang akan dikosongkan.',
      feelings: [],
      paper: PAPER,
    })
    if (page === null) throw new Error('simpan tidak diantrekan')
    expect(await memos.waitForSave(page.id)).toBe(true)

    memos.remove(page.id)
    await vi.waitFor(async () => {
      const stored = (await loadMemoRecords(base, PAPER)).entries
      expect(stored).toHaveLength(1)
      expect(stored[0]?.text).toBe('')
    })

    clearNuxtState([...MEMO_STATES])
    resetMemosHydrationForTest()
    const after = useMemos({ session: async () => base })
    await after.hydrate()
    expect(after.memoOn(DAY)?.text ?? '').toBe('')
    expect(after.moodOn(DAY)).toBe(2)
  })
})
