<script setup lang="ts">
/** Kaki sidebar Desktop.dc.html: kartu akun + menu (profil, keamanan, preferensi, panduan, logout). */
import type { AccountDialog } from '~/composables/useAccountDialogs'

const { collapsed = false } = defineProps<{ collapsed?: boolean }>()

const isOpen = ref(false)
const root = useTemplateRef<HTMLElement>('root')
useDismiss(root, isOpen)

const { isPickerOpen } = useAppearance()
const { logout } = useLogout()
const accountDialogs = useAccountDialogs()
const { profile } = useProfile()

// Email dari sesi asli (tanpa request - guard halaman sudah memuatnya); nama & foto dari profil terenkripsi.
const { session } = useAuthSession()
const accountEmail = computed(() => session.value?.user.email ?? '')
const displayName = computed(() => profile.value.displayName)

/** Modal akun: dibuka lewat state bersama, dirender di layout. */
const dialogItems: readonly { key: AccountDialog; glyph: string; label: string }[] = [
  { key: 'profile', glyph: '☺', label: 'shell.user.profile' },
  { key: 'security', glyph: '⚿', label: 'shell.user.security' },
]

const linkItems = [
  { key: 'preferences', glyph: '⚙', to: APP_HOME_PATH, label: 'shell.user.preferences' },
  { key: 'guide', glyph: '?', to: getFeature('panduan').path, label: 'shell.user.guide' },
  // Import & Export tidak punya baris sendiri di sidebar (grup `lainnya`): pintunya menu akun.
  {
    key: 'importExport',
    glyph: '⇅',
    to: getFeature('import-export').path,
    label: 'feature.import-export.label',
  },
] as const

function openDialog(key: AccountDialog): void {
  isOpen.value = false
  accountDialogs.open(key)
}

function onLink(key: (typeof linkItems)[number]['key']): void {
  isOpen.value = false
  // Preferensi = popover "Tampilan" di header Daily (design).
  if (key === 'preferences') isPickerOpen.value = true
}
</script>

<template>
  <div ref="root" class="user" :class="{ collapsed }">
    <div v-if="isOpen" id="user-menu" class="menu">
      <button
        v-for="item in dialogItems"
        :key="item.key"
        type="button"
        class="item item-button"
        @click="openDialog(item.key)"
      >
        <span class="item-icon" aria-hidden="true">{{ item.glyph }}</span>
        <span>{{ $t(item.label) }}</span>
      </button>
      <NuxtLink
        v-for="item in linkItems"
        :key="item.key"
        :to="item.to"
        class="item"
        @click="onLink(item.key)"
      >
        <span class="item-icon" aria-hidden="true">{{ item.glyph }}</span>
        <span>{{ $t(item.label) }}</span>
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
      <AccountProfileAvatar :src="profile.avatar" :label="displayName || accountEmail" />
      <span v-if="!collapsed" class="who">
        <span class="name">{{ displayName || accountEmail || $t('shell.user.name') }}</span>
        <span class="sub">{{ displayName ? accountEmail : $t('shell.user.label') }}</span>
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
  min-width: 220px;
  width: max-content;
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

.item-button,
.logout {
  border: 0;
  background: none;
  text-align: left;
}

.logout {
  color: var(--danger);
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
