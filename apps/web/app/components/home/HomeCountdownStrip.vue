<script setup lang="ts">
import type { HomeCountdown } from '~/composables/home/types'

const { countdowns } = defineProps<{
  countdowns: (HomeCountdown & { daysLeft: number })[]
}>()

const { dayMonthYear } = useDateFormat()
</script>

<template>
  <section aria-labelledby="home-countdown-title">
    <SectionHeader :title="$t('home.countdown.title')" title-id="home-countdown-title">
      <template #action>
        <NuxtLink :to="getFeature('countdown').path" class="link">{{ $t('home.all') }}</NuxtLink>
      </template>
    </SectionHeader>
    <ul class="strip">
      <CountdownCard
        v-for="item in countdowns"
        :key="item.id"
        :days="item.daysLeft"
        :title="item.title"
        :date="dayMonthYear(item.at)"
        :bg="item.tint"
        :fg="item.ink"
      />
    </ul>
  </section>
</template>

<style scoped>
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
</style>
