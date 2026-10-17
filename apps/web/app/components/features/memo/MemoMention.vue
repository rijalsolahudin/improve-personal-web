<script setup lang="ts">
import { SCHEDULE_COLORS } from '~/utils/schedule'

/** Chip `@jadwal` di entri jurnal; klik → buka tanggal itu di Kalender. Jadwal terhapus aman. */
const { scheduleId, day } = defineProps<{ scheduleId: string; day: string }>()

const { findSchedule } = useSchedules()
const schedule = computed(() => findSchedule(scheduleId))
const tint = computed(() =>
  schedule.value ? (SCHEDULE_COLORS[schedule.value.color] ?? SCHEDULE_COLORS[0])[1] : '#f2e4cc',
)

// Kalender membaca posisi dari state sesi yang sama (`pages/app/kalender.vue`).
const calendarSelected = useState<string>('calendar-selected')
const calendarAnchor = useState<string>('calendar-anchor')

async function open(): Promise<void> {
  if (!schedule.value) return
  const target = schedule.value.start > day ? schedule.value.start : day
  calendarSelected.value = target
  calendarAnchor.value = target
  await navigateTo(getFeature('kalender').path)
}
</script>

<template>
  <button
    v-if="schedule"
    type="button"
    class="mention"
    :style="{ '--tint': tint }"
    :title="$t('memo.openInCalendar')"
    @click="open"
    v-text="`@${schedule.title}`"
  />
  <span
    v-else
    class="mention deleted"
    :title="$t('memo.deletedScheduleHint')"
    v-text="`@${$t('memo.deletedSchedule')}`"
  />
</template>

<style scoped>
.mention {
  display: inline;
  padding: 0 3px;
  border: none;
  background: linear-gradient(transparent 45%, var(--tint) 45%, var(--tint) 92%, transparent 92%);
  color: var(--ink);
  font: inherit;
  cursor: pointer;
}

.deleted {
  --tint: #f2e4cc;
  color: var(--mute);
  cursor: default;
}
</style>
