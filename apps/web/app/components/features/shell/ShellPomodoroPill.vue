<script setup lang="ts">
import { formatMinutesSeconds } from '~/utils/time'

/**
 * Pill Pomodoro melayang (design `pf`): muncul selama sesi berjalan/dijeda di luar halaman
 * Pomodoro. Klik pill → buka Pomodoro; tombol bulat → jeda/lanjut.
 */
const { t } = useI18n()
const route = useRoute()
const pomodoro = usePomodoro()

const pomodoroPath = getFeature('pomodoro').path
const isVisible = computed(
  () => route.path !== pomodoroPath && (pomodoro.isRunning.value || pomodoro.progress.value > 0),
)
const phase = computed(() => pomodoro.phase.value)
const label = computed(() => {
  const name = t(`pomodoro.pill.phase.${phase.value}`)
  return pomodoro.isRunning.value ? name : t('pomodoro.pill.paused', { phase: name })
})
const target = computed(() =>
  phase.value === 'focus'
    ? (pomodoro.target.value ?? t('pomodoro.phase.focus'))
    : t(`pomodoro.pill.break.${phase.value}`),
)
const time = computed(() => formatMinutesSeconds(pomodoro.remainingMs.value))
const toggleLabel = computed(() =>
  t(pomodoro.isRunning.value ? 'pomodoro.pause' : 'pomodoro.resume'),
)
</script>

<template>
  <div
    v-if="isVisible"
    class="pill"
    :class="[`phase-${phase}`, { running: pomodoro.isRunning.value }]"
  >
    <NuxtLink :to="pomodoroPath" class="open" :title="$t('pomodoro.open')">
      <span class="dot" aria-hidden="true" />
      <span class="text">
        <span class="label">{{ label }}</span>
        <span class="target">{{ target }}</span>
      </span>
      <span class="time" role="timer" aria-live="off">{{ time }}</span>
    </NuxtLink>
    <button
      type="button"
      class="toggle"
      :aria-label="toggleLabel"
      :title="toggleLabel"
      @click="pomodoro.toggle"
    >
      <span aria-hidden="true">{{ pomodoro.isRunning.value ? '❚❚' : '▶' }}</span>
    </button>
  </div>
</template>

<style scoped>
/* Warna fase sama dengan kartu timer (PomodoroTimer). */
.phase-focus {
  --pill-color: var(--accent);
}

.phase-short {
  --pill-color: #2e6a26;
}

.phase-long {
  --pill-color: #1e5d78;
}

.pill {
  height: 52px;
  min-width: 0;
  max-width: 100%;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 5px 0 14px;
  border: var(--border-thick) solid var(--outline);
  border-radius: var(--radius-pill);
  background: var(--paper);
  color: var(--ink);
  box-shadow: calc(4px * var(--sx)) calc(4px * var(--sy)) calc(4px * var(--sbl))
    var(--shadow-color, rgb(47 42 36 / 0.18));
}

.pill.running {
  background: var(--pill-color);
  color: var(--paper);
}

.open {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  color: inherit;
  text-decoration: none;
}

.dot {
  width: 10px;
  height: 10px;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--pill-color);
}

.running .dot {
  background: var(--paper);
  animation: pill-pulse 1.4s ease-in-out infinite;
}

.text {
  min-width: 0;
  display: flex;
  flex-direction: column;
  line-height: 1.15;
}

.label {
  font-weight: var(--fw-strong);
  font-size: 10.5px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  white-space: nowrap;
}

.target {
  max-width: 180px;
  overflow: hidden;
  font-weight: var(--fw-body);
  font-size: 12.5px;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.time {
  padding: 0 4px;
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: 22px;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.toggle {
  width: 38px;
  height: 38px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 50%;
  background: var(--pill-color);
  color: var(--paper);
  font-weight: var(--fw-strong);
  font-size: 13px;
}

.running .toggle {
  background: rgb(255 255 255 / 0.22);
}

@keyframes pill-pulse {
  0%,
  100% {
    transform: scale(1);
    opacity: 1;
  }

  50% {
    transform: scale(1.6);
    opacity: 0.35;
  }
}

/* Reset global memendekkan durasi animasi; animasi tak berhenti jadi kedip cepat → matikan. */
@media (prefers-reduced-motion: reduce) {
  .running .dot {
    animation: none;
  }
}

@media (max-width: 599px) {
  .pill {
    height: 42px;
  }

  .toggle {
    width: 30px;
    height: 30px;
  }

  .target {
    max-width: 110px;
  }
}
</style>
