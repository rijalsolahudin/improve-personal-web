<script setup lang="ts">
import type { HomeSchedule } from '~/composables/home/types'
import { formatClock, formatHourMinute } from '~/utils/time'

const { schedule, now } = defineProps<{
  schedule: HomeSchedule | null
  now: number
}>()
const emit = defineEmits<{ focus: [] }>()

const timeRange = computed(() =>
  schedule ? `${formatHourMinute(schedule.startsAt)}–${formatHourMinute(schedule.endsAt)}` : '',
)
const startsIn = computed(() => (schedule ? formatClock(schedule.startsAt - now) : ''))
</script>

<template>
  <section class="hero dot-grid" aria-labelledby="home-next-title">
    <UiMascot class="mascot" name="kelinci" :size="72" />
    <template v-if="schedule">
      <div class="info">
        <p class="meta-row">
          <span class="eyebrow">{{ $t('home.next.eyebrow') }}</span>
          <span class="meta">
            <span>{{ timeRange }}</span>
            <span v-if="schedule.goalTitle" class="goal">· {{ schedule.goalTitle }}</span>
          </span>
        </p>
        <h2 id="home-next-title" class="title">{{ schedule.title }}</h2>
      </div>
      <p class="countdown-block">
        <span class="countdown-label eyebrow">{{ $t('home.next.startsIn') }}</span>
        <span class="countdown">{{ startsIn }}</span>
      </p>
      <button type="button" class="focus-btn" @click="emit('focus')">
        {{ $t('home.next.focus') }}
      </button>
    </template>
    <div v-else class="info">
      <p class="eyebrow">{{ $t('home.next.eyebrow') }}</p>
      <h2 id="home-next-title" class="title">{{ $t('home.next.empty') }}</h2>
    </div>
  </section>
</template>

<style scoped>
.hero {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 10px 14px;
  padding: 12px 64px 12px 20px;
  background-color: var(--primary);
  border-radius: var(--radius-card);
}

.mascot {
  position: absolute;
  top: -30px;
  right: 2px;
  transform: rotate(-6deg) scale(0.85);
}

.info {
  min-width: 0;
}

.meta-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}

.eyebrow {
  flex-shrink: 0;
  color: var(--deep);
}

.meta {
  overflow: hidden;
  font-weight: 700;
  font-size: var(--fs-meta);
  color: var(--deeper);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.title {
  overflow: hidden;
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 19px;
  line-height: 1.2;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.countdown-block {
  display: flex;
  flex-direction: column;
}

.countdown-label {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}

.countdown {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 20px;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.focus-btn {
  padding: 8px 14px;
  border: none;
  border-radius: var(--radius-pill);
  background: var(--accent);
  color: var(--paper);
  font-weight: 800;
  font-size: var(--fs-caption);
  white-space: nowrap;
}

.focus-btn:hover {
  background: var(--deeper);
}

@media (max-width: 599px) {
  .hero {
    grid-template-columns: minmax(0, 1fr) auto;
    margin-top: 26px;
    padding: 14px 16px;
    border-radius: var(--radius-hero);
    background-size: 18px 18px;
  }

  .mascot {
    top: -34px;
    right: 10px;
    transform: none;
  }

  .info {
    grid-column: 1 / -1;
    padding-right: 72px;
  }

  .goal {
    display: none;
  }

  .title {
    font-size: 20px;
  }

  .countdown-label {
    position: static;
    width: auto;
    height: auto;
    clip: auto;
    font-size: 10px;
  }

  .countdown {
    font-size: 24px;
    line-height: 1.1;
  }

  .focus-btn {
    min-height: var(--tap-min);
    padding: 0 20px;
    font-size: var(--fs-body);
  }
}
</style>
