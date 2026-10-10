<script setup lang="ts">
import type { ScheduleFormTarget } from '~/components/schedule/ScheduleForm.vue'
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
          @select="(day) => (selected = day)"
          @create="(day, time) => (form = { mode: 'new', date: day, time })"
          @open="openOccurrence"
        />
      </div>
      <CalendarDayPanel
        :day="selected"
        :today="today"
        @create="form = { mode: 'new', date: selected }"
        @edit="openOccurrence"
      />
    </div>
    <ScheduleForm v-if="form" :target="form" @close="form = null" @saved="onSaved" />
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
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 20px;
}

.board {
  flex: 999 1 560px;
  min-width: 0;
  padding: 16px;
  border: 2px solid var(--line);
  border-radius: 28px;
  background: var(--paper);
}

@media (max-width: 599px) {
  .board {
    flex-basis: 100%;
    padding: 10px;
    border-radius: 22px;
  }
}
</style>
