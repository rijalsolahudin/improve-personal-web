<script setup lang="ts">
import { HABIT_COLORS, type Habit } from '~/utils/habits'

/**
 * Ikon habit: sticker kalau ada, kalau tidak tile warna + ikon (design).
 * Default: ikon di kotak kertas miring (tabel Habit); `isPlain`: ikon putih langsung di tile (Daily).
 */
const {
  habit,
  size = 42,
  isPlain = false,
} = defineProps<{
  habit: Pick<Habit, 'icon' | 'sticker' | 'color'>
  size?: number
  isPlain?: boolean
}>()
const solid = computed(() => (HABIT_COLORS[habit.color] ?? HABIT_COLORS[0])[0])
/** Skala isi terhadap tile (design: tile 42 → ikon 16px berbingkai; tile 30 → ikon 17px polos). */
const ICON_RATIO = { framed: 0.38, plain: 0.56 } as const
const iconSize = computed(() => Math.round(size * ICON_RATIO[isPlain ? 'plain' : 'framed']))
const tileStyle = computed(() => ({
  background: solid.value,
  width: `${size}px`,
  height: `${size}px`,
}))
</script>

<template>
  <LazyDecoStickerArt v-if="habit.sticker" :sid="habit.sticker" :size="size + 2" />
  <span v-else class="tile" :class="{ plain: isPlain }" :style="tileStyle" aria-hidden="true">
    <span class="frame">
      <Icon :name="habit.icon" :size="iconSize" />
    </span>
  </span>
</template>

<style scoped>
.tile {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: calc(12px * var(--rk)) calc(12px * var(--rk)) calc(12px * var(--rk))
    calc(4px * var(--rk));
  box-shadow: inset 0 calc(-3px * var(--bev)) 0 rgb(0 0 0 / 0.14);
}

.frame {
  width: 66%;
  height: 66%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: var(--border-thin) solid var(--outline);
  border-radius: calc(9px * var(--rk));
  background: var(--paper);
  transform: rotate(calc(-6deg * var(--bev)));
}

.plain .frame {
  border: 0;
  background: none;
  color: var(--paper);
  transform: none;
}
</style>
