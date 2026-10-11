<script setup lang="ts">
const {
  title,
  days,
  date,
  bg = 'var(--cat-karier-tint)',
  fg = 'var(--cat-karier-text)',
  layout = 'compact',
  pct = undefined,
} = defineProps<{
  title: string
  days: number
  date: string
  bg?: string
  fg?: string
  /** compact = tile scroller 150px; wide = kartu list penuh dengan badge hari. */
  layout?: 'compact' | 'wide'
  pct?: number
}>()

const style = computed(() => ({ '--cd-tint': bg, '--cd-ink': fg }))
</script>

<template>
  <li v-if="layout === 'compact'" class="card compact" :style="style">
    <span class="days">{{ days }}<span class="unit">{{ $t('home.countdown.days') }}</span></span>
    <span class="title">{{ title }}</span>
    <span class="date">{{ date }}</span>
  </li>
  <li v-else class="card wide" :style="style">
    <div class="info">
      <span class="date">{{ date }}</span>
      <span class="title">{{ title }}</span>
      <span v-if="pct != null" class="bar" aria-hidden="true">
        <span :style="{ width: `${pct}%` }" />
      </span>
    </div>
    <div class="badge">
      <span class="badge-n">{{ days }}</span>
      <span class="badge-l">{{ $t('home.countdown.days') }}</span>
    </div>
  </li>
</template>

<style scoped>
.card {
  display: flex;
  font-family: var(--font-body);
}

.compact {
  width: 150px;
  flex-shrink: 0;
  flex-direction: column;
  padding: 12px 14px;
  border-radius: var(--radius-card);
  background: var(--cd-tint);
}

.compact .days {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 30px;
  line-height: 1;
  color: var(--cd-ink);
}

.unit {
  margin-left: 3px;
  font-size: var(--fs-caption);
}

.compact .title {
  margin-top: 4px;
  font-weight: 800;
  font-size: var(--fs-body-sm);
  line-height: 1.2;
}

.compact .date {
  margin-top: 2px;
  font-weight: 700;
  font-size: var(--fs-meta);
  color: var(--cd-ink);
  text-transform: uppercase;
}

.wide {
  align-items: center;
  gap: 14px;
  padding: 16px;
  border-radius: var(--radius-hero);
  background: var(--cd-tint);
}

.wide .info {
  flex: 1;
  min-width: 0;
}

.wide .date {
  font-weight: 800;
  font-size: 11px;
  letter-spacing: 0.1em;
  color: var(--cd-ink);
  text-transform: uppercase;
}

.wide .title {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 20px;
  line-height: 1.15;
}

.wide .bar {
  display: block;
  height: 8px;
  margin-top: 10px;
  overflow: hidden;
  border-radius: var(--radius-pill);
  background: rgba(255, 255, 255, 0.65);
}

.wide .bar > span {
  display: block;
  height: 100%;
  border-radius: var(--radius-pill);
  background: var(--cd-ink);
}

.badge {
  width: 82px;
  height: 82px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  border: 2.5px solid var(--ink);
  border-radius: var(--radius-leaf-lg);
  background: var(--paper);
}

.badge-n {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 32px;
  line-height: 1;
  color: var(--cd-ink);
}

.badge-l {
  font-weight: 800;
  font-size: 11px;
  color: var(--mute);
}
</style>
