<script setup lang="ts">
import type { StickyFrame } from '~/composables/useDecoAnchors'
import {
  DECO_BUCKETS,
  DECO_DEFAULT_SIZE,
  boxOnAnchor,
  placementOnAnchor,
  tidyIntoWidth,
  type AnchorRect,
  type DecoBox,
  type DecoBucket,
  type DecoItem,
} from '~/utils/deco'

// Di-lazy-load dari layout: katalog sticker cuma diunduh kalau ada hiasan / mode hias aktif.
const ADD_OFFSET = { x: 120, y: -60 }
const ADD_JITTER = 160
const ADD_MAX_TILT = 24
const TOAST_MS = 2800

const { t } = useI18n()
const deco = useDeco()
const { scope } = useDecoScope()
const layerEl = useTemplateRef<HTMLElement>('layer')
const host = computed(() => layerEl.value?.parentElement ?? null)
const { anchors, frames, anchorAt } = useDecoAnchors(host)
const { draft, start } = useDecoDrag(commit)

const picker = ref<{ swapId: string | null } | null>(null)
/** Anchor di bawah titik tengah sticker yang sedang digeser (termasuk halaman). */
const dragAnchor = ref<string | null>(null)
const toast = ref<string | null>(null)
const skippedCopy = useState<Record<string, boolean>>('deco-copy-skip', () => ({}))

const scopeItems = computed(() => deco.itemsIn(scope.value))
const placed = computed(() =>
  scopeItems.value.flatMap((item) => {
    const frame = frames.value[item.anchor] ?? null
    if (draft.value?.id === item.id) return [{ item, box: draft.value.box, frame }]
    const anchor = anchors.value[item.anchor]
    return anchor ? [{ item, box: boxOnAnchor(item, anchor), frame }] : []
  }),
)

/** Box dalam koordinat kontainer sticky (sticker di kartu sticky dirender di dalam kartunya). */
function boxIn(box: DecoBox, frame: StickyFrame | null): DecoBox {
  return frame ? { ...box, left: box.left - frame.x, top: box.top - frame.y } : box
}
const hiddenCount = computed(() => scopeItems.value.length - placed.value.length)
const scopeKey = computed(() => `${scope.value.page}|${scope.value.bucket}`)
const copySources = computed<DecoBucket[]>(() => {
  if (scopeItems.value.length || skippedCopy.value[scopeKey.value]) return []
  return DECO_BUCKETS.filter(
    (bucket) =>
      bucket !== scope.value.bucket && deco.itemsIn({ page: scope.value.page, bucket }).length,
  )
})

/** Titik tengah box di layar (koordinat viewport). */
function screenCenter(box: DecoBox): { x: number; y: number } {
  const origin = host.value?.getBoundingClientRect()
  return {
    x: (origin?.left ?? 0) + box.left + box.size / 2,
    y: (origin?.top ?? 0) + box.top + box.size / 2,
  }
}

function placement(box: DecoBox): Pick<DecoItem, 'anchor' | 'px' | 'py' | 'w' | 'rot'> | null {
  const { x, y } = screenCenter(box)
  const anchor = anchorAt(x, y)
  const rect = anchor ? anchors.value[anchor] : undefined
  return anchor && rect ? { anchor, ...placementOnAnchor(box, rect) } : null
}

function commit(id: string, box: DecoBox): void {
  dragAnchor.value = null
  const next = placement(box)
  if (next) deco.patch(id, next)
}

// Saat digeser, catat tempelan yang bakal dipakai (kartu di bawah titik tengah, atau halaman).
watch(draft, (value) => {
  if (!value) return
  const { x, y } = screenCenter(value.box)
  dragAnchor.value = anchorAt(x, y)
})

/** Mode hias: semua kartu yang bisa ditempeli diberi garis putus-putus tipis. */
const cardZones = computed(() =>
  deco.isEditing.value
    ? Object.entries(anchors.value).filter(([, rect]) => rect.kind !== 'page')
    : [],
)

/** Tempelan sticker aktif (yang digeser, atau yang dipilih): kartunya disorot + label di bawah sticker. */
const attachment = computed(() => {
  if (!deco.isEditing.value) return null
  const id = draft.value?.id ?? deco.selectedId.value
  const entry = placed.value.find(({ item }) => item.id === id)
  if (!entry) return null
  const anchorId = draft.value ? dragAnchor.value : entry.item.anchor
  const rect: AnchorRect | undefined = anchorId ? anchors.value[anchorId] : undefined
  if (!rect) return null
  const label = { page: 'deco.attachedPage', header: 'deco.attachedHeader' }[rect.kind]
  return {
    card: rect.kind === 'page' ? null : rect,
    box: entry.box,
    label: label ?? 'deco.attachedCard',
  }
})

const rectStyle = (rect: AnchorRect): Record<string, string> => ({
  left: `${rect.x}px`,
  top: `${rect.y}px`,
  width: `${rect.w}px`,
  height: `${rect.h}px`,
})

function nudge(item: DecoItem, box: DecoBox, change: Partial<DecoBox>): void {
  commit(item.id, { ...box, ...change })
}

function addSticker(sid: string): void {
  const jitter = (): number => (Math.random() - 0.5) * ADD_JITTER
  const half = DECO_DEFAULT_SIZE / 2
  const cx = Math.min(innerWidth - half, Math.max(half, innerWidth / 2 + ADD_OFFSET.x + jitter()))
  const cy = innerHeight / 2 + ADD_OFFSET.y + jitter()
  const origin = host.value?.getBoundingClientRect()
  const box: DecoBox = {
    size: DECO_DEFAULT_SIZE,
    left: cx - (origin?.left ?? 0) - half,
    top: cy - (origin?.top ?? 0) - half,
    rot: Math.round((Math.random() - 0.5) * ADD_MAX_TILT),
  }
  const where = placement(box)
  if (!where) return
  if (!deco.add({ sid, ...scope.value, ...where })) showToast(t('deco.full'))
}

function onChoose(sid: string): void {
  deco.rememberSticker(sid)
  const swapId = picker.value?.swapId
  picker.value = null
  if (swapId) deco.patch(swapId, { sid })
  else addSticker(sid)
}

function copyFrom(bucket: DecoBucket): void {
  const width = host.value?.offsetWidth ?? innerWidth
  deco.copyScope({ page: scope.value.page, bucket }, scope.value, (item) => {
    const anchor = anchors.value[item.anchor]
    return anchor ? tidyIntoWidth(item, anchor, width) : item
  })
  showToast(t('deco.copied'))
}

let toastTimer: ReturnType<typeof setTimeout> | undefined
function showToast(message: string): void {
  clearTimeout(toastTimer)
  toast.value = message
  toastTimer = setTimeout(() => (toast.value = null), TOAST_MS)
}

// Klik di luar sticker & UI hias → lepas pilihan.
function onWindowPointerDown(event: PointerEvent): void {
  const target = event.target as Element | null
  if (!target?.closest('[data-deco-item], [data-deco-ui]')) deco.select(null)
}
onMounted(() => window.addEventListener('pointerdown', onWindowPointerDown))
onBeforeUnmount(() => {
  clearTimeout(toastTimer)
  window.removeEventListener('pointerdown', onWindowPointerDown)
})

const pickerTitle = computed(() => t(picker.value?.swapId ? 'deco.picker.swap' : 'deco.picker.add'))
const pickerCurrent = computed(() => {
  const id = picker.value?.swapId
  return id ? (scopeItems.value.find((item) => item.id === id)?.sid ?? null) : null
})
</script>

<template>
  <div ref="layer" class="layer" data-deco-layer>
    <div v-for="[id, rect] in cardZones" :key="id" class="zone" :style="rectStyle(rect)" />
    <template v-if="attachment">
      <div v-if="attachment.card" class="highlight" :style="rectStyle(attachment.card)" />
      <span
        class="tag"
        :class="{ page: !attachment.card }"
        :style="{
          left: `${attachment.box.left + attachment.box.size / 2}px`,
          top: `${attachment.box.top + attachment.box.size}px`,
        }"
      >
        {{ $t(attachment.label) }}
      </span>
    </template>
    <Teleport
      v-for="{ item, box, frame } in placed"
      :key="item.id"
      :to="frame?.el ?? 'body'"
      :disabled="!frame"
    >
      <DecoStickerItem
        :sid="item.sid"
        :box="boxIn(box, frame)"
        :z="item.z"
        :is-editing="deco.isEditing.value"
        :is-selected="deco.isEditing.value && deco.selectedId.value === item.id"
        @drag="
          (event, mode) => {
            deco.select(item.id)
            start(event, item.id, mode, box)
          }
        "
        @nudge="(change) => nudge(item, box, change)"
        @remove="deco.remove(item.id)"
        @swap="picker = { swapId: item.id }"
        @front="deco.bringToFront(item.id)"
      />
    </Teleport>
  </div>

  <DecoTray
    v-if="deco.isEditing.value"
    :page="scope.page"
    :bucket="scope.bucket"
    :count="scopeItems.length"
    :hidden-count="hiddenCount"
    :copy-sources="copySources"
    :is-globally-hidden="deco.isHidden.value"
    @add="picker = { swapId: null }"
    @reset="deco.resetScope(scope)"
    @copy="copyFrom"
    @skip-copy="skippedCopy = { ...skippedCopy, [scopeKey]: true }"
  />

  <LazyDecoPicker
    v-if="picker"
    :title="pickerTitle"
    :current="pickerCurrent"
    @choose="onChoose"
    @close="picker = null"
  />

  <div v-if="toast" class="toast" role="status" data-deco-ui>{{ toast }}</div>
</template>

<style scoped>
/* Menutupi seluruh shell; tembus klik kecuali sticker saat mode hias. */
.layer {
  position: absolute;
  inset: 0;
  z-index: 40;
  overflow: hidden;
  pointer-events: none;
}

/* Kartu yang bisa ditempeli (mode hias). */
.zone {
  position: absolute;
  border: var(--border-thin) dashed var(--dash-2);
  border-radius: var(--radius-hero);
}

/* Kartu tempelan sticker aktif. */
.highlight {
  position: absolute;
  border: var(--border) solid var(--accent);
  border-radius: var(--radius-hero);
  background: rgb(255 255 255 / 0.18);
}

/* Label tempelan di bawah sticker (di luar tombol sudut), selalu kelihatan walau kartu tinggi. */
.tag {
  position: absolute;
  transform: translate(-50%, 30px);
  padding: 3px 10px;
  border-radius: var(--radius-pill);
  background: var(--accent);
  color: var(--paper);
  font-weight: var(--fw-strong);
  font-size: 11px;
  letter-spacing: 0.04em;
  white-space: nowrap;
}

.tag.page {
  background: var(--ink);
}

.toast {
  position: fixed;
  top: 24px;
  left: 50%;
  z-index: 120;
  transform: translateX(-50%);
  padding: 12px 20px;
  border-radius: var(--radius-pill);
  background: var(--ink);
  color: var(--paper);
  font-weight: var(--fw-strong);
  font-size: 14px;
  text-align: center;
  width: max-content;
  max-width: calc(100vw - 32px);
  box-shadow: calc(6px * var(--sx)) calc(6px * var(--sy)) calc(6px * var(--sbl))
    var(--shadow-color, rgb(47 42 36 / 0.2));
}
</style>
