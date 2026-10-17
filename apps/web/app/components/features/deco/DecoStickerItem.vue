<script setup lang="ts">
import type { DecoDragMode } from '~/composables/useDecoDrag'
import type { DecoBox } from '~/utils/deco'

const { sid, box, z, isEditing, isSelected } = defineProps<{
  sid: string
  box: DecoBox
  z: number
  isEditing: boolean
  isSelected: boolean
}>()

const emit = defineEmits<{
  drag: [event: PointerEvent, mode: DecoDragMode]
  nudge: [change: Partial<DecoBox>]
  remove: []
  swap: []
  front: []
}>()

const { t } = useI18n()
const NUDGE = 4
const NUDGE_FAST = 16
const SIZE_STEP = 8
const ROTATE_STEP = 15

/** Keyboard: panah geser, +/- ukuran, [ ] putar, Delete hapus. */
function onKeydown(event: KeyboardEvent): void {
  const step = event.shiftKey ? NUDGE_FAST : NUDGE
  const changes: Record<string, Partial<DecoBox>> = {
    ArrowLeft: { left: box.left - step },
    ArrowRight: { left: box.left + step },
    ArrowUp: { top: box.top - step },
    ArrowDown: { top: box.top + step },
    '+': {
      size: box.size + SIZE_STEP,
      left: box.left - SIZE_STEP / 2,
      top: box.top - SIZE_STEP / 2,
    },
    '-': {
      size: box.size - SIZE_STEP,
      left: box.left + SIZE_STEP / 2,
      top: box.top + SIZE_STEP / 2,
    },
    '[': { rot: box.rot - ROTATE_STEP },
    ']': { rot: box.rot + ROTATE_STEP },
  }
  const change = changes[event.key]
  if (change) {
    event.preventDefault()
    emit('nudge', change)
  } else if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault()
    emit('remove')
  }
}

const style = computed(() => ({
  left: `${Math.round(box.left)}px`,
  top: `${Math.round(box.top)}px`,
  width: `${Math.round(box.size)}px`,
  height: `${Math.round(box.size)}px`,
  transform: `rotate(${Math.round(box.rot)}deg)`,
  zIndex: z + (isSelected ? 1000 : 0),
}))
</script>

<template>
  <div
    class="item"
    :class="{ editing: isEditing, selected: isSelected }"
    :style="style"
    data-deco-item
    :tabindex="isEditing ? 0 : undefined"
    :role="isEditing ? 'button' : undefined"
    :aria-label="isEditing ? t('deco.itemLabel') : undefined"
    :aria-hidden="isEditing ? undefined : 'true'"
    @pointerdown="isEditing && emit('drag', $event, 'move')"
    @keydown="isEditing && onKeydown($event)"
  >
    <DecoStickerArt :sid="sid" :size="Math.round(box.size)" />
    <template v-if="isSelected">
      <span class="stem" aria-hidden="true" />
      <button
        type="button"
        class="handle rotate"
        :title="$t('deco.rotate')"
        :aria-label="$t('deco.rotate')"
        @pointerdown="emit('drag', $event, 'rotate')"
      >
        ↻
      </button>
      <button
        type="button"
        class="handle resize"
        :title="$t('deco.resize')"
        :aria-label="$t('deco.resize')"
        @pointerdown="emit('drag', $event, 'resize')"
      >
        ⤡
      </button>
      <button
        type="button"
        class="handle remove"
        :title="$t('deco.remove')"
        @pointerdown.stop.prevent
        @click="emit('remove')"
      >
        ×
      </button>
      <button
        type="button"
        class="handle swap"
        :title="$t('deco.swap')"
        @pointerdown.stop.prevent
        @click="emit('swap')"
      >
        ⇄
      </button>
      <button
        type="button"
        class="handle front"
        :title="$t('deco.front')"
        @pointerdown.stop.prevent
        @click="emit('front')"
      >
        ⬆
      </button>
    </template>
  </div>
</template>

<style scoped>
/* Di luar mode hias sticker tembus klik (design). */
.item {
  position: absolute;
  pointer-events: none;
  border-radius: calc(14px * var(--rk));
  touch-action: none;
  user-select: none;
}

.item.editing {
  pointer-events: auto;
  cursor: move;
}

.item.selected {
  outline: 2.5px dashed var(--ink);
  outline-offset: 8px;
}

.stem {
  position: absolute;
  left: 50%;
  top: -18px;
  width: 2px;
  height: 10px;
  margin-left: -1px;
  background: var(--ink);
}

.handle {
  position: absolute;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: var(--border) solid var(--outline);
  border-radius: 50%;
  background: var(--paper);
  font-weight: var(--fw-strong);
  font-size: 14px;
  line-height: 1;
  touch-action: none;
}

.rotate {
  left: 50%;
  top: -44px;
  margin-left: -14px;
  cursor: grab;
}

.resize {
  right: -22px;
  bottom: -22px;
  cursor: nwse-resize;
}

.remove {
  left: -22px;
  top: -22px;
  background: #e2445c;
  color: var(--paper);
}

.swap {
  left: -22px;
  bottom: -22px;
  background: var(--primary);
}

.front {
  right: -22px;
  top: -22px;
}
</style>
