<script setup lang="ts">
/** Desktop.dc.html "Tampilan": pilih warna (tema) + gaya, berlaku langsung (PRD F16). */
const { t } = useI18n()
const { theme, style, themes, isPickerOpen, setTheme, setStyle } = useAppearance()

const root = useTemplateRef<HTMLElement>('root')
useDismiss(root, isPickerOpen)

const summary = computed(
  () => `${t(`theme.${theme.value}`)} · ${t(`uiStyle.${style.value}.label`)}`,
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
      <section class="group">
        <h2 class="eyebrow legend">{{ $t('appearance.color') }}</h2>
        <AppearanceThemeGrid :themes="themes" :active="theme" @select="setTheme" />
      </section>
      <section class="group">
        <h2 class="eyebrow legend">{{ $t('appearance.style') }}</h2>
        <AppearanceStylePicker :active="style" @select="setStyle" />
      </section>
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
  gap: var(--space-10);
  padding: 0 var(--space-14) 0 var(--space-10);
  border: var(--border) solid var(--outline);
  border-radius: var(--radius-pill);
  background: var(--paper);
  font-weight: var(--fw-strong);
  font-size: var(--fs-13);
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
  width: 360px;
  max-width: calc(100vw - 32px);
  /* Layar pendek (laptop 13", ponsel landscape): panel bergulir sendiri, bukan terpotong. */
  max-height: calc(100dvh - 140px);
  overflow-y: auto;
  overscroll-behavior: contain;
  display: flex;
  flex-direction: column;
  gap: var(--space-16);
  padding: var(--space-16);
  border: var(--border) solid var(--outline);
  border-radius: var(--radius-card);
  background: var(--paper);
  box-shadow: var(--shadow-ring);
}

.group {
  display: flex;
  flex-direction: column;
  gap: var(--space-8);
}

.legend {
  color: var(--mute-2);
}
</style>
