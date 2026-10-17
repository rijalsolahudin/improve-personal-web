<script setup lang="ts">
import type { SegmentedOption } from '~/components/ui/Segmented/index.vue'
import { CALENDAR_VIEWS, type CalendarView } from '~/utils/schedule'

const { rangeLabel } = defineProps<{ rangeLabel: string }>()
const view = defineModel<CalendarView>('view', { required: true })
defineEmits<{ prev: []; next: []; today: []; create: [] }>()

const { t } = useI18n()
const viewOptions = computed<SegmentedOption<CalendarView>[]>(() =>
  CALENDAR_VIEWS.map((value) => ({ value, label: t(`calendar.view.${value}`) })),
)
</script>

<template>
  <header class="toolbar" data-anchor="header" data-anchor-kind="header">
    <div>
      <h1 class="title">{{ $t('feature.kalender.label') }}</h1>
      <p class="range" aria-live="polite">{{ rangeLabel }}</p>
    </div>
    <div class="controls">
      <div class="nav">
        <IconButton :title="$t('calendar.prev')" @click="$emit('prev')">‹</IconButton>
        <Button variant="outline" @click="$emit('today')">{{ $t('calendar.today') }}</Button>
        <IconButton :title="$t('calendar.next')" @click="$emit('next')">›</IconButton>
      </div>
      <Segmented v-model="view" :options="viewOptions" :label="$t('calendar.viewLabel')" framed />
      <Button variant="primary" @click="$emit('create')">+ {{ $t('calendar.newSchedule') }}</Button>
    </div>
  </header>
</template>

<style scoped>
.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
}

.title {
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: 36px;
  line-height: 1.1;
}

.range {
  margin-top: 4px;
  font-weight: var(--fw-body);
  font-size: 16px;
  color: var(--mute);
}

.controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.nav {
  display: flex;
  gap: 6px;
}

@media (max-width: 599px) {
  .title {
    font-size: 28px;
  }
}
</style>
