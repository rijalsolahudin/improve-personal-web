import { createSystemClock } from '@improve-personal/core'
import { MEMO_PAPER_NAMES, type MemoPaperName } from '@improve-personal/tokens'

import {
  MEMO_TEXT_MAX,
  MEMO_TITLE_MAX,
  isMood,
  joinMemoText,
  memoOn as memoOnList,
  type Memo,
  type MemoFeeling,
  type MoodByDate,
} from '~/utils/memo'
import {
  loadMemoRecords,
  persistMemo,
  removeMemoRecord,
  type MemoRecords,
} from '~/utils/memo/persistence'
import type { LocalDataSession } from '~/utils/storage/session'
import { createUuidV7Generator } from '~/utils/storage/uuid'
import { fromIsoDate, toIsoDate } from '~/utils/time'

import { useLocalData } from './useLocalData'

/** Preferensi kertas (bukan isi jurnal) → localStorage, divalidasi saat dibaca. */
export const MEMO_PAPER_KEY = 'ip-memo-paper'

function readPaper(): MemoPaperName {
  if (!import.meta.client) return 'krem'
  try {
    const stored = localStorage.getItem(MEMO_PAPER_KEY)
    return (MEMO_PAPER_NAMES as readonly string[]).includes(stored ?? '')
      ? (stored as MemoPaperName)
      : 'krem'
  } catch {
    return 'krem'
  }
}

/** Memo hari lalu dicatat jam 20:00 (design). */
const PAST_ENTRY_HOUR = 20

/**
 * Pesan kegagalan saat sesi data lokal tidak bisa dibuka. Tidak pernah dirender langsung: banner
 * memakai copy i18n generik, sedangkan pesan internal ini hanya untuk state/log.
 */
const SESSION_UNAVAILABLE_MESSAGE = 'penyimpanan lokal belum bisa dibuka'

export interface MemoInput {
  date: string
  title: string
  text: string
  feelings: MemoFeeling[]
  paper: MemoPaperName
}

export type UseMemosOptions = {
  /**
   * Sumber sesi data lokal. Disuntik di test supaya composable bisa diuji tanpa Nuxt/auth.
   * Default: sesi aplikasi (`useLocalData`).
   */
  readonly session?: () => Promise<LocalDataSession | null>
}

/** Bentuk state yang dibaca halaman & komponen lain. */
export interface MemoStore {
  /**
   * SEMUA record jurnal, termasuk record mood-saja (judul & isi kosong). Komponen hanya melihat
   * `memos` yang sudah disaring, tetapi id record mood-saja tetap dibutuhkan supaya perubahan mood
   * berikutnya meng-update baris yang sama.
   */
  memos: Memo[]
  moods: MoodByDate
}

let hydrateInFlight: Promise<void> | null = null
let writeQueue: Promise<void> = Promise.resolve()

/**
 * Tulisan yang GAGAL dan belum terkonfirmasi, per tanggal.
 *
 * Teks jurnal sengaja tidak ditaruh di `useState`: isi ini hanya hidup di memori tab selama sesi
 * (aturan security.md §2), sementara `useState` bisa ikut terserialisasi ke payload.
 */
type PendingWrite = {
  readonly memo: Memo
  /**
   * Versi halaman yang dilihat penyunting sebelum menyimpan; titik banding merge tiga arah.
   * `null` = halaman baru. `undefined` = jangan gabung (hapus eksplisit: isi memang dikosongkan).
   */
  readonly base?: Memo | null
  readonly mood: number | null
}

const pendingWrites = new Map<string, PendingWrite>()

/** Promise tulisan terakhir per id halaman, supaya pemanggil bisa menunggu konfirmasi tulis. */
const writePromises = new Map<string, Promise<boolean>>()

/** Dipakai test supaya hydrate/antrean antar kasus tidak saling mewarisi. */
export function resetMemosHydrationForTest(): void {
  hydrateInFlight = null
  writeQueue = Promise.resolve()
  pendingWrites.clear()
  writePromises.clear()
}

/**
 * Gabungkan snapshot storage dengan halaman yang ditulis SELAMA hydrate berjalan.
 *
 * `keep` = tanggal yang tulisannya belum terkonfirmasi (gagal). Versi lokal tanggal itu menang:
 * penyimpanan memang belum memuatnya, dan menghapusnya dari memori = data hilang diam-diam
 * (BUG-65-01).
 */
function mergeMemos(
  loaded: readonly Memo[],
  before: readonly Memo[],
  current: readonly Memo[],
  keep: ReadonlySet<string>,
): Memo[] {
  const beforeById = new Map(before.map((memo) => [memo.id, memo]))
  const currentById = new Map(current.map((memo) => [memo.id, memo]))
  const merged: Memo[] = []

  for (const memo of loaded) {
    const local = currentById.get(memo.id)
    // Referensi berubah = ditulis lokal selama hydrate; tulisan lokal menang.
    if (local !== beforeById.get(memo.id)) {
      if (local !== undefined) merged.push(local)
      continue
    }

    // Tanggal yang sudah ditulis lokal dengan id baru (sebelum record lama selesai dihidrasi) tidak
    // boleh muncul dua kali: simpan versi lokal, buang versi storage untuk tanggal yang sama.
    const localSameDate = current.find(
      (candidate) => candidate.date === memo.date && candidate !== beforeById.get(candidate.id),
    )
    if (localSameDate !== undefined) continue

    merged.push(memo)
  }

  const loadedIds = new Set(loaded.map((memo) => memo.id))
  for (const local of current) {
    if (loadedIds.has(local.id)) continue
    if (local !== beforeById.get(local.id)) merged.push(local)
  }

  // Tulisan yang gagal belum ada di storage: pertahankan versi lokal, buang versi storage tanggal itu
  // (satu halaman per tanggal, dan versi lokal yang lebih baru).
  for (const day of keep) {
    const local = current.find((memo) => memo.date === day)
    if (local === undefined) continue
    const stored = merged.findIndex((memo) => memo.date === day)
    if (stored >= 0) merged[stored] = local
    else merged.push(local)
  }

  return merged
}

/** Padanan `mergeMemos` untuk mood: tanggal yang berubah/tertunda menang atas snapshot storage. */
function mergeMoods(
  loaded: MoodByDate,
  before: MoodByDate,
  current: MoodByDate,
  keep: ReadonlySet<string>,
): MoodByDate {
  const merged: MoodByDate = {}
  for (const day of new Set([
    ...Object.keys(loaded),
    ...Object.keys(before),
    ...Object.keys(current),
  ])) {
    const value = keep.has(day) || current[day] !== before[day] ? current[day] : loaded[day]
    if (value !== undefined) merged[day] = value
  }
  return merged
}

function hasText(memo: Memo): boolean {
  return memo.text.trim().length > 0
}

/**
 * Jurnal (PRD F8) untuk halaman Memo, widget Home, dan panel Kalender.
 *
 * Halaman disimpan **terenkripsi** lewat repository lokal `journal_entry` + outbox (pola task/habit/
 * goal/jadwal), satu record per tanggal. Tidak ada seed contoh dan tidak ada halaman tersimpan di
 * `localStorage`. Yang masih plaintext hanyalah **draf** yang belum disimpan (`useMemoDraft`, risiko
 * B-54.1 yang sudah dicatat) dan dibersihkan begitu halaman tersimpan.
 *
 * API tetap sinkron seperti fase awal karena UI (editor, kartu review goal) sudah memakainya;
 * penulisan berjalan di antrean latar. Pemanggil yang perlu tahu hasil tulis (editor, supaya draf
 * tidak dihapus sebelum tersimpan) memakai `waitForSave(id)`.
 *
 * Kegagalan tulis TIDAK mengubah `status` hydrate: halaman tetap di memori sebagai "belum tersimpan"
 * (`hasUnsaved`), `error` terisi, dan hydrate berikutnya tidak menggantinya dengan snapshot storage.
 */
export function useMemos(options: UseMemosOptions = {}) {
  const localData = useLocalData()
  const getSession = options.session ?? localData.ensure

  const store = useState<MemoStore>('memos', () => ({ memos: [], moods: {} }))
  const status = useState<'idle' | 'loading' | 'ready' | 'error'>('memosStatus', () => 'idle')
  const error = useState<string | null>('memosError', () => null)
  const paper = useState<MemoPaperName>('memo-paper', readPaper)
  /** Tanggal yang tulisannya belum terkonfirmasi (gagal) - dipakai hydrate & banner editor. */
  const unsaved = useState<string[]>('memosUnsaved', () => [])

  /** UUIDv7: `journalEntrySchema.id` menolak versi lain (sama seperti task/habit/goal). */
  const newMemoId = createUuidV7Generator({ clock: createSystemClock() })

  /** Halaman yang punya tulisan. Record mood-saja tetap di `store.memos` untuk id-nya. */
  const memos = computed(() => store.value.memos.filter(hasText))

  function moodOn(day: string): number | null {
    return store.value.moods[day] ?? null
  }

  function entryOn(day: string): Memo | null {
    return store.value.memos.find((memo) => memo.date === day) ?? null
  }

  function replaceMemo(next: Memo): void {
    store.value = {
      ...store.value,
      memos: store.value.memos.map((memo) => (memo.id === next.id ? next : memo)),
    }
  }

  function setPaper(next: MemoPaperName): void {
    paper.value = next
    try {
      localStorage.setItem(MEMO_PAPER_KEY, next)
    } catch {
      // Storage diblokir: pilihan kertas berlaku untuk sesi ini.
    }
  }

  /**
   * Muat jurnal sekali per muat halaman. Tulisan yang terjadi selama hydrate (mis. user menekan
   * simpan sebelum dekripsi selesai) digabung, bukan ditimpa snapshot storage.
   */
  function hydrate(): Promise<void> {
    if (status.value === 'ready') return Promise.resolve()

    hydrateInFlight ??= (async () => {
      // Snapshot SEBELUM await: tulisan yang terjadi selama sesi dibuka harus terdeteksi sebagai
      // perubahan lokal (lihat `mergeMemos`), bukan dianggap bagian dari snapshot storage.
      const before = store.value
      status.value = 'loading'
      try {
        const session = await getSession()
        if (session === null) {
          // SSR / sesi terkunci: daftar kosong - bukan data contoh, bukan kegagalan.
          status.value = 'idle'
          return
        }

        const loaded: MemoRecords = await loadMemoRecords(session, paper.value)
        const keep = new Set(unsaved.value)
        store.value = {
          memos: mergeMemos(loaded.entries, before.memos, store.value.memos, keep),
          moods: mergeMoods(loaded.moods, before.moods, store.value.moods, keep),
        }
        status.value = 'ready'
        // Kegagalan tulis yang belum terselesaikan BUKAN error hydrate: jangan sembunyikan banner-nya.
        if (unsaved.value.length === 0) error.value = null
      } catch (cause) {
        status.value = 'error'
        error.value = cause instanceof Error ? cause.message : 'jurnal tidak bisa dimuat'
      } finally {
        hydrateInFlight = null
      }
    })()

    return hydrateInFlight
  }

  /** Ganti/letakkan halaman hasil tulisan tanpa memecah invariant "satu halaman per tanggal". */
  function applyWritten(written: Memo): void {
    const memos: Memo[] = []
    let replaced = false
    for (const memo of store.value.memos) {
      if (memo.id === written.id) {
        memos.push(written)
        replaced = true
        continue
      }
      if (memo.date === written.date) continue
      memos.push(memo)
    }
    store.value = { ...store.value, memos: replaced ? memos : [written, ...memos] }
  }

  /** Buang jejak tulisan tertunda tanggal `day` (tulisan selesai, atau halamannya dihapus). */
  function clearPending(day: string): void {
    pendingWrites.delete(day)
    unsaved.value = unsaved.value.filter((item) => item !== day)
    if (unsaved.value.length === 0) error.value = null
  }

  /** Tulisan terkonfirmasi: state disegarkan dengan versi yang benar-benar ditulis, tanda gagal dibuang. */
  function settleWrite(pending: PendingWrite, written: Memo | null): void {
    // Sudah digantikan tulisan yang lebih baru (retry) atau halamannya dihapus: jangan hidupkan lagi
    // versi lama di memori, dan jangan sentuh penanda milik tulisan yang menggantikannya (BUG-71-02).
    if (pendingWrites.get(pending.memo.date) !== pending) return

    if (written !== null) applyWritten(written)
    clearPending(pending.memo.date)
  }

  /**
   * Tulisan gagal: halaman tetap di memori sebagai "belum tersimpan", draf tidak dibuang pemanggil,
   * dan pesannya terlihat di UI. `status` hydrate sengaja TIDAK diubah - mengubahnya dulu membuat
   * hydrate berikutnya mengganti store dengan snapshot storage dan menghapus halaman ini (BUG-65-01).
   */
  function failWrite(pending: PendingWrite, cause: unknown, failure: string): void {
    // Halaman yang sudah dihapus dari memori tidak punya salinan yang bisa disimpan ulang: menandainya
    // "belum tersimpan" hanya meninggalkan banner tanpa aksi (BUG-71-02).
    if (store.value.memos.some((memo) => memo.id === pending.memo.id)) {
      pendingWrites.set(pending.memo.date, pending)
      if (!unsaved.value.includes(pending.memo.date)) {
        unsaved.value = [...unsaved.value, pending.memo.date]
      }
    }
    error.value = cause instanceof Error ? cause.message : failure
  }

  /**
   * Jalankan satu tulisan di antrean serial.
   *
   * `pending` diisi untuk tulisan halaman/mood (bisa dilacak & diulang); `null` untuk penghapusan,
   * yang tidak butuh mempertahankan isi. Promise-nya TIDAK pernah reject: pemanggil memakainya untuk
   * menunggu konfirmasi (`true` = benar-benar tersimpan).
   */
  function enqueue(
    work: (session: LocalDataSession) => Promise<Memo | null>,
    failure: string,
    pending: PendingWrite | null,
  ): Promise<boolean> {
    const run = writeQueue.then(async () => {
      try {
        const session = await getSession()
        // Sesi data lokal tidak tersedia (kunci terkunci, IndexedDB gagal dibuka, sesi auth hilang).
        // JANGAN lapor sukses: tidak ada satu byte pun yang tertulis, jadi draf pemanggil adalah
        // satu-satunya salinan tulisan user (BUG-71-01). Antrean tetap hidup dan `getSession` dicoba
        // lagi pada percobaan berikutnya ("Coba lagi"/simpan ulang).
        if (session === null) {
          // SSR tidak punya aksi user dan tidak punya penyimpanan perangkat: tidak ada yang hilang.
          if (!import.meta.client) return true
          const cause = new Error(SESSION_UNAVAILABLE_MESSAGE)
          if (pending !== null) failWrite(pending, cause, failure)
          else error.value = cause.message
          return false
        }

        const written = await work(session)
        if (pending !== null) settleWrite(pending, written)
        else if (unsaved.value.length === 0) error.value = null
        return true
      } catch (cause) {
        if (pending !== null) failWrite(pending, cause, failure)
        else error.value = cause instanceof Error ? cause.message : failure
        return false
      }
    })

    writeQueue = run.then(() => undefined)
    if (pending !== null) writePromises.set(pending.memo.id, run)
    return run
  }

  /**
   * Titik banding saat menyimpan: versi yang dilihat penyunting. Kalau tanggal itu punya tulisan yang
   * belum terkonfirmasi, titik bandingnya tetap versi SEBELUM percobaan gagal - bukan versi optimistis
   * di memori, yang akan membuat gabungan dua tab kehilangan catatan tab lain.
   */
  function baseOn(day: string, existing: Memo | null): Memo | null | undefined {
    const pending = pendingWrites.get(day)
    return pending === undefined ? existing : pending.base
  }

  function persist(memo: Memo, base?: Memo | null): Promise<boolean> {
    const pending: PendingWrite = { memo, base, mood: moodOn(memo.date) }
    pendingWrites.set(memo.date, pending)
    return enqueue(
      (session) => persistMemo(session, memo, pending.mood, { base }),
      'jurnal tidak bisa disimpan',
      pending,
    )
  }

  /**
   * Tunggu tulisan untuk halaman `id` selesai. `false` = gagal (draf harus dipertahankan, error tampil).
   * Tanpa tulisan yang tertunda, hasilnya `true`: tidak ada yang perlu ditunggu.
   */
  function waitForSave(id: string): Promise<boolean> {
    return writePromises.get(id) ?? Promise.resolve(true)
  }

  function hasUnsaved(day: string): boolean {
    return unsaved.value.includes(day)
  }

  /** Waktu tulis halaman baru: hari ini = sekarang, hari lalu = jam 20:00 (design). */
  function createdAtFor(day: string): number {
    return day === toIsoDate(new Date())
      ? Date.now()
      : new Date(fromIsoDate(day).setHours(PAST_ENTRY_HOUR)).getTime()
  }

  /**
   * Isi kosong biasanya berarti "tidak ada yang perlu disimpan", tetapi bisa juga halaman yang
   * sengaja dikosongkan (hapus dengan mood tetap) lalu tulisannya gagal. "Coba lagi" memanggil
   * `save` dengan draf kosong, jadi tulisan kosong yang tertunda harus diulang - bukan ditinggalkan
   * bersama banner yang tombolnya tidak bisa membersihkan apa pun (BUG-71-02).
   */
  function retryEmptiedWrite(day: string): Memo | null {
    const pending = pendingWrites.get(day)
    if (pending === undefined || pending.memo.text.trim() !== '') return null

    const emptied: Memo = { ...pending.memo, title: '', text: '', feelings: [] }
    replaceMemo(emptied)
    void persist(emptied, pending.base)
    return emptied
  }

  /**
   * Simpan halaman jurnal tanggal `date`. Satu halaman per tanggal: halaman yang sudah ada
   * **diperbarui** (id & waktu tulis pertama tetap, posisi di daftar tidak berubah); hanya tanggal
   * yang belum punya halaman yang membuat entri baru. `null` kalau isi kosong - kecuali ada tulisan
   * kosong yang tertunda untuk tanggal itu (halaman dikosongkan lalu gagal ditulis), yang diulang
   * lewat `retryEmptiedWrite`.
   */
  function save(input: MemoInput): Memo | null {
    const text = input.text.trim().slice(0, MEMO_TEXT_MAX)
    if (!text) return retryEmptiedWrite(input.date)

    const fields = {
      title: input.title.trim().slice(0, MEMO_TITLE_MAX),
      text,
      feelings: [...input.feelings],
      paper: input.paper,
    }

    const existing = entryOn(input.date)
    const base = baseOn(input.date, existing)
    if (existing !== null) {
      const updated: Memo = { ...existing, ...fields }
      replaceMemo(updated)
      void persist(updated, base)
      return updated
    }

    const created: Memo = {
      id: newMemoId(),
      date: input.date,
      createdAt: createdAtFor(input.date),
      ...fields,
    }
    store.value = { ...store.value, memos: [created, ...store.value.memos] }
    void persist(created, base)
    return created
  }

  /**
   * Tambahkan paragraf ke halaman jurnal tanggal `day` (dipakai kartu review goal).
   *
   * Isi lama dipertahankan - review adalah tambahan, bukan pengganti tulisan user. Saat batas
   * `MEMO_TEXT_MAX` tercapai, teks lama yang dipotong lebih dulu supaya catatan yang baru masuk
   * tidak hilang diam-diam (QA #54 R1).
   */
  function append(day: string, text: string): Memo | null {
    const clean = text.trim().slice(0, MEMO_TEXT_MAX)
    if (!clean) return null

    const existing = entryOn(day)
    const base = baseOn(day, existing)
    if (existing !== null) {
      const updated: Memo = { ...existing, text: joinMemoText(existing.text, clean) }
      replaceMemo(updated)
      void persist(updated, base)
      return updated
    }

    return save({ date: day, title: '', text: clean, feelings: [], paper: paper.value })
  }

  /**
   * Hapus tulisan tanggal itu. Mood hari tersebut BUKAN milik halaman, jadi kalau ada mood record
   * dipertahankan sebagai record mood-saja (tidak ikut terhapus); tanpa mood record di-tombstone.
   */
  function remove(id: string): void {
    const existing = store.value.memos.find((memo) => memo.id === id)
    if (existing === undefined) return

    // Halaman ini sudah tidak ada di editor: jejak tulisan tertunda & banner "belum tersimpan" untuk
    // tanggal itu tidak boleh nyangkut, dan "Coba lagi" tidak boleh menulis versi lamanya (BUG-71-02).
    writePromises.delete(id)
    clearPending(existing.date)

    if (moodOn(existing.date) !== null) {
      const emptied: Memo = { ...existing, title: '', text: '', feelings: [] }
      replaceMemo(emptied)
      // Hapus = isi memang dikosongkan; jangan digabung dengan versi lama di penyimpanan.
      void persist(emptied, undefined)
      return
    }

    store.value = {
      ...store.value,
      memos: store.value.memos.filter((memo) => memo.id !== id),
    }
    void enqueue(
      (session) => removeMemoRecord(session, id).then(() => null),
      'jurnal tidak bisa dihapus',
      null,
    )
  }

  /**
   * Mood satu per hari; `null` menghapus.
   *
   * Mood tanpa tulisan tetap dipersistenkan (satu record per tanggal): setelah reload mood harus
   * ada walaupun hari itu belum punya halaman jurnal.
   */
  function setMood(day: string, mood: number | null): void {
    const nextMood = isMood(mood) ? mood : null
    const moods: MoodByDate = {}
    for (const [entryDay, value] of Object.entries(store.value.moods)) {
      if (entryDay !== day) moods[entryDay] = value
    }
    if (nextMood !== null) moods[day] = nextMood

    const existing = entryOn(day)
    if (existing === null) {
      if (nextMood === null) {
        store.value = { ...store.value, moods }
        return
      }
      const created: Memo = {
        id: newMemoId(),
        date: day,
        createdAt: createdAtFor(day),
        title: '',
        text: '',
        feelings: [],
        paper: paper.value,
      }
      store.value = { memos: [created, ...store.value.memos], moods }
      void persist(created, baseOn(day, null))
      return
    }

    const isEmpty = existing.text.trim() === '' && existing.title.trim() === ''
    if (nextMood === null && isEmpty) {
      store.value = {
        memos: store.value.memos.filter((memo) => memo.id !== existing.id),
        moods,
      }
      void enqueue(
        (session) => removeMemoRecord(session, existing.id).then(() => null),
        'mood tidak bisa dihapus',
        null,
      )
      return
    }

    store.value = {
      memos: store.value.memos.map((memo) => (memo.id === existing.id ? existing : memo)),
      moods,
    }
    void persist(existing, baseOn(day, existing))
  }

  watch(
    () => localData.state.value.status,
    (next) => {
      if (next === 'ready') void hydrate()
    },
  )

  // Di server tidak melakukan apa pun (sesi `null`), dan status tetap `idle`.
  void hydrate()

  return {
    memos,
    moods: computed(() => store.value.moods),
    moodOn,
    /** Halaman jurnal tanggal `day`, `null` kalau belum ditulis. */
    memoOn: (day: string): Memo | null => memoOnList(memos.value, day),
    paper: readonly(paper),
    status: computed(() => status.value),
    error: computed(() => error.value),
    /** Tanggal ini punya tulisan yang belum terkonfirmasi (gagal) - tampilkan "belum tersimpan". */
    hasUnsaved,
    setPaper,
    hydrate,
    save,
    /**
     * Tunggu tulisan halaman `id` benar-benar selesai. `false` = gagal; pemanggil wajib mempertahankan
     * draf dan menampilkan error (BUG-65-01), bukan menghapus draf seperti jalur lama.
     */
    waitForSave,
    append,
    remove,
    setMood,
  }
}
