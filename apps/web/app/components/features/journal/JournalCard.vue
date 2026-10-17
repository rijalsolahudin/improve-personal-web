<script setup lang="ts">
/** Kartu kertas halaman Journal (design: kertas tebal + bayangan). Judul opsional dengan titik warna. */
const {
  title = undefined,
  dot = 'var(--accent)',
  isSoft = false,
} = defineProps<{
  title?: string
  /** Warna titik di depan judul. */
  dot?: string
  /** Latar `--soft` (kartu afirmasi). */
  isSoft?: boolean
}>()
</script>

<template>
  <section class="card" :class="{ soft: isSoft }">
    <slot name="decor" />
    <JournalHeading v-if="title" :title="title" :dot="dot" />
    <slot />
  </section>
</template>

<style scoped>
.card {
  position: relative;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 18px 20px 16px;
  border: var(--border-thick) solid var(--outline);
  border-radius: calc(26px * var(--rk));
  background: var(--paper-2);
  box-shadow: calc(6px * var(--sx)) calc(6px * var(--sy)) calc(6px * var(--sbl))
    var(--shadow-color, rgb(47 42 36 / 0.12));
}

.soft {
  background: var(--soft);
}
</style>
