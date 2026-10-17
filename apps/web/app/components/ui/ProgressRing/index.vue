<script setup lang="ts">
/** Cincin progres conic-gradient (satu-satunya gradient yang diizinkan design). */
const {
  percent,
  size,
  hole = 0.72,
  color = 'var(--accent)',
  track = 'var(--paper)',
  inner = 'var(--soft)',
} = defineProps<{
  /** 0–100 */
  percent: number
  size: number
  /** Rasio diameter lubang terhadap ukuran ring. */
  hole?: number
  color?: string
  track?: string
  inner?: string
}>()

const style = computed(() => ({
  width: `${size}px`,
  height: `${size}px`,
  background: `conic-gradient(${color} ${percent}%, ${track} 0)`,
  '--hole': `${Math.round(size * hole)}px`,
  '--inner': inner,
}))
</script>

<template>
  <span class="ring" :style="style">
    <span class="hole"><slot /></span>
  </span>
</template>

<style scoped>
.ring {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
}

.hole {
  width: var(--hole);
  height: var(--hole);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--inner);
  font-family: var(--font-display);
  font-weight: var(--fw-display);
}
</style>
