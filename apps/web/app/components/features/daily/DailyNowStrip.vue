<script setup lang="ts">
import type { RoutineItem } from '~/composables/useDailyRoutine'
import { splitMinutes, type RoutineBlock } from '~/utils/dailyRoutine'
import type { IconName } from '~/utils/icons'
import { formatMinutes } from '~/utils/schedule'

/** Strip "Sekarang": blok waktu aktif + langkah berikutnya, dan jadwal berikutnya (design). */
const { current, next } = defineProps<{
  current: {
    block: RoutineBlock
    from: number
    to: number
    color: string
    icon: IconName
    done: number
    total: number
    nextItem: RoutineItem | null
  }
  next: { title: string; start: number; minutesUntil: number } | null
}>()
const emit = defineEmits<{ 'toggle-item': [item: RoutineItem] }>()

const { t } = useI18n()

const meta = computed(() =>
  t('daily.nowMeta', {
    done: current.done,
    total: current.total,
    range: `${formatMinutes(current.from * 60)}–${formatMinutes(current.to * 60 - 1)}`,
  }),
)
const nextIn = computed(() => {
  if (!next) return ''
  const { hours, minutes } = splitMinutes(next.minutesUntil)
  if (!hours) return t('daily.nextIn.minutes', { m: minutes })
  return minutes
    ? t('daily.nextIn.hours', { h: hours, m: minutes })
    : t('daily.nextIn.hoursOnly', { h: hours })
})
</script>

<template>
  <section class="strip dot-grid" aria-labelledby="daily-now-title">
    <div class="now">
      <AppIcon :icon="current.icon" :color="current.color" :size="50" />
      <div class="now-text">
        <h2 id="daily-now-title" class="now-title">
          {{ $t('daily.now', { block: $t(`daily.block.${current.block}`) }) }}
        </h2>
        <span class="now-meta">{{ meta }}</span>
        <button
          v-if="current.nextItem"
          type="button"
          class="step"
          :title="$t('daily.markDone')"
          @click="current.nextItem && emit('toggle-item', current.nextItem)"
        >
          <span class="step-box" aria-hidden="true" />
          <span class="step-title">{{ current.nextItem.title }}</span>
          <span class="visually-hidden">· {{ $t('daily.markDone') }}</span>
        </button>
        <span v-else class="hand">{{ $t('daily.allDone') }}</span>
      </div>
    </div>
    <NuxtLink :to="getFeature('kalender').path" class="next">
      <template v-if="next">
        <span class="next-time">
          <span class="eyebrow next-label">{{ $t('daily.next') }}</span>
          <span class="next-clock">{{ formatMinutes(next.start) }}</span>
        </span>
        <span class="next-text">
          <span class="next-title">{{ next.title }}</span>
          <span class="next-in">{{ nextIn }}</span>
        </span>
      </template>
      <span v-else class="hand next-empty">{{ $t('daily.noNext') }}</span>
      <span class="next-link">{{ $t('daily.openCalendar') }}</span>
    </NuxtLink>
  </section>
</template>

<style scoped>
.strip {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr));
  align-items: center;
  gap: 14px;
  padding: 18px 20px;
  border: var(--border-thick) solid var(--outline);
  border-radius: calc(28px * var(--rk));
  background-color: var(--primary);
  background-size: 18px 18px;
  box-shadow: var(--shadow-drop);
}

.now {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 14px;
}

.now-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.now-title {
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: 22px;
  line-height: 1.1;
}

.now-meta {
  font-weight: var(--fw-strong);
  font-size: 12.5px;
  color: var(--deeper);
  font-variant-numeric: tabular-nums;
}

.step {
  align-self: flex-start;
  max-width: 100%;
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: 2px;
  padding: 3px 11px 3px 6px;
  border: calc(1.5px * var(--bk)) solid var(--outline);
  border-radius: var(--radius-pill);
  background: var(--paper-2);
  color: var(--ink);
}

.step:hover {
  background: var(--paper);
}

.step-box {
  width: 15px;
  height: 15px;
  flex-shrink: 0;
  border: var(--border-thin) solid var(--outline);
  border-radius: calc(5px * var(--rk)) calc(5px * var(--rk)) calc(5px * var(--rk))
    calc(2px * var(--rk));
  background: var(--paper);
}

.step-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: var(--fw-body);
  font-size: var(--fs-caption);
}

.hand {
  font-family: var(--font-hand);
  font-size: var(--fs-hand-body);
  line-height: 1.2;
}

.next {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 16px;
  border: var(--border) solid var(--outline);
  border-radius: calc(20px * var(--rk)) calc(20px * var(--rk)) calc(20px * var(--rk))
    calc(7px * var(--rk));
  background: var(--paper-2);
  color: var(--ink);
  transform: rotate(calc(-0.6deg * var(--bev)));
}

.next:hover {
  background: var(--paper);
  color: var(--ink);
}

.next-time {
  width: 62px;
  height: 48px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border-radius: calc(14px * var(--rk));
  background: var(--chip);
}

.next-label {
  font-size: 9.5px;
  color: var(--deep);
}

.next-clock {
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: 18px;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.next-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.next-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: var(--fw-strong);
  font-size: 15px;
  line-height: 1.2;
}

.next-in {
  font-weight: var(--fw-body);
  font-size: 12.5px;
  color: var(--mute);
}

.next-empty {
  flex: 1;
  color: var(--mute);
}

.next-link {
  flex-shrink: 0;
  font-weight: var(--fw-strong);
  font-size: var(--fs-caption);
  color: var(--accent);
}
</style>
