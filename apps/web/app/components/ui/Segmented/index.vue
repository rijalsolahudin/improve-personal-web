<script lang="ts">
export interface SegmentedOption<V extends string> {
  value: V
  label: string
  /** Warna bulatan kecil sebelum label (pemilih tema). */
  swatch?: string
  disabled?: boolean
}
</script>

<script setup lang="ts" generic="T extends string">
/**
 * Grup pilihan tunggal berbentuk pill. Warna bisa diikat ke tema pemanggil lewat custom property:
 * `--seg-bg` (latar grup) dan `--seg-active` (latar opsi aktif).
 */
const {
  options,
  label,
  framed = false,
  size = 'md',
  isEqual = false,
} = defineProps<{
  options: readonly SegmentedOption<T>[]
  /** Label aksesibel untuk grup. */
  label: string
  /** `true` = latar paper + garis tinta (pemilih tema); default = latar chip. */
  framed?: boolean
  size?: 'sm' | 'md'
  /** Semua opsi selebar sama, label kepanjangan dipotong elipsis. */
  isEqual?: boolean
}>()

const model = defineModel<T>({ required: true })
</script>

<template>
  <div
    class="segmented"
    :class="[`size-${size}`, { framed, equal: isEqual }]"
    role="group"
    :aria-label="label"
  >
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      class="option"
      :aria-pressed="model === option.value"
      :disabled="option.disabled"
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
  background: var(--seg-bg, var(--chip));
}

.framed {
  gap: 4px;
  background: var(--seg-bg, var(--paper));
  border: var(--border) solid var(--outline);
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
  font-weight: var(--fw-strong);
  font-size: 14px;
  white-space: nowrap;
}

.size-sm .option {
  padding: 5px 12px;
  font-size: 13px;
}

.equal .option {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.option[aria-pressed='true'] {
  background: var(--seg-active, var(--accent));
  color: var(--paper);
}

.option:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.swatch {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: var(--border-thin) solid var(--outline);
}
</style>
