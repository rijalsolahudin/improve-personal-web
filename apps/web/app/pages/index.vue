<script setup lang="ts">
const { t } = useI18n()

useSeoMeta({
  title: () => t('landing.meta.title'),
  description: () => t('landing.meta.description'),
  ogTitle: () => t('landing.meta.title'),
  ogDescription: () => t('landing.meta.description'),
})
</script>

<template>
  <div class="landing paper-grid">
    <LandingNav />
    <LandingHero />
    <LandingFeatureGrid />
    <LandingSteps />
    <LandingOutro />
    <LandingFooter />
  </div>
</template>

<style scoped>
.landing {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: clamp(56px, 8vw, 96px);
  padding: 24px clamp(16px, 4vw, 48px) 40px;
  background-size: var(--grid-desktop) var(--grid-desktop);
}
</style>
