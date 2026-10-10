<script setup lang="ts">
import { SCHEDULE_COLORS, formatMinutes, layoutLanes, type Occurrence } from '~/utils/schedule'
import { fromIsoDate } from '~/utils/time'

const { days, selected, today, now } = defineProps<{
  days: string[]
  selected: string
  today: string
  now: number
}>()
const emit = defineEmits<{
  select: [day: string]
  create: [day: string, time: string]
  open: [occurrence: Occurrence]
}>()

/** Design: grid 06:00–24:00, 48px per jam; jadwal < 45 menit tanpa baris jam. */
const FIRST_HOUR = 6
const HOURS = 18
const HOUR_PX = 48
const MIN_EVENT_PX = 22
const SHOW_TIME_MIN = 45
const TASK_DOT = 'var(--icon-todo)'
const MARKER_BG = '#fce0f2'

const { occurrences, tasksOn, markersOn, attendance } = useCalendarData()
const { weekdayShort, longDate } = useDateFormat()
const scroller = useTemplateRef<HTMLElement>('scroller')

const hours = Array.from({ length: HOURS }, (_, i) => FIRST_HOUR + i)
const toPx = (minutes: number): number => ((minutes - FIRST_HOUR * 60) / 60) * HOUR_PX

const columns = computed(() =>
  days.map((day) => {
    const all = occurrences(day)
    const date = fromIsoDate(day)
    return {
      day,
      dow: weekdayShort(date.getTime()),
      date: date.getDate(),
      label: longDate(date.getTime()),
      allDay: [
        ...all
          .filter((occurrence) => occurrence.schedule.allDay)
          .map((occurrence) => {
            const [solid, tint] = SCHEDULE_COLORS[occurrence.schedule.color] ?? SCHEDULE_COLORS[0]
            return { key: occurrence.key, label: occurrence.schedule.title, dot: solid, bg: tint }
          }),
        ...tasksOn(day).map((task) => ({
          key: task.id,
          label: task.title,
          dot: TASK_DOT,
          bg: 'var(--paper)',
        })),
        ...markersOn(day).map((marker) => ({
          key: marker.key,
          label: marker.title,
          dot: marker.color,
          bg: MARKER_BG,
        })),
      ],
      events: layoutLanes(all.filter((occurrence) => !occurrence.schedule.allDay)).map((event) => {
        const [solid, tint, text] = SCHEDULE_COLORS[event.schedule.color] ?? SCHEDULE_COLORS[0]
        return {
          event,
          style: {
            top: `${Math.max(0, toPx(event.start))}px`,
            height: `${Math.max(MIN_EVENT_PX, (event.schedule.dur / 60) * HOUR_PX)}px`,
            left: `${(event.lane / event.lanes) * 100}%`,
            width: `${100 / event.lanes}%`,
            '--ev-solid': solid,
            '--ev-tint': tint,
            '--ev-text': text,
          },
          time: formatMinutes(event.start),
          isAttended: Boolean(attendance.value[event.key]),
          showTime: event.schedule.dur >= SHOW_TIME_MIN,
        }
      }),
    }
  }),
)

const nowTop = computed(() => {
  const date = new Date(now)
  return toPx(date.getHours() * 60 + date.getMinutes())
})

// Buka grid di sekitar jam sekarang, bukan selalu dari 06:00.
onMounted(() => {
  if (scroller.value) scroller.value.scrollTop = Math.max(0, nowTop.value - HOUR_PX * 2)
})
</script>

<template>
  <div class="time-grid" :style="{ '--hour': `${HOUR_PX}px` }">
    <div class="heads">
      <button
        v-for="column in columns"
        :key="column.day"
        type="button"
        class="head"
        :class="{ selected: column.day === selected, today: column.day === today }"
        :aria-label="column.label"
        :aria-pressed="column.day === selected"
        @click="emit('select', column.day)"
      >
        <span class="dow">{{ column.dow }}</span>
        <span class="num">{{ column.date }}</span>
      </button>
    </div>
    <div class="all-day">
      <span class="all-day-label">{{ $t('calendar.allDay') }}</span>
      <div v-for="column in columns" :key="column.day" class="all-day-col">
        <button
          v-for="chip in column.allDay"
          :key="chip.key"
          type="button"
          class="chip"
          :style="{ '--chip-bg': chip.bg }"
          :title="chip.label"
          @click="emit('select', column.day)"
        >
          <span class="dot" :style="{ background: chip.dot }" aria-hidden="true" />
          <span class="chip-label">{{ chip.label }}</span>
        </button>
      </div>
    </div>
    <div ref="scroller" class="scroller">
      <div class="body">
        <div class="hours" aria-hidden="true">
          <span v-for="hour in hours" :key="hour" class="hour">{{ formatMinutes(hour * 60) }}</span>
        </div>
        <div
          v-for="column in columns"
          :key="column.day"
          class="col"
          :class="{ today: column.day === today }"
        >
          <button
            v-for="hour in hours"
            :key="hour"
            type="button"
            class="slot"
            :aria-label="
              $t('calendar.createAt', { time: formatMinutes(hour * 60), date: column.label })
            "
            @click="emit('create', column.day, formatMinutes(hour * 60))"
          />
          <button
            v-for="item in column.events"
            :key="item.event.key"
            type="button"
            class="event"
            :class="{ attended: item.isAttended }"
            :style="item.style"
            @click="emit('open', item.event)"
          >
            <span class="event-card">
              <span class="event-title">
                <span class="event-dot" aria-hidden="true" />
                <span class="event-name">{{ item.event.schedule.title }}</span>
              </span>
              <span v-if="item.showTime" class="event-time">{{ item.time }}</span>
            </span>
          </button>
          <span
            v-if="column.day === today && nowTop >= 0"
            class="now"
            :style="{ top: `${nowTop}px` }"
            aria-hidden="true"
          />
        </div>
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
  border-radius: 14px;
  background: transparent;
}

.head.selected {
  background: var(--soft);
}

.dow {
  font-weight: 800;
  font-size: 12px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--mute-3);
}

.num {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 22px;
  line-height: 1.1;
}

.head.today .num {
  color: var(--accent);
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
  font-weight: 800;
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
  border-radius: 10px;
  background: var(--alt);
}

.chip {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 7px;
  border: 2px solid var(--ink);
  border-radius: var(--radius-pill);
  background: var(--chip-bg);
  font-weight: 800;
  font-size: 11px;
  text-align: left;
}

.dot {
  width: 8px;
  height: 8px;
  flex-shrink: 0;
  border-radius: 3px;
}

.chip-label,
.event-name,
.event-time {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.scroller {
  max-height: 620px;
  margin-top: 8px;
  padding-top: 8px;
  overflow-y: auto;
  border-radius: 16px;
  scrollbar-width: none;
}

.hours {
  width: 48px;
  flex-shrink: 0;
}

.hour {
  height: var(--hour);
  display: block;
  padding-right: 6px;
  text-align: right;
  font-weight: 800;
  font-size: 11px;
  color: var(--mute-3);
  transform: translateY(-7px);
}

.col {
  position: relative;
  flex: 1;
  min-width: 0;
  border-radius: 12px;
}

.col.today {
  background: color-mix(in srgb, var(--soft) 33%, transparent);
}

.slot {
  width: 100%;
  height: var(--hour);
  display: block;
  padding: 0;
  border: none;
  border-top: 1.5px dashed var(--line);
  background: transparent;
  cursor: copy;
}

.slot:hover {
  background: rgb(243 203 134 / 0.18);
}

.event {
  position: absolute;
  padding: 2px;
  border: none;
  background: none;
  text-align: left;
}

.event-card {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 4px 7px;
  border: 2.5px solid var(--ink);
  border-radius: 14px 14px 14px 5px;
  background: var(--ev-tint);
  box-shadow: inset 0 -3px 0 color-mix(in srgb, var(--ev-solid) 33%, transparent);
  transition: transform var(--dur) var(--ease);
}

.event:hover .event-card {
  transform: translateY(-1px);
}

.attended .event-card {
  opacity: 0.55;
}

.event-title {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 5px;
}

.event-dot {
  width: 9px;
  height: 9px;
  flex-shrink: 0;
  border-radius: 3px;
  background: var(--ev-solid);
  transform: rotate(-8deg);
}

.event-name {
  font-weight: 800;
  font-size: 12px;
  line-height: 1.2;
}

.event-time {
  padding-left: 14px;
  font-weight: 700;
  font-size: 11px;
  color: var(--ev-text);
}

.now {
  position: absolute;
  right: 0;
  left: -4px;
  height: 2.5px;
  background: #e2445c;
  pointer-events: none;
}

.now::before {
  content: '';
  position: absolute;
  top: -4px;
  left: -3px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #e2445c;
}
</style>
