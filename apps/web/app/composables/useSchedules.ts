import { createSystemClock } from '@improve-personal/core'

import {
  createSchedule,
  deleteSchedules,
  editSchedules,
  formatMinutes,
  toMinutes,
  validateScheduleDraft,
  type EditScope,
  type Schedule,
  type ScheduleDraft,
  type ScheduleDraftError,
} from '~/utils/schedule'
import {
  loadScheduleData,
  persistAttendance,
  persistSchedule,
  removeAttendanceFrom,
  removeSchedule,
} from '~/utils/schedules/persistence'
import { resizeEntry } from '~/utils/calendarGrid'
import { removeItemGoalLinks, syncItemGoalLink } from '~/utils/goals/links'
import type { LocalDataSession } from '~/utils/storage/session'
import {
  isReloadSessionActive,
  readAfterWrites,
  registerSyncReloader,
  reloadSession,
} from '~/utils/sync/refresh'
import { createUuidV7Generator } from '~/utils/storage/uuid'
import { deviceTimeZone } from '~/utils/time'

import { useGoalLinks } from './useGoalLinks'
import { useLocalData } from './useLocalData'

/**
 * Data jadwal (PRD F1) untuk Kalender, Jadwal, Home, dan Daily.
 *
 * Sama seperti `useTasks`: perubahan masuk ke state lokal lebih dulu supaya UI langsung responsif,
 * penyimpanan (IndexedDB terenkripsi) menyusul di belakang layar. Kegagalan penyimpanan muncul di
 * `error`, bukan ditelan.
 *
 * Mesin recurrence-nya milik `@improve-personal/core` - modul ini hanya mengubah model presentasi
 * (tanggal lokal + `HH:MM`) ke payload core dan kembali.
 */
export type UseSchedulesOptions = {
  /** Sumber sesi; disuntik di test supaya bisa memakai adaptor memori core. */
  readonly session?: () => Promise<LocalDataSession | null>
}

let hydrateInFlight: Promise<void> | null = null
/** Reload setelah pull; satu pun untuk seluruh komponen. */
let reloadInFlight: Promise<void> | null = null

/**
 * Antrean tulis GLOBAL (satu untuk seluruh app).
 *
 * Sama seperti task/habit: dua perubahan cepat pada jadwal yang sama (mis. geser jam lalu geser lagi)
 * harus mendarat berurutan sesuai niat user, bukan menurut siapa yang selesai lebih dulu. Reload
 * setelah pull juga memakai antrean ini supaya tidak membaca sebelum perubahan lokal tersimpan.
 */
let writeQueue: Promise<void> = Promise.resolve()

/** Dipakai test supaya hydrate antar kasus tidak saling mewarisi. */
export function resetSchedulesHydrationForTest(): void {
  hydrateInFlight = null
  reloadInFlight = null
  writeQueue = Promise.resolve()
}

export function useSchedules(options: UseSchedulesOptions = {}) {
  const localData = useLocalData()
  const getSession = options.session ?? localData.ensure
  const goalLinks = useGoalLinks(options.session ? { session: options.session } : {})
  const tz = deviceTimeZone()

  const schedules = useState<Schedule[]>('schedules', () => [])
  /** Kehadiran per kejadian, kunci `<id>@<tanggal>`. */
  const attendance = useState<Record<string, boolean>>('schedule-attendance', () => ({}))
  const status = useState<'idle' | 'loading' | 'ready' | 'error'>('schedulesStatus', () => 'idle')
  const error = useState<string | null>('schedulesError', () => null)

  const newScheduleId = createUuidV7Generator({ clock: createSystemClock() })

  /**
   * Baca data satu sesi tanpa menulis state. Dipakai `hydrate` dan `reload` supaya aturan muatnya
   * satu versi.
   *
   * `goalLinks` lebih dulu: bentuk `Schedule` membawa `goalId`/`goalChapterId` dari tautan.
   */
  async function read(
    session: LocalDataSession,
  ): Promise<{ schedules: Schedule[]; attendance: Record<string, boolean> }> {
    await goalLinks.hydrate(session)

    return loadScheduleData(
      session,
      tz,
      new Map(
        goalLinks.links.value
          .filter((link) => link.itemType === 'schedule')
          .map((link) => [link.itemId, link] as const),
      ),
    )
  }

  function apply(data: { schedules: Schedule[]; attendance: Record<string, boolean> }): void {
    schedules.value = data.schedules
    attendance.value = data.attendance
  }

  async function load(session: LocalDataSession): Promise<void> {
    apply(await read(session))
  }

  function hydrate(): Promise<void> {
    if (status.value === 'ready') return Promise.resolve()

    hydrateInFlight ??= (async () => {
      status.value = 'loading'
      try {
        const session = await getSession()
        if (session === null) {
          status.value = 'idle'
          return
        }

        await load(session)
        status.value = 'ready'
        error.value = null
      } catch (cause) {
        status.value = 'error'
        error.value = cause instanceof Error ? cause.message : 'jadwal tidak bisa dimuat'
        hydrateInFlight = null
      }
    })()

    return hydrateInFlight
  }

  /**
   * Muat ulang setelah pull menerapkan record perangkat lain. `status` tidak diubah ke `loading`
   * (daftar lama tetap tampil sampai versi baru siap), dan antrean tulis ditunggu lebih dulu supaya
   * perubahan lokal yang belum mendarat tidak tertimpa hasil pull.
   */
  function reload(): Promise<void> {
    if (status.value === 'idle') return Promise.resolve()

    reloadInFlight ??= (async () => {
      try {
        const target = await reloadSession(localData.current, getSession)
        if (target === null) return

        const loaded = await readAfterWrites(
          () => writeQueue,
          () => read(target.session),
        )

        // Sesi bisa berganti pemilik selama pembacaan (lihat `isReloadSessionActive`).
        if (!isReloadSessionActive(target, localData.current)) return

        apply(loaded)
        status.value = 'ready'
        error.value = null
      } catch (cause) {
        status.value = 'error'
        error.value = cause instanceof Error ? cause.message : 'jadwal tidak bisa dimuat'
      } finally {
        reloadInFlight = null
      }
    })()

    return reloadInFlight
  }

  function background(work: (session: LocalDataSession) => Promise<void>, failure: string): void {
    writeQueue = writeQueue.then(async () => {
      try {
        const session = await getSession()
        if (session === null) return

        await work(session)
        error.value = null
      } catch (cause) {
        status.value = 'error'
        error.value = cause instanceof Error ? cause.message : failure
      }
    })
    void writeQueue
  }

  function findSchedule(id: string): Schedule | undefined {
    return schedules.value.find((schedule) => schedule.id === id)
  }

  function save(
    draft: ScheduleDraft,
    edit: { id: string; occurrence: string; scope: EditScope } | null,
  ): { id: string } | { error: ScheduleDraftError } {
    const draftError = validateScheduleDraft(draft)
    if (draftError) return { error: draftError }

    const original = edit ? findSchedule(edit.id) : undefined
    const before = new Map(schedules.value.map((schedule) => [schedule.id, schedule]))
    const createdId = newScheduleId()
    const next =
      edit && original
        ? editSchedules(
            schedules.value,
            original,
            edit.occurrence,
            draft,
            edit.scope,
            createdId,
            tz,
          )
        : [...schedules.value, createSchedule(draft, createdId)]

    schedules.value = next

    const nextIds = new Set(next.map((schedule) => schedule.id))
    const changed = next.filter((schedule) => {
      const previous = before.get(schedule.id)
      return previous === undefined || !sameSchedule(previous, schedule)
    })
    const removed = [...before.keys()].filter((id) => !nextIds.has(id))

    background(async (session) => {
      for (const schedule of changed) {
        await persistSchedule(session, schedule, tz)
        const link = await syncItemGoalLink(session, {
          itemType: 'schedule',
          itemId: schedule.id,
          goalId: schedule.goalId,
          goalChapterId: schedule.goalChapterId ?? null,
        })
        if (link.ok) goalLinks.apply('schedule', schedule.id, link.link)
      }
      for (const id of removed) {
        await removeSchedule(session, id)
        await removeItemGoalLinks(session, 'schedule', id)
        goalLinks.apply('schedule', id, null)
      }
    }, 'jadwal tidak bisa disimpan')

    // Pemanggil (form) memakai id ini untuk menautkan task ke jadwal. "Kejadian ini"/"ini &
    // berikutnya" memindahkan kejadian yang diedit ke jadwal BARU (`createdId`), jadi task yang
    // ditautkan harus ikut ke sana - kalau menempel ke seri lama, checklist-nya tidak pernah tampil
    // di tanggal itu karena seri lama sudah dikecualikan.
    const ownerId = next.some((schedule) => schedule.id === createdId) ? createdId : original?.id
    return { id: ownerId ?? createdId }
  }

  function remove(id: string, occurrence: string, scope: EditScope): void {
    const original = findSchedule(id)
    if (!original) return

    const next = deleteSchedules(schedules.value, original, occurrence, scope)
    schedules.value = next

    const survivor = next.find((schedule) => schedule.id === id)
    const fromDay = scope === 'all' || original.rec.type === 'once' ? null : occurrence
    const exact = scope === 'this'
    attendance.value = withoutAttendance(attendance.value, id, fromDay, exact)

    background(async (session) => {
      if (survivor) {
        await persistSchedule(session, survivor, tz)
      } else {
        await removeSchedule(session, id)
        await removeItemGoalLinks(session, 'schedule', id)
        goalLinks.apply('schedule', id, null)
      }
      await removeAttendanceFrom(session, id, fromDay, tz, exact)
    }, 'jadwal tidak bisa dihapus')
  }

  /**
   * Hasil tarik tepi jadwal di timeline (design): jam mulai/durasi seluruh seri ikut berubah.
   * Nilai dijepit lewat `resizeEntry` (slot 15 menit, di dalam grid, minimal 15 menit).
   */
  function retime(id: string, start: number, dur: number): void {
    const original = findSchedule(id)
    if (!original || original.allDay) return

    const clamped = resizeEntry('bottom', start, dur, 0)
    if (clamped.start === toMinutes(original.time) && clamped.dur === original.dur) return

    const updated = { ...original, time: formatMinutes(clamped.start), dur: clamped.dur }
    schedules.value = schedules.value.map((schedule) => (schedule.id === id ? updated : schedule))
    background((session) => persistSchedule(session, updated, tz), 'jadwal tidak bisa disimpan')
  }

  function toggleAttendance(key: string): void {
    const next = !attendance.value[key]
    attendance.value = { ...attendance.value, [key]: next }

    const separator = key.indexOf('@')
    if (separator < 0) return

    const schedule = findSchedule(key.slice(0, separator))
    const day = key.slice(separator + 1)
    if (!schedule) return

    background(
      (session) => persistAttendance(session, schedule, day, next, tz),
      'kehadiran tidak bisa disimpan',
    )
  }

  // Di server ini tidak melakukan apa pun (sesi `null`), dan `status` tetap `idle`.
  void hydrate()

  // Halaman yang memakai jadwal ikut memuat ulang saat pull menerapkan data perangkat lain.
  registerSyncReloader('schedules', reload)

  return {
    schedules: computed(() => schedules.value),
    attendance: computed(() => attendance.value),
    status: computed(() => status.value),
    error: computed(() => error.value),
    hydrate,
    reload,
    findSchedule,
    save,
    remove,
    retime,
    toggleAttendance,
  }
}

function sameSchedule(a: Schedule, b: Schedule): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

function withinScope(
  key: string,
  scheduleId: string,
  fromDay: string | null,
  exact: boolean,
): boolean {
  const separator = key.indexOf('@')
  if (separator < 0 || key.slice(0, separator) !== scheduleId) return false
  if (fromDay === null) return true
  return exact ? key.slice(separator + 1) === fromDay : key.slice(separator + 1) >= fromDay
}

function withoutAttendance(
  attendance: Record<string, boolean>,
  scheduleId: string,
  fromDay: string | null,
  exact: boolean,
): Record<string, boolean> {
  return Object.fromEntries(
    Object.entries(attendance).filter(([key]) => !withinScope(key, scheduleId, fromDay, exact)),
  )
}
