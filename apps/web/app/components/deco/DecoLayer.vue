<script setup lang="ts">
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
const { anchors, anchorAt } = useDecoAnchors(host)
const { draft, start } = useDecoDrag(commit)

const picker = ref<{ swapId: string | null } | null>(null)
const highlight = ref<AnchorRect | null>(null)
const toast = ref<string | null>(null)
const skippedCopy = useState<Record<string, boolean>>('deco-copy-skip', () => ({}))

const scopeItems = computed(() => deco.itemsIn(scope.value))
const placed = computed(() =>
  scopeItems.value.flatMap((item) => {
    if (draft.value?.id === item.id) return [{ item, box: draft.value.box }]
    const anchor = anchors.value[item.anchor]
    return anchor ? [{ item, box: boxOnAnchor(item, anchor) }] : []
  }),
)
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
  highlight.value = null
  const next = placement(box)
  if (next) deco.patch(id, next)
}

// Saat digeser, sorot kartu yang bakal ditempeli (bukan area halaman).
watch(draft, (value) => {
  if (!value) return
  const { x, y } = screenCenter(value.box)
  const id = anchorAt(x, y)
  const rect = id ? anchors.value[id] : undefined
  highlight.value = rect && rect.kind !== 'page' ? rect : null
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
    <div
      v-if="highlight"
      class="highlight"
      :style="{
        left: `${highlight.x}px`,
        top: `${highlight.y}px`,
        width: `${highlight.w}px`,
        height: `${highlight.h}px`,
      }"
    />
    <DecoStickerItem
      v-for="{ item, box } in placed"
      :key="item.id"
      :sid="item.sid"
      :box="box"
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

.highlight {
  position: absolute;
  border: 2.5px dashed var(--accent);
  border-radius: 24px;
  background: rgb(255 255 255 / 0.2);
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
  font-weight: 800;
  font-size: 14px;
  text-align: center;
  width: max-content;
  max-width: calc(100vw - 32px);
  box-shadow: 0 6px 0 rgb(47 42 36 / 0.2);
}
</style>
