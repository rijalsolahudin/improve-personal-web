<script setup lang="ts">
import type { Progress, WeatherKind } from '~/utils/dailyRoutine'
import { greetingPeriod } from '~/utils/time'

/** Header Daily Routine: tanggal, sapaan, cuaca + Tampilan, dan satu ringkasan progres hari. */
const { now, progress } = defineProps<{
  now: number
  progress: Progress
}>()
const weather = defineModel<WeatherKind | null>('weather', { required: true })

const { t } = useI18n()
const { longDate } = useDateFormat()

const greeting = computed(() => t(`daily.greeting.${greetingPeriod(new Date(now).getHours())}`))
// Nama dari profil terenkripsi; sebelum diisi (atau sebelum data lokal terbuka) pakai sapaan umum.
const { profile } = useProfile()
const greetingName = computed(() => profile.value.displayName || t('shell.user.name'))
const progressLabel = computed(() =>
  t('daily.progressValue', {
    done: progress.done,
    total: progress.total,
    percent: progress.percent,
  }),
)
</script>

<template>
  <header class="header">
    <div class="titles">
      <p class="date">{{ longDate(now) }}</p>
      <h1 class="greeting">{{ $t('daily.greetingName', { greeting, name: greetingName }) }}</h1>
      <div class="tools">
        <DailyWeatherPicker v-model="weather" />
        <span class="divider" aria-hidden="true" />
        <AppearanceMenu />
      </div>
    </div>
    <div class="summary">
      <div class="progress">
        <ProgressRing
          :percent="progress.percent"
          :size="38"
          :hole="0.68"
          track="var(--chip)"
          inner="var(--paper)"
        />
        <div class="progress-text">
          <span class="eyebrow progress-label">{{ $t('daily.progress') }}</span>
          <span class="progress-value">{{ progressLabel }}</span>
        </div>
      </div>
    </div>
  </header>
</template>

<style scoped>
.header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px 24px;
}

.titles {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.date {
  font-weight: var(--fw-strong);
  font-size: var(--fs-eyebrow);
  letter-spacing: var(--tracking-eyebrow);
  color: var(--deep);
}

.greeting {
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: 38px;
  line-height: var(--lh-tight);
}

.tools {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 2px;
}

.divider {
  width: 1.5px;
  height: 22px;
  margin: 0 6px;
  background: var(--line-2);
}

.summary {
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: 100%;
}

.progress-value {
  font-weight: var(--fw-strong);
  font-size: var(--fs-body-sm);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.progress {
  height: 50px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 14px 0 7px;
  border: var(--border) solid var(--outline);
  border-radius: var(--radius-pill);
  background: var(--paper);
}

.progress-text {
  display: flex;
  flex-direction: column;
  line-height: 1.15;
}

.progress-label {
  color: var(--deep);
}

@media (max-width: 599px) {
  .greeting {
    font-size: var(--fs-h1);
  }

  /* HP: ringkasan progres turun ke baris sendiri, lebarnya mengikuti header. */
  .summary {
    width: 100%;
  }
}
</style>
