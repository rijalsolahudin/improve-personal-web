<script setup lang="ts">
import type { ScheduleFormTarget } from '~/components/features/schedule/ScheduleForm.vue'
import type { Occurrence } from '~/utils/schedule'

/**
 * Jadwal hari ini (PRD F12): timeline versi ringkas Kalender - klik slot kosong bikin jadwal,
 * klik item buka detail. Grid & form dipakai ulang dari Kalender (F6/F1).
 */
const { today, now, done, total } = defineProps<{
  today: string
  now: number
  done: number
  total: number
}>()
const emit = defineEmits<{ focus: [title: string] }>()

const form = ref<ScheduleFormTarget | null>(null)

function open(occurrence: Occurrence): void {
  form.value = { mode: 'edit', id: occurrence.schedule.id, occurrence: occurrence.day }
}
</script>

<template>
  <section class="schedule" aria-labelledby="daily-schedule-title">
    <div class="head">
      <div class="title-row">
        <AppIcon icon="clock" color="--icon-cal" :size="38" />
        <h2 id="daily-schedule-title" class="title">{{ $t('daily.schedule.title') }}</h2>
      </div>
      <NuxtLink :to="getFeature('kalender').path" class="link">
        {{ $t('daily.meta', { done, total }) }} · {{ $t('daily.openCalendar') }}
      </NuxtLink>
    </div>
    <div class="board">
      <CalendarTimeGrid
        :days="[today]"
        :selected="today"
        :today="today"
        :now="now"
        can-focus
        is-bare
        @focus="emit('focus', $event)"
        @create="(day, time) => (form = { mode: 'new', date: day, time })"
        @open="open"
      />
    </div>
    <LazyScheduleForm v-if="form" :target="form" @close="form = null" @saved="form = null" />
  </section>
</template>

<style scoped>
.schedule {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
  padding: 0 2px;
}

.title-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.title {
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: var(--fs-h2);
  line-height: 1.1;
}

.link {
  font-weight: var(--fw-strong);
  font-size: 12.5px;
  white-space: nowrap;
}

.board {
  padding: 14px;
  border: var(--border) solid var(--outline);
  border-radius: var(--radius-card);
  background: var(--paper);
  box-shadow: var(--shadow-drop-sm);
}
</style>
