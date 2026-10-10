<script setup lang="ts">
const { isCollapsed, toggle } = useSidebar()
const { t } = useI18n()

const groups = NAV_GROUPS.map((group) => ({ group, items: featuresInGroup(group) }))
const extras = featuresInGroup('lainnya')
const { isHidden: isDecoHidden, toggleHidden: toggleDecoHidden } = useDeco()
const toggleLabel = computed(() => t(isCollapsed.value ? 'shell.expand' : 'shell.collapse'))
</script>

<template>
  <aside class="sidebar" :class="{ collapsed: isCollapsed }">
    <div class="brand-row">
      <UiBrandMark :wordmark="isCollapsed ? 'none' : 'stacked'" />
      <button
        type="button"
        class="toggle"
        :title="toggleLabel"
        :aria-label="toggleLabel"
        :aria-expanded="!isCollapsed"
        @click="toggle"
      >
        <span aria-hidden="true">{{ isCollapsed ? '»' : '«' }}</span>
      </button>
    </div>

    <nav class="nav" :aria-label="$t('shell.navLabel')">
      <div v-for="{ group, items } in groups" :key="group" class="group">
        <template v-if="group !== 'utama'">
          <span v-if="isCollapsed" class="divider" aria-hidden="true" />
          <span v-else class="group-title">{{ $t(`shell.group.${group}`) }}</span>
        </template>
        <ShellNavItem
          v-for="feature in items"
          :key="feature.id"
          :feature="feature"
          :is-collapsed="isCollapsed"
        />
      </div>
    </nav>

    <div class="extras">
      <NuxtLink
        v-for="feature in extras"
        :key="feature.id"
        :to="feature.path"
        class="extra"
        :title="isCollapsed ? $t(`feature.${feature.id}.label`) : undefined"
        exact-active-class="active"
      >
        <span v-if="isCollapsed" aria-hidden="true">{{ feature.glyph }}</span>
        <span :class="{ 'visually-hidden': isCollapsed }">
          {{ $t(`feature.${feature.id}.label`) }}
        </span>
      </NuxtLink>
      <button
        type="button"
        role="switch"
        class="extra hide-deco"
        :aria-checked="isDecoHidden"
        :title="isCollapsed ? $t('deco.hideAll') : undefined"
        data-deco-ui
        @click="toggleDecoHidden"
      >
        <span :class="{ 'visually-hidden': isCollapsed }">{{ $t('deco.hideAll') }}</span>
        <span class="switch" :class="{ on: isDecoHidden }" aria-hidden="true"><span /></span>
      </button>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  width: 248px;
  flex-shrink: 0;
  position: sticky;
  top: var(--gap-desktop);
  height: calc(100vh - 2 * var(--gap-desktop));
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 20px 14px;
  background: var(--paper);
  border: var(--border-thick) solid var(--ink);
  border-radius: var(--radius-panel);
  box-shadow: var(--shadow-drop);
  transition: width var(--dur) var(--ease);
}

/* `.sidebar.` wajib: root ShellNavItem ikut bawa scope id sidebar dan juga pakai kelas `collapsed`. */
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
  border-bottom: 2px dashed var(--dash);
}

.brand-row > :first-child {
  flex: 1;
  min-width: 0;
}

.collapsed .brand-row {
  flex-direction: column;
  padding: 4px 0 14px;
}

.toggle {
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  border-radius: 10px;
  background: var(--chip);
  color: var(--ink-2);
  font-weight: 800;
  font-size: 15px;
}

.toggle:hover {
  background: var(--hover);
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
  font-weight: 800;
  font-size: var(--fs-eyebrow);
  letter-spacing: var(--tracking-group);
  text-transform: uppercase;
  color: var(--mute-3);
  white-space: nowrap;
}

.divider {
  height: 2px;
  margin: 2px 14px 8px;
  border-radius: 2px;
  background: var(--line);
}

.extras {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex-shrink: 0;
  padding-top: 12px;
  border-top: 2px dashed var(--dash);
}

.extra {
  padding: 8px 14px;
  border-radius: var(--radius-pill);
  font-weight: 700;
  color: var(--mute-2);
  white-space: nowrap;
}

.extra:hover,
.extra.active {
  background: var(--hover);
  color: var(--mute-2);
}

.hide-deco {
  display: flex;
  align-items: center;
  gap: 10px;
  border: none;
  background: none;
  font: inherit;
  font-weight: 700;
  text-align: left;
}

.hide-deco > :first-child {
  flex: 1;
}

.switch {
  position: relative;
  width: 40px;
  height: 24px;
  flex-shrink: 0;
  border: 2px solid var(--ink);
  border-radius: var(--radius-pill);
  background: #e3cfaf;
  transition: background var(--dur) var(--ease);
}

.switch > span {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border: 2px solid var(--ink);
  border-radius: 50%;
  background: var(--paper);
  transition: transform var(--dur) var(--ease);
}

.switch.on {
  background: var(--accent);
}

.switch.on > span {
  transform: translateX(16px);
}

.collapsed .switch {
  width: 34px;
  height: 22px;
}

.collapsed .switch > span {
  width: 14px;
  height: 14px;
}

.collapsed .switch.on > span {
  transform: translateX(12px);
}

.collapsed .extra {
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border-radius: 14px;
  font-weight: 800;
  font-size: 16px;
}
</style>
