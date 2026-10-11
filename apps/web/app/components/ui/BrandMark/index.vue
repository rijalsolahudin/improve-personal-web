<script setup lang="ts">
/** Logo = monogram "ip" di tile + wordmark "Improve / Personal" (readme: jangan bikin logo baru). */
const {
  size = 40,
  wordmark = 'stacked',
  tone = 'primary',
} = defineProps<{
  size?: number
  /** `plain` = dua baris tanpa aksen (Login). */
  wordmark?: 'stacked' | 'inline' | 'plain' | 'none'
  /** `paper` dipakai di atas latar kuning (Login). */
  tone?: 'primary' | 'paper'
}>()
</script>

<template>
  <span class="brand" :class="`brand-${wordmark}`">
    <span
      class="tile"
      :class="`tile-${tone}`"
      :style="{ '--tile-size': `${size}px` }"
      aria-hidden="true"
    >
      ip
    </span>
    <span v-if="wordmark !== 'none'" class="wordmark">
      <span>{{ $t('brand.first') }}</span>
      <span class="second">{{ $t('brand.second') }}</span>
    </span>
    <span v-else class="visually-hidden">{{ $t('brand.name') }}</span>
  </span>
</template>

<style scoped>
.brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: var(--ink);
}

.tile {
  width: var(--tile-size);
  height: var(--tile-size);
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: calc(var(--tile-size) * 0.35);
  border: 2.5px solid var(--ink);
  font-family: var(--font-display);
  font-weight: 800;
  font-size: calc(var(--tile-size) * 0.5);
  line-height: 1;
}

.tile-primary {
  background: var(--primary);
}

.tile-paper {
  background: #fffdf8;
}

.wordmark {
  display: flex;
  flex-direction: column;
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 20px;
  line-height: 1;
  white-space: nowrap;
}

.brand-inline .wordmark {
  flex-direction: row;
  gap: 0.25em;
}

.brand-stacked .second,
.brand-inline .second {
  color: var(--accent);
}
</style>
