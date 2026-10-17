<script setup lang="ts">
import type { IconName } from '~/utils/icons'

const {
  glyph,
  icon = undefined,
  color,
  label,
  collapsed = false,
  active = false,
  to = undefined,
} = defineProps<{
  glyph: string
  icon?: IconName
  color: string
  label: string
  collapsed?: boolean
  active?: boolean
  to?: string
}>()

const emit = defineEmits<{ click: [event: MouseEvent] }>()
</script>

<template>
  <NuxtLink
    v-if="to"
    :to="to"
    class="nav-item"
    :class="{ collapsed, active }"
    :title="collapsed ? label : undefined"
  >
    <AppIcon :glyph="glyph" :icon="icon" :color="color" />
    <span v-if="!collapsed" class="label">{{ label }}</span>
    <span v-else class="visually-hidden">{{ label }}</span>
  </NuxtLink>
  <button
    v-else
    type="button"
    class="nav-item"
    :class="{ collapsed, active }"
    :title="collapsed ? label : undefined"
    @click="emit('click', $event)"
  >
    <AppIcon :glyph="glyph" :icon="icon" :color="color" />
    <span v-if="!collapsed" class="label">{{ label }}</span>
    <span v-else class="visually-hidden">{{ label }}</span>
  </button>
</template>

<style scoped>
.nav-item {
  /* Gaya non-Cute: ikon polos tanpa tile (token --nav-icon-*; tidak terdefinisi di Cute). */
  --tile-bg: var(--nav-icon-bg);
  --tile-inner-bg: var(--nav-icon-inner-bg);
  --tile-inner-border: var(--nav-icon-inner-border);
  --tile-icon-scale: var(--nav-icon-scale);
  --tile-fg: var(--nav-icon-fg);

  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border: none;
  background: none;
  border-radius: calc(14px * var(--rk)) calc(14px * var(--rk)) calc(14px * var(--rk))
    calc(5px * var(--rk));
  color: var(--ink);
  font-weight: var(--fw-strong);
  font-size: 16px;
  white-space: nowrap;
}

.nav-item:hover {
  background: var(--hover);
  color: var(--ink);
}

.nav-item.active {
  --tile-fg: var(--nav-icon-fg-active);

  background: var(--soft);
}

.nav-item.collapsed {
  justify-content: center;
  padding: 8px 0;
}
</style>
