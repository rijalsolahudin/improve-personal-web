<script setup lang="ts">
import { countdownTint, dayBadge, yearlyEdition, type CountdownView } from '~/utils/countdown'

const { view, now } = defineProps<{ view: CountdownView; now: number }>()
const emit = defineEmits<{ edit: []; archive: [] }>()

const { t } = useI18n()
const { shortDateYear } = useDateFormat()
const countdownText = useCountdownText()

const countdown = computed(() => view.countdown)
const tint = computed(() => countdownTint(countdown.value.color))
const dateLabel = computed(
  () => shortDateYear(view.target) + (countdown.value.time ? ` · ${countdown.value.time}` : ''),
)
const sub = computed(() => {
  if (!countdown.value.yearly) return t('countdown.sub.once')
  const edition = yearlyEdition(countdown.value, view.target)
  return edition > 0 ? t('countdown.sub.yearlyNth', { n: edition }) : t('countdown.sub.yearly')
})
const left = computed(() => (view.today ? t('countdown.today') : countdownText(view.target, now)))
const showArchive = computed(() => view.past || countdown.value.archived)
/** Kotak kanan (design `dNum`/`dLbl`): 🎉 di hari-H, selain itu jumlah hari. */
const badge = computed(() => {
  const value = dayBadge(view.target, now, view.today)
  return { value: value.kind === 'today' ? '🎉' : String(value.days), label: value.kind }
})
</script>

<template>
  <Card
    class="card"
    variant="tinted"
    tint="var(--cd-soft)"
    :padding="'18px 18px 16px'"
    :radius="26"
    :class="{ dim: showArchive }"
    :style="{ '--cd-soft': tint[0], '--cd-deep': tint[1] }"
  >
    <button type="button" class="head" @click="emit('edit')">
      <span class="tile" aria-hidden="true">
        <CountdownArt :countdown="countdown" :size="36" />
      </span>
      <span class="info">
        <span class="title">{{ countdown.title }}</span>
        <span class="sub">{{ sub }}</span>
      </span>
      <span class="badge">
        <span class="badge-n">{{ badge.value }}</span>
        <span class="badge-l">{{ $t(`countdown.badge.${badge.label}`) }}</span>
      </span>
    </button>
    <span class="rule" aria-hidden="true" />
    <div class="foot">
      <span class="when">
        <span class="left">{{ left }}</span>
        <span class="date">{{ dateLabel }}</span>
      </span>
      <Button v-if="showArchive" variant="paper" size="xs" @click="emit('archive')">
        {{ countdown.archived ? $t('countdown.unarchive') : $t('countdown.archive') }}
      </Button>
    </div>
  </Card>
</template>

<style scoped>
.card {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.card.dim {
  opacity: 0.7;
}

.head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0;
  border: none;
  background: none;
  text-align: left;
}

.head:hover .title {
  color: var(--cd-deep);
}

.tile {
  width: 52px;
  height: 52px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: var(--border) solid var(--outline);
  border-radius: calc(18px * var(--rk)) calc(18px * var(--rk)) calc(18px * var(--rk))
    calc(6px * var(--rk));
  background: var(--paper);
  font-size: 26px;
  transform: rotate(calc(-5deg * var(--bev)));
}

.info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.title {
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: 19px;
  line-height: 1.15;
}

.sub {
  font-weight: var(--fw-body);
  font-size: 12px;
  color: var(--ink-2);
}

.badge {
  min-width: 64px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 6px 8px 5px;
  border: var(--border) solid var(--outline);
  border-radius: calc(16px * var(--rk)) calc(16px * var(--rk)) calc(16px * var(--rk))
    calc(5px * var(--rk));
  background: var(--paper);
}

.badge-n {
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: 30px;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  color: var(--cd-deep);
}

.badge-l {
  font-weight: var(--fw-strong);
  font-size: 9.5px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  white-space: nowrap;
  color: var(--ink-2);
}

.rule {
  height: 2px;
  border-radius: 2px;
  background: var(--cd-deep);
  opacity: 0.18;
}

.foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.when {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.left {
  font-weight: var(--fw-strong);
  font-size: 14px;
  color: var(--cd-deep);
}

.date {
  font-weight: var(--fw-body);
  font-size: 12px;
  color: var(--ink-2);
}
</style>
