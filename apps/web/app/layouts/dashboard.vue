<script setup lang="ts">
import { ensureStorageProtection } from '~/utils/storage/durability'

const route = useRoute()
const isMenuOpen = ref(false)

/**
 * Preferensi tampilan per akun (PRD F16: record `user_prefs`, ikut sync). Dulu dipanggil di
 * `app.vue`, tetapi halaman publik (`/`, `/login`) tidak punya akun: memanggilnya di root membuat
 * modul `@improve-personal/core` (skema zod + repository) ikut ke JS awal SETIAP rute - 10 KB gzip
 * untuk fitur yang tidak bisa dipakai sebelum login. Shell ber-sesi inilah tempatnya.
 *
 * Hanya di client: layout ini dipakai rute `/app/**` yang `ssr: false` (tidak pernah dirender
 * server), dan datanya ada di IndexedDB.
 *
 * Komposabel ini tetap menonton pergantian akun (`localData.state.userId`), jadi akun B tidak
 * mewarisi tampilan akun A tanpa reload.
 */
if (import.meta.client) useAppearancePrefs()

watch(
  () => route.path,
  () => {
    isMenuOpen.value = false
  },
)

const accountDialogs = useAccountDialogs()

const deco = useDeco()
const { scope } = useDecoScope()
// Lapisan hias (+ katalog sticker) baru dimuat kalau memang ada yang perlu ditampilkan.
const isDecoMounted = computed(
  () => deco.isEditing.value || (!deco.isHidden.value && deco.itemsIn(scope.value).length > 0),
)

function toggleDeco(): void {
  deco.setEditing(!deco.isEditing.value)
}

/**
 * Minta status persistent storage sekali saat shell dibuka (ARCHITECTURE.md §5). Tanpa ini browser
 * boleh membuang IndexedDB - termasuk database kunci - saat ruang perangkat menipis atau (Safari)
 * karena situs lama tidak dibuka. `ensureStorageProtection` melewati permintaan kalau sudah persistent.
 *
 * Tidak menunggu hasilnya: penolakan browser bukan error, hanya berarti data tetap bisa di-evict
 * (statusnya terlihat di kartu Penyimpanan pada modal Keamanan & perangkat).
 */
onMounted(() => {
  void ensureStorageProtection()
})
</script>

<template>
  <div class="shell paper-grid">
    <ShellSidebar class="desktop-only" />
    <main class="main" data-anchor="page" data-anchor-kind="page">
      <ShellStorageQuotaBanner />
      <slot />
    </main>
    <!-- Modal akun dari menu sidebar / menu HP. Lazy + v-if: kodenya baru dimuat saat dibuka. -->
    <LazyAccountProfileDialog
      v-if="accountDialogs.current.value === 'profile'"
      open
      @close="accountDialogs.close"
    />
    <LazyAccountSecurityDialog
      v-if="accountDialogs.current.value === 'security'"
      open
      @close="accountDialogs.close"
    />
    <LazyDecoLayer v-if="isDecoMounted" />
    <div class="fab-dock" data-deco-ui>
      <ShellPomodoroPill />
      <!-- Indikator sync berdiri sendiri di kiri tombol Hias; saat normal ia tidak dirender, jadi
           dock tidak berubah lebar dan tidak ada ruang kosong yang menetap. -->
      <ShellSyncStatus />
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
  gap: var(--space-32);
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
  max-width: calc(100vw - 28px);
  display: flex;
  flex-wrap: wrap-reverse;
  justify-content: flex-end;
  align-items: center;
  gap: var(--space-10);
}

.fab {
  height: 52px;
  display: flex;
  align-items: center;
  gap: var(--space-8);
  padding: 0 var(--space-20);
  border: var(--border-thick) solid var(--outline);
  border-radius: var(--radius-pill);
  background: var(--paper);
  color: var(--ink);
  font-weight: var(--fw-strong);
  font-size: var(--fs-15);
  white-space: nowrap;
  box-shadow: calc(5px * var(--sx)) calc(5px * var(--sy)) calc(5px * var(--sbl))
    var(--shadow-color, rgb(47 42 36 / 0.15));
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
    padding: var(--space-16) var(--space-14) var(--space-112);
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
    padding: 0 var(--space-14);
  }
}
</style>
