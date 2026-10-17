<script setup lang="ts">
import { JOURNAL_NOTE_MAX } from '~/utils/journal'
import { MEMO_FEELINGS } from '~/utils/memo'

/** "Perasaan hari ini" (design): mood harian, tag perasaan untuk entri berikutnya, cerita singkat. */
const { day } = defineProps<{ day: string }>()

const memos = useMemos()
const journal = useJournalDay(() => day)
const { draft, toggleFeeling } = useMemoDraft()

const mood = computed({
  get: () => memos.moodOn(day),
  set: (value: number | null) => memos.setMood(day, value),
})
</script>

<template>
  <JournalCard>
    <p class="eyebrow label">{{ $t('memo.feelingsLabel') }}</p>
    <MoodPicker v-model="mood" :label="$t('memo.moodLabel')" />
    <div class="feelings" role="group" :aria-label="$t('memo.feelingsLabel')">
      <button
        v-for="feeling in MEMO_FEELINGS"
        :key="feeling"
        type="button"
        :aria-pressed="draft.feelings.includes(feeling)"
        @click="toggleFeeling(feeling)"
      >
        {{ feeling }}
      </button>
    </div>
    <textarea
      :value="journal.day.value.feelingNote"
      class="lined-text note"
      rows="3"
      :maxlength="JOURNAL_NOTE_MAX"
      :placeholder="$t('journal.feelingPlaceholder')"
      :aria-label="$t('journal.feelingNote')"
      @input="journal.setNote('feelingNote', ($event.target as HTMLTextAreaElement).value)"
    />
  </JournalCard>
</template>

<style scoped>
.label {
  color: var(--deep);
}

.feelings {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.feelings button {
  padding: 5px 12px;
  border: var(--border-thin) solid var(--dash);
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--mute-2);
  font-family: var(--font-hand);
  font-size: 16px;
}

.feelings button[aria-pressed='true'] {
  border-color: var(--outline);
  background: var(--ink);
  color: var(--paper);
}

.note {
  --line-h: 30px;

  font-size: 19px;
}
</style>
