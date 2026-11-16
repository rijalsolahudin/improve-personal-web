<template>
  <footer class="footer">
    <p class="brand">
      <BrandMark wordmark="none" :size="28" />
      {{ $t('landing.footer.copyright') }}
    </p>
    <nav class="links" :aria-label="$t('landing.footer.label')">
      <a href="#fitur">{{ $t('landing.nav.features') }}</a>
      <a href="#cara">{{ $t('landing.nav.how') }}</a>
      <NuxtLink :to="getFeature('panduan').path">{{ $t('feature.panduan.label') }}</NuxtLink>
    </nav>
  </footer>
</template>

<style scoped>
.footer {
  width: 100%;
  max-width: 1200px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-16);
  padding-top: var(--space-20);
  border-top: var(--border-thin) dashed #d9c3a0;
  font-weight: var(--fw-body);
  font-size: var(--fs-body-sm);
  color: var(--mute);
}

.brand {
  display: flex;
  align-items: center;
  gap: var(--space-8);
}

.links {
  display: flex;
  gap: var(--space-18);
}
</style>
