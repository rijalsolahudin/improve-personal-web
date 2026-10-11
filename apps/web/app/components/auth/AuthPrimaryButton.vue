<script setup lang="ts">
const {
  isLoading = false,
  isDimmed = false,
  type = 'submit',
} = defineProps<{
  isLoading?: boolean
  /** Warna lebih pudar saat input belum lengkap (design: tombol verifikasi). */
  isDimmed?: boolean
  type?: 'submit' | 'button'
}>()
</script>

<template>
  <button :type="type" class="primary" :class="{ dimmed: isDimmed }" :aria-busy="isLoading">
    <Spinner v-if="isLoading" light />
    <slot />
  </button>
</template>

<style scoped>
.primary {
  width: 100%;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  border: var(--border) solid var(--ink);
  border-radius: var(--radius-row);
  background: var(--ink);
  color: #fffdf8;
  font-weight: 800;
  font-size: var(--fs-body-lg);
  box-shadow: 0 4px 0 rgba(47, 42, 36, 0.2);
}

.primary:hover {
  background: #46403a;
}

.primary:active {
  transform: translateY(2px);
  box-shadow: 0 2px 0 rgba(47, 42, 36, 0.2);
}

.dimmed,
.dimmed:hover {
  background: #6b5e4b;
}
</style>
