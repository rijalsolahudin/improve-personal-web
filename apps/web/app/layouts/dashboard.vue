<script setup lang="ts">
const route = useRoute()
const isMenuOpen = ref(false)

watch(
  () => route.path,
  () => {
    isMenuOpen.value = false
  },
)

const deco = useDeco()
const { scope } = useDecoScope()
// Lapisan hias (+ katalog sticker) baru dimuat kalau memang ada yang perlu ditampilkan.
const isDecoMounted = computed(
  () => deco.isEditing.value || (!deco.isHidden.value && deco.itemsIn(scope.value).length > 0),
)

const { setEditing: setLayoutEditing } = useHomeLayout()
function toggleDeco(): void {
  const next = !deco.isEditing.value
  if (next) setLayoutEditing(false)
  deco.setEditing(next)
}
</script>

<template>
  <div class="shell paper-grid">
    <ShellSidebar class="desktop-only" />
    <main class="main" data-anchor="page" data-anchor-kind="page">
      <slot />
    </main>
    <LazyDecoLayer v-if="isDecoMounted" />
    <!-- Halaman bisa menaruh tombol tambahan di sini (mis. "Atur" di Home) lewat Teleport. -->
    <div class="fab-dock" data-deco-ui>
      <div id="fab-dock-extra" class="fab-extra" />
      <button
        type="button"
        class="fab"
        :class="{ on: deco.isEditing.value }"
        :aria-pressed="deco.isEditing.value"
        @click="toggleDeco"
      >
        {{ $t(deco.isEditing.value ? 'deco.fabDone' : 'deco.fab') }}
      </button>
    </div>
    <div class="mobile-only">
      <ShellMenuSheet v-if="isMenuOpen" @close="isMenuOpen = false" />
      <ShellTabBar :is-menu-open="isMenuOpen" @toggle-menu="isMenuOpen = !isMenuOpen" />
    </div>
  </div>
</template>

<style scoped>
.shell {
  position: relative;
  min-height: 100vh;
  display: flex;
  gap: 32px;
  padding: var(--gap-desktop);
}

.main {
  flex: 1;
  min-width: 0;
}

.mobile-only {
  display: none;
}

.fab-dock {
  position: fixed;
  right: 28px;
  bottom: 28px;
  z-index: 95;
  display: flex;
  align-items: center;
  gap: 10px;
}

.fab-extra {
  display: contents;
}

.fab {
  height: 52px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 20px;
  border: 3px solid var(--ink);
  border-radius: var(--radius-pill);
  background: var(--paper);
  color: var(--ink);
  font-weight: 800;
  font-size: 15px;
  white-space: nowrap;
  box-shadow: 0 5px 0 rgb(47 42 36 / 0.15);
  transition: transform var(--dur) var(--ease);
}

.fab:hover {
  transform: translateY(-2px);
}

.fab.on {
  background: var(--ink);
  color: var(--paper);
}

@media (max-width: 599px) {
  .shell {
    padding: 16px 14px 112px;
  }

  .shell > .desktop-only {
    display: none;
  }

  /* Isinya fixed-position; `contents` supaya tidak jadi flex item yang kena gap. */
  .mobile-only {
    display: contents;
  }

  .fab-dock {
    right: 14px;
    bottom: 96px;
  }

  .fab {
    height: 42px;
    padding: 0 14px;
  }
}
</style>
