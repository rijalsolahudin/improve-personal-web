<script setup lang="ts">
const { checked, label } = defineProps<{
  checked: boolean
  label: string
}>()

const emit = defineEmits<{ toggle: [] }>()
</script>

<template>
  <button
    type="button"
    role="checkbox"
    class="checkbox"
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
  border: var(--border) solid var(--ink);
  background: var(--paper);
  color: var(--paper);
  font-weight: 800;
  font-size: 15px;
}

.checkbox[aria-checked='true'] {
  background: var(--success);
}
</style>
