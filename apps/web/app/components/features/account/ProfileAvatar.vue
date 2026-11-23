<script setup lang="ts">
/** Foto profil bulat, huruf depan nama, atau ikon kalau nama belum diisi. */
const {
  src = null,
  label,
  size = 38,
} = defineProps<{
  /** Data URL foto (sudah tervalidasi raster oleh `userProfileSchema`). */
  src?: string | null
  /** Nama tampilan; huruf pertamanya dipakai saat tanpa foto. */
  label: string
  size?: number
}>()

const initial = computed(() => label.trim().slice(0, 1).toUpperCase())
</script>

<template>
  <span class="avatar" :style="{ width: `${size}px`, height: `${size}px` }" aria-hidden="true">
    <img v-if="src" :src="src" alt="" class="photo" />
    <Icon v-else-if="!initial" name="smile" :size="Math.round(size * 0.5)" />
    <span v-else class="initial" :style="{ fontSize: `${Math.round(size * 0.45)}px` }">{{
      initial
    }}</span>
  </span>
</template>

<style scoped>
.avatar {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  box-sizing: border-box;
  border: var(--border) solid var(--outline);
  border-radius: 50%;
  background: var(--accent);
  color: var(--paper);
}

.photo {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.initial {
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  line-height: 1;
}
</style>
