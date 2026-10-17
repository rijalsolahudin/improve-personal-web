<script setup lang="ts">
/** Kaki sidebar Desktop.dc.html: kartu akun + menu (Edit profil, Preferensi, Panduan, Logout). */
const { collapsed = false } = defineProps<{ collapsed?: boolean }>()

const isOpen = ref(false)
const root = useTemplateRef<HTMLElement>('root')
useDismiss(root, isOpen)

const { isPickerOpen } = useAppearance()
const { logout } = useLogout()

const items = [
  { key: 'profile', glyph: '☺', to: getFeature('akun').path },
  { key: 'preferences', glyph: '⚙', to: APP_HOME_PATH },
  { key: 'guide', glyph: '?', to: getFeature('panduan').path },
] as const

function onItem(key: (typeof items)[number]['key']): void {
  isOpen.value = false
  // Preferensi = popover "Tampilan" di header Daily (design).
  if (key === 'preferences') isPickerOpen.value = true
}
</script>

<template>
  <div ref="root" class="user" :class="{ collapsed }">
    <div v-if="isOpen" id="user-menu" class="menu">
      <NuxtLink
        v-for="item in items"
        :key="item.key"
        :to="item.to"
        class="item"
        @click="onItem(item.key)"
      >
        <span class="item-icon" aria-hidden="true">{{ item.glyph }}</span>
        <span>{{ $t(`shell.user.${item.key}`) }}</span>
      </NuxtLink>
      <button type="button" class="item logout" @click="logout">
        <span class="item-icon" aria-hidden="true">⏻</span>
        <span>{{ $t('shell.user.logout') }}</span>
      </button>
    </div>
    <button
      type="button"
      class="card"
      :class="{ on: isOpen }"
      :title="collapsed ? $t('shell.user.label') : undefined"
      :aria-expanded="isOpen"
      aria-controls="user-menu"
      @click="isOpen = !isOpen"
    >
      <span class="avatar" aria-hidden="true">{{ $t('shell.user.initial') }}</span>
      <span v-if="!collapsed" class="who">
        <span class="name">{{ $t('shell.user.name') }}</span>
        <span class="sub">{{ $t('feature.akun.label') }}</span>
      </span>
      <span v-if="!collapsed" class="caret" aria-hidden="true">{{ isOpen ? '▾' : '▴' }}</span>
      <span v-else class="visually-hidden">{{ $t('shell.user.label') }}</span>
    </button>
  </div>
</template>

<style scoped>
.user {
  position: relative;
  flex-shrink: 0;
  margin-top: 4px;
  padding-top: 10px;
  border-top: var(--border-thin) dashed var(--dash);
}

.card {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px;
  border: 0;
  border-radius: var(--radius-btn-sq);
  background: transparent;
  color: var(--ink);
  text-align: left;
}

.collapsed .card {
  justify-content: center;
}

.card:hover,
.card.on {
  background: var(--alt);
}

.avatar {
  width: 38px;
  height: 38px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: var(--border) solid var(--outline);
  border-radius: 50%;
  background: var(--accent);
  color: var(--paper);
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: 17px;
}

.who {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  line-height: 1.2;
}

.name,
.sub {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.name {
  font-weight: var(--fw-strong);
  font-size: 14px;
}

.sub {
  font-weight: var(--fw-body);
  font-size: 12px;
  color: var(--mute);
}

.caret {
  flex-shrink: 0;
  font-weight: var(--fw-strong);
  font-size: 12px;
  color: var(--mute-3);
}

.menu {
  position: absolute;
  bottom: -6px;
  left: calc(100% + 22px);
  z-index: 120;
  width: 220px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px;
  border: var(--border) solid var(--outline);
  border-radius: var(--radius-row);
  background: var(--paper);
  box-shadow: var(--shadow-drop);
}

.item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 7px 10px;
  border-radius: var(--radius-inner);
  color: var(--ink);
  font-weight: var(--fw-strong);
  font-size: 14px;
  white-space: nowrap;
}

.item:hover {
  background: var(--alt);
  color: var(--ink);
}

.logout {
  border: 0;
  background: none;
  color: var(--danger);
  text-align: left;
}

.logout:hover {
  color: var(--danger);
}

.item-icon {
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: calc(10px * var(--rk));
  background: var(--chip);
  font-size: 17px;
  line-height: 1;
}
</style>
