<script setup lang="ts">
const { isCollapsed, toggle } = useSidebar()
const { t } = useI18n()
const route = useRoute()

const groups = NAV_GROUPS.map((group) => ({ group, items: featuresInGroup(group) }))
const toggleLabel = computed(() => t(isCollapsed.value ? 'shell.expand' : 'shell.collapse'))
</script>

<template>
  <aside class="sidebar" :class="{ collapsed: isCollapsed }">
    <div class="brand-row">
      <BrandMark :wordmark="isCollapsed ? 'none' : 'stacked'" />
      <IconButton
        tone="plain"
        :size="30"
        :radius="10"
        :title="toggleLabel"
        :aria-expanded="!isCollapsed"
        @click="toggle"
      >
        {{ isCollapsed ? '»' : '«' }}
      </IconButton>
    </div>

    <nav class="nav" :aria-label="$t('shell.navLabel')">
      <div v-for="{ group, items } in groups" :key="group" class="group">
        <template v-if="group !== 'utama'">
          <span v-if="isCollapsed" class="divider" aria-hidden="true" />
          <span v-else class="group-title">{{ $t(`shell.group.${group}`) }}</span>
        </template>
        <NavItem
          v-for="feature in items"
          :key="feature.id"
          :glyph="feature.glyph"
          :icon="feature.icon"
          :color="feature.color"
          :label="$t(`feature.${feature.id}.label`)"
          :collapsed="isCollapsed"
          :active="route.path === feature.path"
          :to="feature.path"
        />
      </div>
    </nav>
    <ShellUserMenu :collapsed="isCollapsed" />
  </aside>
</template>

<style scoped>
.sidebar {
  width: 248px;
  flex-shrink: 0;
  position: sticky;
  top: var(--gap-desktop);
  height: calc(100vh - 2 * var(--gap-desktop));
  /* Menu akun keluar dari sisi kanan sidebar; nav punya scroll sendiri. */
  overflow: visible;
  z-index: 70;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 20px 14px;
  background: var(--paper);
  border: var(--border-thick) solid var(--outline);
  border-radius: var(--radius-panel);
  box-shadow: var(--shadow-drop);
  transition: width var(--dur) var(--ease);
}

.sidebar.collapsed {
  width: 88px;
  padding: 20px 12px;
}

.brand-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 8px 14px;
  flex-shrink: 0;
  border-bottom: var(--border-thin) dashed var(--dash);
}

.brand-row > :first-child {
  flex: 1;
  min-width: 0;
}

.collapsed .brand-row {
  flex-direction: column;
  padding: 4px 0 14px;
}

.nav {
  flex: 1;
  min-height: 0;
  overflow: hidden auto;
  margin: 0 -8px;
  padding: 10px 8px 8px;
  display: flex;
  flex-direction: column;
}

/* Scrollbar menggeser ikon dari tengah di kolom sempit; nav tetap bisa di-scroll. */
.collapsed .nav {
  scrollbar-width: none;
}

.group {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.group + .group {
  padding-top: 14px;
}

.group-title {
  padding: 0 14px 4px;
  font-weight: var(--fw-strong);
  font-size: var(--fs-eyebrow);
  letter-spacing: var(--tracking-group);
  text-transform: uppercase;
  color: var(--mute-3);
  white-space: nowrap;
}

.divider {
  height: 2px;
  margin: 2px 14px 8px;
  border-radius: calc(2px * var(--rk));
  background: var(--line);
}
</style>
