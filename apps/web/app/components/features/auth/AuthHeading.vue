<script setup lang="ts">
const { eyebrow, title } = defineProps<{ eyebrow: string; title: string }>()
</script>

<template>
  <div>
    <p class="eyebrow-text">{{ eyebrow }}</p>
    <h1 class="title">{{ title }}</h1>
    <p class="sub"><slot /></p>
  </div>
</template>

<style scoped>
.eyebrow-text {
  font-weight: var(--fw-strong);
  font-size: var(--fs-meta);
  letter-spacing: var(--tracking-group);
  color: #8a7a60;
}

.title {
  margin-top: var(--space-4);
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: var(--fs-display-32);
  line-height: 1.1;
}

.sub {
  margin-top: var(--space-6);
  font-weight: var(--fw-medium);
  font-size: var(--fs-body);
  color: #6b5e4b;
  overflow-wrap: anywhere;
}
</style>
