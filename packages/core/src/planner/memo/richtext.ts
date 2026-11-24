// Format tulisan jurnal (PRD F8 "markdown"): markdown berbasis BARIS supaya teks lama (satu baris =
// satu paragraf, tanpa format) tetap terbaca apa adanya tanpa migrasi. Fungsi murni.
//
// Yang didukung: **tebal**, *miring*, ~~coret~~, ==stabilo==, daftar `- ` / `1. `, dan token mention
// `@[id]` (jadwal) / `#[id]` (goal). Karakter penanda yang diketik sebagai teks biasa di-escape `\`.
// Dokumen memakai bentuk JSON ProseMirror/Tiptap supaya editor bisa memuatnya langsung.

import { layoutParts, parseLayout } from './layout.ts'

export const RICH_MARKS = ['bold', 'italic', 'strike', 'highlight'] as const
export type RichMark = (typeof RICH_MARKS)[number]

/** Warna stabilo. `kuning` = bawaan, ditulis `==teks==`; warna lain `=={hijau}teks==`. */
export const HIGHLIGHT_COLORS = ['kuning', 'hijau', 'pink', 'biru'] as const
export type HighlightColor = (typeof HIGHLIGHT_COLORS)[number]
export const DEFAULT_HIGHLIGHT: HighlightColor = 'kuning'

export type MentionKind = 'schedule' | 'goal'

/** `attrs.color` hanya untuk stabilo selain kuning (bentuk mark Tiptap `highlight` multiwarna). */
export type RichMarkNode = { type: RichMark; attrs?: { color?: string | null } }

export type RichInline =
  | { type: 'text'; text: string; marks?: RichMarkNode[] }
  | { type: 'mention'; attrs: { kind: MentionKind; id: string } }

export type RichParagraph = { type: 'paragraph'; content?: RichInline[] }
export type RichListItem = { type: 'listItem'; content: RichParagraph[] }
export type RichListKind = 'bulletList' | 'orderedList'
export type RichList = { type: RichListKind; content: RichListItem[] }
export type RichBlock = RichParagraph | RichList
export type RichDoc = { type: 'doc'; content: RichBlock[] }

/** Kertas yang bisa diberi format dari toolbar (diekspos `MemoRichPaper`). */
export interface RichFormatTarget {
  isActive: (name: RichMark | RichListKind) => boolean
  toggleMark: (mark: RichMark) => void
  toggleList: (kind: RichListKind) => void
  /** Warna stabilo di posisi kursor; `null` kalau teks di situ tidak distabilo. */
  highlightColor: () => HighlightColor | null
  /** Stabilo seleksi dengan warna ini (mengganti warna lama). */
  setHighlight: (color: HighlightColor) => void
}

export function isHighlightColor(value: unknown): value is HighlightColor {
  return typeof value === 'string' && (HIGHLIGHT_COLORS as readonly string[]).includes(value)
}

/**
 * Kunci mark internal: jenis mark, ditambah warna untuk stabilo non-bawaan (`highlight:hijau`).
 * Stabilo beda warna = mark berbeda, jadi penandanya ditutup lalu dibuka lagi.
 */
type MarkKey = string

const OPEN: Record<RichMark, string> = {
  bold: '**',
  italic: '*',
  strike: '~~',
  highlight: '==',
}

function colorOf(mark: RichMarkNode): HighlightColor | null {
  const color = mark.attrs?.color
  return mark.type === 'highlight' && isHighlightColor(color) && color !== DEFAULT_HIGHLIGHT
    ? color
    : null
}

function keyOf(mark: RichMarkNode): MarkKey {
  const color = colorOf(mark)
  return color ? `highlight:${color}` : mark.type
}

function typeOfKey(key: MarkKey): RichMark {
  return (key.split(':')[0] ?? key) as RichMark
}

function markOfKey(key: MarkKey): RichMarkNode {
  const [type, color] = key.split(':')
  return color ? { type: 'highlight', attrs: { color } } : { type: type as RichMark }
}

function openMarker(key: MarkKey): string {
  const [type, color] = key.split(':')
  return color ? `=={${color}}` : OPEN[type as RichMark]
}

/** Urutan tetap (luar ke dalam) supaya hasil serialisasi stabil. */
function rank(key: MarkKey): number {
  const [type, color] = key.split(':')
  const base = RICH_MARKS.indexOf(type as RichMark) * 10
  return base + (color ? HIGHLIGHT_COLORS.indexOf(color as HighlightColor) : 0)
}

const byRank = (a: MarkKey, b: MarkKey): number => rank(a) - rank(b)

const BULLET = /^- (.*)$/
const ORDERED = /^\d{1,4}\. (.*)$/
const MENTION = /^([@#])\[([\w-]{1,64})\]/
const HIGHLIGHT_COLOR_TAG = new RegExp(`^\\{(${HIGHLIGHT_COLORS.join('|')})\\}`)
/**
 * Awal baris yang harus di-escape supaya teks biasa tidak terbaca sebagai daftar, atau sebagai pagar
 * tata letak (`:::`, lihat `layout.ts`).
 */
const LIST_LIKE = /^(- |\d{1,4}\. |:::)/

// ---- Parse: markdown -> dokumen -------------------------------------------------------

type Token =
  | { kind: 'text'; text: string }
  | { kind: 'marker'; mark: RichMark; key: MarkKey; raw: string }
  | { kind: 'mention'; mention: MentionKind; id: string }

function tokenize(line: string): Token[] {
  const tokens: Token[] = []
  let text = ''
  const flush = (): void => {
    if (text) tokens.push({ kind: 'text', text })
    text = ''
  }

  let index = 0
  while (index < line.length) {
    const char = line[index] ?? ''
    const next = line[index + 1] ?? ''
    if (char === '\\' && next !== '') {
      text += next
      index += 2
      continue
    }
    const mention = MENTION.exec(line.slice(index))
    if (mention) {
      flush()
      tokens.push({
        kind: 'mention',
        mention: mention[1] === '#' ? 'goal' : 'schedule',
        id: mention[2] ?? '',
      })
      index += mention[0].length
      continue
    }
    const pair = char + next
    const mark: RichMark | null =
      pair === '**'
        ? 'bold'
        : pair === '~~'
          ? 'strike'
          : pair === '=='
            ? 'highlight'
            : char === '*'
              ? 'italic'
              : null
    if (mark !== null) {
      flush()
      let raw = OPEN[mark]
      let key: MarkKey = mark
      if (mark === 'highlight') {
        const tag = HIGHLIGHT_COLOR_TAG.exec(line.slice(index + raw.length))
        if (tag) {
          raw += tag[0]
          key = keyOf({ type: 'highlight', attrs: { color: tag[1] ?? null } })
        }
      }
      tokens.push({ kind: 'marker', mark, key, raw })
      index += raw.length
      continue
    }
    text += char
    index += 1
  }
  flush()
  return tokens
}

/** Penanda yang tidak punya pasangan dikembalikan jadi teks biasa (tulisan tidak pernah hilang). */
function pairMarkers(tokens: Token[]): Set<number> {
  const paired = new Set<number>()
  const open: number[] = []
  tokens.forEach((token, index) => {
    if (token.kind !== 'marker') return
    const match = open.findLastIndex((at) => {
      const opener = tokens[at]
      return opener?.kind === 'marker' && opener.mark === token.mark
    })
    if (match === -1) {
      open.push(index)
      return
    }
    paired.add(open[match] ?? -1)
    paired.add(index)
    open.splice(match, 1)
  })
  return paired
}

function pushText(content: RichInline[], text: string, active: ReadonlySet<MarkKey>): void {
  const keys = [...active].sort(byRank)
  const last = content.at(-1)
  if (last?.type === 'text' && (last.marks ?? []).map(keyOf).join() === keys.join()) {
    last.text += text
    return
  }
  content.push(
    keys.length ? { type: 'text', text, marks: keys.map(markOfKey) } : { type: 'text', text },
  )
}

export function parseInline(line: string): RichInline[] {
  const tokens = tokenize(line)
  const paired = pairMarkers(tokens)
  const active = new Set<MarkKey>()
  const content: RichInline[] = []

  tokens.forEach((token, index) => {
    if (token.kind === 'mention') {
      content.push({ type: 'mention', attrs: { kind: token.mention, id: token.id } })
    } else if (token.kind === 'text') {
      pushText(content, token.text, active)
    } else if (paired.has(index)) {
      // Penutup `==` tidak membawa warna: tutup stabilo apa pun yang sedang terbuka.
      const opened = [...active].find((key) => typeOfKey(key) === token.mark)
      if (opened === undefined) active.add(token.key)
      else active.delete(opened)
    } else {
      pushText(content, token.raw, active)
    }
  })
  return content
}

function paragraph(line: string): RichParagraph {
  const content = parseInline(line)
  return content.length ? { type: 'paragraph', content } : { type: 'paragraph' }
}

export function parseRich(markdown: string): RichDoc {
  const blocks: RichBlock[] = []
  for (const line of markdown.split('\n')) {
    const bullet = BULLET.exec(line)
    const ordered = bullet ? null : ORDERED.exec(line)
    const listType = bullet ? 'bulletList' : ordered ? 'orderedList' : null
    if (listType === null) {
      blocks.push(paragraph(line))
      continue
    }
    const item: RichListItem = {
      type: 'listItem',
      content: [paragraph((bullet ?? ordered)?.[1] ?? '')],
    }
    const last = blocks.at(-1)
    if (last?.type === listType) last.content.push(item)
    else blocks.push({ type: listType, content: [item] })
  }
  return { type: 'doc', content: blocks.length ? blocks : [{ type: 'paragraph' }] }
}

// ---- Serialize: dokumen -> markdown ---------------------------------------------------

function escapeText(text: string): string {
  return text.replace(/[\\*]|~~|==|[@#](?=\[)/g, (match) =>
    match.length === 2 ? `\\${match[0]}\\${match[1]}` : `\\${match}`,
  )
}

function keysOf(node: RichInline): MarkKey[] {
  return node.type === 'text' ? (node.marks ?? []).map(keyOf).sort(byRank) : []
}

export function serializeInline(content: readonly RichInline[] = []): string {
  let out = ''
  const open: MarkKey[] = []

  const transition = (next: readonly MarkKey[]): void => {
    // Tutup dari dalam sampai semua penanda yang tidak dipakai lagi tertutup, lalu buka ulang yang
    // masih dipakai + yang baru (urutan tetap supaya hasilnya stabil).
    const firstStale = open.findIndex((key) => !next.includes(key))
    if (firstStale !== -1) {
      for (const key of open.splice(firstStale).reverse()) out += OPEN[typeOfKey(key)]
    }
    for (const key of next) {
      if (!open.includes(key)) {
        out += openMarker(key)
        open.push(key)
      }
    }
  }

  for (const node of content) {
    transition(keysOf(node))
    if (node.type === 'mention') {
      out += `${node.attrs.kind === 'goal' ? '#' : '@'}[${node.attrs.id}]`
    } else {
      out += escapeText(node.text)
    }
  }
  transition([])
  return out
}

function serializeParagraph(block: RichParagraph): string {
  const line = serializeInline(block.content)
  return LIST_LIKE.test(line) ? `\\${line}` : line
}

export function serializeRich(doc: RichDoc): string {
  const lines: string[] = []
  for (const block of doc.content) {
    if (block.type === 'paragraph') {
      lines.push(serializeParagraph(block))
      continue
    }
    block.content.forEach((item, index) => {
      const prefix = block.type === 'bulletList' ? '- ' : `${index + 1}. `
      const [first, ...rest] = item.content
      lines.push(prefix + serializeInline(first?.content))
      // Paragraf tambahan di dalam item (jarang) tetap disimpan sebagai baris biasa.
      for (const extra of rest) lines.push(serializeParagraph(extra))
    })
  }
  return lines.join('\n')
}

// ---- Teks polos: pencarian, pratinjau, jumlah kata -------------------------------------

/**
 * Markdown jurnal -> teks tanpa penanda format; token mention dipertahankan untuk `plainText`.
 * Pagar tata letak dibuang: isi kolom dan kotak bebas ikut sebagai baris biasa.
 */
export function richToPlain(markdown: string): string {
  return layoutParts(parseLayout(markdown)).map(partToPlain).join('\n')
}

function partToPlain(markdown: string): string {
  return parseRich(markdown)
    .content.flatMap((block) =>
      block.type === 'paragraph'
        ? [block.content]
        : block.content.map((item) => item.content[0]?.content),
    )
    .map((content) =>
      (content ?? [])
        .map((node) =>
          node.type === 'text'
            ? node.text
            : `${node.attrs.kind === 'goal' ? '#' : '@'}[${node.attrs.id}]`,
        )
        .join(''),
    )
    .join('\n')
}
