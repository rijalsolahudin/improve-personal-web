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
  barColor = 'var(--accent)',
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
  /** Warna isi bar progres (design: warna fitur, mis. `var(--icon-todo)`). */
  barColor?: string
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
      <span class="track">
        <ProgressBar :pct="pct" :height="7" :color="barColor" track="var(--chip)" />
      </span>
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
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.track {
  width: 56px;
  flex-shrink: 0;
  /* Blok, bukan flex: root ProgressBar (`.bar`) tidak punya width, jadi sebagai flex item
     ia menyusut ke 0px dan isi bar tak pernah terlihat (QA #91 BUG-1). */
  display: block;
}

.meta {
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: 15px;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

/* QA #93 (temuan #91): judul + link `nowrap` butuh ~120px, sedangkan sisa baris setelah tile
   38px dan progres ~148px tinggal ~101px saat isi kartu 311px (viewport 375px, padding layout
   14px + kartu 18px) - judul lalu menimpa bar progres (QA #91 mengukur -4,1px @375, -59,1px
   @320). Di <=400px progres turun ke baris kedua (selebar baris, tetap rata kanan seperti
   design); di atas 400px baris tetap satu seperti sekarang. */
@media (max-width: 400px) {
  .head {
    flex-wrap: wrap;
  }

  .progress {
    flex-basis: 100%;
    justify-content: flex-end;
  }
}
</style>
