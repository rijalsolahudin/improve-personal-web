<script setup lang="ts">
import { POMODORO_LIMITS, POMODORO_SETTINGS } from '~/utils/pomodoro'

/** Pengaturan durasi (− / +, dibatasi) + suara saat fase selesai. Tersimpan otomatis. */
const pomodoro = usePomodoro()
</script>

<template>
  <section
    class="card"
    data-anchor="pomodoro-settings"
    data-anchor-kind="content"
    aria-labelledby="pomo-settings-title"
  >
    <h2 id="pomo-settings-title" class="title">{{ $t('pomodoro.settings') }}</h2>
    <ul class="rows">
      <li v-for="key in POMODORO_SETTINGS" :key="key" class="row">
        <span class="label">{{ $t(`pomodoro.setting.${key}`) }}</span>
        <button
          type="button"
          class="step"
          :disabled="pomodoro.config.value[key] <= POMODORO_LIMITS[key][0]"
          :aria-label="$t('pomodoro.decrease', { setting: $t(`pomodoro.setting.${key}`) })"
          @click="pomodoro.adjust(key, -1)"
        >
          −
        </button>
        <span class="value" aria-live="polite">
          {{
            $t(key === 'every' ? 'pomodoro.times' : 'pomodoro.minutesShort', {
              n: pomodoro.config.value[key],
            })
          }}
        </span>
        <button
          type="button"
          class="step"
          :disabled="pomodoro.config.value[key] >= POMODORO_LIMITS[key][1]"
          :aria-label="$t('pomodoro.increase', { setting: $t(`pomodoro.setting.${key}`) })"
          @click="pomodoro.adjust(key, 1)"
        >
          +
        </button>
      </li>
      <li class="row">
        <span class="label">{{ $t('pomodoro.sound') }}</span>
        <button
          type="button"
          role="switch"
          class="switch"
          :class="{ on: pomodoro.isSoundOn.value }"
          :aria-checked="pomodoro.isSoundOn.value"
          :aria-label="$t('pomodoro.sound')"
          @click="pomodoro.toggleSound"
        >
          <span />
        </button>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.card {
  min-width: 0;
  padding: 20px 22px;
  border: 2px solid var(--line);
  border-radius: 28px;
  background: var(--paper);
}

.title {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 20px;
  line-height: 1.2;
}

.rows {
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
}

.row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 0;
  border-top: 2px dashed var(--line-2);
}

.label {
  flex: 1;
  font-weight: 800;
  font-size: 14px;
}

.step {
  width: 34px;
  height: 34px;
  border: none;
  border-radius: 12px;
  background: var(--chip);
  font-weight: 800;
  font-size: 18px;
}

.step:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.value {
  width: 64px;
  text-align: center;
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 18px;
}

.switch {
  position: relative;
  width: 52px;
  height: 30px;
  padding: 0;
  border: 2.5px solid var(--ink);
  border-radius: var(--radius-pill);
  background: #e3cfaf;
}

.switch > span {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 21px;
  height: 21px;
  border: 2px solid var(--ink);
  border-radius: 50%;
  background: var(--paper);
  transition: transform var(--dur) var(--ease);
}

.switch.on {
  background: var(--accent);
}

.switch.on > span {
  transform: translateX(22px);
}
</style>
