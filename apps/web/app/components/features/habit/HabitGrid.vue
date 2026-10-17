<script setup lang="ts">
import {
  HABIT_COLORS,
  completionRate,
  countOn,
  isMet,
  isScheduled,
  monthDaysOf,
  type Habit,
} from '~/utils/habits'
import { WEEKDAY_ORDER } from '~/utils/schedule'
import { fromIsoDate } from '~/utils/time'

/** Tabel habit × tanggal sebulan (design): centang, libur = titik, streak, % bulan ini. */
const { month } = defineProps<{ month: string }>()
defineEmits<{ edit: [id: string] }>()

const { t } = useI18n()
const { habits, checkIns, today, toggleDay, streakOf } = useHabits()
const { weekdayShort, weekdayOfIndex, shortDate } = useDateFormat()

const days = computed(() =>
  monthDaysOf(month).map((day) => {
    const date = fromIsoDate(day)
    return {
      day,
      n: date.getDate(),
      dow: weekdayShort(date.getTime()),
      isToday: day === today.value,
      isWeekend: date.getDay() === 0 || date.getDay() === 6,
      /** Garis pemisah minggu: tiap Senin kecuali tanggal 1. */
      isWeekStart: date.getDay() === 1 && date.getDate() > 1,
      label: shortDate(date.getTime()),
    }
  }),
)

function frequencyLabel(habit: Habit): string {
  const days = habit.days
    ? WEEKDAY_ORDER.filter((d) => habit.days?.includes(d))
        .map(weekdayOfIndex)
        .join(', ')
    : t('habit.everyDay')
  return habit.target > 1 ? `${days} · ${t('habit.perDay', { n: habit.target })}` : days
}

const rows = computed(() =>
  habits.value.map((habit) => {
    const solid = (HABIT_COLORS[habit.color] ?? HABIT_COLORS[0])[0]
    const soft = (HABIT_COLORS[habit.color] ?? HABIT_COLORS[0])[1]
    const lastDay = days.value.at(-1)?.day ?? month
    const until = lastDay < today.value ? lastDay : today.value
    return {
      habit,
      solid,
      soft,
      frequency: frequencyLabel(habit),
      streak: streakOf(habit),
      rate: completionRate(habit, checkIns.value, days.value[0]?.day ?? month, until),
      cells: days.value.map((info) => {
        const scheduled = isScheduled(habit, info.day)
        const isFuture = info.day > today.value
        const count = countOn(checkIns.value, habit.id, info.day)
        const met = scheduled && !isFuture && isMet(habit, checkIns.value, info.day)
        const partial = info.isToday && habit.target > 1 && !met && count > 0
        let state = t('habit.cell.missed')
        if (!scheduled) state = t('habit.cell.off')
        else if (isFuture) state = t('habit.cell.future')
        else if (met) state = t('habit.cell.met')
        else if (info.isToday && habit.target > 1) state = `${count}/${habit.target}`
        return {
          ...info,
          scheduled,
          isFuture,
          met,
          partial,
          count,
          label: `${habit.name}, ${info.label}: ${state}`,
        }
      }),
    }
  }),
)

// Buka tabel di sekitar hari ini (di layar sempit tanggal 1 bisa jauh dari hari ini).
const scroller = useTemplateRef<HTMLElement>('scroller')
const CONTEXT_COLUMNS = 3
function scrollToToday(): void {
  const el = scroller.value
  const todayHead = el?.querySelector<HTMLElement>('.th-day.today')
  const sticky = el?.querySelector<HTMLElement>('.th-name')
  if (!el || !todayHead || !sticky) return
  el.scrollLeft = Math.max(
    0,
    todayHead.offsetLeft - sticky.offsetWidth - todayHead.offsetWidth * CONTEXT_COLUMNS,
  )
}
onMounted(scrollToToday)
watch(
  () => month,
  () => nextTick(scrollToToday),
)

const gridStyle = computed(() => ({
  gridTemplateColumns: `minmax(220px, 260px) repeat(${days.value.length}, 34px) 70px 104px`,
}))
</script>

<template>
  <div ref="scroller" class="scroll">
    <div class="table" role="table" :aria-label="$t('habit.tableLabel')">
      <div class="row head" :style="gridStyle" role="row">
        <span class="sticky th-name" role="columnheader">{{ $t('habit.colHabit') }}</span>
        <span
          v-for="info in days"
          :key="info.day"
          class="th-day"
          :class="{ today: info.isToday, week: info.isWeekStart }"
          role="columnheader"
          :aria-label="info.label"
        >
          <span class="dow" :class="{ weekend: info.isWeekend }">{{ info.dow }}</span>
          <span class="num">{{ info.n }}</span>
        </span>
        <span class="th-streak" role="columnheader">{{ $t('habit.colStreak') }}</span>
        <span class="th-rate" role="columnheader">{{ $t('habit.colMonth') }}</span>
      </div>

      <div v-for="row in rows" :key="row.habit.id" class="row" :style="gridStyle" role="row">
        <button
          type="button"
          class="sticky name-cell"
          role="rowheader"
          :title="$t('habit.editHint')"
          @click="$emit('edit', row.habit.id)"
        >
          <HabitIcon :habit="row.habit" />
          <span class="name-text">
            <span class="name">{{ row.habit.name }}</span>
            <span class="freq">{{ row.frequency }}</span>
          </span>
        </button>
        <span
          v-for="cell in row.cells"
          :key="cell.day"
          class="cell"
          :class="{ today: cell.isToday, week: cell.isWeekStart }"
          role="cell"
        >
          <span v-if="!cell.scheduled" class="off" :title="cell.label" />
          <button
            v-else
            type="button"
            class="box"
            :class="{
              met: cell.met,
              partial: cell.partial,
              future: cell.isFuture,
              current: cell.isToday,
            }"
            :style="{ '--h-solid': row.solid, '--h-soft': row.soft }"
            :disabled="cell.isFuture"
            :aria-pressed="cell.met"
            :aria-label="cell.label"
            :title="cell.label"
            @click="toggleDay(row.habit.id, cell.day)"
          >
            {{ cell.met ? '✓' : cell.partial ? cell.count : '' }}
          </button>
        </span>
        <span class="streak" :class="{ active: row.streak > 0 }" role="cell">
          <span class="streak-n">{{ row.streak }}</span>
          <span class="streak-unit">{{ $t('habit.daysShort') }}</span>
        </span>
        <span class="rate" role="cell">
          <span class="rate-n">{{ row.rate }}%</span>
          <ProgressBar class="bar" :pct="row.rate" :color="row.solid" track="var(--chip)" />
        </span>
      </div>

      <!-- Pengisi sampai dasar kartu (design): kolom nama, hari ini & pemisah minggu tetap menyambung. -->
      <div class="row filler" :style="gridStyle" aria-hidden="true">
        <span class="sticky" />
        <span
          v-for="info in days"
          :key="info.day"
          class="fill-day"
          :class="{ today: info.isToday, week: info.isWeekStart }"
        />
        <span class="fill-streak" />
        <span />
      </div>
    </div>
  </div>
</template>

<style scoped>
.scroll {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow-x: auto;
}

.table {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: max-content;
}

.row {
  display: grid;
  align-items: stretch;
  border-bottom: calc(1.5px * var(--bk)) solid var(--line-2);
}

.row.head {
  border-bottom: var(--border-thin) solid var(--line);
}

.sticky {
  position: sticky;
  left: 0;
  z-index: 1;
  border-right: var(--border-thin) solid var(--line);
  background: var(--paper);
}

.th-name,
.th-streak,
.th-rate {
  display: flex;
  align-items: flex-end;
  padding-bottom: 10px;
  font-weight: var(--fw-strong);
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--mute-3);
}

.th-name {
  padding: 0 12px 10px 20px;
}

.th-streak {
  justify-content: center;
  border-left: var(--border-thin) solid var(--line);
}

.th-rate {
  padding: 0 20px 10px 4px;
}

.th-day {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 6px 0 8px;
  border-radius: calc(12px * var(--rk)) calc(12px * var(--rk)) 0 0;
}

.th-day.today,
.cell.today,
.fill-day.today {
  background: var(--soft);
}

.filler {
  flex: 1;
  min-height: 24px;
  border-bottom: 0;
}

.fill-day.today {
  border-radius: 0 0 calc(12px * var(--rk)) calc(12px * var(--rk));
}

.fill-streak {
  border-left: var(--border-thin) solid var(--line);
}

.week {
  border-left: calc(1.5px * var(--bk)) solid var(--line-2);
}

.dow {
  font-weight: var(--fw-strong);
  font-size: 10px;
  letter-spacing: 0.04em;
  color: var(--mute-3);
}

.dow.weekend {
  color: #c2381a;
}

.today .dow {
  color: var(--deeper);
}

.num {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  font-weight: var(--fw-strong);
  font-size: 13px;
}

.today .num {
  background: var(--accent);
  color: var(--paper);
}

.name-cell {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px 10px 20px;
  border-top: none;
  border-bottom: none;
  border-left: none;
  text-align: left;
}

.name-text {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.name,
.freq {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.name {
  font-weight: var(--fw-strong);
  font-size: 15px;
  line-height: 1.25;
}

.name-cell:hover .name {
  color: var(--accent);
}

.freq {
  margin-top: 1px;
  font-weight: var(--fw-body);
  font-size: 12px;
  color: var(--mute);
}

.cell {
  min-height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.off {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--dash);
}

.box {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: var(--border-thin) solid var(--dash);
  border-radius: calc(8px * var(--rk));
  background: transparent;
  font-weight: var(--fw-strong);
  font-size: 13px;
  transition: transform var(--dur) var(--ease);
}

.box:not(:disabled):hover {
  transform: scale(1.12);
}

.box.current {
  border-color: var(--mute-3);
}

.box.future {
  border: calc(1.5px * var(--bk)) dashed var(--line);
  cursor: default;
}

.box.partial {
  border: none;
  background: var(--h-soft);
  font-size: 11px;
}

.box.met {
  border: none;
  background: var(--h-solid);
  color: var(--paper);
}

.streak {
  height: 100%;
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 3px;
  padding-top: 16px;
  border-left: var(--border-thin) solid var(--line);
}

.streak-n {
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: 18px;
  line-height: 1;
  color: var(--mute-3);
}

.streak.active .streak-n {
  color: #c2531a;
}

.streak-unit {
  font-weight: var(--fw-body);
  font-size: 11px;
  color: var(--mute);
}

.rate {
  align-self: center;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 0 20px 0 4px;
}

.rate-n {
  font-weight: var(--fw-strong);
  font-size: 13px;
  line-height: 1;
}
</style>
