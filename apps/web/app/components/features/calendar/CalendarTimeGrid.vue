<script setup lang="ts">
import type { GridEvent } from '~/composables/useTimeGrid'
import {
  DEFAULT_SCHEDULE_MINUTES,
  SCHEDULE_COLORS,
  formatMinutes,
  type Occurrence,
} from '~/utils/schedule'
import { GRID_START_HOUR, SLOT_COUNT, SLOT_MINUTES, type ResizeEdge } from '~/utils/calendarGrid'
import { fromIsoDate } from '~/utils/time'

/**
 * Timeline 00:00–24:00 (Desktop.dc.html Kalender pekan/hari & "Jadwal hari ini"): tekan atau
 * seret slot 15 menit = jadwal baru, klik item = edit, centang, tarik tepi = ubah jam.
 */
const {
  days,
  selected,
  today,
  now,
  canFocus = false,
  isBare = false,
  scrollToNow = false,
} = defineProps<{
  days: readonly string[]
  selected: string
  today: string
  now: number
  /** Tombol "▶ Fokus" di item jadwal (design: tampilan Hari & Daily Routine). */
  canFocus?: boolean
  /** Tanpa kepala tanggal & baris "Sehari" (Daily Routine). */
  isBare?: boolean
  /** Gulirkan grid ke penanda "sekarang" sekali saat dipasang (design `dlScroll`). */
  scrollToNow?: boolean
}>()
const emit = defineEmits<{
  select: [day: string]
  create: [day: string, time: string, dur: number]
  open: [occurrence: Occurrence]
  focus: [title: string]
}>()

/** Penanda all-day memakai pink lembut, sama seperti design. */
const MARKER_BG = '#fce0f2'

const { t } = useI18n()
const { occurrencesByDay, markersOn, toggleAttendance, toggleTask } = useCalendarData()
const { weekdayShort, longDate } = useDateFormat()
const isCompact = computed(() => days.length > 1)
const grid = useTimeGrid({
  days: () => days,
  isCompact: () => isCompact.value,
  now: () => now,
  onCreate: (day, time, dur) => emit('create', day, time, dur),
})
/** Satu ekspansi untuk seluruh kolom yang tampil, dipakai juga oleh timeline di bawah. */
const byDay = computed(() => occurrencesByDay(days))

const heads = computed(() =>
  days.map((day) => {
    const date = fromIsoDate(day)
    return {
      day,
      dow: weekdayShort(date.getTime()),
      date: date.getDate(),
      label: longDate(date.getTime()),
      allDay: [
        ...(byDay.value.get(day) ?? [])
          .filter((occurrence) => occurrence.schedule.allDay)
          .map((occurrence) => {
            const [solid, tint] = SCHEDULE_COLORS[occurrence.schedule.color] ?? SCHEDULE_COLORS[0]
            return { key: occurrence.key, label: occurrence.schedule.title, dot: solid, bg: tint }
          }),
        ...markersOn(day).map((marker) => ({
          key: marker.key,
          label: marker.title,
          dot: marker.color,
          bg: MARKER_BG,
        })),
      ],
    }
  }),
)

/**
 * Label tombol slot (aria + tooltip) per hari. Dihitung sekali per hari, bukan per slot: 7 kolom
 * x 96 slot = 672 `Intl.DateTimeFormat` baru tiap render kalau `longDate` dipanggil di template.
 */
const slotLabels = computed(() => {
  const labels = new Map<string, string[]>()
  for (const day of days) {
    const date = longDate(fromIsoDate(day).getTime())
    labels.set(
      day,
      Array.from({ length: SLOT_COUNT }, (_, index) =>
        t('calendar.createAt', {
          time: formatMinutes(GRID_START_HOUR * 60 + index * SLOT_MINUTES),
          date,
        }),
      ),
    )
  }
  return labels
})

const body = ref<HTMLElement | null>(null)

onMounted(async () => {
  if (!scrollToNow) return
  // Sesudah render pertama: tinggi grid berasal dari gaya inline, posisi scroll bisa langsung diisi.
  await nextTick()
  if (body.value) body.value.scrollTop = grid.scrollTop.value
})

function create(day: string, time: string): void {
  if (!grid.isJustDragged()) emit('create', day, time, DEFAULT_SCHEDULE_MINUTES)
}

function open(item: GridEvent): void {
  if (!grid.isJustDragged()) emit('open', item.occurrence)
}

function resize(item: GridEvent, edge: ResizeEdge, event: PointerEvent): void {
  grid.startResize(item, edge, event)
}
</script>

<template>
  <div class="time-grid" :class="{ bare: isBare }">
    <template v-if="!isBare">
      <div class="heads">
        <button
          v-for="head in heads"
          :key="head.day"
          type="button"
          class="head"
          :class="{ selected: head.day === selected, today: head.day === today }"
          :aria-label="head.label"
          :aria-pressed="head.day === selected"
          @click="emit('select', head.day)"
        >
          <span class="dow">{{ head.dow }}</span>
          <span class="num">{{ head.date }}</span>
        </button>
      </div>
      <div class="all-day">
        <span class="all-day-label">{{ $t('calendar.allDay') }}</span>
        <div v-for="head in heads" :key="head.day" class="all-day-col">
          <button
            v-for="chip in head.allDay"
            :key="chip.key"
            type="button"
            class="chip"
            :style="{ '--chip-bg': chip.bg }"
            :title="chip.label"
            @click="emit('select', head.day)"
          >
            <span class="dot" :style="{ background: chip.dot }" aria-hidden="true" />
            <span class="chip-label">{{ chip.label }}</span>
          </button>
        </div>
      </div>
    </template>

    <div ref="body" class="body" :style="{ '--grid-h': `${grid.layout.value.height}px` }">
      <div class="hours" aria-hidden="true">
        <span
          v-for="hour in grid.layout.value.hours"
          :key="hour.hour"
          class="hour"
          :class="{ 'is-now': hour.isNow }"
          :style="{ top: `${hour.top}px` }"
          >{{ hour.label }}</span
        >
      </div>
      <div
        v-for="column in grid.layout.value.columns"
        :key="column.day"
        class="col"
        :class="{ today: column.day === today && !isBare }"
      >
        <button
          v-for="slot in column.slots"
          :key="slot.index"
          type="button"
          class="slot"
          :class="`line-${slot.line}`"
          :style="{ top: `${slot.top}px`, height: `${slot.height}px` }"
          :aria-label="slotLabels.get(column.day)?.[slot.index]"
          :title="slotLabels.get(column.day)?.[slot.index]"
          tabindex="-1"
          @pointerdown="grid.startCreate(column.day, slot.minute, $event)"
          @pointerenter="grid.extendCreate(column.day, slot.minute)"
          @click="create(column.day, slot.time)"
        >
          + {{ slot.time }}
        </button>
        <template v-for="item in column.items" :key="item.key">
          <CalendarGridEvent
            v-if="item.kind === 'event'"
            :item="item"
            :is-compact="isCompact"
            :can-focus="canFocus"
            @open="open(item)"
            @toggle="toggleAttendance(item.occurrence.key)"
            @toggle-task="toggleTask"
            @focus="emit('focus', $event)"
            @resize-start="(edge, event) => resize(item, edge, event)"
          />
          <CalendarGridTask
            v-else
            :item="item"
            :is-compact="isCompact"
            @toggle="toggleTask(item.task.id)"
          />
        </template>
        <div
          v-if="column.create"
          class="draft"
          :style="{ top: `${column.create.top}px`, height: `${column.create.height}px` }"
          aria-hidden="true"
        >
          {{ column.create.label }}
        </div>
        <span
          v-if="column.nowTop !== null"
          class="now"
          :style="{ top: `${column.nowTop}px` }"
          aria-hidden="true"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.heads,
.all-day,
.body {
  display: flex;
  gap: 4px;
}

.heads,
.all-day {
  padding-left: 52px;
}

.head {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 6px 0 8px;
  border: none;
  border-radius: calc(14px * var(--rk));
  background: transparent;
}

.head.selected {
  background: var(--soft);
}

.dow {
  font-weight: var(--fw-strong);
  font-size: 12px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--mute-3);
}

/* Kepala hari terpilih punya latar `--soft`; caption 12px di atasnya memakai `--mute-2` (terendah
   5,33:1) supaya kontrasnya tidak bergantung pada sisa ruang token redup di permukaan state
   (QA T16 MAYOR-2). */
.head.selected .dow {
  color: var(--mute-2);
}

.num {
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: 22px;
  line-height: 1.1;
}

/* Aksen di atas `--soft` memakai `--deep` (terendah 4,89:1), bukan `--accent`: bobot angka 22px ini
   < 700 sehingga ambang "large text" 3:1 tidak berlaku, dan `--accent` di `--soft` hanya menyisakan
   ~0,08 di atas ambang AA. */
.head.today .num {
  color: var(--deep);
}

.all-day {
  position: relative;
  margin-top: 4px;
}

.all-day-label {
  position: absolute;
  top: 4px;
  left: 0;
  width: 48px;
  font-weight: var(--fw-strong);
  font-size: 11px;
  text-transform: uppercase;
  color: var(--mute-3);
}

.all-day-col {
  flex: 1;
  min-width: 0;
  min-height: 30px;
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 3px;
  border-radius: calc(10px * var(--rk));
  background: var(--alt);
}

.chip {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 7px;
  border: var(--border-thin) solid var(--outline);
  border-radius: var(--radius-pill);
  background: var(--chip-bg);
  font-weight: var(--fw-strong);
  font-size: 11px;
  text-align: left;
}

.dot {
  width: 8px;
  height: 8px;
  flex-shrink: 0;
  border-radius: calc(3px * var(--rk));
}

.chip-label {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

/*
 * Grid 00:00–24:00 lebih tinggi dari layar, jadi area ini yang menggulir sendiri
 * (design `data-cal-sched`: `max-height: calc(100vh - 300px)`, Daily `- 230px` lewat
 * `--grid-max-h`). `overscroll-behavior` menahan gulir halaman saat grid mentok.
 */
.body {
  position: relative;
  margin-top: 10px;
  padding-top: 6px;
  max-height: var(--grid-max-h, max(320px, calc(100vh - 300px)));
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.bare .body {
  margin-top: 0;
}

.hours {
  position: relative;
  width: 48px;
  height: var(--grid-h);
  flex-shrink: 0;
}

.hour {
  position: absolute;
  right: 6px;
  transform: translateY(-50%);
  font-weight: var(--fw-strong);
  font-size: 11px;
  color: var(--mute-3);
  font-variant-numeric: tabular-nums;
}

.hour.is-now {
  color: var(--danger);
}

.col {
  position: relative;
  flex: 1;
  min-width: 0;
  height: var(--grid-h);
  border-radius: var(--radius-inner);
}

.col.today {
  background: color-mix(in srgb, var(--soft) 33%, transparent);
}

.slot {
  position: absolute;
  right: 0;
  left: 0;
  display: flex;
  align-items: center;
  padding: 0 0 0 8px;
  border: 0;
  background: transparent;
  color: transparent;
  font-weight: var(--fw-strong);
  font-size: 10.5px;
  cursor: copy;
  /* Seret slot = bikin jadwal; tanpa ini browser menyerobot gestur untuk scroll. */
  touch-action: none;
  user-select: none;
}

.slot.line-hour {
  border-top: calc(1.5px * var(--bk)) solid var(--line-2);
}

.slot.line-half {
  border-top: 1px dashed var(--line);
}

.slot:hover {
  background: var(--hover);
  /* `--mute` di atas `--hover` dulu gagal 4/21 (terendah 4,29:1); `--mute-2` terendah 5,73:1. */
  color: var(--mute-2);
}

/* Pratinjau jadwal yang sedang diseret (design `newBox`): putus-putus aksen di atas slot. */
.draft {
  position: absolute;
  right: 2px;
  left: 2px;
  z-index: 5;
  box-sizing: border-box;
  padding: 3px 8px;
  border: 2px dashed var(--accent);
  border-radius: calc(10px * var(--rk));
  background: var(--chip);
  color: var(--deep);
  font-weight: var(--fw-strong);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  pointer-events: none;
}

.now {
  position: absolute;
  right: 0;
  left: -5px;
  z-index: 4;
  height: 2px;
  background: var(--danger);
  pointer-events: none;
  transform: translateY(-1px);
}

.now::before {
  content: '';
  position: absolute;
  top: -3.5px;
  left: 0;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--danger);
}
</style>
