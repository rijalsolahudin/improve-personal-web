<script setup lang="ts">
import type { HomeCountdown } from '~/composables/home/types'

const { countdowns } = defineProps<{
  countdowns: (HomeCountdown & { daysLeft: number })[]
}>()

const { dayMonthYear } = useDateFormat()
</script>

<template>
  <section aria-labelledby="home-countdown-title">
    <div class="head">
      <h2 id="home-countdown-title" class="heading">{{ $t('home.countdown.title') }}</h2>
      <NuxtLink :to="getFeature('countdown').path" class="link">{{ $t('home.all') }}</NuxtLink>
    </div>
    <ul class="strip">
      <li
        v-for="item in countdowns"
        :key="item.id"
        class="item"
        :style="{ '--cd-tint': item.tint, '--cd-ink': item.ink }"
      >
        <span class="days">
          {{ item.daysLeft }}<span class="unit">{{ $t('home.countdown.days') }}</span>
        </span>
        <span class="title">{{ item.title }}</span>
        <span class="date">{{ dayMonthYear(item.at) }}</span>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 10px;
}

.heading {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: var(--fs-h2);
}

.link {
  font-weight: 800;
  font-size: var(--fs-caption);
}

.strip {
  display: flex;
  gap: 10px;
  overflow-x: auto;
  margin: 0 -16px;
  padding: 0 16px 4px;
  list-style: none;
}

.item {
  width: 150px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  padding: 12px 14px;
  border-radius: var(--radius-card);
  background: var(--cd-tint);
}

.days {
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

.title {
  margin-top: 4px;
  font-weight: 800;
  font-size: var(--fs-body-sm);
  line-height: 1.2;
}

.date {
  margin-top: 2px;
  font-weight: 700;
  font-size: var(--fs-meta);
  color: var(--cd-ink);
  text-transform: uppercase;
}
</style>
