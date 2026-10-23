import { beforeEach, describe, expect, it } from 'vitest'

import { MEMO_TEXT_MAX, type Memo } from '~/utils/memo'

import { clearAppStorage } from './useLogout'
import { MEMO_DRAFT_PREFIX, useMemoDraft } from './useMemoDraft'
import { useMemos } from './useMemos'

const DAY = '2025-09-10'
const OTHER_DAY = '2025-09-09'
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

function reload(): void {
  clearNuxtState(['memo-draft', 'memo-draft-day', 'memo-draft-saved', 'memo-draft-held'])
}

describe('useMemoDraft', () => {
  beforeEach(() => {
    localStorage.clear()
    clearNuxtState([
      'memos',
      'memosUnsaved',
      'memo-draft',
      'memo-draft-day',
      'memo-draft-saved',
      'memo-draft-held',
    ])
  })

  it('pindah tanggal membuka isi halaman tanggal itu, tanggal kosong mengosongkan editor', () => {
    const { draft, showDay } = useMemoDraft()

    showDay(DAY, page())
    expect(draft.value).toEqual({ title: 'Judul', text: 'Isi', feelings: ['tenang'] })

    showDay(OTHER_DAY, null)
    expect(draft.value).toEqual({ title: '', text: '', feelings: [] })
  })

  it('draf tanggal yang sedang terbuka tidak ditimpa saat komponen mount ulang', () => {
    const { draft, showDay } = useMemoDraft()

    showDay(DAY, page())
    draft.value.text = 'Belum disimpan'
    showDay(DAY, page())

    expect(draft.value.text).toBe('Belum disimpan')
  })

  it('halaman tersimpan bisa dibuka ulang & perasaan di-toggle satu per satu', () => {
    const { draft, load, toggleFeeling } = useMemoDraft()

    load({ title: 'Judul', text: 'Isi', feelings: ['tenang'] })
    expect(draft.value.feelings).toEqual(['tenang'])

    toggleFeeling('tenang')
    toggleFeeling('cemas')
    expect(draft.value.feelings).toEqual(['cemas'])
  })

  // BUG-T11-02: pindah tanggal menghapus tulisan yang belum disimpan.
  it('pindah tanggal bolak-balik tidak menghilangkan draf yang belum disimpan', () => {
    const { draft, showDay } = useMemoDraft()

    showDay(DAY, null)
    draft.value.text = 'Tulisan hari ini, belum disimpan'
    showDay(OTHER_DAY, null)
    draft.value.text = 'Tulisan kemarin, belum disimpan'

    showDay(DAY, null)
    expect(draft.value.text).toBe('Tulisan hari ini, belum disimpan')

    showDay(OTHER_DAY, null)
    expect(draft.value.text).toBe('Tulisan kemarin, belum disimpan')
  })

  it('draf per tanggal ditulis ke localStorage ber-prefix `ip-` dan bertahan setelah reload', () => {
    const before = useMemoDraft()
    before.showDay(DAY, page())
    before.draft.value.text = 'Revisi yang belum disimpan'

    expect(localStorage.getItem(keyOf(DAY))).toBe(
      JSON.stringify({
        values: { title: 'Judul', text: 'Revisi yang belum disimpan', feelings: ['tenang'] },
        base: { title: 'Judul', text: 'Isi', feelings: ['tenang'] },
      }),
    )
    expect(keyOf(DAY).startsWith('ip-')).toBe(true)

    // Reload: state in-memory hilang, storage perangkat tetap; halaman tersimpan masih versi lama.
    reload()
    const after = useMemoDraft()
    after.showDay(DAY, page())

    expect(after.draft.value.text).toBe('Revisi yang belum disimpan')
  })

  /**
   * QA #54 R2: base version dulu hanya di `useState`, jadi setelah reload draf dibandingkan dengan
   * halaman TERKINI (base = current) dan catatan penulis luar yang masuk selama reload terlihat
   * seperti "tidak ada perubahan" - lalu hilang saat draf disimpan.
   */
  it('reload di tengah draf tetap mempertahankan catatan penulis luar', () => {
    const before = useMemoDraft()
    before.showDay(DAY, page({ text: 'Tulisan awal.' }))
    before.draft.value.text = 'Draf saya yang belum disimpan'

    reload()
    const after = useMemoDraft()
    const withReview = page({ text: 'Tulisan awal.\n\nCatatan review goal' })
    after.showDay(DAY, withReview)

    const values = after.prepareSave(DAY, withReview)
    expect(values.text).toContain('Catatan review goal')
    expect(values.text).toContain('Draf saya yang belum disimpan')
  })

  /** QA #54 R1: saat clamp 5.000 karakter, catatan penulis luar tidak boleh terpotong. */
  it('clamp 5.000 karakter memprioritaskan catatan penulis luar', () => {
    const { draft, prepareSave, showDay } = useMemoDraft()
    const base = 'A'.repeat(4_000)
    showDay(DAY, page({ text: base }))
    // User menulis ulang seluruh halaman hampir sampai batas.
    draft.value.text = 'C'.repeat(MEMO_TEXT_MAX)

    const withReview = page({ text: `${base}\n\nCatatan review goal` })
    const values = prepareSave(DAY, withReview)

    expect(values.text).toHaveLength(MEMO_TEXT_MAX)
    expect(values.text).toContain('Catatan review goal')
    expect(values.text.startsWith('Catatan review goal')).toBe(false)
  })

  it('isi yang kembali sama dengan halaman tersimpan tidak meninggalkan draf', () => {
    const { draft, showDay } = useMemoDraft()

    showDay(DAY, null)
    draft.value.text = 'Sementara'
    expect(localStorage.getItem(keyOf(DAY))).not.toBeNull()

    draft.value.text = ''
    expect(localStorage.getItem(keyOf(DAY))).toBeNull()
  })

  it('simpan berhasil membersihkan draf tanggal itu', () => {
    const memos = useMemos()
    const { draft, load, showDay } = useMemoDraft()
    showDay(DAY, null)
    draft.value.text = 'Hari ini tenang.'
    draft.value.feelings = ['tenang']

    const saved = memos.save({ date: DAY, ...draft.value, paper: 'krem' })
    if (!saved) throw new Error('simpan jurnal gagal')

    load(saved)
    expect(localStorage.getItem(keyOf(DAY))).toBeNull()
    expect(draft.value.text).toBe('Hari ini tenang.')
  })

  /**
   * BUG-65-01: penyimpanan memperbarui halaman di memori lebih dulu, jadi draf bisa terlihat "sama
   * dengan halaman tersimpan" SEBELUM tulisannya berhasil. Selama ditahan (`hold`), draf tidak boleh
   * dibuang - kalau tidak, tulisan user hilang bersama kegagalan tulis.
   */
  it('draf yang ditahan tidak dibuang walau isinya sama dengan halaman; dilepas setelah tulis sukses', () => {
    const { draft, hold, load, release, showDay } = useMemoDraft()
    showDay(DAY, page({ text: 'Isi lama.' }))
    draft.value.text = 'Revisi yang sedang disimpan.'

    hold(DAY)
    // Simulasi penyimpanan optimistis: halaman di memori sudah memuat nilai draf.
    load({ title: 'Judul', text: 'Revisi yang sedang disimpan.', feelings: ['tenang'] })

    expect(localStorage.getItem(keyOf(DAY))).not.toBeNull()

    release(DAY)
    expect(localStorage.getItem(keyOf(DAY))).toBeNull()
  })

  /**
   * Tulisan berjalan di latar; user bisa pindah tanggal sebelum tulisannya selesai. Halaman yang
   * barusan tersimpan hanya boleh menyentuh draf tanggal ITU - draf tanggal lain yang sedang diketik
   * tidak boleh tertimpa (data loss yang sama bentuknya dengan BUG-65-01).
   */
  it('tulisan selesai setelah pindah tanggal tidak menimpa draf tanggal yang sedang terbuka', () => {
    const { draft, hold, load, release, showDay } = useMemoDraft()
    showDay(DAY, null)
    draft.value.text = 'Tulisan hari pertama'
    hold(DAY)

    showDay(OTHER_DAY, null)
    draft.value.text = 'Tulisan hari kedua'

    load({ title: '', text: 'Tulisan hari pertama', feelings: [] }, DAY)
    release(DAY)

    expect(draft.value.text).toBe('Tulisan hari kedua')
    expect(localStorage.getItem(keyOf(DAY))).toBeNull()
    expect(localStorage.getItem(keyOf(OTHER_DAY))).toContain('Tulisan hari kedua')
  })

  it('storage rusak atau bertipe salah diabaikan, bukan dipercaya mentah', () => {
    localStorage.setItem(keyOf(DAY), '{rusak')
    const first = useMemoDraft()
    first.showDay(DAY, page())
    expect(first.draft.value.text).toBe('Isi')

    reload()
    localStorage.setItem(keyOf(DAY), JSON.stringify({ title: 42, text: ['bukan teks'] }))
    const second = useMemoDraft()
    second.showDay(DAY, page())
    expect(second.draft.value).toEqual({ title: 'Judul', text: 'Isi', feelings: ['tenang'] })

    reload()
    localStorage.setItem(
      keyOf(DAY),
      JSON.stringify({ title: '', text: 'Draf', feelings: ['tenang', 'perasaan-palsu'] }),
    )
    const third = useMemoDraft()
    third.showDay(DAY, null)
    expect(third.draft.value).toEqual({ title: '', text: 'Draf', feelings: ['tenang'] })
  })

  it('logout menghapus semua draf jurnal tanpa menyentuh key situs lain', () => {
    const { draft, showDay } = useMemoDraft()
    showDay(DAY, null)
    draft.value.text = 'Isi pribadi'
    showDay(OTHER_DAY, null)
    draft.value.text = 'Isi pribadi lain'
    localStorage.setItem('other-site', 'keep')

    expect(localStorage.getItem(keyOf(DAY))).not.toBeNull()
    expect(localStorage.getItem(keyOf(OTHER_DAY))).not.toBeNull()
    clearAppStorage(localStorage)

    expect(localStorage.getItem(keyOf(DAY))).toBeNull()
    expect(localStorage.getItem(keyOf(OTHER_DAY))).toBeNull()
    expect(localStorage.getItem('other-site')).toBe('keep')
  })
})
