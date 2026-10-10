<script lang="ts">
export interface SegmentedOption<V extends string> {
  value: V
  label: string
  /** Warna bulatan kecil sebelum label (pemilih tema). */
  swatch?: string
}
</script>

<script setup lang="ts" generic="T extends string">
const {
  options,
  label,
  framed = false,
} = defineProps<{
  options: readonly SegmentedOption<T>[]
  /** Label aksesibel untuk grup. */
  label: string
  /** `true` = latar paper + garis tinta (pemilih tema); default = latar chip. */
  framed?: boolean
}>()

const model = defineModel<T>({ required: true })
</script>

<template>
  <div class="segmented" :class="{ framed }" role="group" :aria-label="label">
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      class="option"
      :aria-pressed="model === option.value"
      @click="model = option.value"
    >
      <span
        v-if="option.swatch"
        class="swatch"
        :style="{ background: option.swatch }"
        aria-hidden="true"
      />
      {{ option.label }}
    </button>
  </div>
</template>

<style scoped>
.segmented {
  display: flex;
  gap: 2px;
  padding: 4px;
  border-radius: var(--radius-pill);
  background: var(--chip);
}

.framed {
  gap: 4px;
  background: var(--paper);
  border: var(--border) solid var(--ink);
}

.option {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 8px 14px;
  border: none;
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--mute-2);
  font-weight: 800;
  font-size: 14px;
  white-space: nowrap;
}

.option[aria-pressed='true'] {
  background: var(--accent);
  color: var(--paper);
}

.swatch {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid var(--ink);
}
</style>
