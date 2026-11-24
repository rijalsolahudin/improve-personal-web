<script setup lang="ts">
import {
  type Progress,
  countOn,
  HABIT_COLORS,
  pipCount,
  type Habit,
} from '@improve-personal/core/planner'

/**
 * Habit hari ini + check-in cepat (PRD F12, design v2 `Desktop v2.dc.html` 2264-2286).
 *
 * - Habit single: satu tombol sebaris dengan checkbox di KIRI; klik = tercapai / batal (`toggle`).
 * - Habit multi: ikon polos tanpa tile + pip per langkah. Klik pip ke-N = SET ke N, klik pip yang
 *   sedang menjadi hitungan terakhir = N-1.
 * - Habit multi TIDAK punya tombol pembungkus: klik nama / area kosong tidak mengubah hitungan
 *   (dulu seluruh baris satu tombol besar, jadi klik nama ikut menambah check-in).
 */
const { habits, progress } = defineProps<{
  habits: readonly { habit: Habit; count: number; isDone: boolean; streak: number }[]
  progress: Progress
}>()
const emit = defineEmits<{ toggle: [id: string]; focus: [name: string] }>()

const { t } = useI18n()
/**
 * Pip menyetel angka ABSOLUT, sedangkan kontrak halaman (`daily.toggleHabit`) hanya menambah satu -
 * jadi pip membaca/menulis store habit langsung. `today` diambil dari `useNow` yang sama dengan
 * halaman, jadi tanggalnya tidak bisa meleset dari `habits` yang diprop-kan.
 */
const { checkIns, setDayCount, today } = useHabits()

/** Lebih dari ini pip-nya terlalu rapat; sisanya cukup angka N/target. */
const MAX_PIPS = 12
const PIP_ICON_PX = 20
const HABIT_ICON_PX = 22

const rows = computed(() =>
  habits.map((item) => {
    const color = (HABIT_COLORS[item.habit.color] ?? HABIT_COLORS[0])[0]
    return {
      ...item,
      color,
      isMulti: item.habit.target > 1,
      /** Design: `streak > 0 ? 'N hari' : '0'`. Emoji 🔥 dihapus - angkanya yang dibaca. */
      streakLabel: item.streak > 0 ? t('daily.habit.streak', { n: item.streak }) : '0',
      pips: Array.from({ length: Math.min(item.habit.target, MAX_PIPS) }, (_, index) => ({
        key: `${item.habit.id}-${index}`,
        n: index + 1,
        isOn: index < item.count,
        label: t('daily.habit.pip', {
          n: index + 1,
          target: item.habit.target,
          name: item.habit.name,
        }),
      })),
    }
  }),
)

/** Hitungan dibaca dari store (bukan props) supaya klik beruntun tidak memakai angka yang basi. */
function setPip(habitId: string, n: number): void {
  const day = today.value
  setDayCount(habitId, day, pipCount(countOn(checkIns.value, habitId, day), n))
}
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
      bar-color="var(--icon-habit)"
      :meta="t('daily.meta', { done: progress.done, total: progress.total })"
    />
    <ul v-if="rows.length" class="list">
      <li
        v-for="row in rows"
        :key="row.habit.id"
        class="row hover-reveal"
        :class="{ done: row.isDone }"
      >
        <!-- Single: seluruh baris tetap satu tombol (design v2) dengan checkbox di kiri. -->
        <button
          v-if="!row.isMulti"
          type="button"
          class="check-in"
          :aria-pressed="row.isDone"
          :aria-label="$t('daily.habit.toggle', { name: row.habit.name })"
          @click="emit('toggle', row.habit.id)"
        >
          <span
            class="box"
            :class="{ on: row.isDone }"
            :style="{ '--pip-color': row.color }"
            aria-hidden="true"
            >{{ row.isDone ? '✓' : '' }}</span
          >
          <span class="text">
            <span class="name">{{ row.habit.name }}</span>
          </span>
        </button>
        <!-- Multi: ikon polos + pip per langkah; nama & area kosong sengaja bukan target klik. -->
        <template v-else>
          <HabitIcon :habit="row.habit" :size="HABIT_ICON_PX" bare />
          <span class="text">
            <span class="name">{{ row.habit.name }}</span>
            <span class="pips">
              <button
                v-for="pip in row.pips"
                :key="pip.key"
                type="button"
                class="pip"
                :class="{ on: pip.isOn }"
                :style="{ '--pip-color': row.color }"
                :aria-pressed="pip.isOn"
                :aria-label="pip.label"
                @click="setPip(row.habit.id, pip.n)"
              >
                <Icon :name="row.habit.icon" :size="PIP_ICON_PX" :is-filled="pip.isOn" />
              </button>
            </span>
          </span>
        </template>
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
        <span class="streak">{{ row.streakLabel }}</span>
        <span v-if="row.isMulti" class="count" :style="{ '--pip-color': row.color }"
          >{{ row.count }}/{{ row.habit.target }}</span
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
  padding: var(--space-16) var(--space-18);
  border: var(--border) solid var(--outline);
  border-radius: var(--radius-card);
  background: var(--paper);
  box-shadow: var(--shadow-drop-sm);
}

.card-head {
  padding-bottom: var(--space-12);
  border-bottom: var(--border-thin) dashed var(--dash);
}

.list {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: var(--space-8) 0 0;
  list-style: none;
}

/* Design: baris menempel ke tepi kartu (margin negatif), latar hover, tanpa garis pemisah. */
.row {
  display: flex;
  align-items: center;
  gap: var(--space-12);
  margin: 0 calc(-1 * var(--space-8));
  padding: var(--space-10) var(--space-8);
  border-radius: var(--radius-inner);
}

.row:hover {
  background: var(--hover);
}

.text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

/* Single: tombol sebaris (design) - checkbox di kiri, nama setelahnya. */
.check-in {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--space-12);
  padding: 0;
  border: 0;
  background: none;
  color: var(--ink);
  text-align: left;
  cursor: pointer;
}

.name {
  font-weight: var(--fw-medium);
  font-size: var(--fs-15);
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
  gap: 0;
}

/*
 * Pip = tombol per langkah (design: ikon habit, belum tercapai pudar & mengecil).
 * Kotak 26px adalah target sentuh yang TIDAK ikut mengecil - yang di-scale hanya ikonnya, supaya
 * area klik tetap >= 24px walau visualnya 16px.
 */
.pip {
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  border-radius: calc(6px * var(--rk));
  background: none;
  color: var(--dash);
  opacity: 0.8;
  cursor: pointer;
  transition: color var(--dur) var(--ease);
}

.pip svg {
  transform: scale(0.82);
  transition: transform var(--dur) var(--ease);
}

.pip.on {
  color: var(--pip-color);
  opacity: 1;
}

.pip.on svg {
  transform: none;
}

.streak,
.count {
  flex-shrink: 0;
  font-weight: var(--fw-strong);
  font-size: var(--fs-display-12);
  font-variant-numeric: tabular-nums;
}

/* `--mute` (>= 5,9:1 di `--paper`): warna teks netral design, menggantikan 🔥 oranye. */
.streak {
  color: var(--mute);
  white-space: nowrap;
}

.count {
  min-width: 26px;
  text-align: right;
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: var(--fs-display-15);
  /* Warna habit mentah (#E6A800, #FF6A13, #F03FBF) < 4,5:1 sebagai teks di `--paper`; campuran
     50% dengan `--ink` mempertahankan warna habit dan menaikkan semua 8 warna ke >= 4,95:1. */
  color: color-mix(in srgb, var(--pip-color) 50%, var(--ink));
  font-variant-numeric: tabular-nums;
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
  font-size: var(--fs-12);
}

.box.on {
  background: var(--pip-color);
}

.empty {
  padding: var(--space-14) var(--space-4) var(--space-4);
  font-family: var(--font-hand);
  /* Patrick Hand hanya punya weight 400; paragraf mewarisi `--fw-body` (700) → faux-bold. */
  font-weight: 400;
  font-size: var(--fs-hand-body);
  color: var(--mute);
}
</style>
