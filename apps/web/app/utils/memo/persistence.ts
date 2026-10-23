import { MOODS, journalEntrySchema, type JournalEntry, type Mood } from '@improve-personal/core'
import type { MemoPaperName } from '@improve-personal/tokens'

import {
  MEMO_FEELINGS,
  MEMO_TEXT_MAX,
  MEMO_TITLE_MAX,
  joinMemoText,
  type Memo,
  type MemoFeeling,
  type MoodByDate,
} from '../memo'
import type { LocalDataSession } from '../storage/session'
import { fromIsoDate } from '../time'

/**
 * Persistensi jurnal (PRD F8): `Memo` (bentuk UI) ↔ record `journal_entry`.
 *
 * Yang perlu diketahui pembaca:
 *
 * 1. **Satu record per tanggal.** Core menegakkan `entry_date` unik lewat `findEntryForDate` di
 *    jalur baca; di sini tanggal adalah kunci alami - simpan ulang = update record yang sama.
 * 2. **Isi jurnal tidak pernah plaintext di penyimpanan.** Record ditulis lewat `session.writer`
 *    (sama seperti task/habit/goal), jadi blob di IndexedDB selalu ciphertext sodium. Tidak ada
 *    jalur yang menulis judul/isi/mood ke `localStorage`.
 * 3. **Mood ikut record tanggal itu.** UI mengizinkan mood tanpa tulisan, jadi mood sendirian tetap
 *    jadi record `journal_entry` (judul & diary `null`) supaya satu tanggal tetap satu baris dan
 *    mood tidak hilang setelah reload.
 * 4. **Tag perasaan cepat (design `mTag`) tidak punya kolom di skema core.** Skema `journal_entry`
 *    sengaja tidak diubah di task ini (kontrak bersama + dipakai mobile). Satu-satunya field teks
 *    perasaan yang belum dipakai UI adalah `moodStoryMd`, jadi tag disimpan di sana dengan penanda
 *    `#perasaan ` (mis. `#perasaan tenang semangat`). Field itu tetap ikut terenkripsi dan ikut
 *    export/import. Cerita bebas yang ditulis versi lain TIDAK ditimpa: kalau isinya bukan penanda
 *    kita, nilai aslinya dipertahankan (tag tidak tersimpan, lebih baik daripada menghapus tulisan).
 * 5. **`paper` tidak dipersistenkan per halaman.** Warna kertas yang benar-benar dipakai UI adalah
 *    preferensi global (`ip-memo-paper`); `Memo.paper` hanya ikut bentuk input lama dan tidak
 *    pernah dibaca saat render entri. Saat hydrate, halaman memakai preferensi global saat itu.
 */

/** Penanda tag perasaan di `moodStoryMd`; sengaja teks biasa supaya berkas export tetap terbaca. */
const FEELINGS_STORY_PREFIX = '#perasaan '

/** Index mood UI (0 = paling berat … 4 = paling bahagia) → enum core. */
export function moodFromIndex(index: number | null): Mood | null {
  if (index === null || !Number.isInteger(index)) return null
  return MOODS[index] ?? null
}

/** Enum mood core → index UI; `null` kalau nilai tak dikenal (data rusak tidak bikin crash). */
export function moodIndex(mood: Mood | null): number | null {
  if (mood === null) return null
  const index = MOODS.indexOf(mood)
  return index === -1 ? null : index
}

/** Tag perasaan → isi `moodStoryMd`. `null` kalau tidak ada tag (field dibiarkan kosong). */
export function encodeFeelingsStory(feelings: readonly MemoFeeling[]): string | null {
  const unique = [...new Set(feelings)].filter((feeling) =>
    (MEMO_FEELINGS as readonly string[]).includes(feeling),
  )
  return unique.length === 0 ? null : `${FEELINGS_STORY_PREFIX}${unique.join(' ')}`
}

/** Kebalikan `encodeFeelingsStory`; teks yang bukan penanda kita diabaikan (bukan tag). */
export function decodeFeelingsStory(storyMd: string | null): MemoFeeling[] {
  if (storyMd === null || !storyMd.startsWith(FEELINGS_STORY_PREFIX)) return []

  return [
    ...new Set(
      storyMd
        .slice(FEELINGS_STORY_PREFIX.length)
        .split(/\s+/)
        .filter((token): token is MemoFeeling =>
          (MEMO_FEELINGS as readonly string[]).includes(token),
        ),
    ),
  ]
}

/** `true` kalau `moodStoryMd` ditulis app ini (boleh diganti tag baru). */
export function isFeelingsStory(storyMd: string | null): boolean {
  return storyMd === null || storyMd.startsWith(FEELINGS_STORY_PREFIX)
}

/**
 * Bagian halaman yang bisa ditulis dua pihak sekaligus: editor jurnal (user) dan penulis otomatis
 * (kartu review goal -> `useMemos.append`), atau tab lain yang menyunting tanggal yang sama.
 */
export type MemoFields = Pick<Memo, 'title' | 'text' | 'feelings'>

function sameFeelings(a: readonly MemoFeeling[], b: readonly MemoFeeling[]): boolean {
  return a.length === b.length && a.every((feeling, index) => feeling === b[index])
}

/** Nilai yang dibandingkan/digabung: judul & isi tanpa spasi tepi, perasaan tanpa duplikat. */
export function memoFields(memo: MemoFields): MemoFields {
  return {
    title: memo.title.trim(),
    text: memo.text.trim(),
    feelings: [...new Set(memo.feelings)],
  }
}

export function sameMemoFields(a: MemoFields, b: MemoFields): boolean {
  return a.title === b.title && a.text === b.text && sameFeelings(a.feelings, b.feelings)
}

/**
 * Gabungkan tiga versi teks: `base` (isi halaman saat draf dimuat), `mine` (draf user), `current`
 * (isi halaman sekarang).
 *
 * Penulis lain hari ini hanya **menambah di akhir** halaman (kartu review goal -> `memos.append`),
 * jadi kasus normalnya: halaman tersimpan sudah memuat tambahan itu, dan tambahan user ditempel di
 * belakangnya. Kalau salah satu sisi mengubah bagian tengah, isi kedua sisi tetap dipertahankan -
 * lebih baik tampil sebagai dua paragraf daripada ada tulisan yang hilang tanpa peringatan.
 */
function mergeText(base: string, mine: string, current: string): string {
  if (current === base) return mine
  if (mine === base) return current
  if (mine.includes(current)) return mine
  if (current.includes(mine)) return current

  const externalTail = current.startsWith(base) ? current.slice(base.length) : null
  const mineTail = mine.startsWith(base) ? mine.slice(base.length) : null
  if (externalTail !== null && mineTail !== null) return joinMemoText(current, mineTail)
  // User mengubah bagian tengah, penulis lain menambah ekor: pertahankan keduanya. `joinMemoText`
  // memotong sisi user lebih dulu kalau batas panjang tercapai, bukan catatan luar.
  if (externalTail !== null) return joinMemoText(mine, externalTail)
  if (mineTail !== null) return joinMemoText(current, mineTail)
  // Dua-duanya mengubah bagian tengah: simpan dua versi, jangan pilih salah satu diam-diam.
  return joinMemoText(current, mine)
}

function mergeTitle(base: string, mine: string, current: string): string {
  if (current === base) return mine
  if (mine === base) return current
  // Judul yang sedang diketik user menang; penulis otomatis (review goal) tidak menyentuh judul.
  return mine.trim() ? mine : current
}

function mergeFeelings(
  base: readonly MemoFeeling[],
  mine: readonly MemoFeeling[],
  current: readonly MemoFeeling[],
): MemoFeeling[] {
  if (sameFeelings(current, base)) return [...mine]
  if (sameFeelings(mine, base)) return [...current]
  return [...new Set([...current, ...mine])]
}

/**
 * Gabungkan halaman yang berubah di luar editor dengan draf user tanpa membuang salah satu sisi.
 *
 * Dipakai dua tempat dengan aturan yang sama: editor (`useMemoDraft.prepareSave`, QA #54) dan
 * penyimpanan (`persistMemo`, RISK-65-02) saat tab lain menulis tanggal yang sama.
 */
export function mergeMemoFields(
  base: MemoFields,
  mine: MemoFields,
  current: MemoFields,
): MemoFields {
  return {
    title: mergeTitle(base.title, mine.title, current.title).slice(0, MEMO_TITLE_MAX),
    text: mergeText(base.text, mine.text, current.text).slice(0, MEMO_TEXT_MAX),
    feelings: mergeFeelings(base.feelings, mine.feelings, current.feelings),
  }
}

/** Halaman kosong: titik banding saat halaman tanggal itu belum ada di penyimpanan. */
const EMPTY_FIELDS: MemoFields = { title: '', text: '', feelings: [] }

/** Awal hari lokal: titik index record jurnal (satu-satunya dimensi waktu yang dipakai). */
function dayStartMs(day: string): number {
  return fromIsoDate(day).getTime()
}

/**
 * `Memo` + mood → payload `journal_entry`.
 *
 * `previous` wajib diberikan saat menimpa supaya `createdAt` lama bertahan dan cerita perasaan
 * milik penulis lain tidak terhapus.
 */
export function toJournalEntry(
  memo: Memo,
  mood: number | null,
  nowMs: number,
  previous?: JournalEntry,
): JournalEntry {
  const title = memo.title.trim()
  const text = memo.text.trim()

  return {
    id: memo.id,
    entryDate: memo.date,
    identityToday: title === '' ? null : title,
    mood: moodFromIndex(mood),
    moodStoryMd: isFeelingsStory(previous?.moodStoryMd ?? null)
      ? encodeFeelingsStory(memo.feelings)
      : (previous?.moodStoryMd ?? null),
    diaryMd: text === '' ? null : memo.text,
    createdAt: previous?.createdAt ?? memo.createdAt,
    updatedAt: nowMs,
  }
}

/** Payload `journal_entry` → `Memo`. Mood dibaca terpisah oleh `loadMemoStore`. */
export function fromJournalEntry(entry: JournalEntry, paper: MemoPaperName): Memo {
  return {
    id: entry.id,
    date: entry.entryDate,
    createdAt: entry.createdAt,
    title: entry.identityToday ?? '',
    text: entry.diaryMd ?? '',
    feelings: decodeFeelingsStory(entry.moodStoryMd),
    paper,
  }
}

export type MemoRecords = {
  /**
   * SEMUA halaman, termasuk record mood-saja (judul & isi kosong). Pemanggil menyaring yang punya
   * isi untuk ditampilkan, tetapi tetap butuh id record mood-saja supaya perubahan mood berikutnya
   * meng-update baris yang sama - bukan membuat baris kedua di tanggal yang sama.
   */
  readonly entries: readonly Memo[]
  readonly moods: MoodByDate
}

/** Muat seluruh jurnal + mood. Satu record per tanggal; duplikat lama diambil yang terbaru. */
export async function loadMemoRecords(
  session: LocalDataSession,
  paper: MemoPaperName,
): Promise<MemoRecords> {
  const records = await session.repos.journal.listAll({ includeDeleted: false })
  const latestByDate = new Map<string, JournalEntry>()

  for (const record of records) {
    const entry = journalEntrySchema.parse(record.data)
    const previous = latestByDate.get(entry.entryDate)
    if (previous === undefined || entry.updatedAt > previous.updatedAt) {
      latestByDate.set(entry.entryDate, entry)
    }
  }

  const moods: MoodByDate = {}
  const entries: Memo[] = []

  for (const entry of latestByDate.values()) {
    const index = moodIndex(entry.mood)
    if (index !== null) moods[entry.entryDate] = index
    entries.push(fromJournalEntry(entry, paper))
  }

  entries.sort((left, right) =>
    left.date === right.date
      ? right.createdAt - left.createdAt
      : right.date.localeCompare(left.date),
  )

  return { entries, moods }
}

export type PersistMemoOptions = {
  /**
   * Versi halaman yang dilihat penyunting SEBELUM menyimpan - titik banding tiga arah.
   *
   * `null` = halaman ini belum ada di penyimpanan menurut pemanggil. `undefined` = pemanggil tidak
   * punya titik banding (impor/migrasi): tulis apa adanya, jangan mengarang gabungan.
   */
  readonly base?: Memo | null
}

/**
 * Tulis satu halaman (baru atau perbarui) beserta mood tanggal itu.
 *
 * RISK-65-02: record dibaca ULANG dari penyimpanan sebelum menulis. Kalau isinya sudah berbeda dari
 * `base` (tab lain menyunting tanggal yang sama), kedua versi digabung seperti QA #54 - bukan
 * last-write-wins yang menghapus catatan tab lain. Kembaliannya versi yang benar-benar ditulis,
 * supaya pemanggil bisa menyegarkan state & editor dengan hasil gabungan itu.
 */
export async function persistMemo(
  session: LocalDataSession,
  memo: Memo,
  mood: number | null,
  options: PersistMemoOptions = {},
): Promise<Memo> {
  const existing = await session.repos.journal.getById(memo.id)
  const previous = existing === null ? undefined : journalEntrySchema.parse(existing.data)

  const next =
    previous === undefined
      ? memo
      : mergeWithStored(memo, fromJournalEntry(previous, memo.paper), options.base)

  await session.writer.write({
    id: next.id,
    type: 'journal_entry',
    data: () => toJournalEntry(next, mood, session.clock.nowMs(), previous),
    // Awal hari lokal: rentang ini yang dipakai kalender/overview kalau nanti membaca jurnal per
    // periode, tanpa memindai dan mendekripsi seluruh riwayat.
    index: { rangeStartMs: dayStartMs(next.date), rangeEndMs: null },
  })

  return next
}

/** Versi yang akan ditulis: `mine`, atau gabungan `mine` + isi penyimpanan kalau tab lain menulis. */
function mergeWithStored(mine: Memo, stored: Memo, base: Memo | null | undefined): Memo {
  // Tanpa titik banding tidak ada dasar tiga arah; menebak justru bisa menduplikasi isi.
  if (base === undefined) return mine

  const baseFields = base === null ? EMPTY_FIELDS : memoFields(base)
  const mineFields = memoFields(mine)
  const storedFields = memoFields(stored)
  // Isi penyimpanan masih sama dengan yang kita baca: tidak ada perubahan luar, tulis apa adanya.
  if (sameMemoFields(baseFields, storedFields)) return mine
  // Tab lain sudah menulis isi yang sama dengan yang mau kita tulis (mis. retry setelah gagal).
  if (sameMemoFields(mineFields, storedFields)) return mine

  return { ...mine, ...mergeMemoFields(baseFields, mineFields, storedFields) }
}

/** Hapus halaman (tombstone, ikut outbox). Mood tanggal itu tetap dipertahankan pemanggil. */
export async function removeMemoRecord(session: LocalDataSession, id: string): Promise<void> {
  await session.writer.remove({ id, index: null })
}
