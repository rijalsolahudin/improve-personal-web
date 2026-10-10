<script setup lang="ts">
import type { SegmentedOption } from '~/components/ui/UiSegmented.vue'
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
        <button
          type="button"
          class="square"
          :aria-label="$t('calendar.prev')"
          @click="$emit('prev')"
        >
          ‹
        </button>
        <button type="button" class="today" @click="$emit('today')">
          {{ $t('calendar.today') }}
        </button>
        <button
          type="button"
          class="square"
          :aria-label="$t('calendar.next')"
          @click="$emit('next')"
        >
          ›
        </button>
      </div>
      <UiSegmented v-model="view" :options="viewOptions" :label="$t('calendar.viewLabel')" framed />
      <button type="button" class="create" @click="$emit('create')">
        + {{ $t('calendar.newSchedule') }}
      </button>
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
  font-weight: 800;
  font-size: 36px;
  line-height: 1.1;
}

.range {
  margin-top: 4px;
  font-weight: 700;
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

.square,
.today {
  height: 44px;
  flex-shrink: 0;
  border: 2.5px solid var(--ink);
  border-radius: 16px;
  background: var(--paper);
  font-weight: 800;
}

.square {
  width: 44px;
  font-size: 18px;
}

.today {
  padding: 0 16px;
  font-size: 14px;
  white-space: nowrap;
}

.create {
  height: 44px;
  padding: 0 20px;
  border: none;
  border-radius: var(--radius-pill);
  background: var(--accent);
  color: var(--paper);
  font-weight: 800;
  font-size: 15px;
  white-space: nowrap;
}

.create:hover {
  background: var(--deeper);
}

@media (max-width: 599px) {
  .title {
    font-size: 28px;
  }
}
</style>
