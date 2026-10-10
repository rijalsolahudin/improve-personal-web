<script setup lang="ts">
import { HABIT_COLORS, type Habit } from '~/utils/habits'

/** Ikon habit: sticker kalau ada, kalau tidak tile warna + glyph (design). */
const { habit, size = 34 } = defineProps<{
  habit: Pick<Habit, 'icon' | 'sticker' | 'color'>
  size?: number
}>()
const solid = computed(() => (HABIT_COLORS[habit.color] ?? HABIT_COLORS[0])[0])
</script>

<template>
  <LazyDecoStickerArt v-if="habit.sticker" :sid="habit.sticker" :size="size + 2" />
  <span
    v-else
    class="tile"
    :style="{ background: solid, width: `${size}px`, height: `${size}px` }"
    aria-hidden="true"
  >
    <span class="glyph">{{ habit.icon }}</span>
  </span>
</template>

<style scoped>
.tile {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px 12px 12px 4px;
  box-shadow: inset 0 -3px 0 rgb(0 0 0 / 0.14);
}

.glyph {
  width: 59%;
  height: 59%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid var(--ink);
  border-radius: 7px;
  background: var(--paper);
  font-weight: 800;
  font-size: 11px;
  transform: rotate(-6deg);
}
</style>
