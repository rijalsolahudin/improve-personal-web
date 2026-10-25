<script setup lang="ts">
import type { GoalCategory } from '~/utils/goals'

definePageMeta({ layout: 'dashboard' })

const { t } = useI18n()
useHead({ title: () => t('feature.overview.label') })

const {
  ranges,
  range,
  setRange,
  shift,
  canNav,
  canNext,
  label,
  bars,
  barGap,
  focusUnitLabel,
  stats,
  streakNote,
  bigStreaks,
  habitRows,
  heatmap,
  heatmapHabits,
  habitIndex,
  setHabit,
  moodLine,
  moodArea,
  moodHi,
  moodLo,
  moodFrom,
  moodTo,
  eisenhower,
  eisenhowerNote,
  scheduled,
  scheduledMax,
  scheduledTotal,
  goalRows,
  late,
  nextCountdowns,
} = useOverview()

const GOAL_COLORS: Record<GoalCategory, string> = {
  karier: '#F03FBF',
  kesehatan: '#FF6A13',
  keuangan: '#1DA20F',
  diri: '#9B4FC9',
  relasi: '#10A8D8',
}

const rangeOptions = computed(() =>
  ranges.map((value) => ({ value, label: t(`overview.range.${value}`) })),
)
</script>

<template>
  <div class="overview">
    <header class="header" data-anchor="header" data-anchor-kind="header">
      <div>
        <h1 class="title">{{ $t('feature.overview.label') }}</h1>
        <p class="label">{{ label }}</p>
      </div>
      <div class="controls">
        <div v-if="canNav" class="nav">
          <IconButton :title="$t('calendar.prev')" @click="shift(-1)">‹</IconButton>
          <IconButton :title="$t('calendar.next')" :disabled="!canNext" @click="shift(1)">
            ›
          </IconButton>
        </div>
        <Segmented
          class="ranges"
          framed
          :model-value="range"
          :options="rangeOptions"
          :label="$t('overview.rangeLabel')"
          @update:model-value="setRange"
        />
      </div>
    </header>

    <section class="stats" :aria-label="$t('overview.statsLabel')">
      <div
        v-for="stat in stats"
        :key="stat.key"
        class="stat"
        :style="{ background: stat.bg, color: stat.fg }"
      >
        <p class="stat-label">{{ stat.label }}</p>
        <p class="stat-value">{{ stat.value }}</p>
        <p class="stat-sub">{{ stat.sub }}</p>
      </div>
    </section>

    <div class="row">
      <section class="card chart" data-anchor="overview-focus" data-anchor-kind="content">
        <div class="card-head">
          <h2 class="card-title">{{ $t('overview.focus.title') }}</h2>
          <span class="card-note">{{ focusUnitLabel }}</span>
        </div>
        <div class="bars" :style="{ '--gap': `${barGap}px` }">
          <div
            v-for="bar in bars"
            :key="bar.key"
            class="bar"
            :title="bar.tip"
            :style="{
              height: `${bar.height}%`,
              background: bar.highlight ? '#FF6A13' : '#FFD9BF',
              borderColor: bar.minutes ? 'var(--ink)' : 'transparent',
            }"
          />
        </div>
        <div class="ticks" :style="{ '--gap': `${barGap}px` }">
          <span v-for="bar in bars" :key="bar.key" class="tick">{{ bar.label }}</span>
        </div>
      </section>

      <section class="card streak" data-anchor="overview-streak" data-anchor-kind="content">
        <div class="card-head">
          <h2 class="card-title">{{ $t('overview.streak.title') }}</h2>
          <span class="card-note">{{ streakNote }}</span>
        </div>
        <div class="big-streaks">
          <div
            v-for="streak in bigStreaks"
            :key="streak.key"
            class="big-streak"
            :style="{ background: streak.bg, color: streak.fg }"
          >
            <p class="big-n">{{ streak.n }}</p>
            <p class="big-l">{{ streak.label }}</p>
          </div>
        </div>
        <ul class="habit-streaks">
          <li v-for="habit in habitRows" :key="habit.id" class="habit-streak">
            <span class="dot" :style="{ background: habit.color }" />
            <span class="hs-name">{{ habit.name }}</span>
            <span class="hs-cur">{{ habit.current }} {{ $t('overview.streak.days') }}</span>
            <span class="hs-best">{{ $t('overview.streak.record', { n: habit.best }) }}</span>
          </li>
        </ul>
      </section>
    </div>

    <div class="row">
      <section class="card heatmap-card" data-anchor="overview-heatmap" data-anchor-kind="content">
        <div class="card-head wrap">
          <h2 class="card-title">{{ $t('overview.heatmap.title') }}</h2>
          <div class="habits-tabs">
            <Chip
              v-for="(habit, index) in heatmapHabits"
              :key="habit.id"
              variant="pick"
              :active="habitIndex === index"
              @click="setHabit(index)"
            >
              <span class="dot" :style="{ background: habit.color }" />{{ habit.name }}
            </Chip>
          </div>
        </div>
        <template v-if="heatmap">
          <div class="heatmap">
            <div v-for="(week, wi) in heatmap.weeks" :key="wi" class="hm-week">
              <span
                v-for="cell in week"
                :key="cell.day"
                class="hm-cell"
                :title="cell.tip"
                :style="{ background: cell.color }"
              />
            </div>
          </div>
          <div class="hm-legend">
            <span>{{
              $t('overview.heatmap.rate', { name: heatmap.name, rate: heatmap.rate })
            }}</span>
            <span class="spacer" />
            <span>{{ $t('overview.heatmap.none') }}</span>
            <span class="hm-key" style="background: var(--chip)" />
            <span class="hm-key" :style="{ background: heatmap.color }" />
            <span>{{ $t('overview.heatmap.met') }}</span>
          </div>
        </template>
        <p v-else class="empty">{{ $t('overview.heatmap.empty') }}</p>
      </section>

      <section class="card mood-card" data-anchor="overview-mood" data-anchor-kind="content">
        <h2 class="card-title mood-title">{{ $t('overview.mood.title') }}</h2>
        <svg viewBox="0 0 300 110" preserveAspectRatio="none" class="mood-svg">
          <path :d="moodArea" fill="#9ECDE0" />
          <polyline
            :points="moodLine"
            fill="none"
            stroke="#1E5D78"
            stroke-width="3"
            stroke-linejoin="round"
            stroke-linecap="round"
            vector-effect="non-scaling-stroke"
          />
        </svg>
        <div class="mood-axis">
          <span>{{ moodFrom }}</span
          ><span>{{ moodTo }}</span>
        </div>
        <div class="mood-tiles">
          <div class="mood-tile">
            <p class="mood-n">{{ moodHi }}</p>
            <p class="mood-l">{{ $t('overview.mood.high') }}</p>
          </div>
          <div class="mood-tile alt">
            <p class="mood-n">{{ moodLo }}</p>
            <p class="mood-l">{{ $t('overview.mood.low') }}</p>
          </div>
        </div>
      </section>
    </div>

    <div class="row">
      <section class="card" data-anchor="overview-eisenhower" data-anchor-kind="content">
        <h2 class="card-title">{{ $t('overview.eisenhower.title') }}</h2>
        <div class="eis-bar">
          <span
            v-for="quadrant in eisenhower"
            :key="quadrant.key"
            :style="{ width: `${quadrant.pct}%`, background: quadrant.color }"
          />
        </div>
        <div class="eis-list">
          <div v-for="quadrant in eisenhower" :key="quadrant.key" class="eis-row">
            <span class="dot" :style="{ background: quadrant.color }" />
            <span class="eis-name">{{ quadrant.label }}</span>
            <span class="eis-n">{{ quadrant.n }}</span>
          </div>
        </div>
        <p class="note">{{ eisenhowerNote }}</p>
      </section>

      <section class="card" data-anchor="overview-scheduled" data-anchor-kind="content">
        <div class="card-head">
          <h2 class="card-title">{{ $t('overview.scheduled.title') }}</h2>
          <span class="card-total">{{ scheduledTotal }}</span>
        </div>
        <div v-if="scheduled.length" class="sched-list">
          <div v-for="item in scheduled" :key="item.id" class="sched-row">
            <div class="sched-head">
              <span>{{ item.title }}</span
              ><span class="mute">{{ item.minutes }}</span>
            </div>
            <ProgressBar
              class="track"
              :pct="(item.minutes / scheduledMax) * 100"
              :color="item.color"
              track="var(--chip)"
              :height="10"
            />
          </div>
        </div>
        <p v-else class="empty">{{ $t('overview.scheduled.empty') }}</p>
      </section>

      <section class="card" data-anchor="overview-goals" data-anchor-kind="content">
        <h2 class="card-title">{{ $t('overview.goals.title') }}</h2>
        <div v-if="goalRows.length" class="goal-list">
          <div v-for="goal in goalRows" :key="goal.id" class="goal-row">
            <div class="goal-head">
              <span>{{ goal.title }}</span
              ><span class="goal-pct">{{ goal.pct }}%</span>
            </div>
            <ProgressBar
              class="track"
              :pct="goal.pct"
              :color="GOAL_COLORS[goal.category]"
              track="var(--chip)"
              :height="10"
            />
            <p class="goal-chapter">
              {{
                goal.chapter
                  ? $t('overview.goals.running', { title: goal.chapter })
                  : $t('overview.goals.noChapter')
              }}
            </p>
          </div>
        </div>
        <p v-else class="empty">{{ $t('overview.goals.none') }}</p>
      </section>

      <div class="stack">
        <section class="card late" data-anchor="overview-late" data-anchor-kind="content">
          <h2 class="card-title late-title">{{ $t('overview.late.title') }}</h2>
          <div v-if="late.length" class="mini-list">
            <div v-for="task in late" :key="task.id" class="mini-row">
              <span class="mini-title">{{ task.title }}</span>
              <span class="late-left">{{ task.left }}</span>
            </div>
          </div>
          <p v-else class="late-empty">{{ $t('overview.late.empty') }}</p>
        </section>

        <section class="card countdown" data-anchor="overview-countdown" data-anchor-kind="content">
          <h2 class="card-title cd-title">{{ $t('overview.countdown.title') }}</h2>
          <div v-if="nextCountdowns.length" class="mini-list">
            <div v-for="item in nextCountdowns" :key="item.id" class="mini-row">
              <span>
                <span class="mini-title">{{ item.title }}</span>
                <span class="mini-sub">{{ item.date }}</span>
              </span>
              <span class="cd-left">{{ item.left }}</span>
            </div>
          </div>
          <p v-else class="cd-empty">{{ $t('overview.countdown.empty') }}</p>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.overview {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-bottom: 80px;
}

/* Sumber: jarak antar baris kartu 16px, tapi header->statistik dan statistik->baris pertama 20px
   (main gap 20 + grid baris gap 16). Selisih 4px ditambahkan sebagai margin, bukan gap. */
.header {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 4px;
}

.title {
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: 36px;
  line-height: 1.1;
}

.label {
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
  min-width: 0;
  max-width: 100%;
}

.nav {
  display: flex;
  gap: 6px;
}

/* Sumber desain memberi opacity .35 pada tombol next yang tidak aktif. */
.nav :deep(.icon-btn:disabled) {
  opacity: 0.35;
}

.ranges {
  align-items: center;
  height: 44px;
  max-width: 100%;
  overflow-x: auto;
  scrollbar-width: none;
}

/* Padding/gap pill rentang di desain 3px/2px dengan opsi 7px 14px (bukan 4px/4px, 8px 14px). */
.controls .ranges {
  gap: 2px;
  padding: 3px;
}

.controls :deep(.option) {
  padding: 7px 14px;
}

.stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 14px;
  margin-bottom: 4px;
}

.stat {
  padding: 18px 20px;
  border-radius: var(--radius-hero);
}

.stat-label {
  font-weight: var(--fw-strong);
  font-size: 12px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.stat-value {
  margin-top: 4px;
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: 34px;
  line-height: 1.1;
}

.stat-sub {
  font-weight: var(--fw-body);
  font-size: 13px;
}

.row {
  display: flex;
  flex-wrap: wrap;
  align-items: stretch;
  gap: 16px;
}

.card {
  flex: 1 1 250px;
  min-width: 0;
  padding: 20px 22px;
  border: var(--border-thin) solid var(--line);
  border-radius: calc(28px * var(--rk));
  background: var(--paper);
}

.card-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}

.card-head.wrap {
  flex-wrap: wrap;
  align-items: center;
}

.card-title {
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: 20px;
  line-height: 1.2;
}

.card-note,
.mute {
  font-weight: var(--fw-strong);
  font-size: 13px;
  color: var(--mute);
}

.card-total {
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: 18px;
}

.chart {
  flex: 2 1 480px;
}

.chart .card-head {
  flex-wrap: wrap;
}

.bars {
  display: flex;
  align-items: flex-end;
  gap: var(--gap);
  height: 180px;
  margin-top: 16px;
  padding-bottom: 2px;
  border-bottom: var(--border) solid var(--outline);
}

.bar {
  flex: 1;
  min-width: 0;
  border: var(--border-thin) solid transparent;
  border-radius: calc(8px * var(--rk)) calc(8px * var(--rk)) 3px 3px;
}

.ticks {
  display: flex;
  gap: var(--gap);
  margin-top: 6px;
}

.tick {
  flex: 1;
  min-width: 0;
  text-align: center;
  font-weight: var(--fw-strong);
  font-size: 11px;
  color: var(--mute-3);
  white-space: nowrap;
}

.streak {
  flex: 1 1 300px;
}

.streak .card-note {
  font-size: 12px;
}

.big-streaks {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-top: 12px;
}

.big-streak {
  padding: 12px 14px;
  border-radius: var(--radius-row);
}

.big-n {
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: 28px;
  line-height: 1;
}

.big-l {
  margin-top: 2px;
  font-weight: var(--fw-strong);
  font-size: 12px;
}

.habit-streaks {
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
}

.habit-streak {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  border-top: var(--border-thin) dashed var(--line-2);
}

.dot {
  width: 12px;
  height: 12px;
  flex-shrink: 0;
  border-radius: calc(4px * var(--rk));
}

.hs-name {
  flex: 1;
  min-width: 0;
  font-weight: var(--fw-strong);
  font-size: 14px;
}

.hs-cur {
  font-weight: var(--fw-strong);
  font-size: 13px;
}

.hs-best {
  width: 76px;
  text-align: right;
  font-weight: var(--fw-body);
  font-size: 12px;
  color: var(--mute);
}

.heatmap-card {
  flex: 2 1 480px;
}

.habits-tabs {
  --chip-tint: var(--alt);

  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

/* Chip tab habit: padding 6px 12px dan titik 9px (desain), bukan tinggi minimum 34px. */
.habits-tabs :deep(.chip) {
  min-height: 0;
  padding: 6px 12px;
}

.habits-tabs .dot {
  width: 9px;
  height: 9px;
  border-radius: 3px;
}

.heatmap {
  display: flex;
  gap: 4px;
  margin-top: 16px;
  padding-bottom: 4px;
  overflow-x: auto;
}

.hm-week {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex-shrink: 0;
}

.hm-cell {
  width: 16px;
  height: 16px;
  border-radius: calc(5px * var(--rk));
}

.hm-legend {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
  font-weight: var(--fw-strong);
  font-size: 12px;
  color: var(--mute);
}

.hm-legend .spacer {
  flex: 1;
}

.hm-key {
  width: 12px;
  height: 12px;
  border-radius: calc(4px * var(--rk));
}

.mood-card {
  flex: 1 1 300px;
  border: none;
  background: #c7e3ee;
}

.mood-title {
  color: #143f52;
}

.mood-svg {
  display: block;
  width: 100%;
  height: 130px;
  margin-top: 10px;
}

.mood-axis {
  display: flex;
  justify-content: space-between;
  margin-top: 4px;
  font-weight: var(--fw-strong);
  font-size: 11px;
  color: #3f7590;
}

.mood-tiles {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-top: 12px;
}

.mood-tile {
  padding: 10px 12px;
  border-radius: var(--radius-btn-sq);
  background: var(--paper);
}

.mood-tile.alt {
  background: #b2d7e5;
}

.mood-n {
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: 22px;
  color: #143f52;
}

.mood-l {
  font-weight: var(--fw-strong);
  font-size: 12px;
  color: #1e5d78;
}

.eis-bar {
  display: flex;
  height: 22px;
  margin-top: 14px;
  border: var(--border) solid var(--outline);
  border-radius: var(--radius-pill);
  overflow: hidden;
}

.eis-list {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-top: 12px;
}

.eis-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: var(--fw-strong);
  font-size: 14px;
}

.eis-name {
  flex: 1;
}

.eis-n {
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: 16px;
}

.note {
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: calc(14px * var(--rk));
  background: var(--alt);
  font-weight: var(--fw-body);
  font-size: 13px;
  color: var(--ink-2);
  text-wrap: pretty;
}

.sched-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 12px;
}

.goal-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 12px;
}

.sched-head,
.goal-head {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-weight: var(--fw-strong);
}

.sched-head {
  font-size: 13px;
}

.goal-head {
  align-items: baseline;
  font-size: 14px;
}

.goal-pct {
  font-family: var(--font-display);
  font-size: 16px;
}

.track {
  margin-top: 4px;
}

.goal-chapter {
  margin-top: 3px;
  font-weight: var(--fw-body);
  font-size: 12px;
  color: var(--mute);
}

.stack {
  flex: 1 1 250px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

.late {
  border: none;
  background: #ffe1da;
}

.late-title {
  color: #7a1f10;
}

.countdown {
  border: none;
  background: #dde7fb;
}

.cd-title {
  color: #0a2f78;
}

.mini-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 10px;
}

.mini-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px;
  border-radius: var(--radius-btn-sq);
  background: var(--paper);
}

.mini-title {
  display: block;
  font-weight: var(--fw-strong);
  font-size: 14px;
}

.mini-sub {
  display: block;
  font-weight: var(--fw-body);
  font-size: 12px;
  color: var(--mute);
}

.late-left {
  font-weight: var(--fw-strong);
  font-size: 12px;
  color: #c2381a;
  white-space: nowrap;
}

.cd-left {
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: 16px;
  color: #0a3fa8;
  white-space: nowrap;
}

.late-empty,
.cd-empty {
  margin-top: 10px;
  font-weight: var(--fw-body);
  font-size: 14px;
}

.late-empty {
  color: #9a3a2a;
}

.empty {
  margin-top: 10px;
  font-weight: var(--fw-body);
  font-size: 14px;
  color: var(--mute);
}

@media (max-width: 599px) {
  .title {
    font-size: 28px;
  }
}
</style>
