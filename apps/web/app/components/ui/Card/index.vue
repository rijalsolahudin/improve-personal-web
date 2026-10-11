<script setup lang="ts">
const {
  variant = 'paper',
  tint = undefined,
  padding = undefined,
  radius = undefined,
  dotted = false,
} = defineProps<{
  /** paper = kontainer list; soft/primary = blok fitur; tinted = warna kategori; sticker = kartu jurnal bergaris tinta. */
  variant?: 'paper' | 'soft' | 'primary' | 'tinted' | 'sticker'
  /** Latar untuk variant="tinted", mis. `var(--cat-karier-tint)`. */
  tint?: string
  padding?: number | string
  radius?: number | string
  /** Tekstur dot putih (kartu hero "Berikutnya"). */
  dotted?: boolean
}>()

const style = computed(() => {
  const s: Record<string, string> = {}
  if (variant === 'tinted') s.background = tint ?? 'var(--cat-karier-tint)'
  if (padding !== undefined) s.padding = typeof padding === 'number' ? `${padding}px` : padding
  if (radius !== undefined) s.borderRadius = typeof radius === 'number' ? `${radius}px` : radius
  return s
})
</script>

<template>
  <section class="card" :class="[`card-${variant}`, { dotted }]" :style="style">
    <slot />
  </section>
</template>

<style scoped>
.card {
  position: relative;
  box-sizing: border-box;
}

.dotted {
  background-image: var(--pattern-dots);
  background-size: 18px 18px;
}

.card-paper {
  border: 2px solid var(--line);
  border-radius: var(--radius-hero);
  background: var(--paper);
}

.card-soft {
  border-radius: 22px;
  background: var(--soft);
}

.card-primary {
  border-radius: var(--radius-hero);
  background: var(--primary);
}

.card-tinted {
  border-radius: var(--radius-hero);
}

.card-sticker {
  border: var(--border-thick) solid var(--ink);
  border-radius: var(--radius-sticker);
  background: var(--paper-2);
  box-shadow: var(--shadow-drop-sm);
}
</style>
