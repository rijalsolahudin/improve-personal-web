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
const emit = defineEmits<{
  create: []
  edit: [occurrence: Occurrence]
  focus: [title: string]
  addTask: [scheduleId: string, day: string]
  editTask: [taskId: string]
}>()

const MOODS = ['😢', '😕', '😐', '🙂', '😄'] as const

const { t } = useI18n()
const { weekdayLong, dayMonthLong, weekdayOfIndex } = useDateFormat()
const { occurrences, tasksOn, markersOn, memoOn, attendance, toggleAttendance, toggleTask } =
  useCalendarData()

const date = computed(() => fromIsoDate(day).getTime())
const events = computed(() => occurrences(day))
const tasks = computed(() => tasksOn(day))
const { tasks: allTasks } = useTasks()
/** Design: to-do terbuka tanpa deadline ikut tampil supaya bisa dijadwalkan/difokuskan. */
const undated = computed(() =>
  allTasks.value.filter((task) => !task.done && task.deadline === null && task.scheduleId === null),
)
const linkedTasks = (scheduleId: string) =>
  allTasks.value.filter((task) => task.scheduleId === scheduleId)
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
        <button type="button" class="link" @click="emit('create')">
          + {{ $t('calendar.add') }}
        </button>
      </div>
      <ul class="rows">
        <li v-for="occurrence in events" :key="occurrence.key" class="row hover-reveal">
          <span
            class="tile"
            :style="{
              background: (SCHEDULE_COLORS[occurrence.schedule.color] ?? SCHEDULE_COLORS[0])[0],
            }"
            aria-hidden="true"
          >
            <span />
          </span>
          <button type="button" class="row-main" @click="emit('edit', occurrence)">
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
            class="focus reveal"
            :aria-label="$t('daily.focusLabel', { title: occurrence.schedule.title })"
            @click="emit('focus', occurrence.schedule.title)"
          >
            {{ $t('daily.focus') }}
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

          <div class="linked">
            <p class="linked-title">{{ $t('calendar.linkedTasks') }}</p>
            <ul v-if="linkedTasks(occurrence.schedule.id).length" class="linked-list">
              <li
                v-for="task in linkedTasks(occurrence.schedule.id)"
                :key="task.id"
                class="linked-row"
              >
                <Checkbox
                  :checked="task.done"
                  size="sm"
                  :label="$t('common.toggleDone', { title: task.title })"
                  @toggle="toggleTask(task.id)"
                />
                <button
                  type="button"
                  class="linked-name"
                  :aria-label="$t('calendar.editTask', { title: task.title })"
                  @click="emit('editTask', task.id)"
                >
                  {{ task.title }}
                </button>
              </li>
            </ul>
            <p v-else class="linked-empty">{{ $t('calendar.noLinkedTasks') }}</p>
            <button
              type="button"
              class="link"
              @click="emit('addTask', occurrence.schedule.id, day)"
            >
              + {{ $t('calendar.addTask') }}
            </button>
          </div>
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
        <li
          v-for="task in tasks"
          :key="task.id"
          class="row hover-reveal"
          :class="{ done: task.done }"
        >
          <Checkbox
            :checked="task.done"
            :label="$t('common.toggleDone', { title: task.title })"
            @toggle="toggleTask(task.id)"
          />
          <span class="task-title">{{ task.title }}</span>
          <button
            v-if="!task.done"
            type="button"
            class="focus reveal"
            :aria-label="$t('daily.focusLabel', { title: task.title })"
            @click="emit('focus', task.title)"
          >
            {{ $t('daily.focus') }}
          </button>
          <span class="row-meta">{{
            task.deadline !== null ? formatHourMinute(task.deadline) : ''
          }}</span>
        </li>
        <li v-if="!tasks.length" class="row empty">{{ $t('calendar.noTasks') }}</li>
      </ul>
      <template v-if="undated.length">
        <p class="eyebrow undated-title">{{ $t('calendar.noDeadline') }}</p>
        <ul class="rows">
          <li v-for="task in undated" :key="task.id" class="row hover-reveal">
            <Checkbox
              :checked="task.done"
              :label="$t('common.toggleDone', { title: task.title })"
              @toggle="toggleTask(task.id)"
            />
            <span class="task-title">{{ task.title }}</span>
            <button
              type="button"
              class="focus reveal"
              :aria-label="$t('daily.focusLabel', { title: task.title })"
              @click="emit('focus', task.title)"
            >
              {{ $t('daily.focus') }}
            </button>
          </li>
        </ul>
      </template>
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
  border-radius: calc(28px * var(--rk));
  background-color: var(--primary);
  background-size: 20px 20px;
}

.dow {
  color: var(--deep);
}

.date {
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: 28px;
  line-height: 1.1;
}

.counts {
  margin-top: 2px;
  font-weight: var(--fw-body);
  font-size: 14px;
  color: var(--deeper);
}

.marker {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  padding: 8px 10px;
  border-radius: calc(14px * var(--rk));
  background: rgb(255 255 255 / 0.55);
  font-weight: var(--fw-strong);
  font-size: 13px;
}

.marker-tile {
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: calc(7px * var(--rk));
  color: var(--paper);
  font-size: 11px;
}

.card {
  padding: 16px 18px;
  border: var(--border-thin) solid var(--line);
  border-radius: var(--radius-hero);
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
  font-weight: var(--fw-display);
  font-size: 18px;
}

.link {
  padding: 0;
  border: none;
  background: none;
  color: var(--accent);
  font-weight: var(--fw-strong);
  font-size: 13px;
}

.rows {
  margin: 0;
  padding: 0;
  list-style: none;
}

.row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  padding: 9px 0;
  border-top: var(--border-thin) dashed var(--line-2);
}

.row.empty {
  font-weight: var(--fw-body);
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
  border-radius: calc(12px * var(--rk)) calc(12px * var(--rk)) calc(12px * var(--rk))
    calc(4px * var(--rk));
  box-shadow: inset 0 calc(-3px * var(--bev)) 0 rgb(0 0 0 / 0.14);
}

.tile > span {
  width: 18px;
  height: 18px;
  border: var(--border-thin) solid var(--outline);
  border-radius: calc(6px * var(--rk));
  background: var(--paper);
  transform: rotate(calc(-6deg * var(--bev)));
}

.row-main {
  /* Panel sempit: tombol Fokus/Tandai turun ke baris berikutnya, teks tidak dipecah per kata. */
  flex: 1 1 140px;
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
  font-weight: var(--fw-strong);
  font-size: 14px;
}

.row-main:hover .row-title {
  color: var(--accent);
}

.edit-hint {
  font-weight: var(--fw-body);
  font-size: 12px;
  color: var(--mute-3);
}

.row-meta {
  font-weight: var(--fw-body);
  font-size: 12px;
  color: var(--mute);
}

.attend {
  padding: 6px 10px;
  border: none;
  border-radius: var(--radius-pill);
  background: #f2e4cc;
  color: #7a6b58;
  font-weight: var(--fw-strong);
  font-size: 12px;
  white-space: nowrap;
}

.attend.on {
  background: #e0f2da;
  color: #2e6a26;
}

.linked {
  flex: 1 1 100%;
  margin: 2px 0 4px 44px;
  padding-left: 10px;
  border-left: var(--border-thin) solid var(--line-2);
}

.linked-title {
  font-weight: var(--fw-strong);
  font-size: 11px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--mute-3);
}

.linked-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 5px 0;
  padding: 0;
  list-style: none;
}

.linked-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.linked-name {
  min-width: 0;
  padding: 0;
  border: none;
  background: none;
  text-align: left;
  font-weight: var(--fw-strong);
  font-size: 13px;
  color: var(--ink-2);
}

.linked-name:hover {
  color: var(--accent);
}

.linked-empty {
  margin: 5px 0;
  font-weight: var(--fw-body);
  font-size: 12.5px;
  color: var(--mute);
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
  border-radius: var(--radius-hero);
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
  font-weight: var(--fw-body);
  font-size: 14px;
  color: #1e5d78;
  text-wrap: pretty;
}

@media (max-width: 599px) {
  .panel {
    max-width: none;
  }
}
.focus {
  height: 26px;
  flex-shrink: 0;
  padding: 0 10px;
  border: 0;
  border-radius: var(--radius-pill);
  background: var(--chip);
  color: var(--deep);
  font-weight: var(--fw-strong);
  font-size: 11.5px;
  white-space: nowrap;
}

.undated-title {
  margin-top: 12px;
  color: var(--mute-3);
}
</style>
