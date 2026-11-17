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
        <IconButton :title="$t('calendar.prev')" @click="$emit('prev')">
          <Icon name="chevron-left" :size="20" />
        </IconButton>
        <Button variant="outline" class="today" @click="$emit('today')">
          {{ $t('calendar.today') }}
        </Button>
        <IconButton :title="$t('calendar.next')" @click="$emit('next')">
          <Icon name="chevron-right" :size="20" />
        </IconButton>
      </div>
      <Segmented
        v-model="view"
        class="views"
        :options="viewOptions"
        :label="$t('calendar.viewLabel')"
        framed
      />
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
  gap: var(--space-16);
}

.title {
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: var(--fs-display-36);
  line-height: 1.1;
}

.range {
  margin-top: var(--space-4);
  font-weight: var(--fw-body);
  font-size: var(--fs-16);
  color: var(--mute);
}

.controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-10);
}

.nav {
  display: flex;
  gap: var(--space-6);
}

/* Design: "Hari ini" setinggi 44px dengan sudut 16px (bukan pill), teks 14px.
   Selektor dua kelas supaya menang dari `.btn-md` milik komponen Button. */
.nav .today {
  padding: 0 var(--space-16);
  border-radius: var(--radius-btn-sq);
  font-size: var(--fs-14);
}

/* Grup tampilan: tinggi tetap 44px, bantalan 3px, jarak antar-opsi 2px (design). */
.controls .views {
  height: var(--tap-min);
  align-items: center;
  padding: 3px;
  gap: 2px;
}

.controls .views :deep(.option) {
  padding: var(--space-8) var(--space-16);
}

@media (max-width: 599px) {
  .title {
    font-size: var(--fs-display-28);
  }
}
</style>
