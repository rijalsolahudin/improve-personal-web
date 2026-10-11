<script setup lang="ts">
const {
  value,
  unit = undefined,
  label,
  tone = 'soft',
} = defineProps<{
  value: string | number
  unit?: string
  label: string
  tone?: 'soft' | 'paper' | 'primary' | (string & {})
}>()

const isPreset = computed(() => tone === 'soft' || tone === 'paper' || tone === 'primary')
const style = computed(() => (isPreset.value ? undefined : { background: tone }))
</script>

<template>
  <div class="tile" :class="isPreset ? `tile-${tone}` : undefined" :style="style">
    <span v-if="$slots.icon" class="icon"><slot name="icon" /></span>
    <span class="value" :class="{ 'value-icon': $slots.icon }"
      >{{ value }}<span v-if="unit" class="unit">{{ unit }}</span></span
    >
    <span class="label">{{ label }}</span>
  </div>
</template>

<style scoped>
/* Ukuran ikut lebar tile (container query) - sama seperti design desktop & mobile. */
.tile {
  container-type: inline-size;
  min-width: 0;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: clamp(6px, 3.4cqi, 14px);
  padding: clamp(14px, 7cqi, 28px) clamp(14px, 7.5cqi, 30px);
  border-radius: clamp(20px, 4vw, 28px);
}

.tile-paper {
  border: var(--border) solid var(--line);
  background: var(--paper);
}

.tile-soft {
  background: var(--soft);
}

.tile-primary {
  background: var(--primary);
}

.icon {
  height: clamp(24px, 12cqi, 42px);
  display: flex;
  align-items: center;
}

.value {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: clamp(24px, 14cqi, 54px);
  line-height: 1;
  white-space: nowrap;
}

.value-icon {
  margin-top: 0;
}

.tile-soft .value {
  color: var(--ink);
}

.tile-paper .value,
.tile-primary .value {
  color: var(--deeper);
}

.unit {
  margin-left: 4px;
  font-size: 0.5em;
}

.label {
  font-weight: 800;
  font-size: clamp(13px, 5.6cqi, 19px);
  line-height: 1.25;
  color: var(--deep);
  text-wrap: pretty;
}
</style>
