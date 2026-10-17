<script setup lang="ts">
const { isMenuOpen } = defineProps<{ isMenuOpen: boolean }>()
const emit = defineEmits<{ 'toggle-menu': [] }>()

const { t } = useI18n()
const route = useRoute()
const tabs = MOBILE_TAB_IDS.map(getFeature)
const isOnTab = computed(() => tabs.some((tab) => tab.path === route.path))
const isMenuActive = computed(() => isMenuOpen || !isOnTab.value)

const items = computed(() =>
  tabs.map((tab) => ({
    key: tab.id,
    label: t(`feature.${tab.id}.tab`),
    glyph: tab.glyph,
    icon: tab.icon,
    color: tab.color,
    to: tab.path,
  })),
)
const activeKey = computed(() =>
  isMenuOpen ? '' : (tabs.find((tab) => tab.path === route.path)?.id ?? ''),
)
</script>

<template>
  <TabBar :items="items" :active="activeKey" @change="emit('toggle-menu')">
    <template #center>
      <button
        type="button"
        class="menu"
        :class="{ on: isMenuActive }"
        :aria-expanded="isMenuOpen"
        aria-controls="shell-menu"
        @click="emit('toggle-menu')"
      >
        <span class="menu-icon" aria-hidden="true">⋯</span>
        <span class="menu-label">{{ $t('shell.menu') }}</span>
      </button>
    </template>
  </TabBar>
</template>

<style scoped>
.menu {
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

.menu-icon {
  width: 32px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-leaf-sm);
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: 16px;
  line-height: 1;
}

.menu-label {
  font-weight: var(--fw-strong);
  font-size: 11px;
}

.menu.on .menu-icon {
  background: var(--accent);
  color: var(--paper);
}

.menu.on .menu-label {
  color: var(--ink);
}
</style>
