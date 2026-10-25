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
  <JournalCard :gap="12">
    <p class="label">{{ $t('memo.feelingsLabel') }}</p>
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
    <Input
      :model-value="journal.day.value.feelingNote"
      variant="bare"
      multiline
      class="lined-text note"
      rows="3"
      :maxlength="JOURNAL_NOTE_MAX"
      :placeholder="$t('journal.feelingPlaceholder')"
      :aria-label="$t('journal.feelingNote')"
      @update:model-value="(text) => journal.setNote('feelingNote', String(text))"
    />
  </JournalCard>
</template>

<style scoped>
.label {
  font-weight: var(--fw-strong);
  font-size: 13px;
  line-height: 1.2;
  letter-spacing: 0.08em;
  text-transform: uppercase;
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
  /* Patrick Hand hanya punya weight 400; tombol mewarisi `--fw-body` (700) → faux-bold. */
  font-weight: 400;
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
