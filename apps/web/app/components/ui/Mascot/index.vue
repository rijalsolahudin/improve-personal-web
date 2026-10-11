<script setup lang="ts">
import { BLUSHING_MASCOTS, MASCOTS, type MascotName } from '~/utils/mascots'

const { name, size = 100 } = defineProps<{
  name: MascotName
  /** Ukuran sisi dalam px (kanvas asli 100×100). */
  size?: number
}>()
</script>

<template>
  <MascotCanvas :parts="MASCOTS[name]" :has-blush="BLUSHING_MASCOTS.has(name)" :size="size" />
</template>
