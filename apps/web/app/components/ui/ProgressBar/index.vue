<script setup lang="ts">
const {
  pct,
  color = 'var(--accent)',
  track = 'rgba(255,255,255,.65)',
  height = 8,
} = defineProps<{
  /** 0–100 */
  pct: number
  color?: string
  track?: string
  height?: number
}>()
</script>

<template>
  <div
    class="bar"
    role="progressbar"
    :aria-valuenow="pct"
    aria-valuemin="0"
    aria-valuemax="100"
    :style="{ height: `${height}px`, background: track }"
  >
    <span :style="{ width: `${pct}%`, background: color }" />
  </div>
</template>

<style scoped>
.bar {
  overflow: hidden;
  border-radius: var(--radius-pill);
}

.bar > span {
  display: block;
  height: 100%;
  border-radius: var(--radius-pill);
}
</style>
