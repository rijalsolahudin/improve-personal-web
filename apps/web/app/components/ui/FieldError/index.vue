<script setup lang="ts">
/**
 * Pesan error di bawah kolom form. `id` ditautkan ke kolomnya lewat `aria-describedby`
 * (lihat `useFieldError`); tanpa `id` dipakai untuk error umum di bawah form.
 */
const { id = undefined } = defineProps<{ id?: string }>()
</script>

<template>
  <p :id="id" class="field-error" role="alert"><slot /></p>
</template>

<style scoped>
.field-error {
  margin-top: var(--space-6);
  color: var(--danger);
  font-weight: var(--fw-strong);
  font-size: var(--fs-13);
}
</style>
