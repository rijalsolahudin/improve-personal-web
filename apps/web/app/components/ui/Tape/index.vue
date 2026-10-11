<script setup lang="ts">
const {
  color = 'var(--primary)',
  width = 80,
  rotate = -4,
  top = -12,
  left = 24,
  height = 22,
  radius = 3,
  translate = undefined,
} = defineProps<{
  color?: string
  width?: number
  rotate?: number
  top?: number | string
  left?: number | string
  height?: number
  radius?: number
  /** Geser mendatar, mis. `-50%` untuk menengahkan. */
  translate?: string
}>()

const style = computed(() => ({
  top: typeof top === 'number' ? `${top}px` : top,
  left: typeof left === 'number' ? `${left}px` : left,
  width: `${width}px`,
  height: `${height}px`,
  borderRadius: `${radius}px`,
  background: color,
  transform: `translateX(${translate ?? '0'}) rotate(${rotate}deg)`,
}))
</script>

<template>
  <span class="tape" :style="style" aria-hidden="true" />
</template>

<style scoped>
.tape {
  position: absolute;
  opacity: 0.8;
}
</style>
