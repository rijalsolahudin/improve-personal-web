<script setup lang="ts">
import { isIconSid } from '~/utils/deco'
import { findSticker, mascotArt } from '~/utils/stickers'

// Sticker.dc.html: emoji/maskot dengan outline "potongan stiker", atau varian ikon (tile).
const { sid, size = 96 } = defineProps<{ sid: string; size?: number }>()

const sticker = computed(() => findSticker(sid))
const isIcon = computed(() => isIconSid(sid))
const mascot = computed(() => {
  const art = sticker.value?.art
  return art && typeof art === 'object' ? mascotArt(art.m) : null
})
const emoji = computed(() => (typeof sticker.value?.art === 'string' ? sticker.value.art : null))

const boxStyle = computed(() => {
  const base = { width: `${size}px`, height: `${size}px` }
  if (isIcon.value) {
    return {
      ...base,
      borderRadius: `${Math.round(size * 0.3)}px`,
      background: sticker.value?.tint ?? '#f2e4cc',
      border: `${Math.max(1.5, size / 30).toFixed(1)}px solid var(--ink)`,
      boxShadow: `0 ${Math.max(2, Math.round(size / 20))}px 0 rgb(47 42 36 / 0.18)`,
    }
  }
  const w = Math.max(1.5, size / 36)
  const cut = '#fffbf4'
  return {
    ...base,
    filter: [
      `drop-shadow(${w}px 0 0 ${cut})`,
      `drop-shadow(-${w}px 0 0 ${cut})`,
      `drop-shadow(0 ${w}px 0 ${cut})`,
      `drop-shadow(0 -${w}px 0 ${cut})`,
      'drop-shadow(0 3px 0 rgb(47 42 36 / 0.18))',
    ].join(' '),
  }
})
const artSize = computed(() => Math.round(size * (isIcon.value ? 0.7 : 1)))
const fontSize = computed(() => `${Math.round(size * (isIcon.value ? 0.54 : 0.8))}px`)
</script>

<template>
  <span class="sticker" :style="boxStyle" :title="sticker?.name ?? $t('deco.unknown')">
    <MascotCanvas
      v-if="mascot"
      :parts="mascot.parts"
      :has-blush="mascot.hasBlush"
      :size="artSize"
    />
    <span v-else-if="emoji" class="emoji" :style="{ fontSize }" aria-hidden="true">
      {{ emoji }}
    </span>
    <span v-else class="unknown" :style="{ fontSize: `${Math.round(size * 0.42)}px` }">?</span>
  </span>
</template>

<style scoped>
.sticker {
  position: relative;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  user-select: none;
}

.emoji {
  line-height: 1;
}

.unknown {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2.5px dashed #c9b89e;
  border-radius: 28%;
  background: #fbf3e6;
  font-family: var(--font-display);
  font-weight: 800;
  color: #a8957c;
}
</style>
