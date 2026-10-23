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
    <!--
      Bagian di bawah fold tidak butuh JavaScript sebelum user menggulir: markup-nya tetap dirender
      saat build (prerender), tetapi komponennya jadi chunk terpisah yang TIDAK masuk
      `modulepreload` halaman ini.
      `hydrate-never` dipilih, bukan `hydrate-on-visible`: isinya murni teks + tautan jangkar, jadi
      tidak ada state Vue yang perlu dihidupkan.
      Catatan jujur: Nuxt tetap menaruh `<link rel="prefetch">` prioritas rendah untuk komponen
      async yang dirender (perilaku framework, tidak bisa dimatikan lewat config) - jadi chunk ini
      bisa tiba belakangan saat jaringan menganggur, tetapi tidak lagi bersaing dengan resource
      render. Angka `modulepreload` turun 16,5 KB (chunk ikon) + chunk bagian landing; lihat
      `app/utils/bundle-budget.test.ts`.
    -->
    <LazyLandingFeatureGrid hydrate-never />
    <LazyLandingSteps hydrate-never />
    <LazyLandingOutro hydrate-never />
    <LazyLandingFooter hydrate-never />
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
