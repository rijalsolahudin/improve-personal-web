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
  font-weight: 800;
  font-size: var(--fs-meta);
  letter-spacing: var(--tracking-group);
  color: #8a7a60;
}

.title {
  margin-top: 4px;
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 32px;
  line-height: 1.1;
}

.sub {
  margin-top: 6px;
  font-weight: 600;
  font-size: var(--fs-body);
  color: #6b5e4b;
  overflow-wrap: anywhere;
}
</style>
