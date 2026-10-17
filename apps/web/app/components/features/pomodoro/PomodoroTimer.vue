<script setup lang="ts">
import type { PomodoroPhase } from '~/utils/pomodoro'
import { formatMinutesSeconds } from '~/utils/time'

/** Kartu timer besar halaman Pomodoro: tab fase, cincin progres, kontrol, target fokus. */
const PHASES: readonly PomodoroPhase[] = ['focus', 'short', 'long']

const { t } = useI18n()
const pomodoro = usePomodoro()

const time = computed(() => formatMinutesSeconds(pomodoro.remainingMs.value))
const percent = computed(() => Math.round(pomodoro.progress.value * 100))
const phaseLabel = computed(
  () =>
    t(`pomodoro.phaseLong.${pomodoro.phase.value}`) +
    (pomodoro.isRunning.value ? '' : ` · ${t('pomodoro.ready')}`),
)
const toggleLabel = computed(() => {
  if (pomodoro.isRunning.value) return t('pomodoro.pause')
  return t(pomodoro.isStarted.value ? 'pomodoro.resume' : 'pomodoro.begin')
})
const dots = computed(() =>
  Array.from({ length: pomodoro.sessionsPerCycle.value }, (_, index) => {
    if (index < pomodoro.completedInCycle.value) return 'done'
    return index === pomodoro.completedInCycle.value && pomodoro.phase.value === 'focus'
      ? 'current'
      : 'todo'
  }),
)
</script>

<template>
  <section
    class="timer dot-grid"
    :class="`phase-${pomodoro.phase.value}`"
    data-anchor="pomodoro-timer"
    data-anchor-kind="content"
    :aria-label="$t('pomodoro.name')"
  >
    <div class="phases" role="group" :aria-label="$t('pomodoro.phaseLabel')">
      <button
        v-for="phase in PHASES"
        :key="phase"
        type="button"
        :aria-pressed="pomodoro.phase.value === phase"
        :disabled="pomodoro.isRunning.value && pomodoro.phase.value !== phase"
        @click="pomodoro.selectPhase(phase)"
      >
        {{ $t(`pomodoro.phaseLong.${phase}`) }}
      </button>
    </div>

    <div class="ring" :style="{ '--pct': `${percent}%` }">
      <div class="face">
        <span class="eyebrow phase-label">{{ phaseLabel }}</span>
        <span class="time" role="timer" aria-live="off">{{ time }}</span>
        <span
          class="dots"
          :aria-label="
            $t('pomodoro.cycle', {
              n: pomodoro.session.value,
              total: pomodoro.sessionsPerCycle.value,
            })
          "
        >
          <span v-for="(dot, index) in dots" :key="index" class="dot" :class="dot" />
        </span>
      </div>
    </div>

    <div class="controls">
      <Button variant="outline" class="ctrl" @click="pomodoro.reset">
        {{ $t('pomodoro.reset') }}
      </Button>
      <button type="button" class="ctrl main" @click="pomodoro.toggle">{{ toggleLabel }}</button>
      <Button variant="outline" class="ctrl" @click="pomodoro.skip">
        {{ $t('pomodoro.skip') }}
      </Button>
    </div>

    <PomodoroTarget />
  </section>
</template>

<style scoped>
.timer {
  flex: 2 1 480px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  padding: 26px;
  border-radius: var(--radius-panel);
  background-color: var(--ph-bg);
  background-size: 22px 22px;
}

.phase-focus {
  --ph-bg: var(--soft);
  --ph-color: var(--accent);
  --ph-deep: var(--deep);
}

.phase-short {
  --ph-bg: #cde8c6;
  --ph-color: #1da20f;
  --ph-deep: #2e6a26;
}

.phase-long {
  --ph-bg: #c7e3ee;
  --ph-color: #10a8d8;
  --ph-deep: #1e5d78;
}

.phases {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 2px;
  padding: 4px;
  border-radius: var(--radius-pill);
  background: var(--paper);
}

.phases button {
  padding: 8px 16px;
  border: none;
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--mute-2);
  font-weight: var(--fw-strong);
  font-size: 14px;
  white-space: nowrap;
}

.phases button[aria-pressed='true'] {
  background: var(--ph-deep);
  color: var(--paper);
}

.phases button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.ring {
  width: min(300px, 70vw);
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  border: var(--border-thick) solid var(--outline);
  border-radius: 50%;
  background: conic-gradient(var(--ph-color) var(--pct), var(--paper) 0);
}

.face {
  width: 82%;
  aspect-ratio: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border: var(--border-thick) solid var(--outline);
  border-radius: 50%;
  background: var(--ph-bg);
}

.phase-label {
  letter-spacing: 0.14em;
  color: var(--ph-deep);
}

.time {
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: clamp(48px, 14vw, 72px);
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.dots {
  display: flex;
  gap: 6px;
  margin-top: 10px;
}

.dot {
  width: 12px;
  height: 12px;
  border: var(--border-thin) solid var(--outline);
  border-radius: 50%;
  background: var(--paper);
}

.dot.done {
  background: var(--ink);
}

.dot.current {
  background: var(--ph-color);
}

.controls {
  width: 100%;
  max-width: 420px;
  display: flex;
  gap: 10px;
}

.ctrl {
  flex: 1;
  height: 52px;
  border: var(--border) solid var(--outline);
  border-radius: var(--radius-pill);
  background: var(--paper);
  font-weight: var(--fw-strong);
  font-size: 16px;
}

.ctrl.main {
  flex: 2;
  border: none;
  background: var(--ph-deep);
  color: var(--paper);
}

@media (max-width: 599px) {
  .timer {
    padding: 20px 14px;
  }
}
</style>
