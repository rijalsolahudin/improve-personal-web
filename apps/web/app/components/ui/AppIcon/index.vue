<script setup lang="ts">
import type { IconName } from '~/utils/icons'

const {
  glyph = '',
  icon = undefined,
  color,
  size = 32,
} = defineProps<{
  /** Glyph unicode / angka pendek (dipakai kalau `icon` kosong). */
  glyph?: string
  /** Ikon garis (Desktop.dc.html nav & kepala kartu). */
  icon?: IconName
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
    '--tile-radius': `calc(${outer}px * var(--rk)) calc(${outer}px * var(--rk)) calc(${outer}px * var(--rk)) calc(${leaf}px * var(--rk))`,
    '--tile-color': `var(${color})`,
    '--glyph-size': `${inner}px`,
    '--glyph-radius': `calc(${Math.round(inner * 0.35)}px * var(--rk))`,
    '--glyph-font': `${Math.round(size * 0.34)}px`,
  }
})
</script>

<template>
  <span class="app-icon" :style="style" aria-hidden="true">
    <span class="glyph">
      <Icon v-if="icon" class="line-icon" :name="icon" />
      <template v-else>{{ glyph }}</template>
    </span>
  </span>
</template>

<style scoped>
/* --tile-* bisa ditimpa induk (mis. NavItem di gaya non-Cute → ikon polos tanpa tile). */
.app-icon {
  width: var(--tile-size);
  height: var(--tile-size);
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--tile-radius);
  background: var(--tile-bg, var(--tile-color));
  box-shadow: var(--shadow-icon-inset);
}

.glyph {
  width: var(--glyph-size);
  height: var(--glyph-size);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--glyph-radius);
  background: var(--tile-inner-bg, var(--paper));
  border: var(--tile-inner-border, var(--border-thin)) solid var(--outline);
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: var(--glyph-font);
  line-height: 1;
  color: var(--tile-fg, var(--ink));
  transform: rotate(calc(-6deg * var(--bev)));
}

/* Design: ikon garis ~0,4× sisi tile (32 → 13px); gaya polos membesarkan lewat --tile-icon-scale. */
.line-icon {
  width: calc(var(--glyph-size) * 0.65 * var(--tile-icon-scale, 1));
  height: calc(var(--glyph-size) * 0.65 * var(--tile-icon-scale, 1));
}
</style>
