<script setup lang="ts">
import { themes as themeTokens, type ThemeName } from '@improve-personal/tokens'

/**
 * Pemilih warna tema: grid swatch. Swatch = pastel `primary` tema dengan inti `accent`, jadi dua
 * warna yang paling banyak terlihat di layar sudah terbaca sebelum dipilih.
 */
const { themes, active } = defineProps<{
  themes: readonly ThemeName[]
  active: ThemeName
}>()
const emit = defineEmits<{ select: [theme: ThemeName] }>()

const { t } = useI18n()

const options = computed(() =>
  themes.map((name) => ({
    name,
    label: t(`theme.${name}`),
    swatch: themeTokens[name].primary,
    core: themeTokens[name].accent,
    isOn: name === active,
  })),
)
</script>

<template>
  <div class="themes" role="group" :aria-label="$t('appearance.color')">
    <button
      v-for="option in options"
      :key="option.name"
      type="button"
      class="theme"
      :class="{ on: option.isOn }"
      :aria-pressed="option.isOn"
      @click="emit('select', option.name)"
    >
      <span class="swatch" :style="{ background: option.swatch }" aria-hidden="true">
        <span class="core" :style="{ background: option.core }">
          <Icon v-if="option.isOn" name="check" :size="12" :stroke="3" />
        </span>
      </span>
      <span class="theme-label">{{ option.label }}</span>
    </button>
  </div>
</template>

<style scoped>
.themes {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-6);
}

.theme {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-4);
  min-height: var(--tap-min);
  padding: var(--space-6) var(--space-2);
  border: 0;
  border-radius: calc(12px * var(--rk));
  background: transparent;
  color: var(--ink-2);
}

.theme:hover {
  background: var(--hover);
}

.swatch {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  /* Cincin tipis supaya swatch pucat (Grafit, Toska) tidak lebur dengan latar panel. */
  box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.08);
  transition: box-shadow 0.15s ease;
}

.theme.on .swatch {
  box-shadow:
    0 0 0 2px var(--paper),
    0 0 0 4px var(--accent);
}

.core {
  display: grid;
  place-items: center;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  color: #fff;
}

.theme-label {
  font-weight: var(--fw-medium);
  font-size: var(--fs-12);
  line-height: 1.2;
}

.theme.on .theme-label {
  color: var(--deeper);
  font-weight: var(--fw-strong);
}
</style>
