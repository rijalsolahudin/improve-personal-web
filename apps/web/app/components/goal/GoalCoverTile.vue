<script setup lang="ts">
import { GOAL_CATEGORY_GLYPH, type GoalCategory } from '~/utils/goals'

// Sampul kecil goal: sticker kalau ada, kalau tidak tile kategori + glyph (design).
const { cover, category } = defineProps<{ cover: string | null; category: GoalCategory }>()
</script>

<template>
  <LazyDecoStickerArt v-if="cover" :sid="cover" :size="44" />
  <span v-else class="tile" :style="{ background: `var(--cat-${category})` }" aria-hidden="true">
    <span class="glyph">{{ GOAL_CATEGORY_GLYPH[category] }}</span>
  </span>
</template>

<style scoped>
.tile {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-leaf);
  box-shadow: inset 0 -3px 0 rgb(0 0 0 / 0.14);
}

.glyph {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid var(--ink);
  border-radius: 7px;
  background: var(--paper);
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 12px;
  transform: rotate(-6deg);
}
</style>
