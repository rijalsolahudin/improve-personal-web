<script setup lang="ts">
import type { GoalCategoryView } from '~/utils/goals/categories'

// Sampul kecil goal: sticker kalau ada, kalau tidak titik warna kategori (design v2).
const { cover, category } = defineProps<{ cover: string | null; category: GoalCategoryView }>()
</script>

<template>
  <LazyDecoStickerArt v-if="cover" :sid="cover" :size="44" />
  <span v-else class="dot" :style="{ background: category.accent }" aria-hidden="true" />
</template>

<style scoped>
.dot {
  width: 12px;
  height: 12px;
  flex-shrink: 0;
  border-radius: 4px 4px 4px 2px;
}
</style>
