<script setup lang="ts">
import { goalProgress, type Goal } from '~/utils/goals'
import type { GoalCategoryView } from '~/utils/goals/categories'
import { daysBetween, fromIsoDate } from '~/utils/time'

const { goal, today, category } = defineProps<{
  goal: Goal
  today: string
  /** Kategori hasil resolve; label & warna chip mengikuti katalog tersimpan. */
  category: GoalCategoryView
}>()
defineEmits<{ edit: []; 'pick-cover': [] }>()

const { t } = useI18n()
const { dayMonthYear } = useDateFormat()
const progress = computed(() => goalProgress(goal))
const range = computed(
  () =>
    `${dayMonthYear(fromIsoDate(goal.start).getTime())} – ${dayMonthYear(fromIsoDate(goal.end).getTime())}`,
)
const daysLeftLabel = computed(() => {
  if (goal.status === 'selesai') return t('goals.reached')
  const left = daysBetween(today, goal.end)
  return left >= 0 ? t('goals.daysLeft', { n: left }) : t('goals.pastTarget')
})
</script>

<template>
  <section class="hero dot-grid" aria-labelledby="goal-hero-title">
    <div class="chips">
      <span class="chip">{{ category.label }}</span>
      <span class="chip solid">{{ daysLeftLabel }}</span>
    </div>
    <div class="main">
      <button
        type="button"
        class="cover"
        :class="{ empty: !goal.cover }"
        :title="$t('goals.changeCover')"
        :aria-label="$t('goals.changeCover')"
        @click="$emit('pick-cover')"
      >
        <LazyDecoStickerArt v-if="goal.cover" :sid="goal.cover" :size="78" />
        <span v-else class="cover-hint">
          <Icon name="flower" :size="22" />
          {{ $t('goals.cover') }}
        </span>
      </button>
      <div class="text">
        <h2 id="goal-hero-title" class="title">{{ goal.title }}</h2>
        <p class="range">{{ range }}</p>
        <p v-if="goal.why" class="why">“{{ goal.why }}”</p>
      </div>
      <ProgressRing
        :percent="progress"
        :size="108"
        :hole="0.74"
        color="var(--goal-text)"
        inner="var(--goal-tint)"
      >
        <span class="ring-label">
          <span class="ring-pct">{{ progress }}%</span>
          <span class="ring-sub">{{ $t('goals.progress') }}</span>
        </span>
      </ProgressRing>
    </div>
    <div class="actions">
      <NuxtLink
        :to="{
          path: getFeature('countdown').path,
          query: { title: goal.title, date: goal.end },
        }"
        class="countdown"
      >
        {{ $t('goals.makeCountdown') }}
      </NuxtLink>
      <Button variant="paper" size="sm" @click="$emit('edit')">{{ $t('goals.edit') }}</Button>
    </div>
  </section>
</template>

<style scoped>
.hero {
  --btn-ink: var(--goal-text);

  padding: var(--space-28) var(--space-28);
  border-radius: var(--radius-panel);
  background-color: var(--goal-tint);
}

/* Design memakai titik putih .4 (token global .35), hanya untuk hero goal. */
.hero.dot-grid {
  background-image: radial-gradient(rgba(255, 255, 255, 0.4) 1.2px, transparent 1.2px);
}

.chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-8);
}

.chip {
  padding: var(--space-4) var(--space-12);
  border-radius: var(--radius-pill);
  background: var(--paper);
  color: var(--goal-text);
  font-weight: var(--fw-strong);
  font-size: var(--fs-13);
}

.chip.solid {
  background: var(--goal-text);
  color: var(--paper);
}

.range {
  margin-top: var(--space-4);
  font-weight: var(--fw-strong);
  font-size: var(--fs-13);
  color: var(--goal-text);
}

.main {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-20);
  margin-top: var(--space-10);
}

.cover {
  width: 96px;
  height: 96px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: var(--border) dashed transparent;
  border-radius: calc(28px * var(--rk)) calc(28px * var(--rk)) calc(28px * var(--rk))
    calc(10px * var(--rk));
  background: rgb(255 255 255 / 0.55);
  transform: rotate(calc(-4deg * var(--bev)));
  transition: transform var(--dur) var(--ease);
}

.cover.empty {
  border-color: var(--goal-text);
}

.cover:hover {
  transform: rotate(calc(-1deg * var(--bev))) scale(1.04);
}

.cover-hint {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-4);
  font-weight: var(--fw-strong);
  font-size: var(--fs-12);
  line-height: 1.3;
  color: var(--goal-text);
}

.text {
  flex: 1 1 240px;
  min-width: 0;
}

.title {
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: var(--fs-display-36);
  line-height: 1.1;
}

.why {
  margin-top: var(--space-6);
  font-weight: var(--fw-body);
  font-size: var(--fs-16);
  color: var(--goal-text);
  text-wrap: pretty;
}

.ring-label {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.ring-pct {
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: var(--fs-display-26);
  line-height: 1;
}

.ring-sub {
  font-weight: var(--fw-strong);
  font-size: var(--fs-11);
  color: var(--goal-text);
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-10);
  margin-top: var(--space-18);
}

/*
 * CTA countdown butuh gaya sendiri: `Button` punya style scoped, jadi class global `.btn`
 * tidak berlaku di dalam komponen ini (bug: link tampil sebagai link polos).
 */
.countdown {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-8);
  box-sizing: border-box;
  padding: var(--space-10) var(--space-18);
  border: none;
  border-radius: var(--radius-pill);
  background: var(--goal-text);
  color: var(--paper);
  font-family: var(--font-body);
  font-weight: var(--fw-strong);
  font-size: var(--fs-14);
  line-height: 1.2;
  white-space: nowrap;
  text-decoration: none;
  transition: filter var(--dur) var(--ease);
}

.countdown:hover {
  filter: brightness(0.92);
}

/* "Edit goal" design: pill paper 14px/800, padding 10px 18px (Button sm = 36px/13px). */
.actions :deep(.btn-sm) {
  min-height: 38px;
  padding: var(--space-10) var(--space-18);
  font-size: var(--fs-14);
}

@media (max-width: 599px) {
  .hero {
    padding: var(--space-20);
  }

  .title {
    font-size: var(--fs-display-28);
  }
}
</style>
