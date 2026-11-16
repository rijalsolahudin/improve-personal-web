<script setup lang="ts">
/**
 * Screenshot app asli di bingkai jendela (hasil `scripts/landing/shots.ts`, `public/landing/`).
 *
 * `<img>` biasa dengan `srcset` 800/1600 + dimensi tetap: berkasnya sudah WebP teroptimasi saat
 * dibuat, jadi `@nuxt/image` (dependency + endpoint IPX) tidak menambah apa-apa di sini. Dimensi
 * eksplisit menjaga CLS 0; hanya gambar hero yang `eager` + `fetchpriority=high` (kandidat LCP).
 */
const {
  name,
  alt,
  isEager = false,
  sizes = '(min-width: 1024px) 640px, 100vw',
  // Viewport 1440x900 (16:10) -> 1600x1000. Literal: default `defineProps` tidak boleh merujuk
  // konstanta lokal.
  height = 1000,
} = defineProps<{
  /** Nama berkas tanpa akhiran ukuran, mis. `daily`. */
  name: string
  alt: string
  isEager?: boolean
  sizes?: string
  /** Tinggi intrinsik varian 1600 px; berbeda hanya untuk screenshot yang viewport-nya lebih tinggi. */
  height?: number
}>()

/** Lebar varian terbesar (`OUTPUT_WIDTHS` di skrip screenshot). */
const WIDTH = 1600
</script>

<template>
  <figure class="frame">
    <div class="bar" aria-hidden="true">
      <span class="dot" />
      <span class="dot" />
      <span class="dot" />
    </div>
    <img
      class="shot"
      :src="`/landing/${name}-1600.webp`"
      :srcset="`/landing/${name}-800.webp 800w, /landing/${name}-1600.webp 1600w`"
      :sizes="sizes"
      :alt="alt"
      :width="WIDTH"
      :height="height"
      :loading="isEager ? 'eager' : 'lazy'"
      :fetchpriority="isEager ? 'high' : 'auto'"
      decoding="async"
    />
  </figure>
</template>

<style scoped>
.frame {
  margin: 0;
  overflow: hidden;
  background: #fffbf4;
  border: var(--border-thick) solid var(--outline);
  border-radius: calc(22px * var(--rk));
  box-shadow: calc(6px * var(--sx)) calc(6px * var(--sy)) calc(6px * var(--sbl))
    var(--shadow-color, var(--ink));
}

.bar {
  display: flex;
  gap: var(--space-6);
  padding: var(--space-10) var(--space-14);
  border-bottom: var(--border-thick) solid var(--outline);
  background: var(--soft);
}

.dot {
  width: 11px;
  height: 11px;
  border: var(--border-thin) solid var(--outline);
  border-radius: 50%;
  background: #fffbf4;
}

.shot {
  display: block;
  width: 100%;
  height: auto;
}
</style>
