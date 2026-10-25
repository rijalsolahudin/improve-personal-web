<script setup lang="ts">
const {
  checked,
  label,
  size = 'lg',
} = defineProps<{
  checked: boolean
  label: string
  /** lg = 26px (default halaman lain), md = 22px (baris Daily), sm = 16px (baris rapat timeline). */
  size?: 'lg' | 'md' | 'sm'
}>()

const emit = defineEmits<{ toggle: [] }>()
</script>

<template>
  <button
    type="button"
    role="checkbox"
    class="checkbox"
    :class="`size-${size}`"
    :aria-checked="checked"
    :aria-label="label"
    @click.stop="emit('toggle')"
  >
    <span v-if="checked" aria-hidden="true">✓</span>
  </button>
</template>

<style scoped>
.checkbox {
  width: 26px;
  height: 26px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border-radius: var(--radius-check);
  border: var(--border) solid var(--outline);
  background: var(--paper);
  color: var(--paper);
  font-weight: var(--fw-strong);
  font-size: 15px;
}

.checkbox.size-md {
  width: 22px;
  height: 22px;
  border-radius: calc(8px * var(--rk)) calc(8px * var(--rk)) calc(8px * var(--rk))
    calc(3px * var(--rk));
  font-size: 12px;
}

.checkbox.size-sm {
  width: 16px;
  height: 16px;
  border-width: var(--border-thin);
  border-radius: calc(5px * var(--rk)) calc(5px * var(--rk)) calc(5px * var(--rk))
    calc(2px * var(--rk));
  font-size: 10px;
}

.checkbox[aria-checked='true'] {
  background: var(--success);
}
</style>
