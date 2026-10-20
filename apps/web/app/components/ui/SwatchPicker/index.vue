<script lang="ts">
export interface SwatchOption<V> {
  value: V
  color: string
  /** Label aksesibel, mis. "Warna 3". */
  label: string
}
</script>

<script setup lang="ts" generic="T extends string | number">
/** Deretan kotak warna; yang terpilih bergaris tinta. */
const { options, size = 32 } = defineProps<{
  options: readonly SwatchOption<T>[]
  /** Sisi kotak (px). */
  size?: number
}>()

const model = defineModel<T>({ required: true })
</script>

<template>
  <div class="swatches" :style="{ '--sw-size': `${size}px` }">
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      class="swatch"
      :style="{ background: option.color }"
      :aria-pressed="model === option.value"
      :aria-label="option.label"
      @click="model = option.value"
    />
  </div>
</template>

<style scoped>
.swatches {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.swatch {
  width: var(--sw-size);
  height: var(--sw-size);
  padding: 0;
  border: var(--border-thick) solid transparent;
  border-radius: calc(11px * var(--rk));
}

.swatch[aria-pressed='true'] {
  border-color: var(--outline);
}
</style>
