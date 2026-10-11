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
  gap: 3px;
  padding: 8px 2px 6px;
  border: var(--border) solid var(--line);
  border-radius: 16px 16px 16px 6px;
  background: var(--paper);
}

.mood[aria-pressed='true'] {
  background: var(--mood-tint);
  border-color: var(--ink);
  transform: rotate(-3deg);
}

.emoji {
  font-size: 22px;
  line-height: 1;
}

.mood[aria-pressed='true'] .emoji {
  font-size: 26px;
}

.label {
  font-family: var(--font-hand);
  font-size: var(--fs-hand-label);
  line-height: 1.1;
  text-align: center;
  white-space: nowrap;
}
</style>
