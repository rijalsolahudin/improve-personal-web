import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MEMO_TEXT_MAX, MEMO_TITLE_MAX, type Memo } from '~/utils/memo'

import { MEMO_DRAFT_PREFIX, useMemoDraft } from './useMemoDraft'

/**
 * QA #54 - ketahanan draf jurnal terhadap isi localStorage yang tidak tepercaya dan storage yang
 * diblokir/penuh. Melengkapi `useMemoDraft.test.ts` (jalur normal) dengan batas validasi AC-54.4.
 */

const DAY = '2025-09-10'
const OTHER_DAY = '2025-09-09'
const DRAFT_STATES = ['memo-draft', 'memo-draft-day', 'memo-draft-saved', 'memo-draft-held']
const keyOf = (day: string): string => MEMO_DRAFT_PREFIX + day

const page = (overrides: Partial<Memo> = {}): Memo => ({
  id: 'm',
  date: DAY,
  createdAt: 1,
  title: 'Judul',
  text: 'Isi',
  feelings: ['tenang'],
  paper: 'krem',
  ...overrides,
})

/** Reload: state in-memory hilang, isi localStorage tetap. */
function reload(): void {
  clearNuxtState(DRAFT_STATES)
}

beforeEach(() => {
  localStorage.clear()
  clearNuxtState(DRAFT_STATES)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('QA #54 validasi tanggal & storage draf', () => {
  it('tanggal yang bukan ISO ditolak: tidak menulis key dan tidak melempar', () => {
    const { draft, showDay } = useMemoDraft()

    for (const invalid of [
      'bukan-tanggal',
      '',
      '2025-13-01',
      '10-09-2025',
      '2025-09-10T00:00:00',
    ]) {
      showDay(invalid, page())
      expect(draft.value.text).toBe('Isi')
      draft.value.text = `Draf untuk ${invalid}`
      expect(localStorage.length).toBe(0)
    }
  })

  it('storage diblokir saat dibaca: draf diabaikan, halaman tersimpan tetap tampil', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError: storage diblokir')
    })

    const { draft, showDay } = useMemoDraft()
    expect(() => showDay(DAY, page())).not.toThrow()
    expect(draft.value).toEqual({ title: 'Judul', text: 'Isi', feelings: ['tenang'] })
  })

  it('storage penuh saat menulis tidak fatal: draf tetap hidup di state', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })

    const { draft, showDay } = useMemoDraft()
    showDay(DAY, null)
    expect(() => {
      draft.value.text = 'Tulisan yang tidak bisa disimpan'
    }).not.toThrow()
    expect(draft.value.text).toBe('Tulisan yang tidak bisa disimpan')
    expect(localStorage.getItem(keyOf(DAY))).toBeNull()

    // Storage pulih: perubahan berikutnya tersimpan lagi (tidak "mati" setelah satu kegagalan).
    setItem.mockRestore()
    draft.value.text = 'Tulisan setelah storage pulih'
    expect(localStorage.getItem(keyOf(DAY))).toContain('Tulisan setelah storage pulih')
  })

  it('JSON yang bukan objek (null, array, string, angka) diabaikan', () => {
    for (const raw of ['null', '[]', '"teks"', '42', 'true', '{"title":null,"text":"x"}']) {
      localStorage.clear()
      reload()
      localStorage.setItem(keyOf(DAY), raw)
      const { draft, showDay } = useMemoDraft()
      expect(() => showDay(DAY, page())).not.toThrow()
      expect(draft.value).toEqual({ title: 'Judul', text: 'Isi', feelings: ['tenang'] })
    }
  })

  it('judul/isi kepanjangan dipotong ke batas dan perasaan duplikat dirapikan', () => {
    localStorage.setItem(
      keyOf(DAY),
      JSON.stringify({
        title: 'J'.repeat(MEMO_TITLE_MAX + 50),
        text: 'T'.repeat(MEMO_TEXT_MAX + 100),
        feelings: ['tenang', 'tenang', 'cemas'],
      }),
    )
    const { draft, showDay } = useMemoDraft()
    showDay(DAY, null)

    expect(draft.value.title).toHaveLength(MEMO_TITLE_MAX)
    expect(draft.value.text).toHaveLength(MEMO_TEXT_MAX)
    expect(draft.value.feelings).toEqual(['tenang', 'cemas'])

    // Yang ditulis ulang juga versi yang sudah dipotong (bukan nilai raksasa dari storage).
    const stored = JSON.parse(localStorage.getItem(keyOf(DAY)) ?? '{}') as {
      values?: { text: string }
    }
    expect(stored.values?.text).toHaveLength(MEMO_TEXT_MAX)
  })

  it('load() hanya menghapus draf tanggal yang disimpan, draf tanggal lain tetap', () => {
    const { draft, load, showDay } = useMemoDraft()

    showDay(DAY, null)
    draft.value.text = 'Draf hari ini'
    showDay(OTHER_DAY, null)
    draft.value.text = 'Draf kemarin'

    load({ title: '', text: 'Draf kemarin', feelings: [] })

    expect(localStorage.getItem(keyOf(OTHER_DAY))).toBeNull()
    expect(localStorage.getItem(keyOf(DAY))).toContain('Draf hari ini')
  })

  it('sebelum ada tanggal aktif (showDay belum dipanggil) tidak ada key draf yang ditulis', () => {
    const { draft } = useMemoDraft()
    draft.value.text = 'Tulisan tanpa tanggal'

    expect(localStorage.length).toBe(0)
  })
})
