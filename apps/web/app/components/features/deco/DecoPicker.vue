<script setup lang="ts">
import { ICON_PREFIX, baseSid } from '~/utils/deco'
import { STICKER_PACKS } from '~/utils/stickerCatalog'
import { findSticker, searchStickers, stickersInPack, type Sticker } from '~/utils/stickers'

const {
  title,
  current = null,
  clearLabel = null,
} = defineProps<{
  title: string
  current?: string | null
  /** Tombol lepas sticker (mis. "Hapus sampul"); null = tidak ditampilkan. */
  clearLabel?: string | null
}>()
const emit = defineEmits<{ choose: [sid: string]; clear: []; close: [] }>()

const RECENT_TAB = 'recent'
const SEARCH_DEBOUNCE_MS = 200
const VARIANTS = ['sticker', 'icon'] as const

const { t } = useI18n()
const { recent } = useDeco()
const titleId = useId()
const tab = ref(recent.value.length ? RECENT_TAB : (STICKER_PACKS[0]?.id ?? ''))
const query = ref('')
const debouncedQuery = ref('')
const variant = ref<(typeof VARIANTS)[number]>('sticker')

let timer: ReturnType<typeof setTimeout> | undefined
watch(query, (value) => {
  clearTimeout(timer)
  timer = setTimeout(() => (debouncedQuery.value = value), SEARCH_DEBOUNCE_MS)
})

const variantOptions = computed(() =>
  VARIANTS.map((value) => ({ value, label: t(`deco.picker.${value}`) })),
)

const tabs = computed(() => [
  { id: RECENT_TAB, name: 'deco.picker.recent' },
  ...STICKER_PACKS.map((pack) => ({ id: pack.id, name: pack.name })),
])

const list = computed<Sticker[]>(() => {
  if (debouncedQuery.value.trim()) return searchStickers(debouncedQuery.value)
  if (tab.value === RECENT_TAB) {
    return recent.value.map(findSticker).filter((sticker): sticker is Sticker => sticker !== null)
  }
  return stickersInPack(tab.value)
})

const sidOf = (sticker: Sticker): string =>
  variant.value === 'icon' ? `${ICON_PREFIX}${sticker.id}` : sticker.id
const currentBase = computed(() => (current ? baseSid(current) : null))

function pickTab(id: string): void {
  tab.value = id
  query.value = ''
  debouncedQuery.value = ''
}

onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <Modal
    open
    is-flush
    is-dismissible
    width="660px"
    :labelled-by="titleId"
    data-deco-ui
    @close="emit('close')"
  >
    <div class="top">
      <div class="title-row">
        <h2 :id="titleId" class="title">{{ title }}</h2>
        <Segmented
          v-model="variant"
          class="variants"
          size="sm"
          :options="variantOptions"
          :label="$t('deco.picker.variant')"
        />
        <IconButton
          tone="plain"
          :size="40"
          :radius="14"
          class="close"
          :title="$t('common.close')"
          @click="emit('close')"
        >
          ×
        </IconButton>
      </div>
      <Input
        v-model="query"
        shape="pill"
        data-autofocus
        type="search"
        maxlength="40"
        :placeholder="$t('deco.picker.search')"
        :aria-label="$t('deco.picker.search')"
      />
      <div class="tabs" role="tablist">
        <button
          v-for="item in tabs"
          :key="item.id"
          type="button"
          role="tab"
          :aria-selected="!debouncedQuery.trim() && tab === item.id"
          :class="{ on: !debouncedQuery.trim() && tab === item.id }"
          @click="pickTab(item.id)"
        >
          {{ item.id === RECENT_TAB ? $t(item.name) : item.name }}
        </button>
      </div>
    </div>
    <div class="grid">
      <button
        v-for="sticker in list"
        :key="sticker.id"
        type="button"
        class="cell"
        :class="{ on: currentBase === sticker.id }"
        @click="emit('choose', sidOf(sticker))"
      >
        <DecoStickerArt :sid="sidOf(sticker)" :size="52" />
        <span class="name">{{ sticker.name }}</span>
      </button>
    </div>
    <p v-if="!list.length" class="empty">
      {{
        debouncedQuery.trim()
          ? $t('deco.picker.notFound', { q: debouncedQuery.trim() })
          : $t('deco.picker.noRecent')
      }}
    </p>
    <div v-if="clearLabel" class="footer">
      <Button variant="dashed" size="sm" @click="emit('clear')">{{ clearLabel }}</Button>
    </div>
  </Modal>
</template>

<style scoped>
.top {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 22px 24px 12px;
}

.title-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}

.title {
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: 24px;
  white-space: nowrap;
}

.variants {
  --seg-active: var(--ink);
}

.tabs button {
  border: none;
  border-radius: var(--radius-pill);
  background: transparent;
  font-weight: var(--fw-strong);
  color: #7a6b58;
  white-space: nowrap;
}

.close {
  margin-left: auto;
}

.tabs {
  display: flex;
  gap: 4px;
  overflow-x: auto;
  padding-bottom: 2px;
}

.tabs button {
  flex-shrink: 0;
  padding: 8px 14px;
  font-size: 14px;
}

.tabs .on {
  background: var(--accent);
  color: var(--paper);
}

.grid {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(86px, 1fr));
  align-content: start;
  gap: 8px;
  padding: 4px 24px 18px;
}

.cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 4px 8px;
  border: var(--border) solid transparent;
  border-radius: var(--radius-row);
  background: #fbf3e6;
  transition: transform var(--dur) var(--ease);
}

.cell:hover {
  transform: rotate(calc(-3deg * var(--bev))) scale(1.04);
}

.cell.on {
  border-color: var(--outline);
  background: var(--soft);
}

.name {
  font-weight: var(--fw-strong);
  font-size: 12px;
  line-height: 1.2;
  text-align: center;
}

.footer {
  padding: 12px 24px 18px;
  border-top: var(--border-thin) dashed var(--line);
}

.empty {
  padding: 0 24px 22px;
  text-align: center;
  font-weight: var(--fw-body);
  color: var(--mute);
}
</style>
