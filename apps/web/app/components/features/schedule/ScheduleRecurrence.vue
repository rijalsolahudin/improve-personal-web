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
const { error = null, errorId = undefined } = defineProps<{
  error?: ScheduleDraftError | null
  /** Id pesan error di form induk, ditautkan ke kolom yang bermasalah. */
  errorId?: string
}>()

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
      <Chip
        v-for="n in DAILY_N_OPTIONS"
        :key="n"
        variant="choice"
        :active="draft.dailyN === n"
        @click="set({ dailyN: n })"
      >
        {{ n }}
      </Chip>
      <span>{{ $t('calendar.form.days') }}</span>
    </div>

    <template v-else-if="draft.rec === 'weekly'">
      <div class="line" role="group" :aria-label="$t('calendar.form.weekdays')">
        <Chip
          v-for="day in WEEKDAY_ORDER"
          :key="day"
          variant="choice"
          :active="draft.weekDays.includes(day)"
          @click="toggleDay(day)"
        >
          {{ weekdayOfIndex(day) }}
        </Chip>
      </div>
      <div class="line">
        <Chip
          v-for="interval in INTERVALS"
          :key="interval"
          variant="choice"
          :active="draft.weekInterval === interval"
          @click="set({ weekInterval: interval })"
        >
          {{ $t(interval === 1 ? 'calendar.form.everyWeek' : 'calendar.form.everyTwoWeeks') }}
        </Chip>
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
          <Chip
            v-for="week in WEEKS"
            :key="week"
            variant="choice"
            :active="draft.monthWeek === week"
            @click="set({ monthWeek: week })"
          >
            {{ week }}
          </Chip>
        </div>
        <div class="line" role="group" :aria-label="$t('calendar.form.monthWeekdayLabel')">
          <Chip
            v-for="day in WEEKDAY_ORDER"
            :key="day"
            variant="choice"
            :active="draft.monthWeekday === day"
            @click="set({ monthWeekday: day })"
          >
            {{ weekdayOfIndex(day) }}
          </Chip>
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
      <Input
        v-if="draft.ends === 'until'"
        v-model="draft.untilDate"
        size="sm"
        type="date"
        :aria-label="$t('calendar.form.untilDate')"
        :aria-invalid="error === 'untilDate'"
        :aria-describedby="error === 'untilDate' ? errorId : undefined"
      />
      <label v-else-if="draft.ends === 'count'" class="count">
        <Input
          v-model.number="draft.count"
          class="short"
          size="sm"
          type="number"
          min="1"
          max="999"
          :aria-label="$t('calendar.form.count')"
          :aria-invalid="error === 'count'"
          :aria-describedby="error === 'count' ? errorId : undefined"
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
  margin-bottom: var(--space-6);
  font-weight: var(--fw-strong);
  font-size: var(--fs-13);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--mute-2);
}

.seg-fit {
  width: fit-content;
}

.month-mode {
  margin-top: var(--space-10);
}

.line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-6);
  margin-top: var(--space-10);
  font-weight: var(--fw-strong);
  color: var(--mute-2);
}

.note {
  margin-top: var(--space-10);
  font-weight: var(--fw-body);
  font-size: var(--fs-14);
  color: var(--mute-2);
}

.ends {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-8);
  margin-top: var(--space-14);
  padding-top: var(--space-14);
  border-top: var(--border-thin) dashed var(--line-2);
}

.ends .label {
  margin: 0;
}

.short {
  width: 100px;
}

.count {
  display: flex;
  align-items: center;
  gap: var(--space-8);
  font-weight: var(--fw-strong);
  color: var(--mute-2);
}
</style>
