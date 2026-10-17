<script setup lang="ts">
import { sessionMinutes } from '~/utils/pomodoro'
import { formatHourMinute } from '~/utils/time'

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
  padding: 20px 22px;
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
  font-size: 20px;
  line-height: 1.2;
}

.total {
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: 18px;
  color: var(--deep);
}

.rows {
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
}

.row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 0;
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
  font-size: 12px;
}

.skipped .badge {
  background: var(--dash);
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
  font-size: 14px;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.time {
  font-weight: var(--fw-body);
  font-size: 12px;
  color: var(--mute);
}

.empty {
  padding-top: 6px;
  font-weight: var(--fw-body);
  font-size: 14px;
  color: var(--mute);
}
</style>
