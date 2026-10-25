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
  gap: 6px;
}

.mood {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 2px 6px;
  border: var(--border) solid var(--line);
  border-radius: calc(20px * var(--rk)) calc(20px * var(--rk)) calc(20px * var(--rk))
    calc(8px * var(--rk));
  background: var(--paper);
  transition: transform 0.15s;
}

/* Design: tile terpilih miring -2°, tile mana pun yang di-hover naik -3° + membesar. */
.mood[aria-pressed='true'] {
  background: var(--mood-tint);
  border-color: var(--outline);
  transform: rotate(calc(-2deg * var(--bev)));
}

.mood:hover {
  transform: rotate(calc(-3deg * var(--bev))) scale(1.04);
}

.emoji {
  font-size: 30px;
  line-height: 1;
}

.mood[aria-pressed='true'] .emoji {
  font-size: 36px;
}

.label {
  font-family: var(--font-hand);
  /* Patrick Hand hanya punya weight 400; warisan `--fw-body` (700) membuatnya faux-bold. */
  font-weight: 400;
  font-size: var(--fs-hand-label);
  line-height: 1.05;
  text-align: center;
}
</style>
