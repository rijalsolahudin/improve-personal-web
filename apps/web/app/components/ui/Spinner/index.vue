<script setup lang="ts">
const { light = false } = defineProps<{ light?: boolean }>()
</script>

<template>
  <span class="spinner" :class="{ light }" aria-hidden="true" />
</template>

<style scoped>
.spinner {
  width: 18px;
  height: 18px;
  display: inline-block;
  flex-shrink: 0;
  border: var(--border) solid rgba(47, 42, 36, 0.2);
  border-top-color: var(--ink);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

.light {
  border-color: rgba(255, 253, 248, 0.35);
  border-top-color: #fffdf8;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
