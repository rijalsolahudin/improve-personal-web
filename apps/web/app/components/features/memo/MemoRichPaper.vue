<script setup lang="ts">
import { Node, mergeAttributes, type JSONContent } from '@tiptap/core'
import Highlight from '@tiptap/extension-highlight'
import { Placeholder } from '@tiptap/extensions'
import StarterKit from '@tiptap/starter-kit'
import { EditorContent, useEditor } from '@tiptap/vue-3'
import { memoPapers, type MemoPaperName } from '@improve-personal/tokens'

import {
  DEFAULT_HIGHLIGHT,
  isHighlightColor,
  parseRich,
  serializeRich,
  type HighlightColor,
  type MentionKind,
  type RichDoc,
  type RichListKind,
  type RichMark,
} from '~/utils/memo/richtext'

/**
 * Kertas tulis jurnal dengan format (tebal, miring, coret, stabilo, daftar). Tampilannya sama dengan
 * kertas bergaris lama; isinya tetap disimpan sebagai markdown jurnal (`utils/memo/richtext.ts`).
 * Dimuat lazy karena editornya (Tiptap/ProseMirror) berat dan hanya dipakai di halaman Journal.
 */
const {
  paper = 'krem',
  placeholder = '',
  label,
  describedBy = undefined,
  maxlength,
  mentionLabel,
} = defineProps<{
  paper?: MemoPaperName
  placeholder?: string
  label: string
  describedBy?: string
  /** Batas panjang markdown yang disimpan; ketikan yang melewatinya dibatalkan. */
  maxlength: number
  /** Judul chip mention (`@jadwal` / `#goal`) di dalam editor. */
  mentionLabel: (kind: MentionKind, id: string) => string
}>()

const model = defineModel<string>({ default: '' })

/** Token mention `@[id]` / `#[id]` sebagai chip di dalam kertas (atom: dihapus utuh, tidak diedit). */
const Mention = Node.create({
  name: 'mention',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: false,
  addAttributes: () => ({ kind: { default: 'schedule' }, id: { default: '' } }),
  parseHTML: () => [
    {
      tag: 'span[data-mention]',
      getAttrs: (element) => ({
        kind: element.getAttribute('data-kind') === 'goal' ? 'goal' : 'schedule',
        id: element.getAttribute('data-id') ?? '',
      }),
    },
  ],
  renderHTML: ({ node, HTMLAttributes }) => {
    const kind: MentionKind = node.attrs.kind === 'goal' ? 'goal' : 'schedule'
    const id = String(node.attrs.id)
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-mention': '',
        'data-kind': kind,
        'data-id': id,
        class: 'mention-chip',
      }),
      `${kind === 'goal' ? '#' : '@'}${mentionLabel(kind, id)}`,
    ]
  },
})

/** Warna stabilo terakhir yang dipilih; tombol stabilo & Ctrl+Shift+H memakai warna ini. */
let lastHighlight: HighlightColor = DEFAULT_HIGHLIGHT

/** Markdown terakhir yang dikirim/diterima editor; perubahan dari luar (mention) memuat ulang isi. */
let lastMarkdown = model.value

const editor = useEditor({
  content: parseRich(model.value) as JSONContent,
  extensions: [
    StarterKit.configure({
      // Kertas bergaris: satu baris = satu paragraf, jadi elemen yang mengubah tinggi baris atau
      // tidak punya padanan di markdown jurnal dimatikan.
      heading: false,
      blockquote: false,
      codeBlock: false,
      code: false,
      horizontalRule: false,
      hardBreak: false,
      link: false,
      underline: false,
    }),
    Highlight.configure({ multicolor: true }),
    Placeholder.configure({ placeholder }),
    Mention,
  ],
  editorProps: {
    attributes: {
      class: 'pm',
      role: 'textbox',
      'aria-multiline': 'true',
      'aria-label': label,
      ...(describedBy ? { 'aria-describedby': describedBy } : {}),
    },
  },
  onUpdate: ({ editor: current }) => {
    const markdown = serializeRich(current.getJSON() as RichDoc)
    if (markdown.length > maxlength) {
      current.commands.undo()
      return
    }
    lastMarkdown = markdown
    model.value = markdown
  },
})

watch(model, (next) => {
  const current = editor.value
  if (!current || next === lastMarkdown) return
  lastMarkdown = next
  const hadFocus = current.isFocused
  current.commands.setContent(parseRich(next) as JSONContent, { emitUpdate: false })
  // Mention dipilih dari daftar saran (yang selalu di akhir tulisan): lanjut mengetik di akhir.
  if (hadFocus) current.commands.focus('end')
})

const style = computed(() => {
  const stock = memoPapers[paper] ?? memoPapers.krem
  return {
    '--memo-bg': stock.bg,
    '--memo-line': stock.line,
    '--memo-margin': stock.margin,
    '--memo-ink': stock.ink,
  }
})

defineExpose({
  isActive: (name: RichMark | RichListKind): boolean => editor.value?.isActive(name) ?? false,
  toggleMark(mark: RichMark): void {
    const chain = editor.value?.chain().focus()
    if (!chain) return
    const commands = {
      bold: () => chain.toggleBold(),
      italic: () => chain.toggleItalic(),
      strike: () => chain.toggleStrike(),
      // Kuning = stabilo tanpa atribut warna (ditulis `==teks==`).
      highlight: () =>
        lastHighlight === DEFAULT_HIGHLIGHT
          ? chain.toggleHighlight()
          : chain.toggleHighlight({ color: lastHighlight }),
    }
    commands[mark]().run()
  },
  highlightColor(): HighlightColor | null {
    const current = editor.value
    if (!current?.isActive('highlight')) return null
    const color: unknown = current.getAttributes('highlight').color
    return isHighlightColor(color) ? color : DEFAULT_HIGHLIGHT
  },
  setHighlight(color: HighlightColor): void {
    lastHighlight = color
    // Lepas stabilo lama dulu: `setMark` menggabung atribut, jadi warna lama bisa tertinggal.
    const chain = editor.value?.chain().focus().unsetHighlight()
    if (!chain) return
    ;(color === DEFAULT_HIGHLIGHT ? chain.setHighlight() : chain.setHighlight({ color })).run()
  },
  toggleList(kind: RichListKind): void {
    const chain = editor.value?.chain().focus()
    if (!chain) return
    ;(kind === 'bulletList' ? chain.toggleBulletList() : chain.toggleOrderedList()).run()
  },
})
</script>

<template>
  <EditorContent class="paper" :editor="editor" :style="style" />
</template>

<style scoped>
/* Sama dengan kertas bergaris `MemoPaper`: tinggi baris 34px mengikuti garis kertas. */
.paper {
  display: flex;
  flex-direction: column;
  width: 100%;
  min-height: 308px;
  border-bottom: var(--border-thin) dashed var(--mline);
  color: var(--memo-ink);
  font-family: var(--font-hand);
  /* Patrick Hand hanya punya weight 400; isi mewarisi `--fw-body` (700) → faux-bold. */
  font-weight: 400;
  font-size: var(--fs-hand-21);
  line-height: 34px;
  padding: var(--space-6) var(--space-28) 0 var(--space-64);
  background-color: var(--memo-bg);
  background-image:
    linear-gradient(
      90deg,
      transparent 48px,
      var(--memo-margin) 48px,
      var(--memo-margin) 50px,
      transparent 50px
    ),
    repeating-linear-gradient(
      transparent 0,
      transparent 33px,
      var(--memo-line) 33px,
      var(--memo-line) 34px
    );
  background-position: 0 6px;
}

.paper :deep(.pm) {
  flex: 1;
  outline: none;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.paper :deep(.pm p) {
  margin: 0;
}

.paper :deep(.pm ul),
.paper :deep(.pm ol) {
  margin: 0;
  padding-left: 1.4em;
}

/* Tebal: font tulisan tangan hanya punya satu weight, jadi tebal = tinta lebih pekat + garis tipis. */
.paper :deep(.pm strong) {
  font-weight: 400;
  text-shadow:
    0.4px 0 0 currentcolor,
    -0.4px 0 0 currentcolor;
}

.paper :deep(.pm mark) {
  padding: 0 2px;
  border-radius: 3px;
  background: var(--memo-hl-kuning);
  color: inherit;
}

.paper :deep(.pm mark[data-color='hijau']) {
  background: var(--memo-hl-hijau);
}

.paper :deep(.pm mark[data-color='pink']) {
  background: var(--memo-hl-pink);
}

.paper :deep(.pm mark[data-color='biru']) {
  background: var(--memo-hl-biru);
}

.paper :deep(.pm .mention-chip) {
  padding: 0 var(--space-6);
  border-radius: var(--radius-pill);
  background: var(--alt);
  color: var(--deep);
}

.paper :deep(.pm p.is-editor-empty:first-child::before) {
  content: attr(data-placeholder);
  float: left;
  height: 0;
  color: var(--mute-3);
  pointer-events: none;
}

@media (max-width: 599px) {
  .paper {
    padding-left: var(--space-56);
    padding-right: var(--space-16);
  }
}
</style>
