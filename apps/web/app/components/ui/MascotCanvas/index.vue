<script setup lang="ts">
import type { MascotPart } from '~/utils/mascots'

const {
  parts,
  hasBlush = false,
  size = 100,
} = defineProps<{
  parts: readonly MascotPart[]
  hasBlush?: boolean
  /** Ukuran sisi dalam px (kanvas asli 100×100). */
  size?: number
}>()
</script>

<template>
  <span class="mascot" :style="{ width: `${size}px`, height: `${size}px` }" aria-hidden="true">
    <span class="canvas" :style="{ transform: `scale(${size / 100})` }">
      <!-- style unik per bagian dalam satu maskot, jadi aman dipakai sebagai key -->
      <span v-for="part in parts" :key="part.style" class="part" :style="part.style">
        <template v-if="'children' in part">
          <span
            v-for="child in part.children"
            :key="child.style"
            class="part"
            :style="child.style"
          />
        </template>
      </span>
      <template v-if="hasBlush">
        <span class="part blush blush-left" />
        <span class="part blush blush-right" />
      </template>
    </span>
  </span>
</template>

<style scoped>
.mascot {
  position: relative;
  display: inline-block;
  flex-shrink: 0;
  overflow: visible;
  pointer-events: none;
}

.canvas {
  position: absolute;
  inset: 0 auto auto 0;
  width: 100px;
  height: 100px;
  transform-origin: 0 0;
}

.part {
  position: absolute;
  display: block;
  box-sizing: border-box;
}

.blush {
  top: 72px;
  width: 15px;
  height: 9px;
  background: #f49ab4;
  border-radius: 50%;
  opacity: 0.75;
}

.blush-left {
  left: 21px;
}

.blush-right {
  left: 64px;
}
</style>
