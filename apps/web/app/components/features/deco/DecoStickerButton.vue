<script setup lang="ts">
/** Tombol "pakai/ganti sticker" di form (habit, countdown): pratinjau sticker + label. */
const { sticker } = defineProps<{
  sticker: string | null
  label: string
}>()
defineEmits<{ click: [] }>()
</script>

<template>
  <button type="button" class="sticker-btn" :class="{ on: sticker }" @click="$emit('click')">
    <LazyDecoStickerArt v-if="sticker" :sid="sticker" :size="32" />
    <span v-else class="empty" aria-hidden="true">✿</span>
    {{ label }}
  </button>
</template>

<style scoped>
.sticker-btn {
  width: fit-content;
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
  padding: 5px 14px 5px 5px;
  border: var(--border) solid var(--line);
  border-radius: var(--radius-pill);
  background: var(--paper);
  font-weight: var(--fw-strong);
  font-size: 13px;
}

.sticker-btn.on {
  border-color: var(--outline);
}

.empty {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: var(--border-thin) dashed var(--dash-2);
  border-radius: calc(10px * var(--rk));
  color: var(--mute-3);
}
</style>
