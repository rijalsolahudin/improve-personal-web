<script setup lang="ts">
import type { Progress } from '~/utils/dailyRoutine'
import { HABIT_COLORS, type Habit } from '~/utils/habits'

/** Habit hari ini + quick check (PRD F12): 1 klik = check-in, habit multi-target pakai pip ikon habit. */
const { habits, progress } = defineProps<{
  habits: readonly { habit: Habit; count: number; isDone: boolean; streak: number }[]
  progress: Progress
}>()
const emit = defineEmits<{ toggle: [id: string]; focus: [name: string] }>()

const { t } = useI18n()

/** Lebih dari ini pip-nya terlalu rapat; sisanya cukup angka N/target. */
const MAX_PIPS = 12
const PIP_ICON_PX = 18

const rows = computed(() =>
  habits.map((item) => ({
    ...item,
    color: (HABIT_COLORS[item.habit.color] ?? HABIT_COLORS[0])[0],
    isMulti: item.habit.target > 1,
    pips: Array.from({ length: Math.min(item.habit.target, MAX_PIPS) }, (_, index) => ({
      key: `${item.habit.id}-${index}`,
      isOn: index < item.count,
    })),
  })),
)
</script>

<template>
  <section class="card" aria-labelledby="daily-habit-title">
    <DailyCardHead
      class="card-head"
      icon="flame"
      color="--icon-habit"
      :title="$t('daily.habit.title')"
      title-id="daily-habit-title"
      :link-label="$t('daily.habit.link')"
      :link-to="getFeature('habit').path"
      :pct="progress.percent"
      :meta="t('daily.meta', { done: progress.done, total: progress.total })"
    />
    <ul v-if="rows.length" class="list">
      <li
        v-for="row in rows"
        :key="row.habit.id"
        class="row hover-reveal"
        :class="{ done: row.isDone }"
      >
        <button
          type="button"
          class="check-in"
          :aria-pressed="row.isDone"
          :aria-label="$t('daily.habit.toggle', { name: row.habit.name })"
          @click="emit('toggle', row.habit.id)"
        >
          <HabitIcon :habit="row.habit" :size="32" is-plain />
          <span class="text">
            <span class="name">{{ row.habit.name }}</span>
            <span v-if="row.isMulti" class="pips" aria-hidden="true">
              <span
                v-for="pip in row.pips"
                :key="pip.key"
                class="pip"
                :class="{ on: pip.isOn }"
                :style="{ '--pip-color': row.color }"
              >
                <Icon :name="row.habit.icon" :size="PIP_ICON_PX" :is-filled="pip.isOn" />
              </span>
            </span>
          </span>
        </button>
        <Button
          v-if="!row.isDone"
          variant="chip"
          size="xs"
          class="focus reveal"
          :aria-label="$t('daily.focusLabel', { title: row.habit.name })"
          @click="emit('focus', row.habit.name)"
        >
          {{ $t('daily.focus') }}
        </Button>
        <span class="streak" :title="$t('daily.habit.streak', { n: row.streak })"
          >🔥 {{ row.streak }}</span
        >
        <span v-if="row.isMulti" class="count">{{ row.count }}/{{ row.habit.target }}</span>
        <span
          v-else
          class="box"
          :class="{ on: row.isDone }"
          :style="{ '--pip-color': row.color }"
          aria-hidden="true"
          >{{ row.isDone ? '✓' : '' }}</span
        >
      </li>
    </ul>
    <p v-else class="empty">{{ $t('daily.habit.empty') }}</p>
  </section>
</template>

<style scoped>
.card {
  display: flex;
  flex-direction: column;
  padding: 16px 18px;
  border: var(--border) solid var(--outline);
  border-radius: var(--radius-card);
  background: var(--paper);
  box-shadow: var(--shadow-drop-sm);
}

.card-head {
  padding-bottom: 12px;
  border-bottom: var(--border-thin) dashed var(--dash);
}

.list {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}

.row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 9px 2px;
  border-bottom: var(--border-thin) solid var(--mline);
}

.check-in {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0;
  border: 0;
  background: none;
  color: var(--ink);
  text-align: left;
}

.text {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.name {
  font-weight: var(--fw-strong);
  font-size: 14.5px;
  line-height: 1.25;
}

.done .name {
  text-decoration: line-through;
  /* `--mute-3` >= 5,38:1 di `--paper`; opacity 0.6 hanya ~3,68:1 (QA #62). */
  color: var(--mute-3);
}

.pips {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
}

/* Pip = ikon habit (design): belum = garis pudar & mengecil, tercapai = terisi warna habit. */
.pip {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--dash);
  transform: scale(0.85);
  transition: transform var(--dur) var(--ease);
}

.pip.on {
  color: var(--pip-color);
  transform: none;
}

.streak,
.count {
  flex-shrink: 0;
  font-weight: var(--fw-strong);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.streak {
  /* --streak terlalu terang untuk teks 12px; versi teks oranye lolos kontras AA. */
  color: var(--cat-kesehatan-text);
}

.count {
  min-width: 26px;
  text-align: right;
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: 15px;
}

.box {
  width: 26px;
  height: 26px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: var(--border) solid var(--outline);
  border-radius: calc(8px * var(--rk)) calc(8px * var(--rk)) calc(8px * var(--rk))
    calc(3px * var(--rk));
  background: var(--paper);
  color: var(--paper);
  font-weight: var(--fw-strong);
  font-size: 12px;
}

.box.on {
  background: var(--pip-color);
}

.empty {
  padding: 14px 4px 4px;
  font-family: var(--font-hand);
  font-size: var(--fs-hand-body);
  color: var(--mute);
}
</style>
