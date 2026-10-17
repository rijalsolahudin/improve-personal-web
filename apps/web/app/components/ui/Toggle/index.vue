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
  border: var(--border-thin) solid var(--outline);
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

/* Bulat (setinggi jalur dikurangi 2px tiap sisi); saat on menempel tepi kanan. */
.knob {
  position: absolute;
  top: 2px;
  bottom: 2px;
  left: 2px;
  aspect-ratio: 1;
  box-sizing: border-box;
  border: var(--border-thin) solid var(--outline);
  border-radius: 50%;
  background: var(--paper);
  transition:
    left var(--dur) var(--ease),
    transform var(--dur) var(--ease);
}

.toggle.on .knob {
  left: calc(100% - 2px);
  transform: translateX(-100%);
}
</style>
