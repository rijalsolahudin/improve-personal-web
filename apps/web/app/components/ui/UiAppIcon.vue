<script setup lang="ts">
const {
  glyph,
  color,
  size = 32,
} = defineProps<{
  glyph: string
  /** Nama CSS custom property, mis. `--icon-todo`. */
  color: string
  size?: number
}>()

const style = computed(() => {
  const outer = Math.round(size * 0.34)
  const leaf = Math.round(size * 0.125)
  const inner = Math.round(size * 0.63)
  return {
    '--tile-size': `${size}px`,
    '--tile-radius': `${outer}px ${outer}px ${outer}px ${leaf}px`,
    '--tile-color': `var(${color})`,
    '--glyph-size': `${inner}px`,
    '--glyph-radius': `${Math.round(inner * 0.35)}px`,
    '--glyph-font': `${Math.round(size * 0.34)}px`,
  }
})
</script>

<template>
  <span class="app-icon" :style="style" aria-hidden="true">
    <span class="glyph">{{ glyph }}</span>
  </span>
</template>

<style scoped>
.app-icon {
  width: var(--tile-size);
  height: var(--tile-size);
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--tile-radius);
  background: var(--tile-color);
  box-shadow: var(--shadow-icon-inset);
}

.glyph {
  width: var(--glyph-size);
  height: var(--glyph-size);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--glyph-radius);
  background: var(--paper);
  border: 2px solid var(--ink);
  font-family: var(--font-display);
  font-weight: 800;
  font-size: var(--glyph-font);
  line-height: 1;
  color: var(--ink);
  transform: rotate(-6deg);
}
</style>
