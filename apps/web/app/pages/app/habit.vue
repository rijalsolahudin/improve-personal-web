<script setup lang="ts">
import { isScheduled } from '~/utils/habits'
import { fromIsoDate, toIsoDate } from '~/utils/time'

definePageMeta({ layout: 'dashboard' })

const { t } = useI18n()
useHead({ title: () => t('feature.habit.label') })

const { habits, archivedHabits, today, isMetToday, status } = useHabits()
const { monthYear } = useDateFormat()

/**
 * Muat riwayat gagal (storage tidak bisa dibuka) BUKAN "belum ada habit".
 *
 * Tanpa pembeda ini halaman menampilkan ajakan "bikin habit dulu" di atas daftar yang sebenarnya
 * gagal dimuat - user akan membuat habit baru dan mengira datanya hilang.
 */
const hasLoadError = computed(() => status.value === 'error')

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
      <Button variant="primary" @click="editing = null">+ {{ $t('habit.new') }}</Button>
    </header>

    <p v-if="hasLoadError" class="error" role="alert">{{ $t('habit.loadError') }}</p>

    <section class="board" data-anchor="habit-board" data-anchor-kind="content">
      <div class="bar">
        <div class="month-nav">
          <IconButton
            :title="$t('habit.prevMonth')"
            :size="40"
            :radius="14"
            @click="month = firstOfMonth(month, -1)"
          >
            <Icon name="chevron-left" :size="20" />
          </IconButton>
          <span class="month" aria-live="polite">{{
            monthYear(fromIsoDate(month).getTime())
          }}</span>
          <IconButton
            :title="$t('habit.nextMonth')"
            :size="40"
            :radius="14"
            :disabled="isCurrentMonth"
            @click="month = firstOfMonth(month, 1)"
          >
            <Icon name="chevron-right" :size="20" />
          </IconButton>
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
      <p v-if="!hasLoadError && !habits.length && !archivedHabits.length" class="empty">
        {{ $t('habit.empty') }}
      </p>
      <p class="hint">{{ $t('habit.hint') }}</p>
    </section>

    <!-- Arsip ada di luar grid: habit terarsip tidak ikut tabel maupun hitungan hari ini. -->
    <HabitArchive />

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
  /* Setinggi layar (design): kartu tabel memanjang walau habit sedikit. */
  min-height: calc(100vh - 2 * var(--gap-desktop));
  display: flex;
  flex-direction: column;
  gap: var(--space-20);
}

.header {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--space-16);
}

.title {
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: var(--fs-display-36);
  line-height: 1.1;
}

.summary {
  margin-top: var(--space-4);
  font-weight: var(--fw-body);
  font-size: var(--fs-16);
  color: var(--mute);
}

.board {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding: var(--space-18) 0 var(--space-14);
  border: var(--border-thin) solid var(--line);
  border-radius: calc(28px * var(--rk));
  background: var(--paper);
}

.bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-12);
  padding: 0 var(--space-20) var(--space-14);
}

.month-nav {
  display: flex;
  align-items: center;
  gap: var(--space-8);
}

/* Design: panah 18px (tombol 40) dan tombol "bulan berikutnya" memudar 0.35, bukan 0.45. */
.month-nav :deep(.icon-btn) {
  font-size: var(--fs-18);
}

.month-nav :deep(.icon-btn:disabled) {
  opacity: 0.35;
}

.header :deep(.btn-primary:hover) {
  background: var(--deeper);
}

.month {
  min-width: 160px;
  text-align: center;
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: var(--fs-display-22);
}

.legend {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-14);
  font-weight: var(--fw-strong);
  font-size: var(--fs-12);
  color: var(--mute);
}

.legend > span {
  display: flex;
  align-items: center;
  gap: var(--space-6);
}

.key {
  width: 14px;
  height: 14px;
  border-radius: calc(5px * var(--rk));
}

.key.met {
  background: var(--accent);
}

.key.todo {
  border: var(--border-thin) solid var(--dash);
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
  padding: var(--space-14) var(--space-20) 0;
  font-weight: var(--fw-body);
  font-size: var(--fs-12);
  color: var(--mute);
}

.error {
  padding: var(--space-10) var(--space-16);
  border-radius: calc(14px * var(--rk));
  background: #ffe1da;
  color: #9a2a14;
  font-weight: var(--fw-strong);
  font-size: var(--fs-14);
}

@media (max-width: 599px) {
  .habit {
    min-height: 0;
  }

  .title {
    font-size: var(--fs-display-28);
  }

  .month {
    min-width: 120px;
    font-size: var(--fs-display-18);
  }
}
</style>
