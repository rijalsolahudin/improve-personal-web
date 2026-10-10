<script setup lang="ts">
const { t } = useI18n()
const { theme } = useColorTheme()

useHead({
  htmlAttrs: { 'data-theme': theme },
  titleTemplate: (title) => (title ? `${title} · ${t('brand.name')}` : t('brand.name')),
})
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
