<script setup lang="ts">
import type { MemoPaperName } from '@improve-personal/tokens'

import { freePart, type MemoLayoutModel, type MemoPart } from '~/composables/useMemoLayout'
import { MEMO_FREE_WRITE_ENABLED } from '~/utils/memo/layout'
import { MEMO_LINE_PX, MEMO_PAPER_TOP_PX } from '~/utils/memo/paperClick'
import type { MentionKind, RichFormatTarget } from '~/utils/memo/richtext'

/**
 * Kertas jurnal dengan tata letak: tulisan utama, kolom kanan (split), dan kotak teks bebas yang
 * ditaruh dengan klik di titik kosong. Tiap bagian adalah editor sendiri; semuanya menulis ke satu
 * teks lewat `layout` (`useMemoLayout`).
 */
const { layout, paper, placeholder, label, describedBy, mentionLabel } = defineProps<{
  layout: MemoLayoutModel
  paper: MemoPaperName
  placeholder: string
  label: string
  describedBy: string
  mentionLabel: (kind: MentionKind, id: string) => string
}>()

const emit = defineEmits<{ caret: [rect: { left: number; bottom: number }] }>()

const { t } = useI18n()
const area = useTemplateRef<HTMLElement>('area')

/** Editor per bagian; toolbar format bekerja pada editor bagian yang aktif. */
const targets = shallowReactive(new Map<MemoPart, RichFormatTarget>())
function bindTarget(part: MemoPart) {
  return (instance: unknown) => {
    if (instance) targets.set(part, instance as RichFormatTarget)
    else targets.delete(part)
  }
}
const target = computed(() => targets.get(layout.active.value) ?? null)
defineExpose({ target })

/** Kotak yang baru ditaruh langsung fokus; kotak lama tidak merebut fokus saat dimuat ulang. */
const fresh = ref<MemoPart | null>(null)

/** Titik viewport -> posisi kertas (pecahan lebar + indeks baris). */
function toPaper(x: number, y: number): { x: number; line: number } | null {
  const box = area.value?.getBoundingClientRect()
  if (!box || box.width === 0) return null
  return {
    x: (x - box.left) / box.width,
    line: Math.floor((y - box.top - MEMO_PAPER_TOP_PX) / MEMO_LINE_PX),
  }
}

function place(point: { x: number; y: number }): void {
  const at = toPaper(point.x, point.y)
  if (at === null) return
  fresh.value = layout.addFree(at)
}

/** Geser kotak lewat pegangannya; jarak pointer ke pojok kotak dijaga selama drag. */
let drag: { index: number; dx: number; dy: number } | null = null
function startDrag(index: number, event: PointerEvent): void {
  const block = (event.currentTarget as HTMLElement).parentElement?.getBoundingClientRect()
  if (!block) return
  drag = { index, dx: event.clientX - block.left, dy: event.clientY - block.top }
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}
function moveDrag(event: PointerEvent): void {
  if (drag === null) return
  const at = toPaper(event.clientX - drag.dx, event.clientY - drag.dy + MEMO_LINE_PX / 2)
  if (at !== null) layout.moveFree(drag.index, at)
}
function endDrag(): void {
  drag = null
}

/** Menulis di kolom utama/kanan: kotak kosong yang tertinggal di kertas ikut dibersihkan. */
function focusPart(part: MemoPart): void {
  layout.setActive(part)
  layout.pruneEmpty()
}

/**
 * Kotak ditinggal: tunggu fokus mendarat dulu (bisa di bagian lain kertas), lalu buang kotak
 * kosong. Fokus keluar dari kertas = tidak ada kotak yang sedang diketik.
 */
function afterBlur(): void {
  setTimeout(() => {
    if (!area.value?.contains(document.activeElement)) layout.setActive('main')
    layout.pruneEmpty()
  }, 0)
}

function blockStyle(block: { x: number; line: number; width: number }) {
  return {
    left: `${block.x * 100}%`,
    top: `${MEMO_PAPER_TOP_PX + block.line * MEMO_LINE_PX}px`,
    width: `${block.width * 100}%`,
  }
}

const parts = computed<MemoPart[]>(() => (layout.isSplit.value ? ['main', 'column'] : ['main']))
</script>

<template>
  <div ref="area" class="area" :class="{ split: layout.isSplit.value }">
    <LazyMemoRichPaper
      v-for="part in parts"
      :ref="bindTarget(part)"
      :key="part"
      :model-value="layout.partText(part)"
      :variant="part === 'main' ? 'main' : 'column'"
      :paper="paper"
      :placeholder="part === 'main' ? placeholder : t('memo.columnPlaceholder')"
      :label="part === 'main' ? label : t('memo.columnLabel')"
      :described-by="describedBy"
      :maxlength="layout.budget(part)"
      :mention-label="mentionLabel"
      :can-place="MEMO_FREE_WRITE_ENABLED"
      @update:model-value="(value: string) => layout.setPart(part, value)"
      @focus="focusPart(part)"
      @caret="(rect) => emit('caret', rect)"
      @place="place"
    />
    <div
      v-for="(block, index) in layout.layout.value.blocks"
      :key="layout.blockKeys.value[index]"
      class="free"
      :style="blockStyle(block)"
    >
      <button
        type="button"
        class="grip"
        :aria-label="t('memo.freeMove')"
        :title="t('memo.freeMove')"
        @pointerdown.prevent="startDrag(index, $event)"
        @pointermove="moveDrag"
        @pointerup="endDrag"
        @pointercancel="endDrag"
      >
        <Icon name="grip" :size="14" />
      </button>
      <LazyMemoRichPaper
        :ref="bindTarget(freePart(index))"
        :model-value="block.text"
        variant="bare"
        :is-autofocus="fresh === freePart(index)"
        :paper="paper"
        :placeholder="t('memo.freePlaceholder')"
        :label="t('memo.freeLabel')"
        :described-by="describedBy"
        :maxlength="layout.budget(freePart(index))"
        :mention-label="mentionLabel"
        @update:model-value="(value: string) => layout.setPart(freePart(index), value)"
        @focus="layout.setActive(freePart(index))"
        @blur="afterBlur"
        @caret="(rect) => emit('caret', rect)"
      />
    </div>
  </div>
</template>

<style scoped>
.area {
  position: relative;
}

.split {
  display: grid;
  grid-template-columns: 1fr 1fr;
}

/* Garis pemisah kolom: tipis putus-putus seperti lipatan kertas. */
.split > :nth-child(2) {
  border-left: var(--border-thin) dashed var(--mline);
}

.free {
  position: absolute;
  z-index: 2;
  border-radius: var(--radius-inner);
}

.free:hover,
.free:focus-within {
  outline: var(--border-thin) dashed var(--mline);
}

.grip {
  position: absolute;
  top: 7px;
  left: -22px;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  border-radius: var(--radius-inner);
  background: var(--paper);
  color: var(--mute-2);
  cursor: grab;
  opacity: 0;
  touch-action: none;
}

.free:hover .grip,
.free:focus-within .grip,
.grip:focus-visible {
  opacity: 1;
}

.grip:active {
  cursor: grabbing;
}

/* Layar sempit: kolom kanan turun ke bawah kolom kiri supaya tulisan tangan tetap terbaca. */
@media (max-width: 599px) {
  .split {
    grid-template-columns: 1fr;
  }

  .split > :nth-child(2) {
    border-top: var(--border-thin) dashed var(--mline);
    border-left: 0;
  }

  /* Tidak ada hover di layar sentuh: pegangan selalu terlihat. */
  .grip {
    opacity: 1;
  }
}
</style>
