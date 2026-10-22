import {
  habitCheckinSchema,
  habitSchema,
  jsIndexFromWeekday,
  weekdayFromJsIndex,
  type EntityRecord,
  type Habit as CoreHabit,
  type HabitCheckin,
} from '@improve-personal/core'

import {
  HABIT_COLORS,
  HABIT_ICONS,
  HABIT_LOOKBACK_DAYS,
  type CheckIns,
  type Habit,
  type HabitIcon,
} from '../habits'
import { createRepository } from '../storage/repository'
import type { LocalDataSession } from '../storage/session'
import { MS_PER_DAY, fromIsoDate } from '../time'

/**
 * Persistensi habit: `Habit` (bentuk yang dipakai UI) ↔ record `habit` + `habit_checkin`.
 *
 * Empat keputusan yang perlu diketahui pembaca:
 *
 * 1. **`iconSticker` menampung dua hal.** Core hanya punya satu kolom dekorasi, sedangkan UI punya
 *    ikon (`HABIT_ICONS`) dan sticker opsional yang saling menggantikan. Yang ditulis adalah sticker
 *    kalau dipilih, kalau tidak nama ikonnya. Sticker selalu berbentuk `pack/slug` (mengandung `/`),
 *    jadi saat dibaca kembali keduanya bisa dibedakan tanpa kolom tambahan.
 * 2. **Check-in = satu record per `(habitId, localDate)`**, berisi TOTAL hari itu - bukan satu record
 *    per klik. UI menampilkan angka, bukan riwayat klik, dan `idx_habit_checkin_date` di DBML dibuat
 *    untuk pola baca itu. Record dengan `amount` 0 dibuang (tombstone), bukan disimpan sebagai nol.
 * 3. **Index rentang = awal hari lokal.** `rangeStartMs` ditulis dari tanggal lokal habit, supaya
 *    heatmap Overview bisa `listByRange` untuk sebuah pekan/bulan tanpa memindai dan mendekripsi
 *    seluruh riwayat.
 * 4. **Riwayat dibaca dengan jendela TETAP 400 hari, bukan dari `createdAt`.** UI mengizinkan
 *    backfill ke tanggal sebelum habit dibuat (grid hanya menonaktifkan hari depan), jadi jendela
 *    yang mengikuti `createdAt` akan menyembunyikan check-in yang sah setelah reload. 400 hari
 *    dipilih karena streak (`HABIT_LOOKBACK_DAYS` di `utils/habits.ts`) juga tidak pernah melihat
 *    lebih jauh - check-in di luar itu memang tidak dipakai UI. Jendela ini sekaligus membatasi
 *    jumlah record yang didekripsi saat hydrate (tidak tumbuh linear tanpa batas).
 *
 * `color` disimpan sebagai HEX palet (`habit.color` di core), bukan sebagai index `HABIT_COLORS`:
 * urutan palet di UI boleh berubah tanpa mengubah arti warna habit yang sudah tersimpan. Hex yang
 * tidak dikenal (mis. sisa palet versi lama) dibaca sebagai warna default - warna tidak layak
 * menggagalkan hydrate seluruh daftar habit.
 *
 * Satu field UI yang masih menunggu kolomnya: `goalId` TIDAK dipersist (butuh relasi `goal_link`,
 * F13/T18), jadi `goalId` kembali `null` setelah reload. `color` sudah tidak termasuk daftar itu - jadi
 * warna yang berubah setelah reload adalah bug, bukan keterbatasan yang diketahui.
 */

/** Warna untuk habit tanpa warna tersimpan (`color: null`, termasuk record lama) & hex di luar palet. */
const DEFAULT_HABIT_COLOR = 0
/** Ikon cadangan saat `iconSticker` kosong atau berisi sticker. */
const DEFAULT_HABIT_ICON: HabitIcon = 'star'

/**
 * Jendela baca check-in saat hydrate & saat hapus habit.
 *
 * Sama dengan batas runut streak di `utils/habits.ts`: tidak ada layar yang melihat lebih jauh, jadi
 * menaikkan angka ini hanya menambah dekripsi tanpa menambah informasi yang tampil.
 */
const CHECKIN_LOOKBACK_DAYS = HABIT_LOOKBACK_DAYS

export type CheckinRange = {
  readonly fromMs: number
  readonly toMs: number
}

/** Payload check-in yang ditulis: total hari itu. `amount` 0 = hapus record-nya. */
export type CheckinWrite = {
  readonly habitId: string
  readonly localDate: string
  readonly amount: number
}

function checkinsOf(session: LocalDataSession) {
  // `habit_checkin` tidak ada di `RepositorySet` core, jadi repository-nya dibuat di sini.
  return createRepository<HabitCheckin>(session, 'habit_checkin')
}

/** Awal hari lokal dalam epoch ms - titik index check-in. */
function dayStartMs(localDate: string): number {
  return fromIsoDate(localDate).getTime()
}

/**
 * Index `Habit.color` -> hex palet yang disimpan di core.
 *
 * Index di luar palet (data UI rusak/tak dikenal) jadi `null`, bukan hex tebakan: `null` sudah berarti
 * "pakai warna default UI" di skema core, jadi nilai asing tidak pernah tersimpan sebagai warna nyata.
 */
function habitColorHex(index: number): string | null {
  return HABIT_COLORS[index]?.[0] ?? null
}

/**
 * Hex tersimpan -> index `Habit.color`.
 *
 * Perbandingan tanpa peduli huruf besar/kecil karena hex datang dari perangkat lain (mobile/versi lama)
 * yang belum tentu memakai kapitalisasi palet. `null` dan hex asing sama-sama jatuh ke warna default -
 * bukan error, karena satu warna tak dikenal tidak boleh menggagalkan hydrate seluruh habit.
 */
function habitColorIndex(hex: string | null): number {
  if (hex === null) return DEFAULT_HABIT_COLOR

  const stored = hex.trim().toLowerCase()
  const index = HABIT_COLORS.findIndex(([solid]) => solid.toLowerCase() === stored)
  return index === -1 ? DEFAULT_HABIT_COLOR : index
}

/** `Habit` -> payload `habit` core. `previous` menjaga `createdAt` saat menimpa. */
export function toCoreHabit(habit: Habit, nowMs: number, previous?: CoreHabit): CoreHabit {
  return {
    id: habit.id,
    name: habit.name,
    iconSticker: habit.sticker ?? habit.icon,
    color: habitColorHex(habit.color),
    frequencyType: habit.days === null ? 'daily' : 'weekly_days',
    frequencyDays:
      habit.days === null
        ? null
        : [...new Set(habit.days)].sort((left, right) => left - right).map(weekdayFromJsIndex),
    targetPerDay: habit.target,
    // Arsip adalah bagian state UI (bukan turunan `previous`): `setArchived` menulisnya eksplisit.
    isArchived: habit.isArchived,
    createdAt: previous?.createdAt ?? nowMs,
    updatedAt: nowMs,
  }
}

/** Payload `habit` core -> bentuk UI. */
export function fromCoreHabit(payload: CoreHabit): Habit {
  const iconSticker = payload.iconSticker
  const icon =
    iconSticker === null ? undefined : HABIT_ICONS.find((candidate) => candidate === iconSticker)

  return {
    id: payload.id,
    name: payload.name,
    icon: icon ?? DEFAULT_HABIT_ICON,
    sticker: iconSticker !== null && icon === undefined ? iconSticker : null,
    color: habitColorIndex(payload.color),
    days:
      payload.frequencyType === 'daily'
        ? null
        : (payload.frequencyDays ?? []).map(jsIndexFromWeekday).sort((left, right) => left - right),
    target: payload.targetPerDay,
    goalId: null,
    isArchived: payload.isArchived,
  }
}

/**
 * Check-in dalam rentang index.
 *
 * Rentang dipakai apa adanya; pemanggil yang memperlebar rentang (mis. ±1 hari) untuk toleransi
 * perpindahan zona waktu, karena titik index ditulis dari tengah malam lokal perangkat saat menulis.
 */
export async function loadCheckIns(
  session: LocalDataSession,
  range: CheckinRange,
): Promise<readonly HabitCheckin[]> {
  const records = await checkinsOf(session).listByRange({
    fromMs: range.fromMs,
    toMs: range.toMs,
  })

  return records.map((record) => habitCheckinSchema.parse(record.data))
}

/**
 * Semua habit (aktif & terarsip) + riwayat check-in yang relevan, siap dipakai UI.
 *
 * Riwayat dibaca lewat index untuk jendela TETAP `CHECKIN_LOOKBACK_DAYS` - bukan `listAll` seluruh
 * tabel check-in (tumbuh tanpa batas) dan bukan pula dari hari habit paling tua dibuat (backfill ke
 * tanggal sebelum habit dibuat akan hilang). Check-in milik habit yang sudah dihapus dilewati.
 */
export async function loadHabits(
  session: LocalDataSession,
): Promise<{ habits: Habit[]; checkIns: CheckIns }> {
  const records = await session.repos.habit.listAll({ includeDeleted: false })
  const coreHabits = records.map((record) => habitSchema.parse(record.data))
  const habits = coreHabits.map(fromCoreHabit)

  // Tanpa habit tidak ada yang bisa ditampilkan; jangan dekripsi riwayat 400 hari untuk nol hasil.
  if (coreHabits.length === 0) return { habits, checkIns: {} }

  const nowMs = session.clock.nowMs()
  const checkins = await loadCheckIns(session, {
    // ±1 hari: titik index memakai tengah malam lokal saat record ditulis, dan zona waktu perangkat
    // bisa bergeser. Check-in di luar tanggal yang dicari disaring lagi di bawah.
    fromMs: nowMs - CHECKIN_LOOKBACK_DAYS * MS_PER_DAY,
    toMs: nowMs + MS_PER_DAY,
  })

  const knownHabitIds = new Set(habits.map((habit) => habit.id))
  const checkIns: CheckIns = {}

  for (const checkin of checkins) {
    if (!knownHabitIds.has(checkin.habitId)) continue

    const days = checkIns[checkin.habitId] ?? {}
    // Satu hari bisa punya beberapa baris (DBML: bukan unique) - jumlahkan, jangan saling menimpa.
    days[checkin.localDate] = (days[checkin.localDate] ?? 0) + checkin.amount
    checkIns[checkin.habitId] = days
  }

  return { habits, checkIns }
}

/** Simpan satu habit (baru atau hasil edit). */
export async function persistHabit(session: LocalDataSession, habit: Habit): Promise<void> {
  const existing = await session.repos.habit.getById(habit.id)
  const previous = existing === null ? undefined : habitSchema.parse(existing.data)

  await session.writer.write({
    id: habit.id,
    type: 'habit',
    data: () => toCoreHabit(habit, session.clock.nowMs(), previous),
    // Habit tidak punya dimensi waktu; baris index tetap ditulis supaya `listAll` bisa menemukannya.
    index: null,
  })
}

/**
 * Hapus habit beserta SELURUH riwayat check-in-nya (design: "Riwayat ikut hilang").
 *
 * `RepositorySet` core tidak punya repo `habit_checkin`, dan `listByRange` tidak bisa memfilter
 * `habitId` - jadi riwayat disapu lewat `listAll` lalu disaring per habit. Trade-off yang diterima:
 * hapus jadi O(n) dekripsi SELURUH check-in (bukan hanya milik habit ini). Hapus jarang terjadi dan
 * menambah query per-habit ke `packages/core` bukan pilihan di perbaikan ini; yang tidak boleh
 * diterima adalah baris yatim tanpa outbox `delete` seperti perilaku lama (jendela `createdAt`).
 *
 * Check-in dihapus lebih dulu: kalau proses terhenti di tengah, habit masih terlihat dengan sebagian
 * riwayat - lebih jujur daripada habit hilang tapi check-in-nya tertinggal sebagai data yatim.
 */
export async function removeHabit(session: LocalDataSession, id: string): Promise<void> {
  const existing = await session.repos.habit.getById(id)
  if (existing === null) return

  const records = await checkinsOf(session).listAll({ includeDeleted: false })
  for (const record of records) {
    if (habitCheckinSchema.parse(record.data).habitId !== id) continue
    // `index: null`: tombstone tidak boleh ikut terbaca query rentang setelah dihapus.
    await session.writer.remove({ id: record.id, index: null })
  }

  await session.writer.remove({ id, index: null })
}

/**
 * Tulis total check-in satu `(habitId, localDate)`.
 *
 * `amount` 0 menghapus record hari itu (tidak ada "check-in nol"); `amount` > 0 menimpa record yang
 * sudah ada supaya satu hari tetap satu baris. Baris duplikat dari data lama/platform lain digabung
 * ke baris pertama lalu di-tombstone, bukan dibiarkan menumpuk.
 */
export async function persistCheckin(
  session: LocalDataSession,
  input: CheckinWrite,
): Promise<void> {
  const existing = await findCheckinRecords(session, input.habitId, input.localDate)

  if (input.amount <= 0) {
    for (const record of existing) await session.writer.remove({ id: record.id })
    return
  }

  const [kept, ...duplicates] = existing
  const nowMs = session.clock.nowMs()

  await session.writer.write({
    id: kept?.id ?? session.newId(),
    type: 'habit_checkin',
    // Dari `id` record, bukan dari salinan: invariant "id payload = id record" tidak bisa dilanggar.
    data: (checkinId) =>
      ({
        id: checkinId,
        habitId: input.habitId,
        localDate: input.localDate,
        amount: input.amount,
        checkinAt: nowMs,
      }) satisfies HabitCheckin,
    index: { rangeStartMs: dayStartMs(input.localDate), rangeEndMs: null },
  })

  for (const duplicate of duplicates) await session.writer.remove({ id: duplicate.id })
}

/** Record check-in untuk satu `(habitId, localDate)`; biasanya nol atau satu baris. */
async function findCheckinRecords(
  session: LocalDataSession,
  habitId: string,
  localDate: string,
): Promise<readonly EntityRecord<HabitCheckin>[]> {
  const start = dayStartMs(localDate)
  // Rentang selebar ±1 hari, lalu disaring `localDate` di sini: toleran terhadap record yang
  // di-index pada jam lokal berbeda (zona waktu perangkat bergeser), tanpa melonggarkan hasil.
  const records = await checkinsOf(session).listByRange({
    fromMs: start - MS_PER_DAY,
    toMs: start + MS_PER_DAY,
  })

  return records.filter((record) => {
    const checkin = habitCheckinSchema.parse(record.data)
    return checkin.habitId === habitId && checkin.localDate === localDate
  })
}
