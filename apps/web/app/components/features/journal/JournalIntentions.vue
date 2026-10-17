<script setup lang="ts">
import { INTENTION_MAX, JOURNAL_WORD_MAX } from '~/utils/journal'
import { fromIsoDate } from '~/utils/time'

/** "Niat hari ini" (design): kata hari ini + maksimal 3 kertas niat yang bisa dicentang. */
const { day, today } = defineProps<{ day: string; today: string }>()

const journal = useJournalDay(() => day)
const { goals } = useGoals()
const { longDate } = useDateFormat()

/** Warna kertas, selotip & kemiringan bergiliran (design `tints`/`tapes`/`rots`). */
const LOOKS = [
  { bg: 'var(--paper-2)', tape: '#f7c6da', rotate: -2 },
  { bg: '#fff6e2', tape: '#cde8c6', rotate: 1.5 },
  { bg: '#fdf1f4', tape: '#d3e2fb', rotate: -1 },
] as const

const cards = computed(() =>
  journal.day.value.intentions.map((intention, index) => ({
    intention,
    n: index + 1,
    goal: goals.value.find((item) => item.id === intention.goalId) ?? null,
    look: LOOKS[index % LOOKS.length] ?? LOOKS[0],
  })),
)
const canAdd = computed(() => journal.day.value.intentions.length < INTENTION_MAX)
</script>

<template>
  <section class="intentions" aria-labelledby="intentions-title">
    <div class="top">
      <div>
        <p class="eyebrow label">
          {{ $t(day === today ? 'journal.intentionsToday' : 'journal.intentions') }}
        </p>
        <h2 id="intentions-title" class="date">{{ longDate(fromIsoDate(day).getTime()) }}</h2>
      </div>
      <span class="hint">{{ $t('journal.intentionsHint', { n: INTENTION_MAX }) }}</span>
    </div>

    <div class="board dot-grid">
      <div class="lead">
        <span class="lead-text">{{ $t('journal.leadIn') }}</span>
        <label class="word">
          <span class="word-label">{{ $t('journal.word') }}</span>
          <input
            :value="journal.day.value.word"
            class="word-input"
            :maxlength="JOURNAL_WORD_MAX"
            :placeholder="$t('journal.wordPlaceholder')"
            @input="journal.setWord(($event.target as HTMLInputElement).value)"
          />
        </label>
      </div>

      <ul class="notes">
        <JournalIntentionNote
          v-for="card in cards"
          :key="card.intention.id"
          v-bind="card"
          @toggle="journal.toggleIntention(card.intention.id)"
          @cycle-goal="journal.cycleGoal(card.intention.id)"
          @remove="journal.removeIntention(card.intention.id)"
        />
        <JournalIntentionNew v-if="canAdd" :day="day" />
      </ul>
    </div>
  </section>
</template>

<style scoped>
.intentions {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 22px;
  border: var(--border-thick) solid var(--outline);
  border-radius: calc(28px * var(--rk));
  background: var(--paper-2);
  box-shadow: calc(6px * var(--sx)) calc(6px * var(--sy)) calc(6px * var(--sbl))
    var(--shadow-color, rgb(47 42 36 / 0.12));
}

.top {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 10px;
}

.label {
  color: var(--deep);
}

.date {
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: 24px;
  line-height: 1.1;
}

.hint {
  font-weight: var(--fw-body);
  font-size: 13px;
  color: var(--mute);
}

.board {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
  border: var(--border) solid var(--outline);
  border-radius: calc(26px * var(--rk));
  background-color: var(--primary);
}

.lead {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 14px;
}

.lead-text {
  flex: 1 1 180px;
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: 20px;
  line-height: 1.15;
}

.word {
  flex: 1 1 200px;
  display: flex;
  flex-direction: column;
  padding: 8px 14px 6px;
  border: var(--border) solid var(--outline);
  border-radius: calc(18px * var(--rk)) calc(18px * var(--rk)) calc(18px * var(--rk))
    calc(6px * var(--rk));
  background: var(--paper-2);
  transform: rotate(calc(-1.5deg * var(--bev)));
}

.word-label {
  font-weight: var(--fw-strong);
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--mute-3);
}

.word-input {
  width: 100%;
  min-width: 0;
  padding: 0;
  border: none;
  background: transparent;
  font-family: var(--font-hand);
  font-size: 28px;
  line-height: 1.15;
  outline: none;
}

.notes {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 14px;
  margin: 0;
  padding: 6px 0 0;
  list-style: none;
}
</style>
