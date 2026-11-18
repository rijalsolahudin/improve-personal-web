<script setup lang="ts">
/**
 * Modal "Tampilan": pilih warna (tema) + gaya, berlaku langsung di seluruh app (PRD F16).
 * Global di layout shell, bukan di halaman tertentu: dibuka dari menu Profil (desktop) dan menu HP.
 */
const { t } = useI18n()
const { theme, style, themes, isPickerOpen, setTheme, setStyle } = useAppearance()

const summary = computed(
  () => `${t(`theme.${theme.value}`)} · ${t(`uiStyle.${style.value}.label`)}`,
)
</script>

<template>
  <Modal
    :open="isPickerOpen"
    :title="t('appearance.label')"
    is-dismissible
    width="26rem"
    @close="isPickerOpen = false"
  >
    <p class="summary">{{ summary }}</p>
    <section class="group">
      <h3 class="eyebrow legend">{{ $t('appearance.color') }}</h3>
      <AppearanceThemeGrid :themes="themes" :active="theme" @select="setTheme" />
    </section>
    <section class="group">
      <h3 class="eyebrow legend">{{ $t('appearance.style') }}</h3>
      <AppearanceStylePicker :active="style" @select="setStyle" />
    </section>
  </Modal>
</template>

<style scoped>
.summary {
  margin-top: calc(-1 * var(--space-12));
  color: var(--mute);
  font-size: var(--fs-14);
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
