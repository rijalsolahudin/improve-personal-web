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

const { recent } = useDeco()
const panel = useTemplateRef<HTMLElement>('panel')
const tab = ref(recent.value.length ? RECENT_TAB : (STICKER_PACKS[0]?.id ?? ''))
const query = ref('')
const debouncedQuery = ref('')
const variant = ref<(typeof VARIANTS)[number]>('sticker')

let timer: ReturnType<typeof setTimeout> | undefined
watch(query, (value) => {
  clearTimeout(timer)
  timer = setTimeout(() => (debouncedQuery.value = value), SEARCH_DEBOUNCE_MS)
})

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

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') emit('close')
}

onMounted(() => {
  panel.value?.querySelector<HTMLInputElement>('input')?.focus()
  window.addEventListener('keydown', onKeydown)
})
onBeforeUnmount(() => {
  clearTimeout(timer)
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div class="scrim" data-deco-ui @click.self="emit('close')">
    <div ref="panel" class="panel" role="dialog" aria-modal="true" :aria-label="title">
      <div class="top">
        <div class="title-row">
          <h2 class="title">{{ title }}</h2>
          <div class="variants" role="group" :aria-label="$t('deco.picker.variant')">
            <button
              v-for="option in VARIANTS"
              :key="option"
              type="button"
              :class="{ on: variant === option }"
              :aria-pressed="variant === option"
              @click="variant = option"
            >
              {{ $t(`deco.picker.${option}`) }}
            </button>
          </div>
          <button
            type="button"
            class="close"
            :aria-label="$t('common.close')"
            @click="emit('close')"
          >
            ×
          </button>
        </div>
        <input
          v-model="query"
          class="search"
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
        <button type="button" class="clear" @click="emit('clear')">{{ clearLabel }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.scrim {
  position: fixed;
  inset: 0;
  z-index: 110;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgb(47 42 36 / 0.4);
}

.panel {
  width: 100%;
  max-width: 660px;
  max-height: calc(100vh - 48px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 3px solid var(--ink);
  border-radius: 32px;
  background: var(--paper);
  box-shadow: 0 10px 0 rgb(47 42 36 / 0.15);
}

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
  font-weight: 800;
  font-size: 24px;
  white-space: nowrap;
}

.variants {
  display: flex;
  gap: 2px;
  padding: 3px;
  border-radius: var(--radius-pill);
  background: #f2e4cc;
}

.variants button,
.tabs button {
  border: none;
  border-radius: var(--radius-pill);
  background: transparent;
  font-weight: 800;
  color: #7a6b58;
  white-space: nowrap;
}

.variants button {
  padding: 5px 12px;
  font-size: 13px;
}

.variants .on {
  background: var(--ink);
  color: var(--paper);
}

.close {
  width: 40px;
  height: 40px;
  margin-left: auto;
  border: none;
  border-radius: 14px;
  background: var(--chip);
  font-weight: 800;
  font-size: 18px;
}

.search {
  width: 100%;
  padding: 11px 16px;
  border: 2.5px solid var(--ink);
  border-radius: var(--radius-pill);
  background: var(--paper);
  font-weight: 700;
  font-size: 15px;
  outline: none;
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
  border: 2.5px solid transparent;
  border-radius: 18px;
  background: #fbf3e6;
  transition: transform var(--dur) var(--ease);
}

.cell:hover {
  transform: rotate(-3deg) scale(1.04);
}

.cell.on {
  border-color: var(--ink);
  background: var(--soft);
}

.name {
  font-weight: 800;
  font-size: 12px;
  line-height: 1.2;
  text-align: center;
}

.footer {
  padding: 12px 24px 18px;
  border-top: 2px dashed var(--line);
}

.clear {
  height: 40px;
  padding: 0 16px;
  border: 2px solid var(--dash);
  border-radius: var(--radius-pill);
  background: none;
  color: var(--ink-2);
  font-weight: 800;
  font-size: 14px;
}

.empty {
  padding: 0 24px 22px;
  text-align: center;
  font-weight: 700;
  color: var(--mute);
}
</style>
