<script setup lang="ts">
import { countdownTint, yearlyEdition, type CountdownView } from '~/utils/countdown'
import { MS_PER_DAY, MS_PER_HOUR, MS_PER_MINUTE, MS_PER_SECOND } from '~/utils/time'

const { view, now } = defineProps<{ view: CountdownView; now: number }>()
const emit = defineEmits<{ edit: [] }>()

const { t } = useI18n()
const { shortDateYear } = useDateFormat()
const countdownText = useCountdownText()

const countdown = computed(() => view.countdown)
const tint = computed(() => countdownTint(countdown.value.color))
const pad = (value: number): string => String(value).padStart(2, '0')

const dateLabel = computed(
  () => shortDateYear(view.target) + (countdown.value.time ? ` · ${countdown.value.time}` : ''),
)
const sub = computed(() => {
  if (!countdown.value.yearly) return t('countdown.sub.once')
  const edition = yearlyEdition(countdown.value, view.target)
  return edition > 0 ? t('countdown.sub.yearlyNth', { n: edition }) : t('countdown.sub.yearly')
})
const left = computed(() => (view.today ? t('countdown.today') : countdownText(view.target, now)))

const tiles = computed(() => {
  let rest = Math.max(0, view.target - now)
  const days = Math.floor(rest / MS_PER_DAY)
  rest -= days * MS_PER_DAY
  const hours = Math.floor(rest / MS_PER_HOUR)
  rest -= hours * MS_PER_HOUR
  const minutes = Math.floor(rest / MS_PER_MINUTE)
  rest -= minutes * MS_PER_MINUTE
  const seconds = Math.floor(rest / MS_PER_SECOND)
  return [
    { key: 'hari', value: String(days) },
    { key: 'jam', value: pad(hours) },
    { key: 'menit', value: pad(minutes) },
    { key: 'detik', value: pad(seconds) },
  ]
})
</script>

<template>
  <button
    type="button"
    class="hero dot-grid"
    :style="{ '--cd-soft': tint[0], '--cd-deep': tint[1] }"
    @click="emit('edit')"
  >
    <span class="tile" aria-hidden="true">
      <CountdownArt :countdown="countdown" :size="72" />
    </span>
    <span class="info">
      <span class="eyebrow">{{ $t('countdown.heroEyebrow') }}</span>
      <span class="title">{{ countdown.title }}</span>
      <span class="meta">{{ dateLabel }} · {{ sub }}</span>
      <span class="left">{{ left }}</span>
    </span>
    <span class="countdown-box">
      <span class="eyebrow">{{ $t('countdown.heroLeft') }}</span>
      <span class="tiles">
        <span v-for="tile in tiles" :key="tile.key" class="cell">
          <span class="v">{{ tile.value }}</span>
          <span class="l">{{ $t(`countdown.tile.${tile.key}`) }}</span>
        </span>
      </span>
    </span>
  </button>
</template>

<style scoped>
.hero {
  display: flex;
  align-items: center;
  gap: var(--space-28);
  flex-wrap: wrap;
  margin-top: var(--space-6);
  padding: var(--space-28) var(--space-28);
  border: none;
  border-radius: var(--radius-panel);
  background-color: var(--cd-soft);
  text-align: left;
}

/* Design blok `isCd` memakai titik putih .45 (token global .35), hanya untuk hero countdown. */
.hero.dot-grid {
  background-image: radial-gradient(rgba(255, 255, 255, 0.45) 1.2px, transparent 1.2px);
}

.hero:hover .title {
  color: var(--cd-deep);
}

.tile {
  width: 104px;
  height: 104px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: var(--border-thick) solid var(--outline);
  border-radius: calc(32px * var(--rk)) calc(32px * var(--rk)) calc(32px * var(--rk))
    calc(10px * var(--rk));
  background: var(--paper);
  font-size: var(--fs-56);
  transform: rotate(calc(-6deg * var(--bev)));
  box-shadow: var(--shadow-drop);
}

.info {
  flex: 1 1 240px;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.eyebrow {
  letter-spacing: 0.12em;
  color: var(--cd-deep);
}

/* Eyebrow judul momen 12px; label "Tinggal" tetap 11px (design baris 1907 vs 1913). */
.info .eyebrow {
  font-size: var(--fs-12);
}

.title {
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: var(--fs-display-34);
  line-height: 1.1;
}

.meta {
  margin-top: 2px;
  font-weight: var(--fw-body);
  font-size: var(--fs-15);
  color: var(--ink-2);
}

.left {
  width: fit-content;
  margin-top: var(--space-10);
  padding: var(--space-6) var(--space-14);
  border-radius: var(--radius-pill);
  background: var(--paper);
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: var(--fs-display-17);
  color: var(--cd-deep);
}

.countdown-box {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-8);
}

.tiles {
  display: flex;
  gap: var(--space-8);
}

.cell {
  width: 88px;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: var(--space-12) 0 var(--space-10);
  border: var(--border-thick) solid var(--outline);
  border-radius: calc(20px * var(--rk)) calc(20px * var(--rk)) calc(20px * var(--rk))
    calc(8px * var(--rk));
  background: var(--paper);
  /* Design: 4px, bayangan .14 - lebih rapat/gelap dari `--shadow-drop-sm` (5px/.1). */
  box-shadow: calc(4px * var(--sx)) calc(4px * var(--sy)) calc(4px * var(--sbl))
    var(--shadow-color, rgba(47, 42, 36, 0.14));
}

.v {
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: var(--fs-display-42);
  line-height: 1;
  font-variant-numeric: tabular-nums;
  color: var(--cd-deep);
}

.l {
  margin-top: var(--space-6);
  font-weight: var(--fw-strong);
  font-size: var(--fs-12);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ink);
}

@media (max-width: 599px) {
  .hero {
    gap: var(--space-16);
    padding: var(--space-20) var(--space-18);
  }

  .tile {
    width: 72px;
    height: 72px;
    font-size: var(--fs-40);
  }

  /* Ukuran sticker inline (72px) → muat di tile 72px. */
  .tile :deep(.sticker) {
    transform: scale(0.66);
  }

  .title {
    font-size: var(--fs-display-26);
  }

  .countdown-box {
    width: 100%;
  }

  .tiles {
    justify-content: space-between;
  }

  .cell {
    flex: 1;
    width: auto;
  }

  .v {
    font-size: var(--fs-display-26);
  }
}
</style>
