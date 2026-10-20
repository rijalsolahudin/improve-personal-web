<script setup lang="ts">
/** Kotak pilihan persegi (emoji / ikon): garis tipis, saat aktif bergaris tinta + latar `tint`. */
const {
  active = false,
  size = 42,
  tint = 'var(--soft)',
} = defineProps<{
  active?: boolean
  /** Sisi kotak (px). */
  size?: number
  /** Latar saat aktif, mis. warna lembut item yang sedang diedit. */
  tint?: string
}>()
</script>

<template>
  <button
    type="button"
    class="tile"
    :aria-pressed="active"
    :style="{ '--tile-size': `${size}px`, '--tile-tint': tint }"
  >
    <slot />
  </button>
</template>

<style scoped>
.tile {
  width: var(--tile-size);
  height: var(--tile-size);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: var(--border) solid var(--line);
  border-radius: calc(14px * var(--rk));
  background: var(--paper);
  color: var(--ink);
  font-size: 20px;
}

.tile[aria-pressed='true'] {
  border-color: var(--outline);
  background: var(--tile-tint);
}
</style>
