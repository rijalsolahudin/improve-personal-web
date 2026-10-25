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
          <span class="sign">−</span>
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
          <span class="sign">+</span>
        </IconButton>
      </li>
      <li class="row sound">
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
  border: var(--border-thin) solid var(--line);
  border-radius: calc(28px * var(--rk));
  background: var(--paper);
}

.title {
  font-family: var(--font-display);
  font-weight: var(--fw-display);
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
  border-top: var(--border-thin) dashed var(--line-2);
}

/* Baris terakhir design hanya punya padding atas; jarak bawah dipegang padding kartu (20px). */
.rows > .row:last-child {
  padding-bottom: 0;
}

.label {
  flex: 1;
  font-weight: var(--fw-strong);
  font-size: 14px;
}

.value {
  width: 64px;
  text-align: center;
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: 18px;
}

/* Glyph −/+ design 18px; IconButton menurunkan ukuran font dari `size` (34 → 14px) lewat
   custom property inline, jadi ukuran glyph diatur di sini, bukan di komponen. */
.sign {
  font-size: 18px;
  line-height: 1;
}

/* Switch design 52×30 dengan kenop 21px (Toggle md global 40×24), jalur mati lebih gelap
   (`--dash`) dan garis lebih tebal supaya sebanding dengan kartu 22px padding-nya. */
.sound :deep(.toggle.toggle-md) {
  width: 52px;
  height: 30px;
  border-width: var(--border);
  background: var(--dash);
}

.sound :deep(.toggle.on) {
  background: var(--accent);
}

.sound :deep(.knob) {
  top: 2px;
  bottom: auto;
  height: 21px;
}
</style>
