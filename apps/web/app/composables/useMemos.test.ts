import {
  createHlcGenerator,
  createManualClock,
  createMemoryStorage,
  type CryptoProvider,
  type SecureKeyMaterial,
} from '@improve-personal/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'

import type { LocalDataSession } from '~/utils/storage/session'
import { createRecordWriter } from '~/utils/storage/record-writer'
import { createRepositorySet } from '~/utils/storage/repository'
import { createUuidV7Generator } from '~/utils/storage/uuid'
import { MEMO_TEXT_MAX } from '~/utils/memo'
import type { Memo } from '~/utils/memo'
import { loadMemoRecords, persistMemo } from '~/utils/memo/persistence'
import { resetSyncReloadersForTest } from '~/utils/sync/refresh'

import {
  resetMemosHydrationForTest,
  useMemos,
  waitForMemosWritesForTest,
  type MemoInput,
} from './useMemos'
import { useMemoDraft } from './useMemoDraft'

const INPUT: Omit<MemoInput, 'date'> = {
  title: '  Judul  ',
  text: ' Isi ',
  feelings: [],
  paper: 'krem',
}

/** Tanggal yang tidak dipakai data lain supaya hitungannya bersih. */
const DAY = '2019-12-31'
const OTHER_DAY = '2020-01-01'

const NOW_MS = 1_700_000_000_000
const DATA_KEY: SecureKeyMaterial = { kind: 'raw-32', handle: new Uint8Array(32) }

/** Kripto tiruan: isi record tetap "disandikan" supaya test wiring tidak butuh libsodium. */
const fakeProvider: CryptoProvider = {
  sealRecord: async ({ plaintext }) => Buffer.from(plaintext, 'utf8').toString('base64'),
  openRecord: async ({ blob }) => Buffer.from(blob, 'base64').toString('utf8'),
}

/** Sesi data lokal palsu di atas adaptor memori core - semua port lain nyata. */
function memorySession(): LocalDataSession {
  const clock = createManualClock(NOW_MS)
  const storage = createMemoryStorage({ clock })
  const hlc = createHlcGenerator({ deviceId: '018f2c4e-0000-7000-8000-0000000000d1', clock })

  return {
    storage,
    provider: fakeProvider,
    clock,
    dataKey: DATA_KEY,
    hlc,
    deviceId: '018f2c4e-0000-7000-8000-0000000000d1',
    userId: '018f2c4e-0000-7000-8000-00000000000a',
    isFreshKey: true,
    keyStore: {
      has: async () => false,
      put: async () => undefined,
      get: async () => null,
      remove: async () => undefined,
    },
    newId: createUuidV7Generator({ clock }),
    withMasterKey: async (work) => work(new Uint8Array(32)),
    repos: createRepositorySet({ storage, provider: fakeProvider, dataKey: DATA_KEY }),
    writer: createRecordWriter({ storage, provider: fakeProvider, dataKey: DATA_KEY, hlc, clock }),
  }
}

const STATE_KEYS = ['memos', 'memosStatus', 'memosError', 'memosUnsaved', 'memo-paper'] as const

describe('useMemos', () => {
  beforeEach(() => {
    localStorage.clear()
    clearNuxtState([...STATE_KEYS])
    resetMemosHydrationForTest()
  })

  it('isi kosong ditolak; entri baru dirapikan & masuk paling atas', () => {
    const { memos, save } = useMemos()
    expect(save({ ...INPUT, date: DAY, text: '  ' })).toBeNull()
    const saved = save({ ...INPUT, date: DAY })
    expect(saved).not.toBeNull()
    expect(memos.value[0]).toMatchObject({ title: 'Judul', text: 'Isi', date: DAY })
    expect(new Date(memos.value[0]?.createdAt ?? 0).getHours()).toBe(20)
  })

  it('simpan ulang di tanggal yang sama memperbarui halaman itu, bukan menambah halaman', () => {
    const { memos, save, memoOn } = useMemos()
    const first = save({ ...INPUT, date: DAY })
    if (!first) throw new Error('simpan pertama gagal')

    const second = save({
      ...INPUT,
      date: DAY,
      title: '  Judul baru  ',
      text: ' Isi baru ',
      feelings: ['tenang'],
    })

    const pages = memos.value.filter((memo) => memo.date === DAY)
    expect(pages).toHaveLength(1)
    expect(second?.id).toBe(first.id)
    expect(pages[0]).toMatchObject({
      id: first.id,
      createdAt: first.createdAt,
      title: 'Judul baru',
      text: 'Isi baru',
      feelings: ['tenang'],
    })
    expect(memoOn(DAY)?.id).toBe(first.id)
  })

  it('tanggal berbeda tetap jadi halaman terpisah', () => {
    const { memos, save } = useMemos()
    save({ ...INPUT, date: DAY })
    save({ ...INPUT, date: OTHER_DAY })
    expect(memos.value.filter((memo) => memo.date === DAY || memo.date === OTHER_DAY)).toHaveLength(
      2,
    )
  })

  it('mood satu per hari: ganti & hapus', () => {
    const { setMood, moodOn, memos } = useMemos()
    setMood('2026-10-01', 3)
    setMood('2026-10-01', 1)
    expect(moodOn('2026-10-01')).toBe(1)
    setMood('2026-10-01', null)
    expect(moodOn('2026-10-01')).toBeNull()
    setMood('2026-10-01', 9)
    expect(moodOn('2026-10-01')).toBeNull()
    // Mood tanpa tulisan bukan halaman jurnal: tidak ikut muncul di daftar.
    expect(memos.value.some((memo) => memo.date === '2026-10-01')).toBe(false)
  })

  it('hapus entri', () => {
    const { memos, save, remove } = useMemos()
    const saved = save({ ...INPUT, date: DAY })
    if (!saved) throw new Error('simpan gagal')

    remove(saved.id)
    expect(memos.value.some((memo) => memo.id === saved.id)).toBe(false)
  })

  it('halaman bertahan setelah reload: hydrate dari record terenkripsi, bukan mock', async () => {
    const session = memorySession()
    const first = useMemos({ session: async () => session })
    await first.hydrate()

    const saved = first.save({ ...INPUT, date: DAY, text: '  Catatan yang harus bertahan.  ' })
    if (!saved) throw new Error('simpan gagal')

    await vi.waitFor(async () => {
      const records = await loadMemoRecords(session, 'krem')
      expect(records.entries.map((memo) => memo.text)).toContain('Catatan yang harus bertahan.')
    })

    // Reload penuh: state + hydrate in-flight dibuang, yang tersisa hanya repository.
    clearNuxtState([...STATE_KEYS])
    resetMemosHydrationForTest()
    const afterReload = useMemos({ session: async () => session })
    await afterReload.hydrate()

    expect(afterReload.memos.value.map((memo) => memo.text)).toEqual([
      'Catatan yang harus bertahan.',
    ])
    expect(afterReload.memoOn(DAY)?.id).toBe(saved.id)
  })

  it('simpan ulang setelah reload tetap satu record per tanggal', async () => {
    const session = memorySession()
    const first = useMemos({ session: async () => session })
    await first.hydrate()
    const saved = first.save({ ...INPUT, date: DAY, text: 'Versi pertama.' })
    if (!saved) throw new Error('simpan gagal')

    await vi.waitFor(async () => {
      expect((await loadMemoRecords(session, 'krem')).entries).toHaveLength(1)
    })

    clearNuxtState([...STATE_KEYS])
    resetMemosHydrationForTest()
    const reloaded = useMemos({ session: async () => session })
    await reloaded.hydrate()

    reloaded.save({ ...INPUT, date: DAY, text: 'Versi kedua setelah reload.' })

    await vi.waitFor(async () => {
      const records = await loadMemoRecords(session, 'krem')
      expect(records.entries).toHaveLength(1)
      expect(records.entries[0]?.text).toBe('Versi kedua setelah reload.')
      expect(records.entries[0]?.id).toBe(saved.id)
    })
  })

  it('mood dan judul ikut bertahan setelah reload', async () => {
    const session = memorySession()
    const first = useMemos({ session: async () => session })
    await first.hydrate()

    first.setMood(DAY, 4)
    first.save({ ...INPUT, date: DAY, title: '  Hari tenang  ', text: 'Isi hari tenang.' })

    await vi.waitFor(async () => {
      const records = await loadMemoRecords(session, 'krem')
      expect(records.moods[DAY]).toBe(4)
      expect(records.entries[0]?.title).toBe('Hari tenang')
    })

    clearNuxtState([...STATE_KEYS])
    resetMemosHydrationForTest()
    const afterReload = useMemos({ session: async () => session })
    await afterReload.hydrate()

    expect(afterReload.moodOn(DAY)).toBe(4)
    expect(afterReload.memoOn(DAY)?.title).toBe('Hari tenang')
    expect(afterReload.memoOn(DAY)?.feelings).toEqual([])
  })

  it('mood tanpa tulisan tetap ada setelah reload, dan bukan halaman jurnal', async () => {
    const session = memorySession()
    const first = useMemos({ session: async () => session })
    await first.hydrate()
    first.setMood(DAY, 2)

    await vi.waitFor(async () => {
      expect((await loadMemoRecords(session, 'krem')).moods[DAY]).toBe(2)
    })

    clearNuxtState([...STATE_KEYS])
    resetMemosHydrationForTest()
    const afterReload = useMemos({ session: async () => session })
    await afterReload.hydrate()

    expect(afterReload.moodOn(DAY)).toBe(2)
    expect(afterReload.memoOn(DAY)).toBeNull()
    expect(afterReload.memos.value).toHaveLength(0)

    // Menghapus mood menghapus record mood-saja, bukan meninggalkan baris kosong.
    afterReload.setMood(DAY, null)
    await vi.waitFor(async () => {
      const records = await loadMemoRecords(session, 'krem')
      expect(records.moods[DAY]).toBeUndefined()
      expect(records.entries).toHaveLength(0)
    })
  })

  it('hapus halaman jadi tombstone dan tidak hidup lagi setelah reload', async () => {
    const session = memorySession()
    const first = useMemos({ session: async () => session })
    await first.hydrate()
    const saved = first.save({ ...INPUT, date: DAY, text: 'Akan dihapus.' })
    if (!saved) throw new Error('simpan gagal')

    await vi.waitFor(async () => {
      expect((await loadMemoRecords(session, 'krem')).entries).toHaveLength(1)
    })

    first.remove(saved.id)
    await vi.waitFor(async () => {
      expect((await loadMemoRecords(session, 'krem')).entries).toHaveLength(0)
    })

    clearNuxtState([...STATE_KEYS])
    resetMemosHydrationForTest()
    const afterReload = useMemos({ session: async () => session })
    await afterReload.hydrate()

    expect(afterReload.memos.value).toHaveLength(0)
  })

  it('menghapus tulisan mempertahankan mood hari itu', async () => {
    const session = memorySession()
    const { save, remove, setMood, moodOn, memos } = useMemos({ session: async () => session })

    setMood(DAY, 3)
    const saved = save({ ...INPUT, date: DAY, text: 'Halaman dengan mood.' })
    if (!saved) throw new Error('simpan gagal')

    remove(saved.id)

    expect(moodOn(DAY)).toBe(3)
    expect(memos.value).toHaveLength(0)

    await vi.waitFor(async () => {
      const records = await loadMemoRecords(session, 'krem')
      expect(records.moods[DAY]).toBe(3)
      expect(records.entries).toHaveLength(1)
      expect(records.entries[0]?.text).toBe('')
    })
  })

  it('reload di tengah draf + catatan review goal: dua-duanya selamat', async () => {
    const session = memorySession()
    const first = useMemos({ session: async () => session })
    await first.hydrate()

    const before = useMemoDraft()
    before.showDay(DAY, first.memoOn(DAY))
    before.draft.value.text = 'Draf saya yang belum disimpan'

    // Penulis lain (perangkat/halaman lain) menambah catatan ke halaman tanggal yang sama.
    first.append(DAY, 'Catatan review goal')
    await vi.waitFor(async () => {
      const records = await loadMemoRecords(session, 'krem')
      expect(records.entries[0]?.text).toContain('Catatan review goal')
    })

    // Reload: state Nuxt + komposabel dibuang, localStorage draf & repository tetap.
    clearNuxtState([
      ...STATE_KEYS,
      'memo-draft',
      'memo-draft-day',
      'memo-draft-saved',
      'memo-draft-held',
    ])
    resetMemosHydrationForTest()
    const reloaded = useMemos({ session: async () => session })
    await reloaded.hydrate()

    const after = useMemoDraft()
    after.showDay(DAY, reloaded.memoOn(DAY))
    const values = after.prepareSave(DAY, reloaded.memoOn(DAY))

    expect(values.text).toContain('Catatan review goal')
    expect(values.text).toContain('Draf saya yang belum disimpan')
  })

  it('append saat batas panjang tercapai tidak membuang catatan yang baru masuk', () => {
    const { append, memoOn } = useMemos()
    const page = append(DAY, 'A'.repeat(MEMO_TEXT_MAX))
    if (!page) throw new Error('append gagal')

    append(DAY, 'Catatan review goal')

    const text = memoOn(DAY)?.text ?? ''
    expect(text).toHaveLength(MEMO_TEXT_MAX)
    expect(text).toContain('Catatan review goal')
  })
})

describe('useMemos: muat ulang setelah pull (AC T77)', () => {
  beforeEach(async () => {
    // Tulisan dari kasus sebelumnya diselesaikan dulu: membuang state di tengah tulisan membuat
    // jalur kegagalannya membaca `useState` yang sudah tidak ada.
    await waitForMemosWritesForTest()
    localStorage.clear()
    clearNuxtState([...STATE_KEYS, 'goalLinks'])
    resetMemosHydrationForTest()
    resetSyncReloadersForTest()
  })

  function memoOf(session: LocalDataSession, date: string, text: string): Memo {
    return {
      id: session.newId(),
      date,
      createdAt: NOW_MS,
      title: '',
      text,
      feelings: [],
      paper: 'krem',
    }
  }

  /** Sesi yang tulisannya ditahan sampai `release()` - antrean tulis yang belum mendarat. */
  function withWriteGate(session: LocalDataSession): {
    readonly session: LocalDataSession
    readonly release: () => void
  } {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const writer = session.writer

    return {
      release,
      session: {
        ...session,
        writer: {
          ...writer,
          write: async (input) => {
            await gate
            return writer.write(input)
          },
        },
      },
    }
  }

  it('reload memuat halaman dari perangkat lain tanpa pernah berstatus loading', async () => {
    const session = memorySession()
    await persistMemo(session, memoOf(session, DAY, 'Lokal'), null)

    const { memos, hydrate, reload, status } = useMemos({ session: async () => session })
    await hydrate()
    expect(memos.value.map((memo) => memo.text)).toEqual(['Lokal'])

    await persistMemo(session, memoOf(session, OTHER_DAY, 'Dari perangkat lain'), null)

    const pending = reload()
    expect(status.value).toBe('ready')
    await pending

    expect(memos.value.map((memo) => memo.text).sort()).toEqual(['Dari perangkat lain', 'Lokal'])
    expect(status.value).toBe('ready')
  })

  it('reload menunggu tulisan jurnal yang belum mendarat', async () => {
    const gated = withWriteGate(memorySession())
    const { memos, save, hydrate, reload } = useMemos({ session: async () => gated.session })
    await hydrate()

    // Spy dipasang setelah hydrate: yang diuji hanya pembacaan milik reload.
    const listAll = vi.spyOn(gated.session.repos.journal, 'listAll')

    const saved = save({ ...INPUT, date: DAY })
    if (!saved) throw new Error('simpan gagal')

    const pending = reload()
    await flushPromises()
    // Belum membaca selama antrean tulis masih ditahan: hitungan ini yang menjaga tulisan lokal.
    expect(listAll).not.toHaveBeenCalled()
    expect(memos.value.map((memo) => memo.id)).toContain(saved.id)

    gated.release()
    await pending
    expect(listAll).toHaveBeenCalled()
    expect(memos.value.map((memo) => memo.id)).toContain(saved.id)
  })

  it('store yang belum pernah di-hydrate tidak memuat apa pun', async () => {
    const getSession = vi.fn(async () => null)
    const { status, reload } = useMemos({ session: getSession })
    await vi.waitFor(() => expect(status.value).toBe('idle'))
    getSession.mockClear()

    await reload()

    expect(getSession).not.toHaveBeenCalled()
    expect(status.value).toBe('idle')
  })

  it('reload yang gagal menandai status error beserta pesannya', async () => {
    const session = memorySession()
    const { hydrate, reload, status, error } = useMemos({ session: async () => session })
    await hydrate()

    vi.spyOn(session.repos.journal, 'listAll').mockRejectedValue(new Error('storage rusak'))
    await reload()

    expect(status.value).toBe('error')
    expect(error.value).toBe('storage rusak')
  })
})

/**
 * BUG-83: `useState` bisa kosong (`clearNuxtState` saat logout/test) selagi tulisan masih di
 * antrean. Lanjutan async-nya TIDAK boleh melempar, dan halaman yang sudah tidak ada di memori tidak
 * boleh meninggalkan banner "belum tersimpan".
 */
describe('useMemos: state dibuang di tengah tulisan (BUG-83)', () => {
  beforeEach(async () => {
    await waitForMemosWritesForTest()
    localStorage.clear()
    clearNuxtState([...STATE_KEYS])
    resetMemosHydrationForTest()
  })

  /** Sesi baru dijawab setelah `release()`, jadi tulisan masih menggantung saat state dibuang. */
  function gatedSession(answer: LocalDataSession | null): {
    readonly getSession: () => Promise<LocalDataSession | null>
    readonly release: () => void
  } {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })

    return {
      release,
      getSession: async () => {
        await gate
        return answer
      },
    }
  }

  /** Penyimpanan yang menahan tulisan sampai `release()` - antrean tulis belum mendarat. */
  function gatedWriter(session: LocalDataSession): {
    readonly session: LocalDataSession
    readonly release: () => void
  } {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const writer = session.writer

    return {
      release,
      session: {
        ...session,
        writer: {
          ...writer,
          write: async (input) => {
            await gate
            return writer.write(input)
          },
        },
      },
    }
  }

  it('tulisan gagal setelah state dibersihkan tidak melempar & tidak meninggalkan banner', async () => {
    const gated = gatedSession(null)
    const memos = useMemos({ session: gated.getSession })
    const saved = memos.save({ ...INPUT, date: DAY })
    if (!saved) throw new Error('simpan tidak diantrekan')
    const write = memos.waitForSave(saved.id)

    // Logout/teardown membuang state Nuxt selagi tulisan masih di antrean.
    clearNuxtState([...STATE_KEYS])
    gated.release()

    // Kontrak antrean tidak berubah: selesai dengan `false`, bukan reject.
    await expect(write).resolves.toBe(false)

    const after = useMemos({ session: async () => null })
    expect(after.hasUnsaved(DAY)).toBe(false)
    expect(after.memos.value).toHaveLength(0)
  })

  it('tulisan sukses setelah state dibersihkan tidak melempar saat menyegarkan halaman', async () => {
    const gated = gatedWriter(memorySession())
    const memos = useMemos({ session: async () => gated.session })
    await memos.hydrate()

    const saved = memos.save({ ...INPUT, date: DAY })
    if (!saved) throw new Error('simpan tidak diantrekan')
    const write = memos.waitForSave(saved.id)

    clearNuxtState([...STATE_KEYS])
    gated.release()

    await expect(write).resolves.toBe(true)

    const after = useMemos({ session: async () => null })
    expect(after.memos.value).toHaveLength(0)
    expect(after.hasUnsaved(DAY)).toBe(false)
  })
})
