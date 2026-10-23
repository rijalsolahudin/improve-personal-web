<script setup lang="ts">
import { themes as themeTokens, uiStyles } from '@improve-personal/tokens'

/** Desktop.dc.html "Tampilan": pilih warna (tema) + gaya, berlaku langsung (PRD F16). */
const { t } = useI18n()
const { theme, style, themes, styles, isPickerOpen, setTheme, setStyle } = useAppearance()

const root = useTemplateRef<HTMLElement>('root')
useDismiss(root, isPickerOpen)

const summary = computed(
  () => `${t(`theme.${theme.value}`)} · ${t(`uiStyle.${style.value}.label`)}`,
)
const themeOptions = computed(() =>
  themes.map((name) => ({
    value: name,
    label: t(`theme.${name}`),
    swatch: themeTokens[name].primary,
  })),
)
const styleOptions = computed(() =>
  styles.map((name) => ({ name, font: uiStyles[name].fonts.display, isOn: name === style.value })),
)
</script>

<template>
  <div ref="root" class="appearance">
    <button
      type="button"
      class="trigger"
      :aria-expanded="isPickerOpen"
      aria-controls="appearance-panel"
      @click="isPickerOpen = !isPickerOpen"
    >
      <span class="dot" aria-hidden="true" />
      <span>{{ $t('appearance.label') }}</span>
      <span class="summary">{{ summary }}</span>
    </button>

    <div v-if="isPickerOpen" id="appearance-panel" class="panel">
      <fieldset class="group">
        <legend class="eyebrow legend">{{ $t('appearance.color') }}</legend>
        <Segmented
          class="themes"
          is-equal
          :model-value="theme"
          :options="themeOptions"
          :label="$t('appearance.color')"
          @update:model-value="setTheme"
        />
      </fieldset>
      <fieldset class="group">
        <legend class="eyebrow legend">{{ $t('appearance.style') }}</legend>
        <div class="styles">
          <button
            v-for="option in styleOptions"
            :key="option.name"
            type="button"
            class="style"
            :class="{ on: option.isOn }"
            :aria-pressed="option.isOn"
            @click="setStyle(option.name)"
          >
            <span class="style-name" :style="{ fontFamily: option.font }">
              {{ $t(`uiStyle.${option.name}.label`) }}
            </span>
            <span class="style-desc">{{ $t(`uiStyle.${option.name}.desc`) }}</span>
          </button>
        </div>
      </fieldset>
    </div>
  </div>
</template>

<style scoped>
.appearance {
  position: relative;
}

.trigger {
  height: 36px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 14px 0 10px;
  border: var(--border) solid var(--outline);
  border-radius: var(--radius-pill);
  background: var(--paper);
  font-weight: var(--fw-strong);
  font-size: 13px;
  white-space: nowrap;
}

.trigger:hover {
  background: var(--hover);
}

.dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--accent);
}

.summary {
  color: var(--mute);
  font-weight: var(--fw-body);
}

.panel {
  position: absolute;
  top: calc(100% + 10px);
  left: 0;
  z-index: 80;
  width: 320px;
  max-width: calc(100vw - 32px);
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
  border: var(--border) solid var(--outline);
  border-radius: var(--radius-card);
  background: var(--paper);
  box-shadow: var(--shadow-ring);
}

.group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  border: 0;
}

.legend {
  padding: 0 0 8px;
  color: var(--mute-2);
}

.themes {
  --seg-bg: transparent;
}

.styles {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.style {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 10px 12px;
  border: calc(1.5px * var(--bk)) solid var(--line);
  border-radius: calc(14px * var(--rk));
  background: transparent;
  color: var(--ink);
  text-align: left;
}

.style.on {
  border-color: var(--accent);
  background: var(--soft);
  color: var(--deeper);
}

.style-name {
  font-weight: var(--fw-body);
  font-size: 16px;
  line-height: 1.1;
}

.style-desc {
  font-weight: var(--fw-medium);
  font-size: 11.5px;
  line-height: 1.3;
  /* `--mute-2` >= 6,97:1 di `--paper`, >= 5,33:1 di `--soft` (gaya terpilih) - naik dari
     opacity 0.8 (4,07:1 di `--soft`) tanpa menurunkan kontras di `--paper` (QA #62). */
  color: var(--mute-2);
}
</style>
