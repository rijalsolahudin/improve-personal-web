<script setup lang="ts">
import { SCHEDULE_COLORS, monthDays } from '~/utils/schedule'
import { fromIsoDate } from '~/utils/time'

interface MonthChip {
  key: string
  label: string
  dot: string
  bg: string
}

const MAX_CHIPS = 3
const TASK_DOT = 'var(--icon-todo)'

const { anchor, selected, today } = defineProps<{
  anchor: string
  selected: string
  today: string
}>()
defineEmits<{ select: [day: string] }>()

const { occurrences, tasksOn, markersOn } = useCalendarData()
const { weekdayShort, longDate } = useDateFormat()

const month = computed(() => fromIsoDate(anchor).getMonth())
const cells = computed(() =>
  monthDays(anchor).map((day) => {
    const date = fromIsoDate(day)
    const chips: MonthChip[] = [
      ...occurrences(day).map((occurrence) => {
        const [solid, tint] = SCHEDULE_COLORS[occurrence.schedule.color] ?? SCHEDULE_COLORS[0]
        return { key: occurrence.key, label: occurrence.schedule.title, dot: solid, bg: tint }
      }),
      ...tasksOn(day).map((task) => ({
        key: task.id,
        label: task.title,
        dot: TASK_DOT,
        bg: 'var(--paper)',
      })),
    ]
    return {
      day,
      date: date.getDate(),
      label: longDate(date.getTime()),
      isOutside: date.getMonth() !== month.value,
      chips: chips.slice(0, MAX_CHIPS),
      more: Math.max(0, chips.length - MAX_CHIPS),
      markers: markersOn(day),
    }
  }),
)
// Header Senin–Minggu dari 7 sel pertama (selalu mulai Senin).
const weekdays = computed(() =>
  cells.value.slice(0, 7).map((cell) => weekdayShort(fromIsoDate(cell.day).getTime())),
)
</script>

<template>
  <div class="month">
    <div class="grid" role="grid" :aria-label="$t('calendar.monthGrid')">
      <div v-for="name in weekdays" :key="name" class="dow" role="columnheader">{{ name }}</div>
      <button
        v-for="cell in cells"
        :key="cell.day"
        type="button"
        class="cell"
        :class="{
          outside: cell.isOutside,
          selected: cell.day === selected,
          today: cell.day === today,
        }"
        :aria-label="cell.label"
        :aria-pressed="cell.day === selected"
        @click="$emit('select', cell.day)"
      >
        <span class="top">
          <span class="num">{{ cell.date }}</span>
          <span class="markers">
            <span
              v-for="marker in cell.markers"
              :key="marker.key"
              class="marker"
              :style="{ background: marker.color }"
              :title="marker.title"
            >
              {{ marker.glyph }}
            </span>
          </span>
        </span>
        <span
          v-for="chip in cell.chips"
          :key="chip.key"
          class="chip"
          :style="{ '--chip-bg': chip.bg }"
        >
          <span class="dot" :style="{ background: chip.dot }" aria-hidden="true" />
          <span class="chip-label">{{ chip.label }}</span>
        </span>
        <span v-if="cell.more" class="more">{{ $t('calendar.more', { n: cell.more }) }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 6px;
}

.dow {
  padding: 4px 0;
  text-align: center;
  font-weight: 800;
  font-size: 12px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--mute-3);
}

.cell {
  min-width: 0;
  min-height: 104px;
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 6px;
  border: 2.5px solid transparent;
  border-radius: 16px;
  background: var(--paper);
  text-align: left;
}

.cell:hover {
  border-color: var(--dash-2);
}

.cell.outside {
  background: var(--alt);
  opacity: 0.55;
}

.cell.selected {
  border-color: var(--ink);
  background: var(--soft);
}

.top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.num {
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 9px;
  font-weight: 800;
  font-size: 13px;
}

.today .num {
  background: var(--accent);
  color: var(--paper);
}

.markers {
  display: flex;
  gap: 2px;
}

.marker {
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 5px;
  color: var(--paper);
  font-weight: 800;
  font-size: 9px;
}

.chip {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px;
  border: 2px solid var(--ink);
  border-radius: var(--radius-pill);
  background: var(--chip-bg);
  font-weight: 800;
  font-size: 11px;
  line-height: 1.25;
}

.dot {
  width: 7px;
  height: 7px;
  flex-shrink: 0;
  border-radius: 2px;
}

.chip-label {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.more {
  padding: 0 6px;
  font-weight: 800;
  font-size: 11px;
  color: var(--mute);
}

@media (max-width: 599px) {
  .grid {
    gap: 3px;
  }

  .cell {
    min-height: 64px;
    padding: 4px;
    border-radius: 12px;
  }

  /* Di HP cukup titik warna, judul tidak muat. */
  .chip {
    padding: 0;
    border: none;
    background: none;
  }

  .chip-label,
  .more {
    display: none;
  }

  .markers {
    display: none;
  }
}
</style>
