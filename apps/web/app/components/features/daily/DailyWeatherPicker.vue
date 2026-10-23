<script setup lang="ts">
import { WEATHER_KINDS, WEATHER_META, type WeatherKind } from '~/utils/dailyRoutine'

/** Cuaca hari ini, dipilih manual (Desktop.dc.html). Klik pilihan aktif = kosongkan. */
const weather = defineModel<WeatherKind | null>({ required: true })

const options = computed(() =>
  WEATHER_KINDS.map((kind) => ({ kind, ...WEATHER_META[kind], isOn: weather.value === kind })),
)
</script>

<template>
  <div class="weather" role="group" :aria-label="$t('daily.weather.label')">
    <button
      v-for="option in options"
      :key="option.kind"
      type="button"
      class="option"
      :class="{ on: option.isOn }"
      :style="{ '--weather-color': option.color }"
      :title="$t(`daily.weather.${option.kind}`)"
      :aria-label="$t(`daily.weather.${option.kind}`)"
      :aria-pressed="option.isOn"
      @click="weather = option.isOn ? null : option.kind"
    >
      <Icon :name="option.icon" :size="18" />
    </button>
  </div>
</template>

<style scoped>
.weather {
  display: flex;
  gap: 6px;
}

.option {
  position: relative;
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: var(--border-thin) solid var(--line-2);
  border-radius: var(--radius-leaf-sm);
  background: var(--paper);
  color: var(--mute-2);
  transition: transform 0.15s ease;
}

.option:hover {
  background: var(--hover);
}

.option.on {
  border-color: var(--outline);
  background: var(--primary);
  /* Ikon = informasi non-teks: warna cuaca (#E6A800 dst.) cuma 1,1-3,9:1 di atas `--primary` dan
     gagal ambang 3:1. Ikon pakai `--deeper` (>=5,09:1); warna cuaca tetap terbaca sebagai bar
     dekoratif, tidak memikul beban kontras (jenis cuaca sudah dibawa bentuk ikon + label). */
  color: var(--deeper);
  transform: rotate(calc(-4deg * var(--bev))) scale(1.06);
}

.option.on::after {
  content: '';
  position: absolute;
  right: 7px;
  bottom: 4px;
  left: 7px;
  height: 3px;
  border-radius: 2px;
  background: var(--weather-color);
}
</style>
