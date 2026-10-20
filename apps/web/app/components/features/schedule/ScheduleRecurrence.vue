<script setup lang="ts">
import {
  DAILY_N_OPTIONS,
  WEEKDAY_ORDER,
  type RecurrenceType,
  type ScheduleDraft,
  type ScheduleDraftError,
} from '~/utils/schedule'
import { fromIsoDate } from '~/utils/time'

/** Pilihan "Berulang" di form jadwal: sekali / harian tiap n hari / mingguan / bulanan + aturan berakhir. */
const draft = defineModel<ScheduleDraft>({ required: true })
const { error = null } = defineProps<{ error?: ScheduleDraftError | null }>()

const TYPES: readonly RecurrenceType[] = ['once', 'daily', 'weekly', 'monthly']
const INTERVALS = [1, 2] as const
const WEEKS = [1, 2, 3, 4, 5] as const
const MONTH_MODES = ['date', 'nth'] as const
const END_MODES = ['never', 'until', 'count'] as const

const { t } = useI18n()
const { weekdayOfIndex } = useDateFormat()

const typeOptions = computed(() =>
  TYPES.map((value) => ({ value, label: t(`calendar.form.rec.${value}`) })),
)
const monthModeOptions = computed(() =>
  MONTH_MODES.map((value) => ({ value, label: t(`calendar.form.monthMode.${value}`) })),
)
const endOptions = computed(() =>
  END_MODES.map((value) => ({ value, label: t(`calendar.form.ends.${value}`) })),
)

// Selalu ganti objek (bukan mutasi properti) supaya tidak memutasi prop milik parent.
function set(change: Partial<ScheduleDraft>): void {
  draft.value = { ...draft.value, ...change }
}

function toggleDay(day: number): void {
  const days = draft.value.weekDays
  set({ weekDays: days.includes(day) ? days.filter((d) => d !== day) : [...days, day] })
}

// Tanggal mulai berubah = titik acuan pola bulanan ikut berubah.
watch(
  () => draft.value.date,
  (date) => {
    if (draft.value.rec !== 'monthly') return
    const weekday = fromIsoDate(date).getDay()
    set({ monthWeek: Math.ceil(fromIsoDate(date).getDate() / 7), monthWeekday: weekday })
  },
)
</script>

<template>
  <fieldset class="rec">
    <legend class="label">{{ $t('calendar.form.repeat') }}</legend>
    <Segmented
      class="seg-fit"
      :model-value="draft.rec"
      :options="typeOptions"
      :label="$t('calendar.form.repeat')"
      @update:model-value="(value) => set({ rec: value })"
    />

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

    <template v-else-if="draft.rec === 'monthly'">
      <Segmented
        class="seg-fit month-mode"
        :model-value="draft.monthMode"
        :options="monthModeOptions"
        :label="$t('calendar.form.monthMode.date')"
        @update:model-value="(value) => set({ monthMode: value })"
      />

      <p v-if="draft.monthMode === 'date'" class="note">
        {{ $t('calendar.form.monthlyNote', { day: fromIsoDate(draft.date).getDate() }) }}
      </p>

      <template v-else>
        <div class="line">
          <span>{{ $t('calendar.form.monthWeekLabel') }}</span>
          <button
            v-for="week in WEEKS"
            :key="week"
            type="button"
            class="chip"
            :aria-pressed="draft.monthWeek === week"
            @click="set({ monthWeek: week })"
          >
            {{ week }}
          </button>
        </div>
        <div class="line" role="group" :aria-label="$t('calendar.form.monthWeekdayLabel')">
          <button
            v-for="day in WEEKDAY_ORDER"
            :key="day"
            type="button"
            class="chip"
            :aria-pressed="draft.monthWeekday === day"
            @click="set({ monthWeekday: day })"
          >
            {{ weekdayOfIndex(day) }}
          </button>
        </div>
      </template>
    </template>

    <div v-if="draft.rec !== 'once'" class="ends">
      <span class="label">{{ $t('calendar.form.endsLabel') }}</span>
      <Segmented
        class="seg-fit"
        :model-value="draft.ends"
        :options="endOptions"
        :label="$t('calendar.form.endsLabel')"
        @update:model-value="(value) => set({ ends: value })"
      />
      <input
        v-if="draft.ends === 'until'"
        v-model="draft.untilDate"
        class="field"
        type="date"
        :aria-label="$t('calendar.form.untilDate')"
        :aria-invalid="error === 'untilDate'"
      />
      <label v-else-if="draft.ends === 'count'" class="count">
        <input
          v-model.number="draft.count"
          class="field short"
          type="number"
          min="1"
          max="999"
          :aria-label="$t('calendar.form.count')"
          :aria-invalid="error === 'count'"
        />
        <span>{{ $t('calendar.form.countUnit') }}</span>
      </label>
    </div>
  </fieldset>
</template>

<style scoped>
.rec {
  margin: 0;
  padding: 0;
  border: none;
}

.label {
  display: block;
  margin-bottom: 6px;
  font-weight: var(--fw-strong);
  font-size: 13px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--mute-2);
}

.seg-fit {
  width: fit-content;
}

.month-mode {
  margin-top: 10px;
}

.chip {
  min-width: 28px;
  padding: 8px 14px;
  border: none;
  border-radius: var(--radius-pill);
  background: #f2e4cc;
  color: var(--mute-2);
  font-weight: var(--fw-strong);
  font-size: 14px;
}

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
  font-weight: var(--fw-strong);
  color: var(--mute-2);
}

.note {
  margin-top: 10px;
  font-weight: var(--fw-body);
  font-size: 14px;
  color: var(--mute-2);
}

.ends {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 14px;
  padding-top: 14px;
  border-top: var(--border-thin) dashed var(--line-2);
}

.ends .label {
  margin: 0;
}

.field {
  padding: 9px 12px;
  border: var(--border) solid var(--outline);
  border-radius: var(--radius-btn-sq);
  background: var(--paper);
  font-weight: var(--fw-body);
  font-size: 14px;
  outline: none;
}

.field[aria-invalid='true'] {
  border-color: #e2445c;
}

.field.short {
  width: 100px;
}

.count {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: var(--fw-strong);
  color: var(--mute-2);
}
</style>
