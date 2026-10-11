<script setup lang="ts">
const { active = false, variant = 'filter' } = defineProps<{
  active?: boolean
  /** filter = filter list bergaris tinta; soft = pick polos (tinta saat aktif). */
  variant?: 'filter' | 'soft'
}>()
</script>

<template>
  <button
    type="button"
    class="chip"
    :class="[`chip-${variant}`, { active }]"
    :aria-pressed="active"
  >
    <slot />
  </button>
</template>

<style scoped>
.chip {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  box-sizing: border-box;
  border-radius: var(--radius-pill);
  font-family: var(--font-body);
  font-weight: 800;
  white-space: nowrap;
}

.chip-filter {
  min-height: 38px;
  padding: 0 14px;
  font-size: 14px;
  border: 2.5px solid var(--line);
  background: var(--paper);
  color: var(--mute-2);
}

.chip-filter.active {
  border-color: var(--ink);
  background: var(--accent);
  color: var(--paper);
}

.chip-soft {
  min-height: 36px;
  padding: 0 12px;
  font-size: 13px;
  border: none;
  background: var(--alt);
  color: var(--ink);
}

.chip-soft.active {
  background: var(--ink);
  color: var(--paper);
}
</style>
