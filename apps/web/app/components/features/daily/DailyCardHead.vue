<script setup lang="ts">
import type { IconName } from '~/utils/icons'

/** Kepala kartu Daily Routine: tile ikon + judul + link fitur, opsional progres (design). */
const {
  icon,
  color,
  title,
  titleId,
  linkLabel,
  linkTo,
  meta = undefined,
  pct = undefined,
} = defineProps<{
  icon: IconName
  /** Nama CSS custom property warna tile. */
  color: string
  title: string
  titleId: string
  linkLabel: string
  linkTo: string
  meta?: string
  /** 0–100; kalau diisi tampil bar progres + `meta`. */
  pct?: number
}>()
</script>

<template>
  <div class="head">
    <AppIcon :icon="icon" :color="color" :size="38" />
    <div class="titles">
      <h2 :id="titleId" class="title">{{ title }}</h2>
      <NuxtLink :to="linkTo" class="link">{{ linkLabel }}</NuxtLink>
    </div>
    <div v-if="pct !== undefined" class="progress">
      <ProgressBar :pct="pct" :height="7" track="var(--chip)" />
      <span v-if="meta" class="meta">{{ meta }}</span>
    </div>
  </div>
</template>

<style scoped>
.head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.titles {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.title {
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: var(--fs-h2);
  line-height: 1.1;
  white-space: nowrap;
}

.link {
  align-self: flex-start;
  font-weight: var(--fw-strong);
  font-size: var(--fs-meta);
  white-space: nowrap;
}

.progress {
  width: 96px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}

.progress > :first-child {
  width: 100%;
}

.meta {
  font-weight: var(--fw-strong);
  font-size: 11.5px;
  color: var(--mute-3);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
</style>
