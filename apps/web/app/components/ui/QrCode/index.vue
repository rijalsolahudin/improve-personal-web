<script setup lang="ts">
import { encode } from 'uqr'

/**
 * QR sebagai SVG inline.
 *
 * Matriksnya dihitung `uqr` (MIT, ~7,8 KB gzip, tanpa dependency) lalu digambar sendiri sebagai SATU
 * `<path>`: satu elemen untuk seluruh modul, bukan ribuan `<rect>` atau string HTML. String SVG dari
 * `renderSVG()` sengaja tidak dipakai karena harus lewat `v-html`, dan aturan keamanan app melarang
 * `v-html` - termasuk untuk data yang "cuma" QR.
 */
const {
  value,
  label,
  size = 220,
} = defineProps<{
  /** Isi QR (JSON payload transfer). */
  value: string
  /** Nama yang dibaca pembaca layar; QR sendiri tidak berguna tanpa penjelasan. */
  label: string
  /** Sisi tampilan dalam px. `0` = mengikuti lebar induk (mis. di dalam modal sempit). */
  size?: number
}>()

const ECC = 'M'
const BORDER_MODULES = 2

const matrix = computed(() => encode(value, { ecc: ECC, border: BORDER_MODULES }))

/**
 * Satu sub-path per deret modul hitam (`h<n>`), bukan per modul: payload transfer ±150 karakter
 * menghasilkan ribuan modul, dan satu `d` pendek jauh lebih murah diparse daripada ribuan perintah.
 */
const path = computed(() => {
  const rows = matrix.value.data
  const commands: string[] = []

  rows.forEach((row, y) => {
    let x = 0
    while (x < row.length) {
      if (!row[x]) {
        x += 1
        continue
      }

      const start = x
      while (x < row.length && row[x]) x += 1
      commands.push(`M${start} ${y}h${x - start}v1h-${x - start}z`)
    }
  })

  return commands.join('')
})

const style = computed(() => (size === 0 ? undefined : { width: `${size}px`, height: `${size}px` }))
</script>

<template>
  <svg
    class="qr"
    :style="style"
    :viewBox="`0 0 ${matrix.size} ${matrix.size}`"
    role="img"
    :aria-label="label"
    shape-rendering="crispEdges"
  >
    <rect :width="matrix.size" :height="matrix.size" fill="#fff" />
    <path :d="path" fill="#1b1b1b" />
  </svg>
</template>

<style scoped>
.qr {
  display: block;
  max-width: 100%;
  height: auto;
  border-radius: var(--radius-inner, 8px);
}
</style>
