<script setup lang="ts">
import type { IconName } from '~/utils/icons'
import {
  DEFAULT_HIGHLIGHT,
  HIGHLIGHT_COLORS,
  type HighlightColor,
  type RichFormatTarget,
  type RichListKind,
  type RichMark,
} from '~/utils/memo/richtext'

/** Tombol format tulisan jurnal; aksinya dijalankan ke kertas `MemoRichPaper` (`target`). */
const { target } = defineProps<{ target: RichFormatTarget | null }>()

const MARKS: readonly { name: Exclude<RichMark, 'highlight'>; icon: IconName }[] = [
  { name: 'bold', icon: 'text-bold' },
  { name: 'italic', icon: 'text-italic' },
  { name: 'strike', icon: 'text-strike' },
]
const LISTS: readonly { name: RichListKind; icon: IconName }[] = [
  { name: 'bulletList', icon: 'list-bullet' },
  { name: 'orderedList', icon: 'list-ordered' },
]

/** Warna yang dipakai tombol stabilo berikutnya; ikut warna teks di kursor kalau sudah distabilo. */
const chosen = ref<HighlightColor>(DEFAULT_HIGHLIGHT)
const isPicking = ref(false)
const shownColor = computed(() => target?.highlightColor() ?? chosen.value)

function pick(color: HighlightColor): void {
  chosen.value = color
  isPicking.value = false
  target?.setHighlight(color)
}
</script>

<template>
  <div class="formats" role="toolbar" :aria-label="$t('memo.format.label')">
    <!-- `mousedown.prevent`: kertas tidak kehilangan fokus & seleksi saat tombol ditekan. -->
    <button
      v-for="mark in MARKS"
      :key="mark.name"
      type="button"
      class="format"
      :title="$t(`memo.format.${mark.name}`)"
      :aria-label="$t(`memo.format.${mark.name}`)"
      :aria-pressed="target?.isActive(mark.name) ?? false"
      :disabled="!target"
      @mousedown.prevent
      @click="target?.toggleMark(mark.name)"
    >
      <Icon :name="mark.icon" :size="16" />
    </button>

    <span class="highlight" :style="{ '--hl': `var(--memo-hl-${shownColor})` }">
      <button
        type="button"
        class="format"
        :title="$t('memo.format.highlight')"
        :aria-label="$t('memo.format.highlight')"
        :aria-pressed="target?.isActive('highlight') ?? false"
        :disabled="!target"
        @mousedown.prevent
        @click="target?.toggleMark('highlight')"
      >
        <Icon name="highlighter" :size="16" />
        <span class="ink" aria-hidden="true" />
      </button>
      <button
        type="button"
        class="format caret"
        :title="$t('memo.format.highlightColor')"
        :aria-label="$t('memo.format.highlightColor')"
        :aria-expanded="isPicking"
        :disabled="!target"
        @mousedown.prevent
        @click="isPicking = !isPicking"
      >
        ▾
      </button>
      <span
        v-if="isPicking"
        class="swatches"
        role="group"
        :aria-label="$t('memo.format.highlightColor')"
      >
        <button
          v-for="color in HIGHLIGHT_COLORS"
          :key="color"
          type="button"
          class="swatch"
          :style="{ background: `var(--memo-hl-${color})` }"
          :title="$t(`memo.format.colors.${color}`)"
          :aria-label="$t(`memo.format.colors.${color}`)"
          :aria-pressed="shownColor === color"
          @mousedown.prevent
          @click="pick(color)"
        />
      </span>
    </span>

    <span class="divider" aria-hidden="true" />

    <button
      v-for="list in LISTS"
      :key="list.name"
      type="button"
      class="format"
      :title="$t(`memo.format.${list.name}`)"
      :aria-label="$t(`memo.format.${list.name}`)"
      :aria-pressed="target?.isActive(list.name) ?? false"
      :disabled="!target"
      @mousedown.prevent
      @click="target?.toggleList(list.name)"
    >
      <Icon :name="list.icon" :size="16" />
    </button>
  </div>
</template>

<style scoped>
.formats {
  display: flex;
  align-items: center;
  gap: 2px;
}

.format {
  position: relative;
  width: 28px;
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  border-radius: var(--radius-pill);
  background: none;
  color: var(--mute-2);
}

.format:hover:not(:disabled) {
  background: var(--alt);
  color: var(--ink);
}

.format[aria-pressed='true'] {
  background: var(--alt);
  color: var(--ink);
  box-shadow: inset 0 0 0 var(--border-thin) var(--line);
}

.highlight {
  display: inline-flex;
  align-items: center;
}

/* Garis warna di bawah ikon spidol = warna stabilo yang akan dipakai. */
.ink {
  position: absolute;
  bottom: 3px;
  left: 7px;
  right: 7px;
  height: 3px;
  border-radius: 2px;
  background: var(--hl);
}

.caret {
  width: 16px;
  font-size: var(--fs-11);
}

.swatches {
  display: inline-flex;
  align-items: center;
  gap: var(--space-4);
  padding: 0 var(--space-6);
}

.swatch {
  width: 18px;
  height: 18px;
  padding: 0;
  border: var(--border-thin) solid var(--line);
  border-radius: 50%;
}

.swatch[aria-pressed='true'] {
  box-shadow:
    0 0 0 2px var(--paper-2),
    0 0 0 3px var(--ink);
}

.divider {
  width: 1px;
  height: 16px;
  margin: 0 var(--space-4);
  background: var(--line);
}
</style>
