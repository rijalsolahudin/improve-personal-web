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
        <IconButton
          tone="plain"
          :size="34"
          :radius="12"
          :disabled="pomodoro.config.value[key] <= POMODORO_LIMITS[key][0]"
          :title="$t('pomodoro.decrease', { setting: $t(`pomodoro.setting.${key}`) })"
          @click="pomodoro.adjust(key, -1)"
        >
          −
        </IconButton>
        <span class="value" aria-live="polite">
          {{
            $t(key === 'every' ? 'pomodoro.times' : 'pomodoro.minutesShort', {
              n: pomodoro.config.value[key],
            })
          }}
        </span>
        <IconButton
          tone="plain"
          :size="34"
          :radius="12"
          :disabled="pomodoro.config.value[key] >= POMODORO_LIMITS[key][1]"
          :title="$t('pomodoro.increase', { setting: $t(`pomodoro.setting.${key}`) })"
          @click="pomodoro.adjust(key, 1)"
        >
          +
        </IconButton>
      </li>
      <li class="row">
        <span class="label">{{ $t('pomodoro.sound') }}</span>
        <Toggle
          :on="pomodoro.isSoundOn.value"
          :aria-label="$t('pomodoro.sound')"
          @click="pomodoro.toggleSound"
        />
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

.value {
  width: 64px;
  text-align: center;
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 18px;
}
</style>
