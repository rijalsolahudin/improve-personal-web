<script setup lang="ts">
/** Kaki sidebar Desktop.dc.html: kartu profil + menu (profil, data, tampilan, panduan, keluar). */
import type { AccountDialog } from '~/composables/useAccountDialogs'

const { collapsed = false } = defineProps<{ collapsed?: boolean }>()

const isOpen = ref(false)
const root = useTemplateRef<HTMLElement>('root')
useDismiss(root, isOpen)

const { isPickerOpen } = useAppearance()
const accountDialogs = useAccountDialogs()
const { profile } = useProfile()

// Nama & foto dari profil lokal terenkripsi; tidak ada akun server (ADR 15), jadi email login tidak
// pernah jadi nama. Selama nama kosong, kartu & item profil mengajak mengisinya.
const displayName = computed(() => profile.value.displayName)
const profileLabel = computed(() =>
  displayName.value ? 'shell.user.profile' : 'shell.user.setName',
)

/** Modal akun: dibuka lewat state bersama, dirender di layout. */
const dialogItems = computed<readonly { key: AccountDialog; glyph: string; label: string }[]>(
  () => [
    { key: 'profile', glyph: '☺', label: profileLabel.value },
    { key: 'security', glyph: '⚿', label: 'shell.user.security' },
  ],
)

const linkItems = [
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

function openAppearance(): void {
  isOpen.value = false
  isPickerOpen.value = true
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
      <button type="button" class="item item-button" @click="openAppearance">
        <span class="item-icon" aria-hidden="true"><Icon name="paint-brush" :size="16" /></span>
        <span>{{ $t('appearance.label') }}</span>
      </button>
      <NuxtLink
        v-for="item in linkItems"
        :key="item.key"
        :to="item.to"
        class="item"
        @click="isOpen = false"
      >
        <span class="item-icon" aria-hidden="true">{{ item.glyph }}</span>
        <span>{{ $t(item.label) }}</span>
      </NuxtLink>
      <button type="button" class="item item-button sign-out" @click="openDialog('signOut')">
        <span class="item-icon" aria-hidden="true"><Icon name="arrow-right" :size="16" /></span>
        <span>{{ $t('shell.user.signOut') }}</span>
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
      <AccountProfileAvatar :src="profile.avatar" :label="displayName" />
      <span v-if="!collapsed" class="who">
        <span class="name" :class="{ unset: !displayName }">{{
          displayName || $t('shell.user.setName')
        }}</span>
        <span class="sub">{{ $t('shell.user.label') }}</span>
      </span>
      <Icon
        v-if="!collapsed"
        :name="isOpen ? 'chevron-down' : 'chevron-up'"
        :size="14"
        class="caret"
      />
      <span v-else class="visually-hidden">{{ $t('shell.user.label') }}</span>
    </button>
  </div>
</template>

<style scoped>
.user {
  position: relative;
  flex-shrink: 0;
  margin-top: var(--space-4);
  padding-top: var(--space-10);
  border-top: var(--border-thin) dashed var(--dash);
}

.card {
  width: 100%;
  display: flex;
  align-items: center;
  gap: var(--space-10);
  padding: var(--space-6);
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
  font-size: var(--fs-14);
}

.sub {
  font-weight: var(--fw-body);
  font-size: var(--fs-12);
  color: var(--mute);
}

.caret {
  flex-shrink: 0;
  font-weight: var(--fw-strong);
  font-size: var(--fs-12);
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
  padding: var(--space-6);
  border: var(--border) solid var(--outline);
  border-radius: var(--radius-row);
  background: var(--paper);
  box-shadow: var(--shadow-drop);
  /* Design: popover muncul cepat dari arah pemicunya - membesar sedikit, tanpa gerak naik. */
  transform-origin: bottom left;
  animation: user-menu-pop 0.12s ease-out both;
}

@keyframes user-menu-pop {
  from {
    opacity: 0;
    transform: scale(0.97);
  }
}

.item {
  display: flex;
  align-items: center;
  gap: var(--space-12);
  padding: var(--space-8) var(--space-10);
  border-radius: var(--radius-inner);
  color: var(--ink);
  font-weight: var(--fw-strong);
  font-size: var(--fs-14);
  white-space: nowrap;
}

.item:hover {
  background: var(--alt);
  color: var(--ink);
}

.item-button {
  border: 0;
  background: none;
  text-align: left;
}

/* Aksi keluar dipisah garis dari menu biasa: bukan navigasi, dan mengakhiri akses perangkat ini. */
.sign-out {
  margin-top: var(--space-4);
  padding-top: var(--space-10);
  border-top: var(--border-thin) dashed var(--dash);
  border-radius: 0 0 var(--radius-inner) var(--radius-inner);
  color: var(--danger);
}

/* Nama kosong: ajakan, bukan nama - warnanya aksen supaya terbaca sebagai tautan. */
.name.unset {
  color: var(--accent);
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
  font-size: var(--fs-17);
  line-height: 1;
}
</style>
