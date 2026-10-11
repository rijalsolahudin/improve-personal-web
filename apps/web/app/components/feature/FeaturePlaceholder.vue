<script setup lang="ts">
import type { Feature } from '~/utils/features'

const { feature } = defineProps<{ feature: Feature }>()
</script>

<template>
  <section class="placeholder" :aria-labelledby="`placeholder-${feature.id}`">
    <AppIcon :glyph="feature.glyph" :color="feature.color" :size="64" />
    <h1 :id="`placeholder-${feature.id}`" class="title">
      {{ $t(`feature.${feature.id}.label`) }}
    </h1>
    <p class="note">{{ $t('placeholder.note', { code: feature.code }) }}</p>
    <NuxtLink :to="APP_HOME_PATH" class="back">{{ $t('placeholder.back') }}</NuxtLink>
  </section>
</template>

<style scoped>
.placeholder {
  min-height: calc(100vh - 2 * var(--gap-desktop));
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  text-align: center;
}

.title {
  margin-top: 14px;
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 32px;
  line-height: var(--lh-title);
}

.note {
  font-weight: 700;
  color: var(--mute);
}

.back {
  margin-top: 14px;
  font-weight: 800;
}

@media (max-width: 599px) {
  .placeholder {
    min-height: calc(100vh - 160px);
  }
}
</style>
