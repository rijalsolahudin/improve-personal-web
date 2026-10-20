<script setup lang="ts">
import { FIELD_ID_KEY } from '~/utils/field'

/**
 * Kolom teks. Atribut native (`type`, `placeholder`, `maxlength`, `aria-invalid`, `data-autofocus`,
 * ...) diteruskan ke `<input>`/`<textarea>`. Di dalam `Field`, id-nya otomatis dipasangkan dengan
 * label; `id` eksplisit tetap menang.
 *
 * Class dari pemanggil sebaiknya hanya menambah tata letak (lebar, flex, margin). Untuk permukaan
 * dengan gaya sendiri (jurnal, memo, auth) pakai `variant="bare"` - tanpa gaya sama sekali, jadi
 * tidak ada aturan yang berebut dengan class pemanggil.
 */
const {
  variant = 'outline',
  size = 'md',
  shape = 'square',
  multiline = false,
} = defineProps<{
  /**
   * outline = kolom form bergaris tinta; subtle = garis tipis abu (panel ringan, pencarian kecil);
   * bare = tanpa gaya apa pun - permukaan tulis (jurnal, memo, auth) yang gayanya diatur pemanggil.
   */
  variant?: 'outline' | 'subtle' | 'bare'
  /** md = form utama; sm = kolom rapat di dalam baris. Diabaikan untuk `bare`. */
  size?: 'md' | 'sm'
  /** pill = kolom tambah cepat / pencarian. */
  shape?: 'square' | 'pill'
  /** Render `<textarea>` yang bisa ditarik vertikal. */
  multiline?: boolean
}>()

const model = defineModel<string | number>({ required: true })
const fieldId = inject(FIELD_ID_KEY, undefined)

const classes = computed(() =>
  variant === 'bare'
    ? null
    : ['input', `variant-${variant}`, `size-${size}`, `shape-${shape}`, { multiline }],
)
</script>

<template>
  <textarea v-if="multiline" :id="fieldId" v-model="model" :class="classes" />
  <input v-else :id="fieldId" v-model="model" :class="classes" />
</template>

<style scoped>
.input {
  min-width: 0;
  background: var(--paper);
  color: var(--ink);
  font-weight: var(--fw-body);
  outline: none;
}

.input:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.variant-outline {
  border: var(--border) solid var(--outline);
}

.variant-subtle {
  border: var(--border-thin) solid var(--line);
}

.variant-subtle:focus-visible {
  border-color: var(--outline);
}

.input[aria-invalid='true'] {
  border-color: var(--danger);
}

.size-md {
  padding: 11px 14px;
  font-size: 15px;
}

.size-sm {
  padding: 9px 12px;
  font-size: 14px;
}

.shape-square {
  border-radius: var(--radius-btn-sq);
}

.variant-subtle.shape-square {
  border-radius: calc(14px * var(--rk));
}

.shape-pill {
  border-radius: var(--radius-pill);
}

.multiline {
  min-height: 72px;
  resize: vertical;
}
</style>
