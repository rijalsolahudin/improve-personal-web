<script setup lang="ts">
import type { Feature } from '~/utils/features'

const { feature, isCollapsed = false } = defineProps<{
  feature: Feature
  isCollapsed?: boolean
}>()
</script>

<template>
  <NuxtLink
    :to="feature.path"
    class="nav-item"
    :class="{ collapsed: isCollapsed }"
    :title="isCollapsed ? $t(`feature.${feature.id}.label`) : undefined"
    :active-class="feature.path === APP_HOME_PATH ? undefined : 'active'"
    exact-active-class="active"
  >
    <UiAppIcon :glyph="feature.glyph" :color="feature.color" />
    <span :class="{ 'visually-hidden': isCollapsed }">{{ $t(`feature.${feature.id}.label`) }}</span>
  </NuxtLink>
</template>

<style scoped>
.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border-radius: var(--radius-pill);
  color: var(--ink);
  font-weight: 800;
  font-size: 16px;
  white-space: nowrap;
}

.nav-item:hover {
  background: var(--hover);
  color: var(--ink);
}

.nav-item.active {
  background: var(--soft);
}

.collapsed {
  justify-content: center;
  padding: 8px 0;
}
</style>
