<script setup lang="ts">
import type { ScheduleFormTarget } from '~/components/features/schedule/ScheduleForm.vue'
import { shiftAnchor, weekDays, type CalendarView, type Occurrence } from '~/utils/schedule'
import { fromIsoDate, toIsoDate } from '~/utils/time'

definePageMeta({ layout: 'dashboard' })

const { t } = useI18n()
useHead({ title: () => t('feature.kalender.label') })

const now = useNow()
const today = computed(() => toIsoDate(new Date(now.value)))
const { monthYear, dayMonth, dayMonthYear, longDate } = useDateFormat()

// Posisi kalender bertahan saat pindah halaman (sesi), bukan disimpan permanen.
// Di HP 7 kolom terlalu sempit, jadi tampilan awalnya per hari.
const view = useState<CalendarView>('calendar-view', () =>
  window.matchMedia('(max-width: 599px)').matches ? 'hari' : 'pekan',
)
const anchor = useState<string>('calendar-anchor', () => toIsoDate(new Date()))
const selected = useState<string>('calendar-selected', () => toIsoDate(new Date()))
const form = ref<ScheduleFormTarget | null>(null)
/** `null` = tertutup. `taskId` kosong = task baru; `scheduleId`/`date` mengisi form dari jadwal. */
const taskForm = ref<{ taskId: string | null; scheduleId: string | null; date?: string } | null>(
  null,
)
const { focusOn } = useFocusTarget()

// Ganti tampilan → mulai dari tanggal yang sedang dipilih (design).
watch(view, () => (anchor.value = selected.value))

const days = computed(() => (view.value === 'pekan' ? weekDays(anchor.value) : [anchor.value]))
const rangeLabel = computed(() => {
  const ms = (iso: string): number => fromIsoDate(iso).getTime()
  if (view.value === 'bulan') return monthYear(ms(anchor.value))
  if (view.value === 'hari') return longDate(ms(anchor.value))
  const first = days.value[0] ?? anchor.value
  const last = days.value.at(-1) ?? anchor.value
  return `${dayMonth(ms(first))} – ${dayMonthYear(ms(last))}`
})

function goToday(): void {
  anchor.value = today.value
  selected.value = today.value
}

function onSaved(date: string): void {
  form.value = null
  selected.value = date
}

function openOccurrence(occurrence: Occurrence): void {
  selected.value = occurrence.day
  form.value = { mode: 'edit', id: occurrence.schedule.id, occurrence: occurrence.day }
}

function addTask(scheduleId: string, day: string): void {
  taskForm.value = { taskId: null, scheduleId, date: day }
}

function editTask(taskId: string): void {
  taskForm.value = { taskId, scheduleId: null }
}
</script>

<template>
  <div class="calendar">
    <CalendarToolbar
      v-model:view="view"
      :range-label="rangeLabel"
      @prev="anchor = shiftAnchor(view, anchor, -1)"
      @next="anchor = shiftAnchor(view, anchor, 1)"
      @today="goToday"
      @create="form = { mode: 'new', date: selected }"
    />
    <div class="layout">
      <div class="board" data-anchor="calendar-board" data-anchor-kind="content">
        <CalendarMonth
          v-if="view === 'bulan'"
          :anchor="anchor"
          :selected="selected"
          :today="today"
          @select="(day) => (selected = day)"
        />
        <CalendarTimeGrid
          v-else
          :days="days"
          :selected="selected"
          :today="today"
          :now="now"
          :can-focus="view === 'hari'"
          @select="(day) => (selected = day)"
          @create="(day, time) => (form = { mode: 'new', date: day, time })"
          @open="openOccurrence"
          @focus="focusOn"
        />
      </div>
      <!-- Rail sticky terpisah dari panel yang di-scroll: sticker di atasnya tidak terpotong. -->
      <div class="rail">
        <CalendarDayPanel
          class="side"
          :day="selected"
          :today="today"
          @create="form = { mode: 'new', date: selected }"
          @edit="openOccurrence"
          @focus="focusOn"
          @add-task="addTask"
          @edit-task="editTask"
        />
      </div>
    </div>
    <ScheduleForm v-if="form" :target="form" @close="form = null" @saved="onSaved" />
    <TodoForm
      v-if="taskForm"
      :task-id="taskForm.taskId"
      :schedule-id="taskForm.scheduleId"
      :date="taskForm.date"
      @close="taskForm = null"
    />
  </div>
</template>

<style scoped>
.calendar {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding-bottom: 80px;
}

.layout {
  container-type: inline-size;
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 20px;
}

.board {
  flex: 999 1 560px;
  min-width: 0;
  padding: 16px;
  border: var(--border-thin) solid var(--line);
  border-radius: calc(28px * var(--rk));
  background: var(--paper);
}

/* Ukuran kolom panel hari (dulu di .panel, kini rail yang jadi item flex). */
.rail {
  flex: 1 1 280px;
  min-width: 260px;
  max-width: 380px;
}

/*
 * Panel hari ikut sticky saat board di-scroll, hanya kalau berdampingan dengan board
 * (board 560 + gap 20 + panel 280). Panel lebih tinggi dari layar di-scroll sendiri;
 * padding/margin negatif = lebar ring fokus (3px + offset 2px) supaya tidak terpotong.
 */
@container (min-width: 860px) {
  .rail {
    position: sticky;
    /* Sejajar tepi atas sidebar (sidebar sticky di --gap-desktop). */
    top: var(--gap-desktop);
    /* Di atas kolom tetangga: sticker yang ditempel di dalam panel boleh menjorok keluar. */
    z-index: 1;
  }

  .side {
    max-height: calc(100vh - 2 * var(--gap-desktop) + 12px);
    margin: -6px;
    padding: 6px;
    overflow-y: auto;
    overscroll-behavior: contain;
  }
}

@media (max-width: 599px) {
  .rail {
    max-width: none;
  }

  .board {
    flex-basis: 100%;
    padding: 10px;
    border-radius: var(--radius-card);
  }
}
</style>
