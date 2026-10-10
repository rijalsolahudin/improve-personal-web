<script setup lang="ts">
import {
  DAILY_N_OPTIONS,
  WEEKDAY_ORDER,
  type RecurrenceType,
  type ScheduleDraft,
} from '~/utils/schedule'
import { fromIsoDate } from '~/utils/time'

/** Pilihan "Berulang" di form jadwal: sekali / harian tiap n hari / mingguan / bulanan. */
const draft = defineModel<ScheduleDraft>({ required: true })

const TYPES: readonly RecurrenceType[] = ['once', 'daily', 'weekly', 'monthly']
const INTERVALS = [1, 2] as const
const { weekdayOfIndex } = useDateFormat()

// Selalu ganti objek (bukan mutasi properti) supaya tidak memutasi prop milik parent.
function set(change: Partial<ScheduleDraft>): void {
  draft.value = { ...draft.value, ...change }
}

function toggleDay(day: number): void {
  const days = draft.value.weekDays
  set({ weekDays: days.includes(day) ? days.filter((d) => d !== day) : [...days, day] })
}
</script>

<template>
  <fieldset class="rec">
    <legend class="label">{{ $t('calendar.form.repeat') }}</legend>
    <div class="pills">
      <button
        v-for="type in TYPES"
        :key="type"
        type="button"
        :aria-pressed="draft.rec === type"
        @click="set({ rec: type })"
      >
        {{ $t(`calendar.form.rec.${type}`) }}
      </button>
    </div>

    <div v-if="draft.rec === 'daily'" class="line">
      <span>{{ $t('calendar.form.every') }}</span>
      <button
        v-for="n in DAILY_N_OPTIONS"
        :key="n"
        type="button"
        class="chip"
        :aria-pressed="draft.dailyN === n"
        @click="set({ dailyN: n })"
      >
        {{ n }}
      </button>
      <span>{{ $t('calendar.form.days') }}</span>
    </div>

    <template v-else-if="draft.rec === 'weekly'">
      <div class="line" role="group" :aria-label="$t('calendar.form.weekdays')">
        <button
          v-for="day in WEEKDAY_ORDER"
          :key="day"
          type="button"
          class="chip"
          :aria-pressed="draft.weekDays.includes(day)"
          @click="toggleDay(day)"
        >
          {{ weekdayOfIndex(day) }}
        </button>
      </div>
      <div class="line">
        <button
          v-for="interval in INTERVALS"
          :key="interval"
          type="button"
          class="chip"
          :aria-pressed="draft.weekInterval === interval"
          @click="set({ weekInterval: interval })"
        >
          {{ $t(interval === 1 ? 'calendar.form.everyWeek' : 'calendar.form.everyTwoWeeks') }}
        </button>
      </div>
    </template>

    <p v-else-if="draft.rec === 'monthly'" class="note">
      {{ $t('calendar.form.monthlyNote', { day: fromIsoDate(draft.date).getDate() }) }}
    </p>
  </fieldset>
</template>

<style scoped>
.rec {
  margin: 0;
  padding: 0;
  border: none;
}

.label {
  margin-bottom: 6px;
  padding: 0;
  font-weight: 800;
  font-size: 13px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--mute-2);
}

.pills {
  width: fit-content;
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  padding: 4px;
  border-radius: var(--radius-pill);
  background: var(--chip);
}

.pills button,
.chip {
  padding: 8px 14px;
  border: none;
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--mute-2);
  font-weight: 800;
  font-size: 14px;
}

.chip {
  min-width: 28px;
  background: #f2e4cc;
}

.pills button[aria-pressed='true'],
.chip[aria-pressed='true'] {
  background: var(--accent);
  color: var(--paper);
}

.line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
  font-weight: 800;
  color: var(--mute-2);
}

.note {
  margin-top: 10px;
  font-weight: 700;
  font-size: 14px;
  color: var(--mute-2);
}
</style>
