<script setup lang="ts">
// Placeholder fitur yang belum dikerjakan. Begitu satu fitur dibangun, buat
// `pages/app/<id>.vue` - route statis otomatis menang atas route dinamis ini.
definePageMeta({
  layout: 'dashboard',
  validate: (route) => isFeatureId(route.params.feature) && route.params.feature !== 'home',
})

const route = useRoute()
const { t } = useI18n()
const feature = computed(() => FEATURES.find(({ id }) => id === route.params.feature))

useHead({ title: () => (feature.value ? t(`feature.${feature.value.id}.label`) : '') })
</script>

<template>
  <FeaturePlaceholder v-if="feature" :feature="feature" />
</template>
