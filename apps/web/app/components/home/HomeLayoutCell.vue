<script setup lang="ts">
import type { HomeWidgetId } from '~/utils/homeLayout'

const { id, isEditing, isTwoColumn, isWide, isDragging } = defineProps<{
  id: HomeWidgetId
  isEditing: boolean
  isTwoColumn: boolean
  isWide: boolean
  isDragging: boolean
}>()

const emit = defineEmits<{
  move: [delta: -1 | 1]
  swap: []
  'toggle-wide': []
  hide: []
  grab: [event: PointerEvent]
}>()

const { t } = useI18n()
const label = computed(() => t(`home.layout.widget.${id}`))
const wideTitle = computed(() => t(isWide ? 'home.layout.normal' : 'home.layout.wide'))
</script>

<template>
  <div class="cell" :data-widget="id">
    <div v-if="isDragging" class="placeholder" aria-hidden="true" />
    <div class="inner" :class="{ ghosted: isDragging }" :data-widget-inner="id">
      <!-- Anchor mode hias: sticker menempel ke kartu ini (tanpa jarak bawah). -->
      <div :data-anchor="id" data-anchor-kind="content">
        <slot />
      </div>
    </div>
    <div
      v-if="isEditing && !isDragging"
      class="overlay"
      role="group"
      :aria-label="label"
      @pointerdown="emit('grab', $event)"
    >
      <span class="tag" aria-hidden="true">⠿ {{ label }}</span>
      <div class="tools" @pointerdown.stop>
        <button type="button" :title="$t('home.layout.up')" @click="emit('move', -1)">
          <span aria-hidden="true">↑</span>
          <span class="visually-hidden">{{ $t('home.layout.up') }} {{ label }}</span>
        </button>
        <button type="button" :title="$t('home.layout.down')" @click="emit('move', 1)">
          <span aria-hidden="true">↓</span>
          <span class="visually-hidden">{{ $t('home.layout.down') }} {{ label }}</span>
        </button>
        <template v-if="isTwoColumn">
          <button type="button" :title="$t('home.layout.swap')" @click="emit('swap')">
            <span aria-hidden="true">⇄</span>
            <span class="visually-hidden">{{ $t('home.layout.swap') }} {{ label }}</span>
          </button>
          <button
            type="button"
            :title="wideTitle"
            :aria-pressed="isWide"
            :class="{ on: isWide }"
            @click="emit('toggle-wide')"
          >
            <span aria-hidden="true">⟷</span>
            <span class="visually-hidden">{{ $t('home.layout.wide') }} {{ label }}</span>
          </button>
        </template>
        <button type="button" class="hide" :title="$t('home.layout.hide')" @click="emit('hide')">
          <span aria-hidden="true">✕</span>
          <span class="visually-hidden">{{ $t('home.layout.hide') }} {{ label }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cell {
  position: relative;
  min-width: 0;
}

/* Jarak antar widget = padding bawah, ikut terukur sebagai tinggi sel (grid masonry).
   `flow-root`: margin anak tidak bocor keluar, jadi tinggi terukur = tinggi sebenarnya. */
.inner {
  display: flow-root;
  padding-bottom: var(--gap-desktop);
}

.ghosted {
  visibility: hidden;
}

.placeholder {
  position: absolute;
  inset: 0 0 var(--gap-desktop) 0;
  border: 3px dashed var(--accent);
  border-radius: 30px;
  background: var(--chip);
}

.overlay {
  position: absolute;
  inset: -6px -6px calc(var(--gap-desktop) - 6px) -6px;
  z-index: 6;
  border: 2.5px dashed var(--accent);
  border-radius: 32px;
  background: rgb(255 255 255 / 0.12);
  cursor: grab;
  touch-action: none;
  user-select: none;
  transition: background var(--dur) var(--ease);
}

.overlay:hover {
  background: rgb(255 255 255 / 0.22);
}

.tag {
  position: absolute;
  top: -15px;
  left: 18px;
  padding: 5px 12px;
  border-radius: var(--radius-pill);
  background: var(--accent);
  color: var(--paper);
  font-weight: 800;
  font-size: 12px;
  letter-spacing: 0.06em;
  white-space: nowrap;
}

.tools {
  position: absolute;
  top: -17px;
  right: 14px;
  display: flex;
  gap: 3px;
  padding: 3px;
  border: 2.5px solid var(--ink);
  border-radius: var(--radius-pill);
  background: var(--paper);
  cursor: default;
}

.tools button {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  font-weight: 800;
  font-size: 14px;
}

.tools button:hover,
.tools .on {
  background: var(--hover);
}

.tools .hide {
  color: #b0352a;
}

.tools .hide:hover {
  background: #ffe1da;
}

@media (max-width: 599px) {
  .inner {
    padding-bottom: var(--gap-mobile);
  }

  .placeholder {
    inset: 0 0 var(--gap-mobile) 0;
  }

  .overlay {
    inset: -6px -6px calc(var(--gap-mobile) - 6px) -6px;
  }
}
</style>
