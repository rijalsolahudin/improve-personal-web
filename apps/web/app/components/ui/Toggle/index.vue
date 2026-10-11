<script setup lang="ts">
const { on = false, size = 'md' } = defineProps<{
  on?: boolean
  size?: 'sm' | 'md'
}>()
</script>

<template>
  <button
    type="button"
    role="switch"
    :aria-checked="on"
    class="toggle"
    :class="[`toggle-${size}`, { on }]"
  >
    <span class="knob" />
  </button>
</template>

<style scoped>
.toggle {
  position: relative;
  flex-shrink: 0;
  padding: 0;
  box-sizing: border-box;
  border: 2px solid var(--ink);
  border-radius: var(--radius-pill);
  background: var(--chip);
  transition: background var(--dur) var(--ease);
}

.toggle-sm {
  width: 34px;
  height: 22px;
}

.toggle-md {
  width: 40px;
  height: 24px;
}

.toggle.on {
  background: var(--accent);
}

.knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: calc(100% - 8px);
  height: calc(100% - 8px);
  box-sizing: border-box;
  border: 2px solid var(--ink);
  border-radius: 50%;
  background: var(--paper);
  transition: transform var(--dur) var(--ease);
}

.toggle.on .knob {
  transform: translateX(100%);
}
</style>
