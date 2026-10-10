<script setup lang="ts">
import { setHidden } from '~/utils/homeLayout'

const { layout, isEditing, update, reset, setEditing } = useHomeLayout()
const { isCollapsed } = useSidebar()
const { setEditing: setDecoEditing } = useDeco()

function toggleEditing(): void {
  const next = !isEditing.value
  if (next) setDecoEditing(false)
  setEditing(next)
}

// Keluar dari Home dalam keadaan mode atur → jangan terbawa saat kembali.
onBeforeUnmount(() => setEditing(false))
</script>

<template>
  <div
    v-if="isEditing"
    class="tray-dock"
    data-deco-ui
    :class="{ 'sidebar-collapsed': isCollapsed }"
  >
    <section class="tray" :aria-label="$t('home.layout.title')">
      <div class="intro">
        <h2 class="title">{{ $t('home.layout.title') }}</h2>
        <p class="hint">{{ $t('home.layout.hint') }}</p>
      </div>
      <div v-if="layout.hidden.length" class="hidden-list">
        <span class="hidden-label">{{ $t('home.layout.hiddenTitle') }}</span>
        <button
          v-for="id in layout.hidden"
          :key="id"
          type="button"
          class="chip"
          @click="update(setHidden(layout, id, false))"
        >
          + {{ $t(`home.layout.widget.${id}`) }}
        </button>
      </div>
      <button type="button" class="reset" @click="reset">{{ $t('home.layout.reset') }}</button>
      <button type="button" class="save" @click="setEditing(false)">
        {{ $t('home.layout.save') }}
      </button>
    </section>
  </div>

  <!-- Dok FAB milik layout dashboard; "Atur" berdiri di kiri tombol "Hias". -->
  <Teleport defer to="#fab-dock-extra">
    <button
      type="button"
      class="fab"
      :class="{ on: isEditing }"
      :aria-pressed="isEditing"
      @click="toggleEditing"
    >
      <span class="fab-icon" aria-hidden="true"><span /><span /><span /><span /></span>
      {{ $t(isEditing ? 'home.layout.done' : 'home.layout.open') }}
    </button>
  </Teleport>
</template>

<style scoped>
/* Posisi mengikuti design: tray di antara sidebar dan FAB, FAB pojok kanan bawah. */
.tray-dock {
  position: fixed;
  left: 310px;
  right: 330px;
  bottom: 24px;
  z-index: 90;
  display: flex;
  justify-content: center;
  pointer-events: none;
}

.tray-dock.sidebar-collapsed {
  left: 150px;
}

.tray {
  pointer-events: auto;
  width: 100%;
  max-width: 720px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  padding: 14px 18px;
  border: 3px solid var(--ink);
  border-radius: 28px;
  background: var(--paper);
  box-shadow: 0 8px 0 rgb(47 42 36 / 0.15);
}

.intro {
  flex: 1 1 240px;
  min-width: 0;
}

.title {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 18px;
  line-height: 1.2;
}

.hint {
  font-weight: 700;
  font-size: 13px;
  color: var(--mute);
}

.hidden-list {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.hidden-label {
  font-weight: 800;
  font-size: 12px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--mute);
}

.chip {
  padding: 6px 12px;
  border: none;
  border-radius: var(--radius-pill);
  background: var(--chip);
  font-weight: 800;
  font-size: 13px;
}

.chip:hover {
  background: var(--hover);
}

.reset {
  padding: 8px 6px;
  border: none;
  background: none;
  font-weight: 800;
  font-size: 14px;
  color: var(--mute-3);
}

.reset:hover {
  color: var(--accent);
}

.save {
  padding: 10px 18px;
  border: none;
  border-radius: var(--radius-pill);
  background: var(--accent);
  color: var(--paper);
  font-weight: 800;
  font-size: 14px;
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
  background: var(--accent);
  color: var(--paper);
}

.fab-icon {
  display: grid;
  grid-template-columns: 7px 7px;
  grid-template-rows: 7px 7px;
  gap: 2.5px;
  flex-shrink: 0;
}

.fab-icon > span {
  border: 2px solid currentColor;
  border-radius: 2.5px;
}

.fab-icon > span:last-child {
  background: currentColor;
}

/* Mobile: tray & FAB di atas tab bar. */
@media (max-width: 599px) {
  .tray-dock,
  .tray-dock.sidebar-collapsed {
    left: 10px;
    right: 10px;
    bottom: 148px;
  }

  .fab {
    height: 42px;
    padding: 0 14px;
  }
}
</style>
