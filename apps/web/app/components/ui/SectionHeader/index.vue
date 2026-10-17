<script setup lang="ts">
const {
  title,
  eyebrow = undefined,
  action = undefined,
  titleId = undefined,
} = defineProps<{
  title: string
  /** Baris caps kecil di atas judul. */
  eyebrow?: string
  /** Link accent kanan, mis. "Semua". */
  action?: string
  /** `id` untuk `<h2>`, dipakai `aria-labelledby` pemanggil. */
  titleId?: string
}>()

const emit = defineEmits<{ action: [] }>()
</script>

<template>
  <div class="head">
    <div class="text">
      <span v-if="eyebrow" class="eyebrow">{{ eyebrow }}</span>
      <h2 :id="titleId" class="title">{{ title }}</h2>
    </div>
    <slot name="action">
      <button v-if="action" type="button" class="action" @click="emit('action')">
        {{ action }}
      </button>
    </slot>
  </div>
</template>

<style scoped>
.head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}

.eyebrow {
  display: block;
  font-weight: var(--fw-strong);
  font-size: 11px;
  letter-spacing: 0.1em;
  color: var(--deep);
}

.title {
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: 20px;
  line-height: 1.15;
}

.action {
  padding: 0;
  border: none;
  background: none;
  color: var(--accent);
  font-weight: var(--fw-strong);
  font-size: 13px;
  white-space: nowrap;
}

.action:hover {
  color: var(--deeper);
}
</style>
