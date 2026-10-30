import {
  COMPACT_HEAD_PX,
  EVENT_HEAD_PX,
  GRID_END_HOUR,
  GRID_START_HOUR,
  LINKED_FRAME_PX,
  LINKED_ROW_PX,
  SLOT_COUNT,
  SLOT_MINUTES,
  SLOTS_PER_HOUR,
  createRange,
  entryNeed,
  gridScale,
  isVisible,
  minuteClock,
  placeColumns,
  resizeEntry,
  scrollTopForNow,
  slotHeights,
  type ResizeEdge,
} from '~/utils/calendarGrid'
import { SCHEDULE_COLORS, formatMinutes, type Occurrence } from '~/utils/schedule'
import type { Task } from '~/utils/tasks'
import { toIsoDate } from '~/utils/time'

/** Klik yang menyusul langsung setelah tarik bukan "buka item" (design `recent()`). */
const DRAG_CLICK_GUARD_MS = 300
/** Penanda to-do digambar setinggi 30 menit (design). */
const TASK_MARKER_MINUTES = 30
/** Batas tinggi (px) variasi tampilan item jadwal. */
const SMALL_PX = 24
const BIG_PX = 42
const COMPACT_BIG_PX = 22

export type GridEventSize = 'tiny' | 'small' | 'big'

interface Box {
  key: string
  top: number
  height: number
  left: number
  width: number
}

export interface GridEvent extends Box {
  kind: 'event'
  occurrence: Occurrence
  start: number
  dur: number
  solid: string
  tint: string
  size: GridEventSize
  isDone: boolean
  isDragging: boolean
  linked: Task[]
  /** To-do tertaut yang tidak muat (tampil sebagai "+N to-do"). */
  moreCount: number
}

export interface GridTask extends Box {
  kind: 'task'
  task: Task
  start: number
}

export type GridItem = GridEvent | GridTask

interface DragState {
  scheduleId: string
  day: string
  start: number
  dur: number
}

/** Kotak putus-putus pratinjau jadwal baru (design `newBox`). */
interface CreateBox {
  top: number
  height: number
  /** "HH:MM–HH:MM". */
  label: string
}

/** Jadwal baru yang sedang ditentukan dengan menekan/menyeret slot (design `dnew`). */
interface CreateState {
  day: string
  /** Slot yang ditekan. */
  a: number
  /** Slot terakhir yang dilewati pointer. */
  b: number
}

/**
 * Timeline Kalender (pekan/hari) & "Jadwal hari ini": posisi item, slot 15 menit, garis
 * sekarang, tarik tepi jadwal untuk ubah jam, dan seret slot untuk bikin jadwal baru
 * (Desktop.dc.html `buildGrid`).
 */
export function useTimeGrid(options: {
  days: () => readonly string[]
  isCompact: () => boolean
  now: () => number
  /** Jadwal baru selesai ditentukan: `time` = jam mulai `HH:MM`, `dur` = menit. */
  onCreate?: (day: string, time: string, dur: number) => void
}) {
  const { occurrencesByDay } = useCalendarData()
  const { tasks } = useTasks()
  const { attendance, retime } = useSchedules()

  const drag = ref<DragState | null>(null)
  const createDraft = ref<CreateState | null>(null)
  let draggedAt = 0
  let stopDrag: (() => void) | null = null
  let stopCreate: (() => void) | null = null
  onBeforeUnmount(() => {
    stopDrag?.()
    stopCreate?.()
  })

  function linkedTasks(scheduleId: string): Task[] {
    return tasks.value.filter((task) => task.scheduleId === scheduleId)
  }

  function entriesOf(day: string, dayOccurrences: readonly Occurrence[]) {
    const compact = options.isCompact()
    const events = dayOccurrences
      .filter((occurrence) => !occurrence.schedule.allDay)
      .map((occurrence) => {
        const preview =
          drag.value?.scheduleId === occurrence.schedule.id && drag.value.day === day
            ? drag.value
            : null
        const start = preview?.start ?? occurrence.start
        const dur = preview?.dur ?? occurrence.schedule.dur
        const linked = linkedTasks(occurrence.schedule.id)
        return {
          key: occurrence.key,
          start,
          dur,
          need: entryNeed('event', dur, linked.length, compact),
          kind: 'event' as const,
          occurrence,
          linked,
        }
      })
    const markers = tasks.value
      .filter(
        (task) =>
          task.scheduleId === null &&
          task.deadline !== null &&
          toIsoDate(new Date(task.deadline)) === day,
      )
      .map((task) => {
        const at = new Date(task.deadline ?? 0)
        return {
          key: `task-${task.id}`,
          start: at.getHours() * 60 + at.getMinutes(),
          dur: TASK_MARKER_MINUTES,
          need: entryNeed('task', TASK_MARKER_MINUTES, 0, compact),
          kind: 'task' as const,
          task,
        }
      })
    return [...events, ...markers].filter(isVisible)
  }

  const layout = computed(() => {
    const compact = options.isCompact()
    // Satu ekspansi untuk semua kolom yang tampil, bukan satu per hari.
    const byDay = occurrencesByDay(options.days())
    const perDay = options
      .days()
      .map((day) => ({ day, entries: entriesOf(day, byDay.get(day) ?? []) }))
    const scale = gridScale(slotHeights(perDay.map(({ entries }) => entries)))
    const now = new Date(options.now())
    const today = toIsoDate(now)
    const nowMinutes = now.getHours() * 60 + now.getMinutes()

    const toItem = (
      entry: ReturnType<typeof entriesOf>[number] & { col: number; cols: number },
    ): GridItem => {
      const top = scale.yAt(entry.start) + 1
      const height = Math.max(scale.yAt(entry.start + entry.dur) - scale.yAt(entry.start) - 2, 12)
      const box = {
        key: entry.key,
        top,
        left: (entry.col / entry.cols) * 100,
        width: 100 / entry.cols,
      }
      if (entry.kind === 'task') {
        return {
          ...box,
          kind: 'task',
          task: entry.task,
          start: entry.start,
          height: Math.max(height, 22),
        }
      }
      const [solid, tint] = SCHEDULE_COLORS[entry.occurrence.schedule.color] ?? SCHEDULE_COLORS[0]
      let size: GridEventSize = height < SMALL_PX ? 'tiny' : height < BIG_PX ? 'small' : 'big'
      if (compact) size = height < COMPACT_BIG_PX ? 'tiny' : 'big'
      // To-do tertaut juga tampil di kartu ringkas (tampilan pekan); sisa yang tidak muat
      // dilaporkan lewat "moreCount".
      const head = compact ? COMPACT_HEAD_PX : EVENT_HEAD_PX
      const room = Math.max(0, Math.floor((height - head - LINKED_FRAME_PX) / LINKED_ROW_PX))
      return {
        ...box,
        height,
        kind: 'event',
        occurrence: entry.occurrence,
        start: entry.start,
        dur: entry.dur,
        solid,
        tint,
        size,
        isDone: Boolean(attendance.value[entry.occurrence.key]),
        isDragging:
          drag.value?.scheduleId === entry.occurrence.schedule.id &&
          drag.value.day === entry.occurrence.day,
        linked: entry.linked.slice(0, room),
        moreCount: Math.max(0, entry.linked.length - room),
      }
    }

    return {
      height: scale.height,
      hours: Array.from({ length: GRID_END_HOUR - GRID_START_HOUR }, (_, index) => {
        const hour = GRID_START_HOUR + index
        return {
          hour,
          label: formatMinutes(hour * 60),
          top: scale.slot(index * SLOTS_PER_HOUR).top,
          isNow: perDay.some(({ day }) => day === today) && hour === now.getHours(),
        }
      }),
      columns: perDay.map(({ day, entries }) => ({
        day,
        // Grid kini menutup 00:00–24:00, jadi penanda "sekarang" selalu punya posisi.
        nowTop: day === today ? scale.yAt(nowMinutes) : null,
        create: createBox(day, scale),
        slots: Array.from({ length: SLOT_COUNT }, (_, index) => ({
          index,
          minute: GRID_START_HOUR * 60 + index * SLOT_MINUTES,
          ...scale.slot(index),
          time: formatMinutes(GRID_START_HOUR * 60 + index * SLOT_MINUTES),
          line:
            index % SLOTS_PER_HOUR === 0 ? 'hour' : index % SLOTS_PER_HOUR === 2 ? 'half' : 'none',
        })),
        items: placeColumns(entries).map(toItem),
      })),
      scale,
    }
  })

  /** Kotak putus-putus jadwal baru untuk kolom `day` (design `newBox`). */
  function createBox(day: string, scale: ReturnType<typeof gridScale>): CreateBox | null {
    const draft = createDraft.value
    if (!draft || draft.day !== day) return null
    const { start, dur } = createRange(draft.a, draft.b)
    const top = scale.yAt(start)
    return {
      top,
      height: Math.max(scale.yAt(start + dur) - top, 12),
      label: `${minuteClock(start)}–${minuteClock(start + dur)}`,
    }
  }

  /** `scrollTop` awal grid: penanda "sekarang" kolom hari ini, atau jam sekarang kalau hari ini tidak tampil. */
  const scrollTop = computed(() => {
    const now = new Date(options.now())
    const nowMinutes = now.getHours() * 60 + now.getMinutes()
    const column = layout.value.columns.find((item) => item.nowTop !== null)
    return scrollTopForNow(column?.nowTop ?? null, nowMinutes, layout.value.scale.yAt)
  })

  /** Mulai tarik tepi `edge` jadwal; tiap langkah = tinggi slot di tepi itu. */
  function startResize(item: GridEvent, edge: ResizeEdge, event: PointerEvent): void {
    event.preventDefault()
    const origin = { start: item.start, dur: item.dur, y: event.clientY }
    const edgeMinute = edge === 'top' ? origin.start : origin.start + origin.dur - 1
    const slotIndex = Math.floor((edgeMinute - GRID_START_HOUR * 60) / SLOT_MINUTES)
    const stepPx = layout.value.scale.slot(Math.max(0, Math.min(SLOT_COUNT - 1, slotIndex))).height
    const base = { scheduleId: item.occurrence.schedule.id, day: item.occurrence.day }
    drag.value = { ...base, start: origin.start, dur: origin.dur }

    const onMove = (move: PointerEvent): void => {
      const next = resizeEntry(edge, origin.start, origin.dur, (move.clientY - origin.y) / stepPx)
      if (drag.value?.start !== next.start || drag.value.dur !== next.dur)
        drag.value = { ...base, ...next }
    }
    const detach = (): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      stopDrag = null
    }
    const onUp = (): void => {
      detach()
      const final = drag.value
      drag.value = null
      draggedAt = Date.now()
      if (final) retime(final.scheduleId, final.start, final.dur)
    }
    stopDrag?.()
    stopDrag = detach
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  /**
   * Mulai jadwal baru dari slot yang ditekan (design `slotDown`). Slot lain yang dilewati
   * pointer memperpanjang rentang lewat `extendCreate`; pointerup menyerahkannya ke `onCreate`.
   */
  function startCreate(day: string, minute: number, event: PointerEvent): void {
    if (event.button !== 0 || drag.value) return
    event.preventDefault()
    createDraft.value = { day, a: minute, b: minute }

    const detach = (): void => {
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      stopCreate = null
    }
    const onUp = (): void => {
      detach()
      const final = createDraft.value
      createDraft.value = null
      if (!final) return
      const { start, dur } = createRange(final.a, final.b)
      // `click` slot menyusul pointerup; anggap baru saja "digeser" supaya tidak bikin jadwal kedua.
      draggedAt = Date.now()
      options.onCreate?.(final.day, formatMinutes(start), dur)
    }
    const onCancel = (): void => {
      detach()
      createDraft.value = null
    }
    stopCreate?.()
    stopCreate = detach
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
  }

  /** Pointer masuk ke slot lain selama menekan (design `slotEnter`). */
  function extendCreate(day: string, minute: number): void {
    const draft = createDraft.value
    if (!draft || draft.day !== day || draft.b === minute) return
    createDraft.value = { ...draft, b: minute }
  }

  return {
    layout,
    scrollTop,
    startResize,
    startCreate,
    extendCreate,
    isJustDragged: (): boolean => Date.now() - draggedAt < DRAG_CLICK_GUARD_MS,
  }
}
