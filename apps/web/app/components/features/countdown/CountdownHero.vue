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
  gap: 28px;
  flex-wrap: wrap;
  margin-top: 6px;
  padding: 26px 28px;
  border: none;
  border-radius: var(--radius-panel);
  background-color: var(--cd-soft);
  text-align: left;
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
  font-size: 56px;
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
  color: var(--cd-deep);
}

.title {
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: 34px;
  line-height: 1.1;
}

.meta {
  margin-top: 2px;
  font-weight: var(--fw-body);
  font-size: 15px;
  color: var(--ink-2);
}

.left {
  width: fit-content;
  margin-top: 10px;
  padding: 5px 14px;
  border-radius: var(--radius-pill);
  background: var(--paper);
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: 17px;
  color: var(--cd-deep);
}

.countdown-box {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tiles {
  display: flex;
  gap: 8px;
}

.cell {
  width: 88px;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 0 10px;
  border: var(--border-thick) solid var(--outline);
  border-radius: calc(20px * var(--rk)) calc(20px * var(--rk)) calc(20px * var(--rk))
    calc(8px * var(--rk));
  background: var(--paper);
  box-shadow: var(--shadow-drop-sm);
}

.v {
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: 42px;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  color: var(--cd-deep);
}

.l {
  margin-top: 6px;
  font-weight: var(--fw-strong);
  font-size: 11px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ink);
}

@media (max-width: 599px) {
  .hero {
    gap: 16px;
    padding: 20px 18px;
  }

  .tile {
    width: 72px;
    height: 72px;
    font-size: 40px;
  }

  /* Ukuran sticker inline (72px) → muat di tile 72px. */
  .tile :deep(.sticker) {
    transform: scale(0.66);
  }

  .title {
    font-size: 26px;
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
    font-size: 26px;
  }
}
</style>
