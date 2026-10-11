<script lang="ts">
import { formatMinutesSeconds } from '~/utils/time'

export interface PomodoroTargetOption {
  id: string
  label: string
  meta: string
  /** Warna titik penanda (CSS color). */
  dot: string
}
</script>

<script setup lang="ts">
const { targetGroups } = defineProps<{
  targetGroups: { id: 'schedule' | 'task'; options: PomodoroTargetOption[] }[]
}>()

const { t } = useI18n()
const pomodoro = usePomodoro()
const isPickerOpen = ref(false)

const time = computed(() => formatMinutesSeconds(pomodoro.remainingMs.value))
const status = computed(() => {
  const phase = t(`pomodoro.phase.${pomodoro.phase.value}`)
  const ready = pomodoro.isRunning.value ? '' : ` · ${t('pomodoro.ready')}`
  return `${t('pomodoro.name')} · ${phase}${ready} · ${pomodoro.session.value}/${pomodoro.sessionsPerCycle.value}`
})
const toggleLabel = computed(() =>
  t(pomodoro.isRunning.value ? 'pomodoro.pause' : 'pomodoro.start'),
)

function pick(label: string): void {
  pomodoro.setTarget(label)
  isPickerOpen.value = false
}
</script>

<template>
  <section class="card" :aria-label="$t('pomodoro.name')">
    <div class="row">
      <PomodoroClockFace class="wide" :progress="pomodoro.progress.value" />
      <ProgressRing
        class="narrow"
        :percent="Math.round(pomodoro.progress.value * 100)"
        :size="48"
        :hole="0.75"
        inner="var(--accent)"
      >
        <button type="button" class="play-mini" :aria-label="toggleLabel" @click="pomodoro.toggle">
          <span aria-hidden="true">{{ pomodoro.isRunning.value ? '❚❚' : '▶' }}</span>
        </button>
      </ProgressRing>

      <div class="text">
        <p class="eyebrow status">{{ status }}</p>
        <p class="time" role="timer" aria-live="off">{{ time }}</p>
      </div>

      <div class="controls wide-flex">
        <button
          type="button"
          class="ctrl ctrl-main"
          :title="toggleLabel"
          :aria-label="toggleLabel"
          @click="pomodoro.toggle"
        >
          <span aria-hidden="true">{{ pomodoro.isRunning.value ? '❚❚' : '▶' }}</span>
        </button>
        <button
          type="button"
          class="ctrl ctrl-reset"
          :title="$t('pomodoro.reset')"
          :aria-label="$t('pomodoro.reset')"
          @click="pomodoro.reset"
        >
          <span aria-hidden="true">↺</span>
        </button>
      </div>
      <NuxtLink
        :to="getFeature('pomodoro').path"
        class="open narrow"
        :aria-label="$t('pomodoro.open')"
      >
        <span aria-hidden="true">›</span>
      </NuxtLink>
    </div>

    <div class="wide">
      <button
        type="button"
        class="target"
        :aria-expanded="isPickerOpen"
        aria-controls="home-pomodoro-targets"
        @click="isPickerOpen = !isPickerOpen"
      >
        <span class="target-label">{{ $t('pomodoro.target') }}</span>
        <span class="target-value">{{ pomodoro.target.value ?? $t('pomodoro.noTarget') }}</span>
        <span class="target-action">{{ $t(isPickerOpen ? 'common.close' : 'common.change') }}</span>
      </button>
      <div v-if="isPickerOpen" id="home-pomodoro-targets" class="picker">
        <div v-for="group in targetGroups" :key="group.id" class="picker-group">
          <p class="picker-title">{{ $t(`pomodoro.targetGroup.${group.id}`) }}</p>
          <button
            v-for="option in group.options"
            :key="option.id"
            type="button"
            class="option"
            :aria-pressed="pomodoro.target.value === option.label"
            @click="pick(option.label)"
          >
            <span class="dot" :style="{ background: option.dot }" aria-hidden="true" />
            <span class="option-label">{{ option.label }}</span>
            <span class="option-meta">{{ option.meta }}</span>
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.card {
  padding: 16px 18px;
  background: var(--soft);
  border-radius: 28px;
}

.row {
  display: flex;
  align-items: center;
  gap: 14px;
}

.text {
  flex: 1;
  min-width: 0;
}

.status {
  overflow: hidden;
  color: var(--deep);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.time {
  margin-top: 2px;
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 34px;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
}

.controls {
  display: flex;
  flex-shrink: 0;
  gap: 8px;
}

.ctrl {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  border-radius: 50%;
  font-weight: 800;
}

.ctrl-main {
  background: var(--accent);
  color: var(--paper);
  font-size: var(--fs-caption);
}

.ctrl-reset {
  background: rgba(255, 255, 255, 0.6);
  color: var(--deeper);
  font-size: 16px;
}

.target {
  width: 100%;
  margin-top: 10px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 12px;
  border: none;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.6);
  text-align: left;
}

.target:hover {
  background: rgba(255, 255, 255, 0.85);
}

.target-label {
  flex-shrink: 0;
  font-weight: 800;
  font-size: var(--fs-eyebrow);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--deep);
}

.target-value {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  font-weight: 800;
  font-size: var(--fs-caption);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.target-action {
  font-weight: 800;
  font-size: var(--fs-meta);
  color: var(--deeper);
}

.picker {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px;
  border-radius: var(--radius-row);
  background: var(--paper);
}

.picker-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.picker-title {
  padding: 0 6px;
  font-weight: 800;
  font-size: var(--fs-eyebrow);
  letter-spacing: var(--tracking-eyebrow);
  text-transform: uppercase;
  color: var(--mute);
}

.option {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border: none;
  border-radius: var(--radius-inner);
  background: transparent;
  text-align: left;
}

.option:hover,
.option[aria-pressed='true'] {
  background: #ffe9d9;
}

.dot {
  width: 10px;
  height: 10px;
  flex-shrink: 0;
  border-radius: 50%;
}

.option-label {
  flex: 1;
  min-width: 0;
  font-weight: 700;
  font-size: var(--fs-body-sm);
}

.option-meta {
  font-weight: 700;
  font-size: var(--fs-meta);
  color: var(--mute);
}

.card .narrow {
  display: none;
}

.play-mini {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--paper);
  font-weight: 800;
  font-size: var(--fs-meta);
}

.open {
  font-weight: 800;
  font-size: 20px;
  color: var(--deep);
}

@media (max-width: 599px) {
  .card {
    padding: 12px 14px;
    border-radius: var(--radius-hero);
  }

  .row {
    gap: 12px;
  }

  .card .wide,
  .card .wide-flex {
    display: none;
  }

  .card .narrow {
    display: inline-flex;
  }

  .time {
    font-size: var(--fs-stat);
  }
}
</style>
