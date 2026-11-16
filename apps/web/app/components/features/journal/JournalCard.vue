<script setup lang="ts">
/**
 * Kartu kertas halaman Journal. Judul opsional dengan titik warna.
 * `gap` mengikuti design per kartu (perasaan 12, afirmasi 10, refleksi 6).
 */
const {
  title = undefined,
  dot = 'var(--accent)',
  isSoft = false,
  gap = 10,
} = defineProps<{
  title?: string
  /** Warna titik di depan judul. */
  dot?: string
  /** Latar `--soft` (kartu afirmasi). */
  isSoft?: boolean
  /** Jarak antar isi kartu (px), sesuai design tiap kartu. */
  gap?: number
}>()
</script>

<template>
  <section class="card" :class="{ soft: isSoft }" :style="{ '--card-gap': `${gap}px` }">
    <slot name="decor" />
    <JournalHeading v-if="title" :title="title" :dot="dot" />
    <slot />
  </section>
</template>

<style scoped>
/*
 * Design v2: kartu diam (tidak bisa diklik) memakai garis kertas tipis `--line`, tanpa
 * bayangan keras - bayangan keras + tinta 3px hanya untuk elemen yang memang "sticker"
 * dan bisa ditekan. Lihat `Desktop v2.dc.html` blok Journaling (`a44`-`a45`).
 */
.card {
  position: relative;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--card-gap, 10px);
  padding: var(--space-18) var(--space-20) var(--space-16);
  border: var(--border-thin) solid var(--line);
  border-radius: calc(26px * var(--rk));
  background: var(--paper-2);
}

.soft {
  background: var(--soft);
}
</style>
