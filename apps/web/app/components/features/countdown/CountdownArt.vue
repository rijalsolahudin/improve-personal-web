<script setup lang="ts">
import type { Countdown } from '~/utils/countdown'

/** Isi tile momen: sticker kalau dipilih, kalau tidak emoji (design `sid: sticker || emoji`). */
const { countdown, size } = defineProps<{
  countdown: Pick<Countdown, 'emoji' | 'sticker'>
  /** Ukuran sticker (px); emoji ikut font-size tile. */
  size: number
}>()
</script>

<template>
  <LazyDecoStickerArt v-if="countdown.sticker" :sid="countdown.sticker" :size="size" />
  <template v-else>{{ countdown.emoji }}</template>
</template>
