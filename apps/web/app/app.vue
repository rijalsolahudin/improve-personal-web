<script setup lang="ts">
const { t } = useI18n()
const { theme, style } = useAppearance()

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
