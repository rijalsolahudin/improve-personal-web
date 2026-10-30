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
      <!-- Wordmark tetap dirender (dulu `v-if` lewat prop `wordmark`): collapse memudarkannya. -->
      <BrandMark wordmark="stacked" />
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
          <span class="group-title">{{ $t(`shell.group.${group}`) }}</span>
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

/*
 * Wordmark "Improve Personal" (BrandMark) menyusut + memudar saat collapse, bukan hilang mendadak.
 * Lebar/tinggi alami tidak bisa dianimasikan, jadi dibatasi (2 baris × line-height 1 × 20px) lalu
 * diturunkan ke 0; `overflow: hidden` yang memotong teksnya.
 */
.brand-row :deep(.wordmark) {
  overflow: hidden;
  max-inline-size: 160px;
  max-block-size: 40px;
  transition:
    opacity var(--dur) var(--ease),
    max-inline-size var(--dur) var(--ease),
    max-block-size var(--dur) var(--ease);
}

/* Jarak tile→wordmark ikut hilang saat wordmark selebar 0, supaya tile tetap di tengah kolom sempit. */
.brand-row :deep(.brand) {
  transition: gap var(--dur) var(--ease);
}

.collapsed .brand-row :deep(.brand) {
  gap: 0;
}

/*
 * Wordmark tetap ada di DOM, jadi tingginya 0 dan flex gap tidak lagi memberi jarak tile→tombol:
 * jarak 10px itu dipindah ke margin supaya tinggi brand-row collapsed sama seperti sebelumnya.
 */
.collapsed .brand-row {
  flex-direction: column;
  gap: 0;
  padding: 4px 0 14px;
}

.collapsed .brand-row > :first-child {
  margin-block-end: 10px;
}

.collapsed .brand-row :deep(.wordmark) {
  opacity: 0;
  max-inline-size: 0;
  max-block-size: 0;
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

/*
 * Judul grup tidak lagi lenyap lewat `v-if`: saat collapse ia menyusut dan berubah warna jadi garis
 * pemisah antar grup (design sidebar sempit). Satu elemen supaya jarak antar grup tidak bergeser.
 */
.group-title {
  padding: 0 14px 4px;
  font-weight: var(--fw-strong);
  font-size: var(--fs-eyebrow);
  letter-spacing: var(--tracking-group);
  text-transform: uppercase;
  color: var(--mute-3);
  white-space: nowrap;
  /* Lebih dari tinggi satu baris (~17px): batas atas supaya collapse bisa menyusutkannya. */
  max-block-size: 40px;
  overflow: hidden;
  transition:
    max-block-size var(--dur) var(--ease),
    padding var(--dur) var(--ease),
    margin var(--dur) var(--ease),
    color var(--dur) var(--ease),
    background-color var(--dur) var(--ease);
}

.collapsed .group-title {
  max-block-size: 2px;
  margin: 2px 14px 8px;
  padding: 0;
  border-radius: calc(2px * var(--rk));
  background: var(--line);
  /* Teksnya dibuang secara visual, tapi tetap jadi nama grup untuk pembaca layar. */
  color: transparent;
}
</style>
