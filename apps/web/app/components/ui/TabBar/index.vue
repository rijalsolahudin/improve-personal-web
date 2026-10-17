<script lang="ts">
import type { IconName } from '~/utils/icons'

export interface TabBarItem {
  key: string
  label: string
  glyph: string
  /** Ikon garis; kalau diisi menggantikan glyph. */
  icon?: IconName
  color: string
  /** Kalau diisi, tab jadi NuxtLink. */
  to?: string
}
</script>

<script setup lang="ts">
const { items, active } = defineProps<{
  items: readonly TabBarItem[]
  active: string
}>()

const emit = defineEmits<{ change: [key: string] }>()

const half = computed(() => Math.ceil(items.length / 2))
const left = computed(() => items.slice(0, half.value))
const right = computed(() => items.slice(half.value))
const gridStyle = computed(() => ({
  gridTemplateColumns: `repeat(${items.length + 1}, minmax(0, 1fr))`,
}))

function onTab(item: TabBarItem): void {
  if (!item.to) emit('change', item.key)
}
</script>

<template>
  <nav class="tab-bar" :style="gridStyle">
    <component
      :is="item.to ? 'NuxtLink' : 'button'"
      v-for="item in left"
      :key="item.key"
      :to="item.to"
      :type="item.to ? undefined : 'button'"
      class="tab"
      :class="{ on: item.key === active }"
      :style="{ '--tab-color': `var(${item.color})` }"
      @click="onTab(item)"
    >
      <span class="tab-icon" aria-hidden="true">
        <Icon v-if="item.icon" :name="item.icon" :size="18" />
        <template v-else>{{ item.glyph }}</template>
      </span>
      <span class="tab-label">{{ item.label }}</span>
    </component>

    <span class="center"><slot name="center" /></span>

    <component
      :is="item.to ? 'NuxtLink' : 'button'"
      v-for="item in right"
      :key="item.key"
      :to="item.to"
      :type="item.to ? undefined : 'button'"
      class="tab"
      :class="{ on: item.key === active }"
      :style="{ '--tab-color': `var(${item.color})` }"
      @click="onTab(item)"
    >
      <span class="tab-icon" aria-hidden="true">
        <Icon v-if="item.icon" :name="item.icon" :size="18" />
        <template v-else>{{ item.glyph }}</template>
      </span>
      <span class="tab-label">{{ item.label }}</span>
    </component>
  </nav>
</template>

<style scoped>
.tab-bar {
  position: fixed;
  left: 10px;
  right: 10px;
  bottom: 12px;
  z-index: 98;
  height: 70px;
  display: grid;
  align-items: center;
  padding: 0 4px;
  background: var(--paper);
  border: var(--border-thick) solid var(--outline);
  border-radius: calc(28px * var(--rk));
  box-shadow: var(--shadow-drop);
}

.center {
  display: flex;
  justify-content: center;
}

.tab {
  min-height: 56px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  padding: 0;
  border: none;
  background: none;
  color: var(--mute-2);
}

.tab:hover {
  color: var(--mute-2);
}

.tab-icon {
  width: 32px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-leaf-sm);
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: 14px;
  line-height: 1;
}

.tab-label {
  font-weight: var(--fw-strong);
  font-size: 11px;
}

.tab.on .tab-icon {
  background: var(--tab-color);
  color: var(--paper);
}

.tab.on .tab-label {
  color: var(--ink);
}
</style>
