<script setup lang="ts">
const { isMenuOpen } = defineProps<{ isMenuOpen: boolean }>()
const emit = defineEmits<{ 'toggle-menu': [] }>()

const route = useRoute()
const tabs = MOBILE_TAB_IDS.map(getFeature)
const isOnTab = computed(() => tabs.some((tab) => tab.path === route.path))
const isMenuActive = computed(() => isMenuOpen || !isOnTab.value)
</script>

<template>
  <nav class="tab-bar" :aria-label="$t('shell.navLabel')">
    <NuxtLink
      v-for="tab in tabs"
      :key="tab.id"
      :to="tab.path"
      class="tab"
      :style="{ '--tab-color': `var(${tab.color})` }"
      :aria-current="!isMenuOpen && route.path === tab.path ? 'page' : undefined"
    >
      <span class="tab-icon" aria-hidden="true">{{ tab.glyph }}</span>
      <span class="tab-label">{{ $t(`feature.${tab.id}.tab`) }}</span>
    </NuxtLink>
    <button
      type="button"
      class="tab"
      :class="{ 'menu-active': isMenuActive }"
      :aria-expanded="isMenuOpen"
      aria-controls="shell-menu"
      @click="emit('toggle-menu')"
    >
      <span class="tab-icon menu-icon" aria-hidden="true">⋯</span>
      <span class="tab-label">{{ $t('shell.menu') }}</span>
    </button>
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
  grid-template-columns: repeat(5, minmax(0, 1fr));
  align-items: center;
  padding: 0 4px;
  background: var(--paper);
  border: var(--border-thick) solid var(--ink);
  border-radius: 28px;
  box-shadow: var(--shadow-drop);
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
  font-weight: 800;
  font-size: 14px;
  line-height: 1;
}

.menu-icon {
  font-size: 16px;
}

.tab-label {
  font-weight: 800;
  font-size: 11px;
}

.tab[aria-current='page'] .tab-icon {
  background: var(--tab-color);
  color: var(--paper);
}

.tab[aria-current='page'] .tab-label {
  color: var(--ink);
}

.menu-active .tab-icon {
  background: var(--accent);
  color: var(--paper);
}
</style>
