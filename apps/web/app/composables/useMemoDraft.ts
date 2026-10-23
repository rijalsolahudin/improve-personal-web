import {
  MEMO_FEELINGS,
  MEMO_TEXT_MAX,
  MEMO_TITLE_MAX,
  type Memo,
  type MemoFeeling,
} from '~/utils/memo'
import { isIsoDate } from '~/utils/time'

/**
 * Awalan key `localStorage` draf jurnal, satu key per tanggal: `ip-memo-draft-2025-09-10`.
 * Prefix `ip-` membuat `clearAppStorage` ikut menghapusnya saat logout/hapus akun.
 */
export const MEMO_DRAFT_PREFIX = 'ip-memo-draft-'

export interface MemoDraftValues {
  title: string
  text: string
  feelings: MemoFeeling[]
}

function emptyDraft(): MemoDraftValues {
  return { title: '', text: '', feelings: [] }
}

function cloneDraft(draft: MemoDraftValues): MemoDraftValues {
  return { title: draft.title, text: draft.text, feelings: [...draft.feelings] }
}

function sameDraft(a: MemoDraftValues, b: MemoDraftValues): boolean {
  return (
    a.title === b.title &&
    a.text === b.text &&
    a.feelings.length === b.feelings.length &&
    a.feelings.every((feeling, index) => feeling === b.feelings[index])
  )
}

function isMemoFeeling(value: unknown): value is MemoFeeling {
  return typeof value === 'string' && (MEMO_FEELINGS as readonly string[]).includes(value)
}

/**
 * Baca draf satu tanggal dari storage. Isinya data pribadi, jadi divalidasi ketat: bentuk yang
 * tidak sesuai (JSON rusak, tipe salah, perasaan tak dikenal) tidak dipercaya - draf dibuang dan
 * editor kembali memakai halaman tersimpan.
 */
function readDraft(day: string): MemoDraftValues | null {
  if (!import.meta.client || !isIsoDate(day)) return null
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(MEMO_DRAFT_PREFIX + day) ?? 'null')
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
    const { title, text, feelings } = raw as Record<string, unknown>
    if (typeof title !== 'string' || typeof text !== 'string' || !Array.isArray(feelings))
      return null
    return {
      title: title.slice(0, MEMO_TITLE_MAX),
      text: text.slice(0, MEMO_TEXT_MAX),
      feelings: [...new Set(feelings.filter(isMemoFeeling))],
    }
  } catch {
    return null
  }
}

/** Tulis/hapus (`null`) draf satu tanggal. Gagal simpan (storage penuh/diblokir) tidak fatal. */
function writeDraft(day: string, draft: MemoDraftValues | null): void {
  if (!import.meta.client || !isIsoDate(day)) return
  try {
    const key = MEMO_DRAFT_PREFIX + day
    if (draft === null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(draft))
  } catch {
    // Storage penuh/diblokir: draf tetap hidup di state selama sesi ini.
  }
}

/**
 * Draf halaman jurnal (judul, isi, perasaan) bersama editor & kartu "Perasaan hari ini".
 *
 * PRD F8: tulisan "otomatis tersimpan sebagai draf lokal". Draf disimpan **per tanggal** ke
 * localStorage, jadi pindah tanggal (atau reload) tidak menghilangkan tulisan yang belum disimpan,
 * dan draf tanggal lain tidak saling menimpa. Draf dibuang begitu isinya sama dengan halaman
 * tersimpan (mis. setelah simpan berhasil) supaya tidak ada salinan isi jurnal yang tertinggal.
 */
export function useMemoDraft() {
  const draft = useState<MemoDraftValues>('memo-draft', emptyDraft)
  /** Tanggal yang isinya sedang terbuka di editor; draf tanggal itu tidak dibuang saat mount ulang. */
  const draftDay = useState<string>('memo-draft-day', () => '')
  /** Isi halaman tersimpan tanggal yang sedang terbuka - pembanding untuk tahu draf masih "kotor". */
  const saved = useState<MemoDraftValues>('memo-draft-saved', emptyDraft)

  watch(
    draft,
    (value) => {
      const day = draftDay.value
      // `clearNuxtState` (logout/test) bisa mengosongkan state di tengah jalan; jangan menulis apa pun.
      if (!day || !value || !saved.value) return
      writeDraft(day, sameDraft(value, saved.value) ? null : value)
    },
    { deep: true, flush: 'sync' },
  )

  return {
    draft,
    toggleFeeling(feeling: MemoFeeling): void {
      const list = draft.value.feelings
      draft.value.feelings = list.includes(feeling)
        ? list.filter((item) => item !== feeling)
        : [...list, feeling]
    },
    /**
     * Tampilkan halaman tanggal `day` di editor (PRD F8: satu halaman per tanggal). Draf yang
     * sedang terbuka untuk tanggal itu tidak ditimpa, jadi tulisan yang belum disimpan tetap ada
     * setelah pindah halaman; pindah tanggal memuat draf tanggal tujuan kalau ada, kalau tidak
     * isi halaman tersimpan tanggal itu.
     */
    showDay(day: string, page: Memo | null): void {
      if (draftDay.value === day) return
      draftDay.value = day
      const pageDraft = page
        ? { title: page.title, text: page.text, feelings: [...page.feelings] }
        : emptyDraft()
      saved.value = pageDraft
      draft.value = readDraft(day) ?? cloneDraft(pageDraft)
    },
    /** Halaman yang baru disimpan tetap terbuka di editor supaya bisa dikoreksi, dan drafnya dibuang. */
    load(page: Pick<Memo, 'title' | 'text' | 'feelings'>): void {
      const next = { title: page.title, text: page.text, feelings: [...page.feelings] }
      saved.value = next
      draft.value = cloneDraft(next)
    },
  }
}
