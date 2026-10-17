<script setup lang="ts">
import type { DecoBucket } from '~/utils/deco'

const { page, bucket, count, hiddenCount, copySources, isGloballyHidden } = defineProps<{
  page: string
  bucket: DecoBucket
  count: number
  hiddenCount: number
  /** Ukuran layar lain yang sudah dihias di halaman ini (ditawarkan kalau di sini masih kosong). */
  copySources: readonly DecoBucket[]
  isGloballyHidden: boolean
}>()

const emit = defineEmits<{
  add: []
  reset: []
  copy: [from: DecoBucket]
  'skip-copy': []
}>()

const { isCollapsed } = useSidebar()
const isConfirmingReset = ref(false)

function onReset(): void {
  if (!isConfirmingReset.value) {
    isConfirmingReset.value = true
    return
  }
  isConfirmingReset.value = false
  emit('reset')
}
</script>

<template>
  <div class="dock" :class="{ 'sidebar-collapsed': isCollapsed }" data-deco-ui>
    <section class="tray" :aria-label="$t('deco.title', { page: $t(`feature.${page}.label`) })">
      <div class="head">
        <div class="intro">
          <h2 class="title">{{ $t('deco.title', { page: $t(`feature.${page}.label`) }) }}</h2>
          <p class="sub">
            {{ $t('deco.scope', { bucket: $t(`deco.bucket.${bucket}`), n: count }) }}
          </p>
        </div>
        <div class="actions">
          <button v-if="count" type="button" class="btn danger" @click="onReset">
            {{ $t(isConfirmingReset ? 'deco.resetConfirm' : 'deco.reset') }}
          </button>
          <button type="button" class="btn primary" @click="emit('add')">
            ＋ {{ $t('deco.add') }}
          </button>
        </div>
      </div>
      <div v-if="copySources.length" class="offer">
        <p class="offer-text">
          {{ $t('deco.offer', { bucket: $t(`deco.bucketShort.${bucket}`) }) }}
        </p>
        <button
          v-for="source in copySources"
          :key="source"
          type="button"
          class="btn small dark"
          @click="emit('copy', source)"
        >
          {{ $t('deco.copyFrom', { bucket: $t(`deco.bucketShort.${source}`) }) }}
        </button>
        <button type="button" class="btn small plain" @click="emit('skip-copy')">
          {{ $t('deco.startEmpty') }}
        </button>
      </div>
      <p class="hint">{{ $t('deco.hint') }}</p>
      <p v-if="hiddenCount" class="warn">{{ $t('deco.hiddenItems', { n: hiddenCount }) }}</p>
      <p v-if="isGloballyHidden" class="warn">{{ $t('deco.hiddenGlobal') }}</p>
    </section>
  </div>
</template>

<style scoped>
.dock {
  position: fixed;
  left: 310px;
  right: 170px;
  bottom: 24px;
  z-index: 90;
  display: flex;
  justify-content: center;
  pointer-events: none;
}

.dock.sidebar-collapsed {
  left: 150px;
}

.tray {
  pointer-events: auto;
  width: 100%;
  max-width: 720px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 18px;
  border: var(--border-thick) solid var(--outline);
  border-radius: calc(28px * var(--rk));
  background: var(--paper);
  box-shadow: calc(8px * var(--sx)) calc(8px * var(--sy)) calc(8px * var(--sbl))
    var(--shadow-color, rgb(47 42 36 / 0.15));
}

.head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.intro {
  min-width: 0;
}

.title {
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: 19px;
  line-height: 1.15;
}

.sub,
.hint {
  font-weight: var(--fw-body);
  font-size: 12px;
  color: var(--mute);
}

.warn {
  font-weight: var(--fw-body);
  font-size: 12px;
  color: #a8573f;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.btn {
  height: 40px;
  display: flex;
  align-items: center;
  padding: 0 16px;
  border: none;
  border-radius: var(--radius-pill);
  background: none;
  font-weight: var(--fw-strong);
  font-size: 14px;
  white-space: nowrap;
}

.btn.small {
  height: 34px;
}

.primary {
  background: var(--accent);
  color: var(--paper);
}

.danger {
  border: var(--border-thin) solid #f3a99a;
  color: #c2381a;
}

.dark {
  background: var(--ink);
  color: var(--paper);
}

.plain {
  background: var(--paper);
  color: var(--ink-2);
}

.offer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-radius: var(--radius-row);
  background: var(--soft);
}

.offer-text {
  flex: 1 1 200px;
  font-weight: var(--fw-strong);
  font-size: 14px;
}

@media (max-width: 599px) {
  .dock,
  .dock.sidebar-collapsed {
    left: 10px;
    right: 10px;
    bottom: 148px;
  }
}
</style>
