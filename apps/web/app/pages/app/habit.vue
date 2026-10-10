<script setup lang="ts">
import { isScheduled } from '~/utils/habits'
import { fromIsoDate, toIsoDate } from '~/utils/time'

definePageMeta({ layout: 'dashboard' })

const { t } = useI18n()
useHead({ title: () => t('feature.habit.label') })

const { habits, today, isMetToday } = useHabits()
const { monthYear } = useDateFormat()

/** Bulan yang dilihat: tanggal 1 bulan itu. Tidak bisa maju melewati bulan ini. */
const month = ref(firstOfMonth(today.value))
/** `undefined` = form tertutup; `null` = habit baru. */
const editing = ref<string | null | undefined>(undefined)

function firstOfMonth(iso: string, shift = 0): string {
  const date = fromIsoDate(iso)
  return toIsoDate(new Date(date.getFullYear(), date.getMonth() + shift, 1))
}

const isCurrentMonth = computed(() => month.value === firstOfMonth(today.value))
const summary = computed(() => {
  const scheduled = habits.value.filter((habit) => isScheduled(habit, today.value))
  return t('habit.summary', {
    done: scheduled.filter(isMetToday).length,
    total: scheduled.length,
  })
})
</script>

<template>
  <div class="habit">
    <header class="header" data-anchor="header" data-anchor-kind="header">
      <div>
        <h1 class="title">{{ $t('feature.habit.label') }}</h1>
        <p class="summary">{{ summary }}</p>
      </div>
      <button type="button" class="new" @click="editing = null">+ {{ $t('habit.new') }}</button>
    </header>

    <section class="board" data-anchor="habit-board" data-anchor-kind="content">
      <div class="bar">
        <div class="month-nav">
          <button
            type="button"
            class="square"
            :aria-label="$t('habit.prevMonth')"
            @click="month = firstOfMonth(month, -1)"
          >
            ‹
          </button>
          <span class="month" aria-live="polite">{{
            monthYear(fromIsoDate(month).getTime())
          }}</span>
          <button
            type="button"
            class="square"
            :disabled="isCurrentMonth"
            :aria-label="$t('habit.nextMonth')"
            @click="month = firstOfMonth(month, 1)"
          >
            ›
          </button>
        </div>
        <div class="legend" aria-hidden="true">
          <span><span class="key met" />{{ $t('habit.legend.met') }}</span>
          <span><span class="key todo" />{{ $t('habit.legend.todo') }}</span>
          <span
            ><span class="key off"><span /></span>{{ $t('habit.legend.off') }}</span
          >
        </div>
      </div>
      <HabitGrid :month="month" @edit="(id) => (editing = id)" />
      <p v-if="!habits.length" class="empty">{{ $t('habit.empty') }}</p>
      <p class="hint">{{ $t('habit.hint') }}</p>
    </section>

    <HabitForm
      v-if="editing !== undefined"
      :habit-id="editing"
      @close="editing = undefined"
      @saved="editing = undefined"
    />
  </div>
</template>

<style scoped>
.habit {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding-bottom: 80px;
}

.header {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
}

.title {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 36px;
  line-height: 1.1;
}

.summary {
  margin-top: 4px;
  font-weight: 700;
  font-size: 16px;
  color: var(--mute);
}

.new {
  height: 44px;
  padding: 0 20px;
  border: none;
  border-radius: var(--radius-pill);
  background: var(--accent);
  color: var(--paper);
  font-weight: 800;
  font-size: 15px;
  white-space: nowrap;
}

.new:hover {
  background: var(--deeper);
}

.board {
  min-width: 0;
  padding: 18px 0 14px;
  border: 2px solid var(--line);
  border-radius: 28px;
  background: var(--paper);
}

.bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 20px 14px;
}

.month-nav {
  display: flex;
  align-items: center;
  gap: 8px;
}

.square {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  border: 2.5px solid var(--ink);
  border-radius: 14px;
  background: var(--paper);
  font-weight: 800;
  font-size: 18px;
}

.square:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.month {
  min-width: 160px;
  text-align: center;
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 22px;
}

.legend {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 14px;
  font-weight: 800;
  font-size: 12px;
  color: var(--mute);
}

.legend > span {
  display: flex;
  align-items: center;
  gap: 6px;
}

.key {
  width: 14px;
  height: 14px;
  border-radius: 5px;
}

.key.met {
  background: var(--accent);
}

.key.todo {
  border: 2px solid var(--dash);
}

.key.off {
  display: flex;
  align-items: center;
  justify-content: center;
}

.key.off > span {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--dash);
}

.empty,
.hint {
  padding: 14px 20px 0;
  font-weight: 700;
  font-size: 12px;
  color: var(--mute);
}

@media (max-width: 599px) {
  .title {
    font-size: 28px;
  }

  .month {
    min-width: 120px;
    font-size: 18px;
  }
}
</style>
