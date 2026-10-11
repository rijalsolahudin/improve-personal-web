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
  () =>
    shortDateYear(view.target) + (countdown.value.time ? ` · ${countdown.value.time}` : ''),
)
const sub = computed(() => {
  if (!countdown.value.yearly) return t('countdown.sub.once')
  const edition = yearlyEdition(countdown.value, view.target)
  return edition > 0 ? t('countdown.sub.yearlyNth', { n: edition }) : t('countdown.sub.yearly')
})
const left = computed(() =>
  view.today ? t('countdown.today') : countdownText(view.target, now),
)

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
    <span class="tile" aria-hidden="true">{{ countdown.emoji }}</span>
    <span class="info">
      <span class="eyebrow">{{ $t('countdown.heroEyebrow') }}</span>
      <span class="title">{{ countdown.title }}</span>
      <span class="meta">{{ dateLabel }} · {{ sub }}</span>
      <span class="left">{{ left }}</span>
    </span>
    <span class="tiles">
      <span v-for="tile in tiles" :key="tile.key" class="cell">
        <span class="v">{{ tile.value }}</span>
        <span class="l">{{ $t(`countdown.tile.${tile.key}`) }}</span>
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
  border-radius: 32px;
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
  border: 3px solid var(--ink);
  border-radius: 32px 32px 32px 10px;
  background: var(--paper);
  font-size: 56px;
  transform: rotate(-6deg);
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
  font-weight: 800;
  font-size: 34px;
  line-height: 1.1;
}

.meta {
  margin-top: 2px;
  font-weight: 700;
  font-size: 15px;
  color: var(--ink-2);
}

.left {
  margin-top: 6px;
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 20px;
  color: var(--cd-deep);
}

.tiles {
  display: flex;
  gap: 10px;
  flex-shrink: 0;
}

.cell {
  width: 78px;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 10px 0 8px;
  border: 2.5px solid var(--ink);
  border-radius: 20px 20px 20px 8px;
  background: var(--paper);
}

.v {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 32px;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.l {
  margin-top: 4px;
  font-weight: 800;
  font-size: 12px;
  color: var(--mute);
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

  .title {
    font-size: 26px;
  }

  .tiles {
    width: 100%;
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
