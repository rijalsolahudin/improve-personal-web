<script setup lang="ts">
const {
  glyph,
  color,
  label,
  collapsed = false,
  active = false,
  to = undefined,
} = defineProps<{
  glyph: string
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
    <AppIcon :glyph="glyph" :color="color" />
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
    <AppIcon :glyph="glyph" :color="color" />
    <span v-if="!collapsed" class="label">{{ label }}</span>
    <span v-else class="visually-hidden">{{ label }}</span>
  </button>
</template>

<style scoped>
.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border: none;
  background: none;
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

.nav-item.collapsed {
  justify-content: center;
  padding: 8px 0;
}
</style>
