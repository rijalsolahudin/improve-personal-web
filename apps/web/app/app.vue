<script setup lang="ts">
const { t } = useI18n()
const { theme, style } = useAppearance()

// Preferensi tampilan (PRD F16) dihidrasi oleh layout dashboard - lihat komentar di sana. Sengaja
// TIDAK di sini: landing publik tidak perlu menyeret modul core + akses IndexedDB ke JS awalnya.

useHead({
  htmlAttrs: { 'data-theme': theme, 'data-style': style },
  titleTemplate: (title) => (title ? `${title} · ${t('brand.name')}` : t('brand.name')),
})
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
