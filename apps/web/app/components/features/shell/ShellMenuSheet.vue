<script setup lang="ts">
import type { AccountDialog } from '~/composables/useAccountDialogs'
import type { IconName } from '~/utils/icons'

const emit = defineEmits<{ close: [] }>()

const route = useRoute()
const accountDialogs = useAccountDialogs()

/** Profil & keamanan berupa modal, bukan halaman: di HP pintunya grup "Akun" di menu ini. */
const accountItems: readonly {
  key: AccountDialog
  icon: IconName
  color: string
  label: string
}[] = [
  { key: 'profile', icon: 'smile', color: '--cat-kerja', label: 'shell.user.profile' },
  { key: 'security', icon: 'eye-off', color: '--cat-diri', label: 'shell.user.security' },
]

function openDialog(key: AccountDialog): void {
  emit('close')
  accountDialogs.open(key)
}
const groups = [
  ...(['utama', 'rencana', 'fokus'] as const).map((group) => ({
    group,
    items: featuresInGroup(group),
  })),
  // Grup `lainnya` sengaja TIDAK ditampilkan utuh (jadwal & sticker punya pintu lain); hanya halaman
  // yang benar-benar dibutuhkan di HP - termasuk Import & Export.
  { group: 'lainnya', items: MOBILE_MENU_EXTRA_IDS.map(getFeature) },
]
</script>

<template>
  <Sheet id="shell-menu" :title="$t('shell.menu')" @close="emit('close')">
    <div class="groups">
      <section v-for="{ group, items } in groups" :key="group" class="group">
        <h3 class="group-title">{{ $t(`shell.group.${group}`) }}</h3>
        <div class="grid">
          <NuxtLink
            v-for="feature in items"
            :key="feature.id"
            :to="feature.path"
            class="item"
            :aria-current="route.path === feature.path ? 'page' : undefined"
            @click="emit('close')"
          >
            <AppIcon
              :glyph="feature.glyph"
              :icon="feature.icon"
              :color="feature.color"
              :size="38"
            />
            <span class="label">{{ $t(`feature.${feature.id}.label`) }}</span>
          </NuxtLink>
        </div>
      </section>
      <section class="group">
        <h3 class="group-title">{{ $t('shell.user.label') }}</h3>
        <div class="grid">
          <button
            v-for="item in accountItems"
            :key="item.key"
            type="button"
            class="item item-button"
            @click="openDialog(item.key)"
          >
            <AppIcon :icon="item.icon" :color="item.color" :size="38" />
            <span class="label">{{ $t(item.label) }}</span>
          </button>
        </div>
      </section>
    </div>
  </Sheet>
</template>

<style scoped>
.groups {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.group-title {
  font-weight: var(--fw-strong);
  font-size: var(--fs-eyebrow);
  letter-spacing: var(--tracking-group);
  text-transform: uppercase;
  color: var(--mute-3);
}

.grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
}

.item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 10px 2px 8px;
  border-radius: var(--radius-row);
  border: var(--border) solid transparent;
  color: var(--ink);
}

.item-button {
  background: none;
  font: inherit;
}

.item:hover {
  background: var(--hover);
  color: var(--ink);
}

.item[aria-current='page'] {
  background: var(--soft);
  border-color: var(--outline);
}

.label {
  font-weight: var(--fw-strong);
  font-size: 11px;
  line-height: 1.15;
  text-align: center;
}
</style>
