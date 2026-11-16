<script setup lang="ts">
import { moodTints } from '@improve-personal/tokens'

/** Mood 5 skala (😢 … 😄). Emoji hanya dipakai untuk mood (readme design). */
const MOOD_EMOJI = ['😢', '😕', '😐', '🙂', '😄'] as const

const { label = undefined } = defineProps<{ label?: string }>()

const model = defineModel<number | null>({ required: true })

const moods = MOOD_EMOJI.map((emoji, index) => ({ emoji, index, tint: moodTints[index] }))
</script>

<template>
  <div class="moods" role="group" :aria-label="label">
    <button
      v-for="mood in moods"
      :key="mood.index"
      type="button"
      class="mood"
      :aria-pressed="model === mood.index"
      :style="{ '--mood-tint': mood.tint }"
      @click="model = model === mood.index ? null : mood.index"
    >
      <span class="emoji" aria-hidden="true">{{ mood.emoji }}</span>
      <span class="label">{{ $t(`memo.mood.${mood.index}`) }}</span>
    </button>
  </div>
</template>

<style scoped>
.moods {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: var(--space-2);
}

/* Tanpa bingkai: emoji + label saja, supaya mood tidak bersaing dengan tulisan jurnal. */
.mood {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: var(--space-6) 2px var(--space-4);
  border: none;
  border-radius: calc(14px * var(--rk));
  background: none;
  color: var(--mute-3);
  transition: transform 0.15s;
}

/* Design: tile terpilih miring -2°, tile mana pun yang di-hover naik -3° + membesar. */
.mood[aria-pressed='true'] {
  background: var(--mood-tint);
  color: var(--ink);
  transform: rotate(calc(-2deg * var(--bev)));
}

.mood:hover {
  transform: rotate(calc(-3deg * var(--bev))) scale(1.04);
}

.emoji {
  font-size: var(--fs-24);
  line-height: 1;
}

.label {
  font-family: var(--font-hand);
  /* Patrick Hand hanya punya weight 400; warisan `--fw-body` (700) membuatnya faux-bold. */
  font-weight: 400;
  font-size: var(--fs-hand-label);
  line-height: 1.05;
  text-align: center;
  white-space: nowrap;
}
</style>
