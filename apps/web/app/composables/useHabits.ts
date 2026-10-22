import { createSystemClock } from '@improve-personal/core'

import {
  applyHabitDraft,
  countOn,
  currentStreak,
  isMet,
  isScheduled,
  nextCount,
  setCount,
  validateHabitDraft,
  type CheckIns,
  type Habit,
  type HabitDraft,
  type HabitDraftError,
} from '~/utils/habits'
import { loadHabits, persistCheckin, persistHabit, removeHabit } from '~/utils/habits/persistence'
import type { LocalDataSession } from '~/utils/storage/session'
import { createUuidV7Generator } from '~/utils/storage/uuid'
import { toIsoDate } from '~/utils/time'

import { useLocalData } from './useLocalData'

/**
 * Data habit + check-in (PRD F7) untuk halaman Habit, Daily, dan Overview.
 *
 * Bentuk API sengaja TETAP sinkron seperti fase mock (`habits`, `checkIns`, `toggleDay`, `toggleToday`)
 * supaya pemakainya tidak ikut berubah - dan karena UI memang harus langsung responsif: perubahan
 * masuk ke state lokal lebih dulu, penyimpanan menyusul di antrean tulis.
 *
 * Mutasi yang bisa menghilangkan data kalau gagal (`save`, `remove`, `setArchived`) MENGEMBALIKAN
 * hasil yang bisa dicek pemanggil, dan state optimistisnya di-rollback saat penyimpanan gagal. UI
 * tidak boleh menutup form seolah berhasil kalau DB kosong.
 */
export type UseHabitsOptions = {
  /**
   * Sumber sesi. Default: sesi data lokal aplikasi.
   *
   * Disuntik di test supaya logika ini bisa diuji tanpa Nuxt (dan test memakai adaptor memori core),
   * tanpa mem-mock modul internal.
   */
  readonly session?: () => Promise<LocalDataSession | null>
}

/** Hasil satu penulisan: `ok: false` = state sudah dikembalikan seperti sebelum tulisan. */
export type HabitWriteResult =
  { readonly ok: true } | { readonly ok: false; readonly message: string }

/** Kegagalan `save`: validasi draft, atau penyimpanan yang menolak menulis. */
export type HabitSaveError = HabitDraftError | 'persist'

export type HabitSaveResult =
  | { readonly ok: true; readonly id: string }
  | { readonly ok: false; readonly error: HabitSaveError }

/**
 * Hydrate yang sedang berjalan, dibagi seluruh komponen.
 *
 * Di level modul, bukan per-pemanggil: Habit halaman, Daily, dan Overview harus menunggu hydrate yang
 * SAMA - bukan masing-masing memuat riwayat check-in sendiri. Aman di server karena sesi `null`.
 */
let hydrateInFlight: Promise<void> | null = null

/**
 * Antrean tulis GLOBAL (satu untuk seluruh app).
 *
 * Dua klik cepat pada kotak tanggal yang sama harus selesai berurutan sesuai niat user; tanpa antrean,
 * tulisan yang selesai lebih dulu bisa menimpa total yang lebih baru.
 */
let writeQueue: Promise<void> = Promise.resolve()

/**
 * Revisi tulis terakhir per habit id (level modul, seperti antrean tulis).
 *
 * Rollback hanya boleh dilakukan kalau tulisan yang gagal adalah tulisan TERAKHIR untuk habit itu.
 * Kalau user sudah menyimpan perubahan yang lebih baru, kegagalan tulisan lama tidak boleh
 * menghapus perubahan itu.
 */
const writeRevision = new Map<string, number>()

function nextRevision(id: string): number {
  const revision = (writeRevision.get(id) ?? 0) + 1
  writeRevision.set(id, revision)
  return revision
}

/** Dipakai test supaya hydrate/antrean antar kasus tidak saling mewarisi. */
export function resetHabitsHydrationForTest(): void {
  hydrateInFlight = null
  writeQueue = Promise.resolve()
  writeRevision.clear()
}

/**
 * Gabungkan snapshot hydrate dengan tulisan yang terjadi SELAMA hydrate berjalan.
 *
 * `before` = state saat hydrate mulai, `current` = state saat snapshot database siap. Entitas yang
 * referensinya berubah di antara keduanya adalah tulisan lokal (tambah/edit/hapus) dan harus menang;
 * sisanya mengikuti database. Perbandingan referensi cukup karena setiap perubahan state membuat objek
 * baru untuk entitas yang berubah, dan rollback mengembalikan referensi lama - jadi tulisan yang gagal
 * tidak ikut dipertahankan.
 */
function mergeHabits(
  loaded: readonly Habit[],
  before: readonly Habit[],
  current: readonly Habit[],
): Habit[] {
  const beforeById = new Map(before.map((habit) => [habit.id, habit]))
  const currentById = new Map(current.map((habit) => [habit.id, habit]))
  const merged: Habit[] = []

  for (const habit of loaded) {
    const local = currentById.get(habit.id)
    const isChangedLocally = local !== beforeById.get(habit.id)
    // `local` undefined = dihapus selama hydrate: jangan hidupkan lagi dari snapshot lama.
    if (isChangedLocally) {
      if (local !== undefined) merged.push(local)
      continue
    }
    merged.push(habit)
  }

  const loadedIds = new Set(loaded.map((habit) => habit.id))
  for (const local of current) {
    if (loadedIds.has(local.id)) continue
    // Habit yang lahir selama hydrate belum ada di snapshot - tambahkan, jangan dibuang.
    if (local !== beforeById.get(local.id)) merged.push(local)
  }

  return merged
}

/** Padanan `mergeHabits` untuk check-in: hanya hari yang berubah sejak hydrate mulai yang menang. */
function mergeCheckIns(
  loaded: CheckIns,
  before: CheckIns,
  current: CheckIns,
  habits: readonly Habit[],
): CheckIns {
  const known = new Set(habits.map((habit) => habit.id))
  const merged: CheckIns = {}

  for (const habitId of new Set([...Object.keys(loaded), ...Object.keys(current)])) {
    if (!known.has(habitId)) continue

    const loadedDays = loaded[habitId] ?? {}
    const beforeDays = before[habitId]
    const currentDays = current[habitId]
    const isWrittenLocally = currentDays !== beforeDays
    const days: Record<string, number> = {}

    // Dibangun ulang, bukan disalin lalu dihapus: hari yang dibatalkan selama hydrate (nilai 0)
    // memang tidak boleh ada di state, dan map tanpa kunci 0 lebih jujur daripada `delete`.
    for (const day of new Set([...Object.keys(loadedDays), ...Object.keys(currentDays ?? {})])) {
      const loadedCount = loadedDays[day] ?? 0
      const beforeCount = beforeDays?.[day] ?? 0
      const currentCount = currentDays?.[day] ?? 0
      const count = isWrittenLocally && currentCount !== beforeCount ? currentCount : loadedCount
      if (count > 0) days[day] = count
    }

    merged[habitId] = days
  }

  return merged
}

export function useHabits(options: UseHabitsOptions = {}) {
  const localData = useLocalData()
  const getSession = options.session ?? localData.ensure

  const now = useNow()
  const today = computed(() => toIsoDate(new Date(now.value)))

  const habits = useState<Habit[]>('habits', () => [])
  const checkIns = useState<CheckIns>('habitsCheckIns', () => ({}))
  const status = useState<'idle' | 'loading' | 'ready' | 'error'>('habitsStatus', () => 'idle')
  const error = useState<string | null>('habitsError', () => null)

  /**
   * Id habit baru.
   *
   * UUIDv7 karena `habitSchema.id` menolak versi lain - `crypto.randomUUID()` (v4) akan menghasilkan
   * record yang tidak bisa dibaca lagi. Dibuat di sini (bukan menunggu sesi) supaya `save` tetap
   * sinkron seperti sebelumnya.
   */
  const newHabitId = createUuidV7Generator({ clock: createSystemClock() })

  /**
   * Habit aktif: yang ikut grid, Daily, Overview, dan pilihan target Pomodoro.
   *
   * Ini juga yang dikembalikan sebagai `habits` (lihat `return` di bawah), sehingga habit terarsip
   * hilang dari SEMUA pemakainya tanpa tiap consumer perlu menyaring sendiri. Satu tempat menentukan
   * arti "aktif", dan daftar arsip tetap bisa dibaca lewat `archivedHabits`.
   */
  const activeHabits = computed(() => habits.value.filter((habit) => !habit.isArchived))
  const archivedHabits = computed(() => habits.value.filter((habit) => habit.isArchived))

  /**
   * Muat sekali per muat halaman; panggilan kedua menunggu hydrate yang sedang jalan.
   *
   * Hasil hydrate TIDAK menimpa tulisan yang terjadi selama pemuatan; keduanya digabung supaya habit
   * yang baru disimpan tidak hilang dari state (lihat `mergeHabits`).
   */
  function hydrate(): Promise<void> {
    if (status.value === 'ready') return Promise.resolve()

    if (hydrateInFlight === null) {
      const beforeHabits = habits.value
      const beforeCheckIns = checkIns.value

      hydrateInFlight = (async () => {
        status.value = 'loading'
        try {
          const session = await getSession()
          if (session === null) {
            // SSR, atau sesi belum bisa dibuka: daftar kosong - bukan kegagalan. `hydrateInFlight`
            // dibersihkan di `finally` supaya panggilan berikutnya benar-benar mencoba lagi.
            status.value = 'idle'
            return
          }

          const loaded = await loadHabits(session)
          const mergedHabits = mergeHabits(loaded.habits, beforeHabits, habits.value)
          habits.value = mergedHabits
          checkIns.value = mergeCheckIns(
            loaded.checkIns,
            beforeCheckIns,
            checkIns.value,
            mergedHabits,
          )
          status.value = 'ready'
          error.value = null
        } catch (cause) {
          status.value = 'error'
          error.value = cause instanceof Error ? cause.message : 'habit tidak bisa dimuat'
        } finally {
          hydrateInFlight = null
        }
      })()
    }

    return hydrateInFlight
  }

  /**
   * Jalankan pekerjaan penyimpanan di belakang antrean tulis.
   *
   * Hasilnya menunggu tulisan SELESAI (bukan hanya masuk antrean): pemanggil harus tahu kalau
   * penyimpanan gagal, karena UI sudah terlanjur menampilkan perubahannya. Sesi `null` juga kegagalan
   * - perubahannya tidak tersimpan di mana pun, jadi tidak boleh dilaporkan sebagai sukses.
   */
  function enqueue(work: (session: LocalDataSession) => Promise<void>): Promise<HabitWriteResult> {
    const run = writeQueue.then(async (): Promise<HabitWriteResult> => {
      try {
        const session = await getSession()
        if (session === null) throw new Error('sesi data lokal belum siap')

        await work(session)
        error.value = null
        return { ok: true }
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : 'penyimpanan habit gagal'
        error.value = message
        return { ok: false, message }
      }
    })

    // Antrean tetap hidup walau satu tulisan gagal; kegagalannya sudah ada di hasil `run`.
    writeQueue = run.then(() => undefined)
    return run
  }

  function findHabit(id: string | null | undefined): Habit | undefined {
    return id ? habits.value.find((habit) => habit.id === id) : undefined
  }

  /** Tulis total satu hari ke state lalu ke penyimpanan (0 = hapus record hari itu). */
  function setDay(habitId: string, day: string, count: number): void {
    const before = countOn(checkIns.value, habitId, day)
    if (before === count) return

    checkIns.value = setCount(checkIns.value, habitId, day, count)

    void enqueue((session) =>
      persistCheckin(session, { habitId, localDate: day, amount: count }),
    ).then((result) => {
      if (result.ok) return
      // Hanya kembalikan kalau nilainya masih yang kita tulis: tulisan yang lebih baru menang.
      if (countOn(checkIns.value, habitId, day) === count) {
        checkIns.value = setCount(checkIns.value, habitId, day, before)
      }
    })
  }

  /** Klik kotak tanggal `day` (hari depan, hari bukan jadwal, & habit terarsip diabaikan). */
  function toggleDay(id: string, day: string): void {
    const habit = findHabit(id)
    if (!habit || habit.isArchived || day > today.value || !isScheduled(habit, day)) return

    setDay(id, day, nextCount(habit, countOn(checkIns.value, id, day)))
  }

  /** "Quick habit check" Daily: satu klik = tercapai / batal. */
  function toggleToday(id: string): void {
    const habit = findHabit(id)
    if (!habit || habit.isArchived) return

    setDay(id, today.value, isMet(habit, checkIns.value, today.value) ? 0 : habit.target)
  }

  /** Kembalikan entri yang gagal ditulis ke bentuk sebelumnya. Pemanggil yang memeriksa revisi. */
  function revertHabit(written: Habit, previous: Habit | null): void {
    habits.value =
      previous === null
        ? habits.value.filter((habit) => habit.id !== written.id)
        : habits.value.map((habit) => (habit.id === written.id ? previous : habit))
  }

  async function save(draft: HabitDraft, editId: string | null): Promise<HabitSaveResult> {
    const draftError = validateHabitDraft(draft)
    if (draftError) return { ok: false, error: draftError }

    const base = findHabit(editId) ?? null
    // Arsip bukan bagian form: habit yang sedang diedit tetap terarsip (atau tetap aktif).
    const saved = applyHabitDraft(draft, base?.id ?? newHabitId(), base?.isArchived ?? false)

    habits.value = base
      ? habits.value.map((habit) => (habit.id === saved.id ? saved : habit))
      : [...habits.value, saved]

    const revision = nextRevision(saved.id)
    const written = await enqueue((session) => persistHabit(session, saved))
    if (!written.ok) {
      // Tulisan yang lebih baru (kalau ada) sudah menang - jangan dihapus oleh kegagalan ini.
      if (writeRevision.get(saved.id) === revision) revertHabit(saved, base)
      return { ok: false, error: 'persist' }
    }

    return { ok: true, id: saved.id }
  }

  /** Hapus habit beserta riwayat check-in-nya (design: "Riwayat ikut hilang"). */
  async function remove(id: string): Promise<HabitWriteResult> {
    const index = habits.value.findIndex((habit) => habit.id === id)
    const removed = habits.value[index]
    if (removed === undefined) return { ok: true }

    const checkInsBefore = checkIns.value[id]
    const { [id]: _removedCheckIns, ...checkInsLeft } = checkIns.value
    habits.value = habits.value.filter((habit) => habit.id !== id)
    checkIns.value = checkInsLeft

    const revision = nextRevision(id)
    const written = await enqueue((session) => removeHabit(session, id))
    if (!written.ok && writeRevision.get(id) === revision) {
      // Kembalikan di posisi semula supaya urutan grid tidak berubah karena kegagalan sesaat.
      if (!habits.value.some((habit) => habit.id === removed.id)) {
        const restored = [...habits.value]
        restored.splice(Math.min(index, restored.length), 0, removed)
        habits.value = restored
      }
      if (checkInsBefore !== undefined) {
        checkIns.value = { ...checkIns.value, [removed.id]: checkInsBefore }
      }
    }

    return written
  }

  /** Arsipkan (`true`) atau kembalikan ke daftar aktif (`false`). */
  async function setArchived(id: string, isArchived: boolean): Promise<HabitWriteResult> {
    const habit = findHabit(id)
    if (!habit) return { ok: true }
    if (habit.isArchived === isArchived) return { ok: true }

    const updated: Habit = { ...habit, isArchived }
    habits.value = habits.value.map((current) => (current.id === id ? updated : current))

    const revision = nextRevision(id)
    const written = await enqueue((session) => persistHabit(session, updated))
    if (!written.ok && writeRevision.get(id) === revision) revertHabit(updated, habit)

    return written
  }

  /**
   * Muat ulang begitu sesi data lokal siap.
   *
   * Skenario yang ditutup: perangkat baru/terkunci membuka halaman dengan sesi `null` (daftar kosong),
   * lalu kuncinya dibuka lewat passkey/kode pemulihan - `useKeyRecovery` hanya membuka sesi, tidak
   * memuat ulang halaman. Tanpa watch ini daftar tetap kosong sampai user reload manual.
   *
   * Tidak ada loop: sumbernya status sesi data lokal (bukan status habit), dan `hydrate()` mengabaikan
   * panggilan saat sudah `ready` atau saat hydrate lain masih berjalan.
   */
  watch(
    () => localData.state.value.status,
    (next) => {
      if (next === 'ready') void hydrate()
    },
  )

  // Di server ini tidak melakukan apa pun (sesi `null`), dan `status` tetap `idle`.
  void hydrate()

  return {
    /**
     * Habit AKTIF saja - habit terarsip tidak ikut (lihat `activeHabits`).
     *
     * Semua pemakai lama (`HabitGrid`, `useDailyRoutine`, `useOverview`, `usePomodoroTargets`) tetap
     * memakai kunci ini dan otomatis berhenti menampilkan habit terarsip; daftar arsip dibaca lewat
     * `archivedHabits`. `findHabit()` sengaja tetap mencari di SEMUA habit supaya form edit/arsip
     * masih bisa membuka habit yang sudah terarsip.
     */
    habits: activeHabits,
    activeHabits,
    archivedHabits,
    checkIns: computed(() => checkIns.value),
    today,
    status: computed(() => status.value),
    error: computed(() => error.value),
    hydrate,
    findHabit,
    isMetToday: (habit: Habit) => isMet(habit, checkIns.value, today.value),
    streakOf: (habit: Habit) => currentStreak(habit, checkIns.value, today.value),
    toggleDay,
    toggleToday,
    save,
    remove,
    setArchived,
  }
}
