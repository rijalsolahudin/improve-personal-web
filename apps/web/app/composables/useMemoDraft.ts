import {
  MEMO_FEELINGS,
  MEMO_TEXT_MAX,
  MEMO_TITLE_MAX,
  type Memo,
  type MemoFeeling,
} from '~/utils/memo'
import { mergeMemoFields } from '~/utils/memo/persistence'
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

function sameFeelings(a: readonly MemoFeeling[], b: readonly MemoFeeling[]): boolean {
  return a.length === b.length && a.every((feeling, index) => feeling === b[index])
}

function sameDraft(a: MemoDraftValues, b: MemoDraftValues): boolean {
  return a.title === b.title && a.text === b.text && sameFeelings(a.feelings, b.feelings)
}

function isMemoFeeling(value: unknown): value is MemoFeeling {
  return typeof value === 'string' && (MEMO_FEELINGS as readonly string[]).includes(value)
}

/** Nilai draf dari halaman tersimpan; `null` = tanggal itu belum punya halaman. */
function pageValues(page: Memo | null): MemoDraftValues {
  return page ? { title: page.title, text: page.text, feelings: [...page.feelings] } : emptyDraft()
}

/**
 * Baca draf satu tanggal dari storage. Isinya data pribadi, jadi divalidasi ketat: bentuk yang
 * tidak sesuai (JSON rusak, tipe salah, perasaan tak dikenal) tidak dipercaya - draf dibuang dan
 * editor kembali memakai halaman tersimpan.
 *
 * Sejak QA #54 R2, `base` (isi halaman saat draf ditulis) ikut disimpan. Tanpa itu, setelah reload
 * draf dari storage dibandingkan dengan halaman yang SUDAH berubah (mis. catatan review goal masuk),
 * `reconcile` melihat "tidak ada perubahan" lalu menyimpan draf lama di atas catatan luar - data
 * hilang. Draf versi lama (tanpa `base`) tetap dibaca; `base: null` berarti pemanggil memakai
 * halaman terkini sebagai titik banding.
 */
interface StoredMemoDraft {
  readonly values: MemoDraftValues
  /** `null` = draf ditulis versi lama yang belum menyimpan base. */
  readonly base: MemoDraftValues | null
}

function readValues(raw: unknown): MemoDraftValues | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const { title, text, feelings } = raw as Record<string, unknown>
  if (typeof title !== 'string' || typeof text !== 'string' || !Array.isArray(feelings)) return null

  return {
    title: title.slice(0, MEMO_TITLE_MAX),
    text: text.slice(0, MEMO_TEXT_MAX),
    feelings: [...new Set(feelings.filter(isMemoFeeling))],
  }
}

function readDraft(day: string): StoredMemoDraft | null {
  if (!import.meta.client || !isIsoDate(day)) return null
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(MEMO_DRAFT_PREFIX + day) ?? 'null')
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null

    const record = raw as Record<string, unknown>
    const wrapped = readValues(record['values'])
    if (wrapped !== null) {
      return { values: wrapped, base: readValues(record['base']) }
    }

    // Format lama (`{ title, text, feelings }` tanpa pembungkus): tetap dibaca supaya draf yang
    // sudah ada di perangkat user tidak hilang saat versi baru dibuka.
    const legacy = readValues(record)
    return legacy === null ? null : { values: legacy, base: null }
  } catch {
    return null
  }
}

/** Tulis/hapus (`null`) draf satu tanggal. Gagal simpan (storage penuh/diblokir) tidak fatal. */
function writeDraft(day: string, draft: MemoDraftValues | null, base: MemoDraftValues): void {
  if (!import.meta.client || !isIsoDate(day)) return
  try {
    const key = MEMO_DRAFT_PREFIX + day
    if (draft === null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify({ values: draft, base }))
  } catch {
    // Storage penuh/diblokir: draf tetap hidup di state selama sesi ini.
  }
}

/**
 * Gabungkan tiga versi halaman: `base` (isi halaman saat draf dimuat), `mine` (draf user),
 * `current` (isi halaman sekarang).
 *
 * Aturan gabungnya milik `mergeMemoFields` (`utils/memo/persistence.ts`), dipakai bersama jalur
 * simpan dua tab supaya satu halaman tidak punya dua arti "gabung" yang berbeda.
 */
function mergeValues(
  base: MemoDraftValues,
  mine: MemoDraftValues,
  current: MemoDraftValues,
): MemoDraftValues {
  return mergeMemoFields(base, mine, current)
}

/**
 * Draf halaman jurnal (judul, isi, perasaan) bersama editor & kartu "Perasaan hari ini".
 *
 * PRD F8: tulisan "otomatis tersimpan sebagai draf lokal". Draf disimpan **per tanggal** ke
 * localStorage, jadi pindah tanggal (atau reload) tidak menghilangkan tulisan yang belum disimpan,
 * dan draf tanggal lain tidak saling menimpa. Draf dibuang begitu isinya sama dengan halaman
 * tersimpan **dan** tulisannya sudah terkonfirmasi (`hold`/`release`) supaya tidak ada salinan isi
 * jurnal yang tertinggal - lihat BUG-65-01.
 *
 * Satu halaman jurnal punya dua penulis: editor ini dan penulis otomatis (kartu review goal ->
 * `memos.append`). Karena itu isi halaman saat draf dimuat disimpan sebagai `base`, dan setiap kali
 * editor dibuka/disimpan draf dibandingkan lagi dengan halaman terkini - supaya draf lama tidak
 * menimpa catatan yang ditulis penulis lain di sela-selanya.
 */
export function useMemoDraft() {
  const draft = useState<MemoDraftValues>('memo-draft', emptyDraft)
  /** Tanggal yang isinya sedang terbuka di editor; draf tanggal itu tidak dibuang saat mount ulang. */
  const draftDay = useState<string>('memo-draft-day', () => '')
  /** Isi halaman tersimpan saat draf dimuat - dasar "kotor" dan titik banding saat ada perubahan luar. */
  const saved = useState<MemoDraftValues>('memo-draft-saved', emptyDraft)
  /**
   * Tanggal yang tulisannya sedang/belum terkonfirmasi (BUG-65-01). Selama di sini, draf TIDAK boleh
   * dibuang walau isinya sudah sama dengan halaman - kalau tulisnya gagal, draf itulah satu-satunya
   * salinan tulisan user.
   */
  const held = useState<string[]>('memo-draft-held', () => [])

  watch(
    draft,
    (value) => {
      const day = draftDay.value
      // `clearNuxtState` (logout/test) bisa mengosongkan state di tengah jalan; jangan menulis apa pun.
      if (!day || !value || !saved.value) return
      if (sameDraft(value, saved.value) && !held.value.includes(day)) {
        writeDraft(day, null, saved.value)
        return
      }
      writeDraft(day, cloneDraft(value), saved.value)
    },
    { deep: true, flush: 'sync' },
  )

  /**
   * Samakan draf dengan halaman tersimpan yang berubah di luar editor. Draf yang belum diedit
   * diganti isi terbaru (dan key draf basi ikut dibuang); draf yang sudah diedit digabung supaya
   * tidak ada tulisan yang hilang.
   */
  function reconcile(page: Memo | null): void {
    const base = saved.value
    const current = pageValues(page)
    if (sameDraft(base, current)) return

    saved.value = current
    draft.value = sameDraft(draft.value, base)
      ? cloneDraft(current)
      : mergeValues(base, draft.value, current)
  }

  return {
    draft,
    /**
     * Tahan draf tanggal `day` sampai tulisan benar-benar terkonfirmasi. Dipanggil SEBELUM
     * `memos.save`: penyimpanan memperbarui halaman di memori lebih dulu (UI tetap responsif), dan
     * tanpa tahanan ini watcher di atas akan menganggap draf "sudah tersimpan" lalu menghapusnya
     * sebelum tulisannya berhasil (BUG-65-01).
     */
    hold(day: string): void {
      if (!held.value.includes(day)) held.value = [...held.value, day]
    },
    /** Lepas tahanan setelah tulisan terkonfirmasi; draf yang isinya sama dengan halaman dibuang. */
    release(day: string): void {
      held.value = held.value.filter((item) => item !== day)
      if (draftDay.value === day && saved.value) {
        writeDraft(
          day,
          sameDraft(draft.value, saved.value) ? null : cloneDraft(draft.value),
          saved.value,
        )
        return
      }
      // Tanggal itu sudah tidak terbuka: isinya ada di halaman tersimpan, salinan draf tidak perlu.
      writeDraft(day, null, emptyDraft())
    },
    toggleFeeling(feeling: MemoFeeling): void {
      const list = draft.value.feelings
      draft.value.feelings = list.includes(feeling)
        ? list.filter((item) => item !== feeling)
        : [...list, feeling]
    },
    /**
     * Tampilkan halaman tanggal `day` di editor (PRD F8: satu halaman per tanggal). Draf yang
     * sedang terbuka untuk tanggal itu tidak ditimpa, kecuali halaman tersimpan tanggal itu berubah
     * di luar editor - saat itu draf disegarkan/digabung lewat `reconcile`. Pindah tanggal memuat
     * draf tanggal tujuan kalau ada, kalau tidak isi halaman tersimpan tanggal itu.
     */
    showDay(day: string, page: Memo | null): void {
      if (draftDay.value === day) {
        // BUG-54-01: early return buta di sini membuat draf basi menimpa catatan review goal.
        reconcile(page)
        return
      }
      draftDay.value = day
      const current = pageValues(page)
      const stored = readDraft(day)
      if (stored !== null) {
        // QA #54 R2: base ikut dimuat dari storage, jadi perubahan halaman yang terjadi selama
        // reload (mis. catatan review goal) tetap terdeteksi dan digabung - bukan ditimpa draf.
        saved.value = stored.base ?? current
        draft.value = cloneDraft(stored.values)
        reconcile(page)
        return
      }
      saved.value = current
      draft.value = cloneDraft(current)
    },
    /**
     * Nilai yang aman disimpan untuk tanggal `day`: kalau halaman tersimpan berubah sejak draf
     * dimuat (penulis lain menambah catatan), gabungkan dulu supaya simpan tidak menimpanya.
     */
    prepareSave(day: string, page: Memo | null): MemoDraftValues {
      if (draftDay.value === day) reconcile(page)
      return cloneDraft(draft.value)
    },
    /**
     * `true` kalau draf tanggal `day` masih sama dengan `values` yang dikirim saat menyimpan.
     * Editor memakainya supaya ketikan yang masuk SELAMA tulisan berjalan tidak ditimpa hasil tulis
     * yang lebih lama (BUG-71-03).
     */
    unchangedSince(day: string, values: MemoDraftValues): boolean {
      return draftDay.value === day && sameDraft(draft.value, values)
    },
    /**
     * Halaman yang baru disimpan tetap terbuka di editor supaya bisa dikoreksi, dan drafnya dibuang.
     *
     * `day` diisi pemanggil yang menunggu tulisan: kalau editor sudah pindah tanggal saat tulisan
     * selesai, draf tanggal lain TIDAK boleh ditimpa halaman ini (hanya draf tanggal tersimpan yang
     * boleh dibuang lewat `release`).
     */
    load(page: Pick<Memo, 'title' | 'text' | 'feelings'>, day?: string): void {
      if (day !== undefined && day !== draftDay.value) return

      const next = { title: page.title, text: page.text, feelings: [...page.feelings] }
      saved.value = next
      draft.value = cloneDraft(next)
    },
  }
}
