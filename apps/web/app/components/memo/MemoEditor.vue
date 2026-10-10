<script setup lang="ts">
import { memoPapers } from '@improve-personal/tokens'

import {
  MEMO_FEELINGS,
  MEMO_TEXT_MAX,
  MEMO_TITLE_MAX,
  insertMention,
  mentionQuery,
  wordCount,
  type MemoFeeling,
} from '~/utils/memo'
import { SCHEDULE_COLORS, occurrencesOn } from '~/utils/schedule'
import { addDays, fromIsoDate } from '~/utils/time'

/** Halaman tulis jurnal untuk tanggal `day` (design: kertas bergaris + selotip). */
const { day } = defineProps<{ day: string }>()

/** Rentang jadwal yang ditawarkan saat mengetik `@` (design: ±2 hari dari tanggal memo). */
const SUGGEST_RANGE_DAYS = 2
const SUGGEST_LIMIT = 6
const PROMPT_KEYS = ['smile', 'mind', 'proud', 'tomorrow'] as const

const { t } = useI18n()
const memos = useMemos()
const { schedules } = useSchedules()
const { longDate, shortDate } = useDateFormat()

// Draf bertahan selama sesi (pindah halaman), tidak ditulis ke storage (isi jurnal = data pribadi).
const draft = useState('memo-draft', () => ({
  title: '',
  text: '',
  feelings: [] as MemoFeeling[],
}))

const mood = computed({
  get: () => memos.moodOn(day),
  set: (value: number | null) => memos.setMood(day, value),
})
const paper = computed({
  get: () => memos.paper.value,
  set: (value) => memos.setPaper(value),
})
const paperStyle = computed(() => {
  const stock = memoPapers[paper.value]
  return {
    '--memo-bg': stock.bg,
    '--memo-line': stock.line,
    '--memo-margin': stock.margin,
    '--memo-ink': stock.ink,
  }
})

const words = computed(() => wordCount(draft.value.text))
const query = computed(() => mentionQuery(draft.value.text))
const suggestions = computed(() => {
  const q = query.value
  if (q === null) return []
  const seen = new Set<string>()
  const result = []
  for (let offset = -SUGGEST_RANGE_DAYS; offset <= SUGGEST_RANGE_DAYS; offset += 1) {
    const date = addDays(day, offset)
    for (const occurrence of occurrencesOn(schedules.value, date)) {
      const { schedule } = occurrence
      if (seen.has(schedule.id) || !schedule.title.toLowerCase().includes(q.toLowerCase())) continue
      seen.add(schedule.id)
      result.push({
        id: schedule.id,
        title: schedule.title,
        color: (SCHEDULE_COLORS[schedule.color] ?? SCHEDULE_COLORS[0])[0],
        when: `${shortDate(fromIsoDate(date).getTime())} · ${schedule.time}`,
      })
    }
  }
  return result.slice(0, SUGGEST_LIMIT)
})

function toggleFeeling(feeling: MemoFeeling): void {
  const list = draft.value.feelings
  draft.value.feelings = list.includes(feeling)
    ? list.filter((item) => item !== feeling)
    : [...list, feeling]
}

function addPrompt(key: (typeof PROMPT_KEYS)[number]): void {
  const prompt = t(`memo.prompt.${key}`).replace('…', ' ')
  const current = draft.value.text.trimEnd()
  draft.value.text = current ? `${current}\n\n${prompt}` : prompt
}

function save(): void {
  const saved = memos.add({ date: day, ...draft.value, paper: paper.value })
  if (saved) draft.value = { title: '', text: '', feelings: [] }
}
</script>

<template>
  <section
    class="sheet"
    data-anchor="memo-editor"
    data-anchor-kind="content"
    aria-labelledby="memo-editor-title"
  >
    <span class="tape" aria-hidden="true" />
    <div class="pad">
      <div class="top">
        <h2 id="memo-editor-title" class="sheet-date">
          {{ longDate(fromIsoDate(day).getTime()) }}
        </h2>
        <span v-if="draft.text.trim()" class="draft-note">{{ $t('memo.draftKept') }}</span>
      </div>
      <p class="eyebrow feeling">{{ $t('memo.feeling') }}</p>
      <MemoMoodPicker v-model="mood" class="moods" />
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
    </div>
    <MemoPaperPicker v-model="paper" class="pad papers" />
    <div class="divider" />
    <input
      v-model="draft.title"
      class="title-input"
      :style="paperStyle"
      :maxlength="MEMO_TITLE_MAX"
      :placeholder="$t('memo.titlePlaceholder')"
      :aria-label="$t('memo.titleLabel')"
    />
    <textarea
      v-model="draft.text"
      class="text-input"
      :style="paperStyle"
      :maxlength="MEMO_TEXT_MAX"
      :placeholder="$t('memo.placeholder')"
      :aria-label="$t('memo.textLabel')"
      aria-describedby="memo-hint"
    />
    <div
      v-if="suggestions.length"
      class="suggest"
      role="listbox"
      :aria-label="$t('memo.mentionTitle')"
    >
      <p class="eyebrow suggest-title">{{ $t('memo.mentionTitle') }}</p>
      <button
        v-for="item in suggestions"
        :key="item.id"
        type="button"
        role="option"
        class="suggest-item"
        :aria-selected="false"
        @click="draft.text = insertMention(draft.text, item.id)"
      >
        <span class="dot" :style="{ background: item.color }" aria-hidden="true" />
        <span class="suggest-name">{{ item.title }}</span>
        <span class="suggest-when">{{ item.when }}</span>
      </button>
    </div>
    <div class="prompts">
      <span class="prompts-label">{{ $t('memo.promptsLabel') }}</span>
      <button
        v-for="key in PROMPT_KEYS"
        :key="key"
        type="button"
        class="prompt"
        @click="addPrompt(key)"
      >
        {{ $t(`memo.prompt.${key}`) }}
      </button>
    </div>
    <div class="bottom">
      <p id="memo-hint" class="hint">{{ $t('memo.wordsHint', { n: words }) }}</p>
      <button type="button" class="save" :disabled="!words" @click="save">
        {{ $t('memo.save') }}
      </button>
    </div>
  </section>
</template>

<style scoped>
.sheet {
  position: relative;
  margin-top: 10px;
  padding: 28px 0 18px;
  border: 3px solid var(--ink);
  border-radius: 28px;
  background: var(--paper-2);
  box-shadow: 0 8px 0 rgb(47 42 36 / 0.12);
}

.tape {
  position: absolute;
  top: -15px;
  left: 50%;
  width: 120px;
  height: 28px;
  border-radius: 4px;
  background: var(--primary);
  opacity: 0.8;
  transform: translateX(-50%) rotate(-3deg);
}

.pad {
  padding: 0 28px;
}

.top {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.sheet-date {
  font-family: var(--font-hand);
  font-weight: 400;
  font-size: 30px;
  line-height: 1.1;
}

.draft-note {
  font-weight: 800;
  font-size: 12px;
  color: var(--mute-3);
}

.feeling {
  margin-top: 18px;
  color: var(--mute-2);
}

.moods {
  margin-top: 10px;
}

.feelings {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 12px;
}

.feelings button {
  padding: 5px 12px;
  border: 2px solid var(--dash);
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--mute-2);
  font-family: var(--font-hand);
  font-size: 16px;
}

.feelings button[aria-pressed='true'] {
  border-color: var(--ink);
  background: var(--ink);
  color: var(--paper);
}

.papers {
  padding-top: 14px;
}

.divider {
  margin-top: 14px;
  border-top: 2px dashed var(--mline);
}

.title-input,
.text-input {
  display: block;
  width: 100%;
  border: none;
  outline: none;
  color: var(--memo-ink);
  font-family: var(--font-hand);
  background-color: var(--memo-bg);
}

.title-input {
  padding: 14px 28px 2px 66px;
  font-size: 26px;
  background-image: linear-gradient(
    90deg,
    transparent 48px,
    var(--memo-margin) 48px,
    var(--memo-margin) 50px,
    transparent 50px
  );
}

.text-input {
  min-height: 308px;
  margin-top: -1px;
  padding: 6px 28px 0 66px;
  border-bottom: 2px dashed var(--mline);
  font-size: 21px;
  line-height: 34px;
  resize: vertical;
  background-image:
    linear-gradient(
      90deg,
      transparent 48px,
      var(--memo-margin) 48px,
      var(--memo-margin) 50px,
      transparent 50px
    ),
    repeating-linear-gradient(
      transparent 0,
      transparent 33px,
      var(--memo-line) 33px,
      var(--memo-line) 34px
    );
  background-attachment: local;
  background-position: 0 6px;
}

.title-input:focus-visible,
.text-input:focus-visible {
  box-shadow: inset 0 0 0 3px var(--accent);
}

.suggest {
  margin: 4px 28px 0 66px;
  padding: 6px;
  border: 2.5px solid var(--ink);
  border-radius: 18px;
  background: var(--paper);
  box-shadow: 0 6px 0 rgb(47 42 36 / 0.12);
}

.suggest-title {
  padding: 4px 8px;
  color: var(--mute-3);
}

.suggest-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: none;
  border-radius: 12px;
  background: none;
  font-weight: 800;
  font-size: 14px;
  text-align: left;
}

.suggest-item:hover {
  background: var(--alt);
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 3px;
}

.suggest-name {
  flex: 1;
}

.suggest-when {
  font-weight: 700;
  font-size: 12px;
  color: var(--mute);
}

.prompts {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 14px 28px 0 66px;
}

.prompts-label {
  margin-right: 2px;
  font-weight: 800;
  font-size: 12px;
  color: var(--mute-3);
}

.prompt {
  padding: 4px 12px;
  border: none;
  border-radius: var(--radius-pill);
  background: var(--alt);
  color: var(--ink-2);
  font-family: var(--font-hand);
  font-size: 15px;
}

.prompt:hover {
  background: var(--chip);
}

.bottom {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 28px 0;
}

.hint {
  font-weight: 800;
  font-size: 13px;
  color: var(--mute);
}

.save {
  padding: 12px 22px;
  border: none;
  border-radius: var(--radius-pill);
  background: var(--accent);
  color: var(--paper);
  font-weight: 800;
  font-size: 15px;
}

.save:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

@media (max-width: 599px) {
  .pad,
  .bottom {
    padding-inline: 16px;
  }

  .title-input,
  .text-input {
    padding-left: 56px;
    padding-right: 16px;
  }

  .prompts,
  .suggest {
    margin-left: 0;
    padding-left: 16px;
  }
}
</style>
