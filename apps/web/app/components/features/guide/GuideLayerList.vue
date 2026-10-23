<script setup lang="ts">
import type { GuideLayer } from '~/utils/guide'

const { layers, numbered = false } = defineProps<{
  layers: readonly GuideLayer[]
  /** Tampilkan nomor urut di depan tiap kartu (bagian keamanan); backup memakai judul bernomor sendiri. */
  numbered?: boolean
}>()
</script>

<template>
  <ol class="layers">
    <li v-for="(layer, index) in layers" :key="layer.title" class="layer">
      <span v-if="numbered" class="number" aria-hidden="true">{{ index + 1 }}</span>
      <div>
        <p class="layer-title">{{ layer.title }}</p>
        <p class="layer-body">{{ layer.body }}</p>
      </div>
    </li>
  </ol>
</template>

<style scoped>
.layers {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 230px), 1fr));
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.layer {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 14px;
  border-radius: var(--radius-inner);
  background: var(--surface-inset, var(--soft));
}

.number {
  display: grid;
  flex-shrink: 0;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: var(--radius-pill);
  background: var(--accent);
  color: var(--text-on-accent);
  font-size: var(--fs-meta);
  font-weight: var(--fw-strong);
}

.layer-title {
  font-weight: var(--fw-strong);
  font-size: var(--fs-body-sm);
}

.layer-body {
  margin-top: 3px;
  color: var(--mute-2);
  font-size: var(--fs-caption);
  line-height: 1.55;
}
</style>
