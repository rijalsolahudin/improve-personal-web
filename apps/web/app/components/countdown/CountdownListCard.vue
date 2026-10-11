<script setup lang="ts">
import { countdownTint, yearlyEdition, type CountdownView } from '~/utils/countdown'

const { view, now } = defineProps<{ view: CountdownView; now: number }>()
const emit = defineEmits<{ edit: []; archive: [] }>()

const { t } = useI18n()
const { shortDateYear } = useDateFormat()
const countdownText = useCountdownText()

const countdown = computed(() => view.countdown)
const tint = computed(() => countdownTint(countdown.value.color))
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
const showArchive = computed(() => view.past || countdown.value.archived)
</script>

<template>
  <Card
    class="card"
    variant="tinted"
    tint="var(--cd-soft)"
    :padding="'18px 18px 16px'"
    :radius="26"
    :class="{ dim: countdown.archived }"
    :style="{ '--cd-soft': tint[0], '--cd-deep': tint[1] }"
  >
    <button type="button" class="main" @click="emit('edit')">
      <span class="head">
        <span class="tile" aria-hidden="true">{{ countdown.emoji }}</span>
        <span class="info">
          <span class="title">{{ countdown.title }}</span>
          <span class="sub">{{ sub }}</span>
        </span>
      </span>
      <span class="left">{{ left }}</span>
    </button>
    <div class="foot">
      <span class="date">{{ dateLabel }}</span>
      <button v-if="showArchive" type="button" class="archive" @click="emit('archive')">
        {{ countdown.archived ? $t('countdown.unarchive') : $t('countdown.archive') }}
      </button>
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

.main {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 0;
  border: none;
  background: none;
  text-align: left;
}

.main:hover .title {
  color: var(--cd-deep);
}

.head {
  display: flex;
  align-items: center;
  gap: 12px;
}

.tile {
  width: 52px;
  height: 52px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2.5px solid var(--ink);
  border-radius: 18px 18px 18px 6px;
  background: var(--paper);
  font-size: 26px;
  transform: rotate(-5deg);
}

.info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.title {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 19px;
  line-height: 1.15;
}

.sub {
  font-weight: 700;
  font-size: 12px;
  color: var(--ink-2);
}

.left {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 22px;
  line-height: 1.15;
  color: var(--cd-deep);
}

.foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.date {
  font-weight: 700;
  font-size: 12px;
  color: var(--ink-2);
}

.archive {
  padding: 5px 12px;
  border: none;
  border-radius: var(--radius-pill);
  background: var(--paper);
  color: var(--ink-2);
  font-weight: 800;
  font-size: 12px;
  white-space: nowrap;
}
</style>
