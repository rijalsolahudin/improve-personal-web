<script setup lang="ts">
import { sessionMinutes, formatHourMinute } from '@improve-personal/core/planner'

/** Riwayat sesi fokus hari ini (selesai & dilewati). */
const pomodoro = usePomodoro()
const now = useNow()

const today = computed(() => {
  const day = new Date(now.value).toDateString()
  return pomodoro.history.value.filter(
    (session) => new Date(session.endedAt).toDateString() === day,
  )
})
</script>

<template>
  <section
    class="card"
    data-anchor="pomodoro-history"
    data-anchor-kind="content"
    aria-labelledby="pomo-history-title"
  >
    <div class="head">
      <h2 id="pomo-history-title" class="title">{{ $t('pomodoro.historyTitle') }}</h2>
      <span class="total">{{
        $t('pomodoro.minutesShort', { n: pomodoro.focusMinutesToday.value })
      }}</span>
    </div>
    <ul class="rows">
      <li
        v-for="session in today"
        :key="session.id"
        class="row"
        :class="{ skipped: session.status === 'dilewati' }"
      >
        <span class="badge" aria-hidden="true">{{ sessionMinutes(session) }}'</span>
        <span class="text">
          <span class="target">{{ session.target }}</span>
          <span class="time">
            {{ formatHourMinute(session.startedAt) }} – {{ formatHourMinute(session.endedAt) }}
            <template v-if="session.status === 'dilewati'">
              · {{ $t('pomodoro.skipped') }}</template
            >
          </span>
        </span>
      </li>
      <li v-if="!today.length" class="empty">{{ $t('pomodoro.noHistory') }}</li>
    </ul>
  </section>
</template>

<style scoped>
.card {
  min-width: 0;
  padding: var(--space-20) var(--space-22);
  border: var(--border-thin) solid var(--line);
  border-radius: calc(28px * var(--rk));
  background: var(--paper);
}

.head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.title {
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: var(--fs-display-20);
  line-height: 1.2;
}

.total {
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: var(--fs-display-18);
  color: var(--deep);
}

.rows {
  margin: var(--space-8) 0 0;
  padding: 0;
  list-style: none;
}

.row {
  display: flex;
  align-items: center;
  gap: var(--space-10);
  padding: var(--space-10) 0;
  border-top: var(--border-thin) dashed var(--line-2);
}

.badge {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: calc(11px * var(--rk)) calc(11px * var(--rk)) calc(11px * var(--rk))
    calc(4px * var(--rk));
  background: var(--accent);
  color: var(--paper);
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: var(--fs-display-12);
}

/* Sesi yang dilewati: latar `--chip` (permukaan), bukan `--dash` (token GARIS). `--ink-2` di atas
   `--dash` gagal di kertas (4,14:1) karena `--dash` memang tidak pernah dimaksudkan sebagai latar teks
   (QA T16 MAYOR-2). */
.skipped .badge {
  background: var(--chip);
  color: var(--ink-2);
}

.text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.target {
  overflow: hidden;
  font-weight: var(--fw-strong);
  font-size: var(--fs-14);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.time {
  font-weight: var(--fw-body);
  font-size: var(--fs-12);
  color: var(--mute);
}

.empty {
  padding-top: var(--space-6);
  font-weight: var(--fw-body);
  font-size: var(--fs-14);
  color: var(--mute);
}
</style>
