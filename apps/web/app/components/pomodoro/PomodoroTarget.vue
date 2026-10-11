<script setup lang="ts">
import { POMODORO_TARGET_MAX, type PomodoroTargetMode } from '~/composables/usePomodoro'

/** Target fokus: pilih task aktif atau tulis teks bebas (PRD F4). */
const MODES: readonly PomodoroTargetMode[] = ['task', 'free']

const pomodoro = usePomodoro()
const { tasks } = useTasks()
const openTasks = computed(() => tasks.value.filter((task) => !task.done))
const freeText = ref(pomodoro.targetMode.value === 'free' ? (pomodoro.target.value ?? '') : '')

function onFreeInput(event: Event): void {
  freeText.value = (event.target as HTMLInputElement).value
  pomodoro.setTarget(freeText.value)
}
</script>

<template>
  <div class="target">
    <div class="head">
      <span class="eyebrow label">{{ $t('pomodoro.targetTitle') }}</span>
      <div class="modes" role="group" :aria-label="$t('pomodoro.targetTitle')">
        <button
          v-for="mode in MODES"
          :key="mode"
          type="button"
          :aria-pressed="pomodoro.targetMode.value === mode"
          @click="pomodoro.setTargetMode(mode)"
        >
          {{ $t(`pomodoro.targetMode.${mode}`) }}
        </button>
      </div>
    </div>
    <div v-if="pomodoro.targetMode.value === 'task'" class="tasks">
      <button
        v-for="task in openTasks"
        :key="task.id"
        type="button"
        class="task"
        :aria-pressed="pomodoro.target.value === task.title"
        @click="pomodoro.setTarget(task.title)"
      >
        <span
          class="dot"
          :style="{ background: `var(--prio-${task.priority}-fg)` }"
          aria-hidden="true"
        />
        {{ task.title }}
      </button>
      <p v-if="!openTasks.length" class="empty">{{ $t('pomodoro.noTasks') }}</p>
    </div>
    <input
      v-else
      class="free"
      :value="freeText"
      :maxlength="POMODORO_TARGET_MAX"
      :placeholder="$t('pomodoro.freePlaceholder')"
      :aria-label="$t('pomodoro.targetMode.free')"
      @input="onFreeInput"
    />
  </div>
</template>

<style scoped>
.target {
  width: 100%;
  max-width: 520px;
  padding: 14px 16px;
  border-radius: 22px;
  background: rgb(255 255 255 / 0.7);
}

.head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.label {
  color: var(--ph-deep);
}

.modes {
  display: flex;
  gap: 2px;
  padding: 3px;
  border-radius: var(--radius-pill);
  background: var(--paper);
}

.modes button {
  padding: 5px 12px;
  border: none;
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--mute-2);
  font-weight: 800;
  font-size: 13px;
  white-space: nowrap;
}

.modes button[aria-pressed='true'] {
  background: var(--ph-deep);
  color: var(--paper);
}

.tasks {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}

.task {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  border: 2px solid transparent;
  border-radius: var(--radius-pill);
  background: rgb(255 255 255 / 0.5);
  font-weight: 800;
  font-size: 13px;
}

.task[aria-pressed='true'] {
  border-color: var(--ink);
  background: var(--paper);
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.empty {
  font-weight: 700;
  font-size: 13px;
  color: var(--mute);
}

.free {
  width: 100%;
  margin-top: 10px;
  padding: 11px 14px;
  border: 2.5px solid var(--ink);
  border-radius: 16px;
  background: var(--paper);
  font-weight: 700;
  font-size: 15px;
  outline: none;
}

</style>
