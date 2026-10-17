<script setup lang="ts">
/** Judul kartu Journal dengan titik warna (design). */
const { title, dot = 'var(--accent)' } = defineProps<{ title: string; dot?: string }>()
</script>

<template>
  <h3 class="head">
    <span class="dot" :style="{ background: dot }" aria-hidden="true" />
    {{ title }}
  </h3>
</template>

<style scoped>
.head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: 17px;
  line-height: 1.2;
}

.dot {
  width: 10px;
  height: 10px;
  flex-shrink: 0;
  border-radius: 4px 4px 4px 1px;
}
</style>
