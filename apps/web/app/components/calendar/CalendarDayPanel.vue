<script setup lang="ts">
import {
  SCHEDULE_COLORS,
  WEEKDAY_ORDER,
  formatMinutes,
  type Occurrence,
  type Recurrence,
} from '~/utils/schedule'
import { formatHourMinute, fromIsoDate } from '~/utils/time'

const { day, today } = defineProps<{ day: string; today: string }>()
defineEmits<{ create: []; edit: [occurrence: Occurrence] }>()

const MOODS = ['😢', '😕', '😐', '🙂', '😄'] as const

const { t } = useI18n()
const { weekdayLong, dayMonthLong, weekdayOfIndex } = useDateFormat()
const { occurrences, tasksOn, markersOn, memoOn, attendance, toggleAttendance, toggleTask } =
  useCalendarData()

const date = computed(() => fromIsoDate(day).getTime())
const events = computed(() => occurrences(day))
const tasks = computed(() => tasksOn(day))
const markers = computed(() => markersOn(day))
const memo = computed(() => memoOn(day))
const isToday = computed(() => day === today)

function recurrenceLabel(rec: Recurrence): string {
  switch (rec.type) {
    case 'once':
      return t('calendar.rec.once')
    case 'daily':
      return rec.n > 1 ? t('calendar.rec.everyNDays', { n: rec.n }) : t('calendar.rec.daily')
    case 'weekly': {
      const days = WEEKDAY_ORDER.filter((d) => rec.days.includes(d))
        .map(weekdayOfIndex)
        .join(' & ')
      return t(rec.interval > 1 ? 'calendar.rec.biweeklyOn' : 'calendar.rec.weeklyOn', { days })
    }
    case 'monthly':
      return t('calendar.rec.monthly')
  }
}

function timeLabel(occurrence: Occurrence): string {
  if (occurrence.schedule.allDay) return t('calendar.allDayLong')
  return `${formatMinutes(occurrence.start)}–${formatMinutes(occurrence.end)}`
}
</script>

<template>
  <aside class="panel" :aria-label="$t('calendar.dayPanel')">
    <section class="summary dot-grid" data-anchor="calendar-day" data-anchor-kind="content">
      <p class="eyebrow dow">
        {{ weekdayLong(date) }}<template v-if="isToday"> · {{ $t('calendar.todayTag') }}</template>
      </p>
      <h2 class="date">{{ dayMonthLong(date) }}</h2>
      <p class="counts">
        {{ $t('calendar.dayCounts', { events: events.length, tasks: tasks.length }) }}
      </p>
      <p v-for="marker in markers" :key="marker.key" class="marker">
        <span class="marker-tile" :style="{ background: marker.color }" aria-hidden="true">
          {{ marker.glyph }}
        </span>
        {{
          marker.kind === 'chapter'
            ? $t('calendar.marker.chapter', { title: marker.title, goal: marker.goal })
            : $t(`calendar.marker.${marker.kind}`, { title: marker.title })
        }}
      </p>
    </section>

    <section class="card">
      <div class="card-head">
        <h3 class="card-title">{{ $t('calendar.schedules') }}</h3>
        <button type="button" class="link" @click="$emit('create')">
          + {{ $t('calendar.add') }}
        </button>
      </div>
      <ul class="rows">
        <li v-for="occurrence in events" :key="occurrence.key" class="row">
          <span
            class="tile"
            :style="{
              background: (SCHEDULE_COLORS[occurrence.schedule.color] ?? SCHEDULE_COLORS[0])[0],
            }"
            aria-hidden="true"
          >
            <span />
          </span>
          <button type="button" class="row-main" @click="$emit('edit', occurrence)">
            <span class="row-title">
              {{ occurrence.schedule.title }}
              <span class="edit-hint">· {{ $t('calendar.edit') }}</span>
            </span>
            <span class="row-meta">
              {{ timeLabel(occurrence) }} · {{ recurrenceLabel(occurrence.schedule.rec) }}
            </span>
          </button>
          <button
            type="button"
            class="attend"
            :class="{ on: attendance[occurrence.key] }"
            :aria-pressed="Boolean(attendance[occurrence.key])"
            @click="toggleAttendance(occurrence.key)"
          >
            {{
              attendance[occurrence.key]
                ? `✓ ${$t('calendar.attended')}`
                : $t('calendar.markAttend')
            }}
          </button>
        </li>
        <li v-if="!events.length" class="row empty">{{ $t('calendar.noSchedules') }}</li>
      </ul>
    </section>

    <section class="card">
      <div class="card-head">
        <h3 class="card-title">{{ $t('feature.to-do.label') }}</h3>
        <NuxtLink :to="getFeature('to-do').path" class="link">+ {{ $t('calendar.add') }}</NuxtLink>
      </div>
      <ul class="rows">
        <li v-for="task in tasks" :key="task.id" class="row" :class="{ done: task.done }">
          <Checkbox
            :checked="task.done"
            :label="$t('home.todo.toggle', { title: task.title })"
            @toggle="toggleTask(task.id)"
          />
          <span class="task-title">{{ task.title }}</span>
          <span class="row-meta">{{
            task.deadline !== null ? formatHourMinute(task.deadline) : ''
          }}</span>
        </li>
        <li v-if="!tasks.length" class="row empty">{{ $t('calendar.noTasks') }}</li>
      </ul>
    </section>

    <section class="memo">
      <div class="card-head">
        <h3 class="card-title memo-title">
          {{ $t('feature.memo.label') }}
          <span v-if="memo && memo.mood !== null" aria-hidden="true">{{ MOODS[memo.mood] }}</span>
        </h3>
        <NuxtLink :to="getFeature('memo').path" class="link memo-link"
          >+ {{ $t('calendar.add') }}</NuxtLink
        >
      </div>
      <p class="memo-text">
        {{ memo?.text ?? $t(isToday ? 'calendar.noMemoToday' : 'calendar.noMemo') }}
      </p>
    </section>
  </aside>
</template>

<style scoped>
.panel {
  flex: 1 1 280px;
  min-width: 260px;
  max-width: 380px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.summary {
  padding: 20px 22px;
  border-radius: 28px;
  background-color: var(--primary);
  background-size: 20px 20px;
}

.dow {
  color: var(--deep);
}

.date {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 28px;
  line-height: 1.1;
}

.counts {
  margin-top: 2px;
  font-weight: 700;
  font-size: 14px;
  color: var(--deeper);
}

.marker {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  padding: 8px 10px;
  border-radius: 14px;
  background: rgb(255 255 255 / 0.55);
  font-weight: 800;
  font-size: 13px;
}

.marker-tile {
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 7px;
  color: var(--paper);
  font-size: 11px;
}

.card {
  padding: 16px 18px;
  border: 2px solid var(--line);
  border-radius: 24px;
  background: var(--paper);
}

.card-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 6px;
}

.card-title {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 18px;
}

.link {
  padding: 0;
  border: none;
  background: none;
  color: var(--accent);
  font-weight: 800;
  font-size: 13px;
}

.rows {
  margin: 0;
  padding: 0;
  list-style: none;
}

.row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 0;
  border-top: 2px dashed var(--line-2);
}

.row.empty {
  font-weight: 700;
  font-size: 14px;
  color: var(--mute);
}

.tile {
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px 12px 12px 4px;
  box-shadow: inset 0 -3px 0 rgb(0 0 0 / 0.14);
}

.tile > span {
  width: 18px;
  height: 18px;
  border: 2px solid var(--ink);
  border-radius: 6px;
  background: var(--paper);
  transform: rotate(-6deg);
}

.row-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding: 0;
  border: none;
  background: none;
  text-align: left;
}

.row-title,
.task-title {
  font-weight: 800;
  font-size: 14px;
}

.row-main:hover .row-title {
  color: var(--accent);
}

.edit-hint {
  font-weight: 700;
  font-size: 12px;
  color: var(--mute-3);
}

.row-meta {
  font-weight: 700;
  font-size: 12px;
  color: var(--mute);
}

.attend {
  padding: 6px 10px;
  border: none;
  border-radius: var(--radius-pill);
  background: #f2e4cc;
  color: #7a6b58;
  font-weight: 800;
  font-size: 12px;
  white-space: nowrap;
}

.attend.on {
  background: #e0f2da;
  color: #2e6a26;
}

.task-title {
  flex: 1;
  min-width: 0;
}

.done .task-title {
  text-decoration: line-through;
  opacity: 0.55;
}

.memo {
  padding: 16px 18px;
  border-radius: 24px;
  background: #c7e3ee;
}

.memo-title {
  display: flex;
  align-items: baseline;
  gap: 10px;
  color: #143f52;
}

.memo-link {
  color: #1e5d78;
}

.memo-text {
  margin-top: 4px;
  font-weight: 700;
  font-size: 14px;
  color: #1e5d78;
  text-wrap: pretty;
}

@media (max-width: 599px) {
  .panel {
    max-width: none;
  }
}
</style>
