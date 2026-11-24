<script setup lang="ts">
import { h, type VNode } from 'vue'

import {
  parseLayout,
  parseRich,
  type RichBlock,
  type RichInline,
  type RichMark,
} from '@improve-personal/core/planner'

/**
 * Tulisan jurnal di mode baca: markdown jurnal dirender jadi elemen Vue (bukan HTML mentah), jadi isi
 * user tidak pernah ditafsirkan sebagai HTML. Mention jadi chip yang bisa diklik. Tata letak ikut
 * seperti di editor: kolom kanan di samping tulisan utama, kotak bebas di baris & posisinya.
 */
const { text, day } = defineProps<{ text: string; day: string }>()

const TAGS: Record<RichMark, string> = {
  bold: 'strong',
  italic: 'em',
  strike: 's',
  highlight: 'mark',
}

const MemoMention = resolveComponent('MemoMention')
const MemoGoalMention = resolveComponent('MemoGoalMention')

function inline(node: RichInline, key: number): VNode {
  if (node.type === 'mention') {
    return node.attrs.kind === 'goal'
      ? h(MemoGoalMention, { key, goalId: node.attrs.id })
      : h(MemoMention, { key, scheduleId: node.attrs.id, day })
  }
  // Mark terluar dibungkus terakhir supaya urutannya sama dengan editor.
  return (node.marks ?? []).reduceRight<VNode>(
    (child, mark) =>
      h(TAGS[mark.type], { class: mark.type, 'data-color': mark.attrs?.color ?? undefined }, [
        child,
      ]),
    h('span', { key, class: 'seg' }, node.text),
  )
}

function block(node: RichBlock, key: number): VNode {
  if (node.type === 'paragraph') {
    return h('p', { key, class: 'line' }, (node.content ?? []).map(inline))
  }
  return h(
    node.type === 'bulletList' ? 'ul' : 'ol',
    { key, class: 'list' },
    node.content.map((item, index) =>
      h(
        'li',
        { key: index },
        (item.content[0]?.content ?? []).map((child, childIndex) => inline(child, childIndex)),
      ),
    ),
  )
}

const blocksOf = (markdown: string): VNode[] => parseRich(markdown).content.map(block)

const layout = computed(() => parseLayout(text))
/** Tinggi minimal supaya kotak bebas di baris bawah tidak keluar dari kartu. */
const minLines = computed(() =>
  layout.value.blocks.reduce(
    (most, free) => Math.max(most, free.line + free.text.split('\n').length),
    0,
  ),
)

const Main = () => blocksOf(layout.value.main)
const Column = () => blocksOf(layout.value.column ?? '')
</script>

<template>
  <div class="rich" :style="minLines ? { minHeight: `${minLines}lh` } : undefined">
    <div v-if="layout.column !== null" class="split">
      <div><Main /></div>
      <div class="column"><Column /></div>
    </div>
    <Main v-else />
    <div
      v-for="(free, index) in layout.blocks"
      :key="index"
      class="free"
      :style="{ left: `${free.x * 100}%`, top: `${free.line}lh`, width: `${free.width * 100}%` }"
    >
      <component :is="() => blocksOf(free.text)" />
    </div>
  </div>
</template>

<style scoped>
.rich {
  position: relative;
}

.split {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-16);
}

.column {
  padding-left: var(--space-16);
  border-left: var(--border-thin) dashed var(--line-2);
}

.free {
  position: absolute;
}

@media (max-width: 599px) {
  .split {
    grid-template-columns: 1fr;
  }

  .column {
    padding: var(--space-8) 0 0;
    border-top: var(--border-thin) dashed var(--line-2);
    border-left: 0;
  }
}

.rich :deep(.line) {
  min-height: 1lh;
}

/* Spasi & baris di isi jurnal dipertahankan; spasi template di sekitar chip tidak ikut tampil. */
.rich :deep(.seg) {
  white-space: pre-wrap;
}

.rich :deep(.list) {
  margin: 0;
  padding-left: 1.4em;
}

/* Sama dengan editor: font tulisan tangan hanya punya satu weight, jadi tebal = tinta lebih pekat. */
.rich :deep(strong) {
  font-weight: 400;
  text-shadow:
    0.4px 0 0 currentcolor,
    -0.4px 0 0 currentcolor;
}

.rich :deep(mark) {
  padding: 0 2px;
  border-radius: 3px;
  background: var(--memo-hl-kuning);
  color: inherit;
}

.rich :deep(mark[data-color='hijau']) {
  background: var(--memo-hl-hijau);
}

.rich :deep(mark[data-color='pink']) {
  background: var(--memo-hl-pink);
}

.rich :deep(mark[data-color='biru']) {
  background: var(--memo-hl-biru);
}
</style>
