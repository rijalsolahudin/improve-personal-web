<script setup lang="ts">
import { JOURNAL_NOTE_MAX } from '~/utils/journal'
import { goalMentionQuery, insertGoalMention, splitMentions } from '~/utils/memo'

/** Afirmasi (kutipan di kertas lembut + selotip) atau Refleksi diri (kertas bergaris). */
const { day, kind } = defineProps<{ day: string; kind: 'affirm' | 'reflect' }>()

const journal = useJournalDay(() => day)
const isAffirm = computed(() => kind === 'affirm')

/**
 * Mention `#goal` di teks jurnal tampil sebagai chip navigasi (PRD F13 "Integrasi Journal").
 * Token `#[id]` yang goal-nya sudah dihapus tetap aman (chip redup, tanpa navigasi).
 */
const goalMentions = computed(() =>
  splitMentions(journal.day.value[kind])
    .filter((segment) => segment.kind === 'goal-mention')
    .map((segment) => (segment.kind === 'goal-mention' ? segment.goalId : '')),
)

/** Autocomplete `#`: goal aktif yang judulnya cocok dengan kata setelah `#` terakhir. */
const { goals } = useGoals()
const goalQuery = computed(() => goalMentionQuery(journal.day.value[kind]))
const goalSuggestions = computed(() => {
  const query = goalQuery.value
  if (query === null) return []
  const needle = query.toLowerCase()
  return goals.value
    .filter((goal) => goal.status === 'aktif' && goal.title.toLowerCase().includes(needle))
    .slice(0, 4)
})

function insertGoal(goalId: string): void {
  journal.setNote(kind, insertGoalMention(journal.day.value[kind], goalId))
}
</script>

<template>
  <JournalCard
    :title="$t(`journal.${kind}.title`)"
    :dot="isAffirm ? 'var(--deep)' : 'var(--accent)'"
    :is-soft="isAffirm"
    :gap="isAffirm ? 10 : 6"
  >
    <template v-if="isAffirm" #decor>
      <Tape :width="84" :height="24" :top="-13" left="auto" :rotate="4" :radius="4" class="tape" />
    </template>
    <p v-if="!isAffirm" class="hint">{{ $t('journal.reflect.hint') }}</p>
    <div :class="isAffirm ? 'quote' : undefined">
      <span v-if="isAffirm" class="mark" aria-hidden="true">“</span>
      <Input
        :model-value="journal.day.value[kind]"
        variant="bare"
        multiline
        :class="isAffirm ? 'affirm' : 'lined-text reflect'"
        :rows="isAffirm ? 2 : 4"
        :maxlength="JOURNAL_NOTE_MAX"
        :placeholder="$t(`journal.${kind}.placeholder`)"
        :aria-label="$t(`journal.${kind}.title`)"
        @update:model-value="(text) => journal.setNote(kind, String(text))"
      />
    </div>
    <div
      v-if="goalSuggestions.length"
      class="suggest"
      role="listbox"
      :aria-label="$t('memo.goalMentionTitle')"
    >
      <button
        v-for="goal in goalSuggestions"
        :key="goal.id"
        type="button"
        role="option"
        class="suggest-item"
        :aria-selected="false"
        @click="insertGoal(goal.id)"
      >
        #{{ goal.title }}
      </button>
    </div>
    <p v-if="goalMentions.length" class="mentions">
      <MemoGoalMention
        v-for="(goalId, index) in goalMentions"
        :key="`${goalId}-${index}`"
        :goal-id="goalId"
      />
    </p>
  </JournalCard>
</template>

<style scoped>
.tape {
  right: 28px;
  opacity: 0.75;
}

.hint {
  margin-top: calc(-1 * var(--space-4));
  font-weight: var(--fw-body);
  font-size: var(--fs-13);
  color: var(--mute);
}

.quote {
  display: flex;
  align-items: flex-start;
  gap: var(--space-6);
}

.mark {
  flex-shrink: 0;
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: var(--fs-display-44);
  line-height: 0.8;
  color: var(--deep);
}

.affirm {
  flex: 1;
  min-width: 0;
  padding: var(--space-4) 0 0;
  border: none;
  background: transparent;
  font-family: var(--font-hand);
  /* Patrick Hand hanya punya weight 400; textarea mewarisi `--fw-body` (700) → faux-bold. */
  font-weight: 400;
  font-size: var(--fs-hand-24);
  line-height: 32px;
  resize: none;
  outline: none;
}

.reflect {
  --line-h: 33px;

  font-size: var(--fs-19);
}

.mentions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-4);
  font-size: var(--fs-14);
}

.suggest {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-6);
}

.suggest-item {
  padding: var(--space-4) var(--space-10);
  border: var(--border-thin) dashed var(--line);
  border-radius: var(--radius-pill);
  background: var(--paper);
  color: var(--mute);
  font: inherit;
  font-size: var(--fs-13);
  cursor: pointer;
}
</style>
