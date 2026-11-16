<script setup lang="ts">
import type { IconName } from '~/utils/icons'

const {
  glyph,
  icon = undefined,
  color,
  label,
  collapsed = false,
  active = false,
  to = undefined,
} = defineProps<{
  glyph: string
  icon?: IconName
  color: string
  label: string
  collapsed?: boolean
  active?: boolean
  to?: string
}>()

const emit = defineEmits<{ click: [event: MouseEvent] }>()
</script>

<template>
  <NuxtLink
    v-if="to"
    :to="to"
    class="nav-item"
    :class="{ collapsed, active }"
    :title="collapsed ? label : undefined"
  >
    <AppIcon :glyph="glyph" :icon="icon" :color="color" />
    <!--
      Label selalu dirender supaya collapse bisa memudarkannya (dulu `v-if` membuatnya lenyap
      mendadak). Saat collapsed teksnya jadi nama aksesibel lewat `title`, jadi jangan dibaca dua kali.
    -->
    <span class="label" :aria-hidden="collapsed ? 'true' : undefined">{{ label }}</span>
  </NuxtLink>
  <button
    v-else
    type="button"
    class="nav-item"
    :class="{ collapsed, active }"
    :title="collapsed ? label : undefined"
    @click="emit('click', $event)"
  >
    <AppIcon :glyph="glyph" :icon="icon" :color="color" />
    <span class="label" :aria-hidden="collapsed ? 'true' : undefined">{{ label }}</span>
  </button>
</template>

<style scoped>
.nav-item {
  /* Gaya non-Cute: ikon polos tanpa tile (token --nav-icon-*; tidak terdefinisi di Cute). */
  --tile-bg: var(--nav-icon-bg);
  --tile-inner-bg: var(--nav-icon-inner-bg);
  --tile-inner-border: var(--nav-icon-inner-border);
  --tile-icon-scale: var(--nav-icon-scale);
  --tile-fg: var(--nav-icon-fg);

  display: flex;
  align-items: center;
  gap: var(--space-12);
  padding: var(--space-10) var(--space-14);
  border: none;
  background: none;
  border-radius: calc(14px * var(--rk)) calc(14px * var(--rk)) calc(14px * var(--rk))
    calc(5px * var(--rk));
  color: var(--ink);
  font-weight: var(--fw-strong);
  font-size: var(--fs-16);
  white-space: nowrap;
  /*
   * Aturan global hanya menargetkan `button`/`.btn`/`[role=button]`, jadi link sidebar tidak dapat
   * umpan balik hover/tekan. Properti `translate` dipakai (bukan `transform`) supaya varian tombol
   * komponen ini tidak bergeser 2px saat ditekan - aturan global sudah memakai `translate`.
   * `gap` ikut dianimasikan supaya ikon berhenti tepat di tengah saat label menyusut (collapse).
   * Durasi diperpendek sama seperti aturan global; `prefers-reduced-motion` global sudah mematikan
   * transisinya.
   */
  transition:
    background-color 0.12s ease-out,
    color 0.12s ease-out,
    translate 0.08s ease-out,
    gap var(--dur) var(--ease);
}

.nav-item:hover {
  background: var(--hover);
  color: var(--ink);
}

.nav-item.active {
  --tile-fg: var(--nav-icon-fg-active);

  background: var(--soft);
}

/* Design `Desktop v2.dc.html` baris 26: elemen yang ditekan turun 1px. */
.nav-item:active {
  translate: 0 1px;
}

.nav-item.collapsed {
  justify-content: center;
  padding: var(--space-8) 0;
  gap: 0;
}

/*
 * Lebar alami label tidak bisa dianimasikan, jadi dibatasi: collapse menyusutkannya sampai 0
 * sambil memudar, bukan terpotong mendadak. Batasnya lebih lebar dari label terpanjang.
 */
.label {
  overflow: hidden;
  max-inline-size: 200px;
  transition:
    opacity var(--dur) var(--ease),
    max-inline-size var(--dur) var(--ease);
}

.nav-item.collapsed .label {
  opacity: 0;
  max-inline-size: 0;
}
</style>
