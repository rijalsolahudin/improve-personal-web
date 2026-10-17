<script setup lang="ts">
import { memoPapers } from '@improve-personal/tokens'

import { MEMO_TEXT_MAX, MEMO_TITLE_MAX, insertMention, mentionQuery, wordCount } from '~/utils/memo'
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

const { draft, clear } = useMemoDraft()
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

function addPrompt(key: (typeof PROMPT_KEYS)[number]): void {
  const prompt = t(`memo.prompt.${key}`).replace('…', ' ')
  const current = draft.value.text.trimEnd()
  draft.value.text = current ? `${current}\n\n${prompt}` : prompt
}

function save(): void {
  const saved = memos.add({ date: day, ...draft.value, paper: paper.value })
  if (saved) clear()
}
</script>

<template>
  <section
    class="sheet"
    data-anchor="memo-editor"
    data-anchor-kind="content"
    aria-labelledby="memo-editor-title"
  >
    <Tape
      :width="120"
      :top="-15"
      :left="'50%'"
      :height="28"
      :radius="4"
      :rotate="-3"
      translate="-50%"
    />
    <div class="pad">
      <p class="eyebrow about">{{ $t('journal.about') }}</p>
      <div class="top">
        <h2 id="memo-editor-title" class="sheet-date">
          {{ longDate(fromIsoDate(day).getTime()) }}
        </h2>
        <span v-if="draft.text.trim()" class="draft-note">{{ $t('memo.draftKept') }}</span>
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
    <MemoPaper
      v-model="draft.text"
      :paper="paper"
      :placeholder="$t('memo.placeholder')"
      :aria-label="$t('memo.textLabel')"
      aria-describedby="memo-hint"
      :maxlength="MEMO_TEXT_MAX"
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
      <Button variant="primary" :disabled="!words" @click="save">{{ $t('memo.save') }}</Button>
    </div>
  </section>
</template>

<style scoped>
.sheet {
  position: relative;
  margin-top: 10px;
  padding: 28px 0 18px;
  border: var(--border-thick) solid var(--outline);
  border-radius: calc(28px * var(--rk));
  background: var(--paper-2);
  box-shadow: calc(8px * var(--sx)) calc(8px * var(--sy)) calc(8px * var(--sbl))
    var(--shadow-color, rgb(47 42 36 / 0.12));
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
  font-weight: var(--fw-strong);
  font-size: 12px;
  color: var(--mute-3);
}

.about {
  margin-bottom: 2px;
  color: var(--deep);
}

.papers {
  padding-top: 14px;
}

.divider {
  margin-top: 14px;
  border-top: var(--border-thin) dashed var(--mline);
}

.title-input {
  display: block;
  width: 100%;
  border: none;
  outline: none;
  color: var(--memo-ink);
  font-family: var(--font-hand);
  background-color: var(--memo-bg);
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

.suggest {
  margin: 4px 28px 0 66px;
  padding: 6px;
  border: var(--border) solid var(--outline);
  border-radius: var(--radius-row);
  background: var(--paper);
  box-shadow: calc(6px * var(--sx)) calc(6px * var(--sy)) calc(6px * var(--sbl))
    var(--shadow-color, rgb(47 42 36 / 0.12));
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
  border-radius: var(--radius-inner);
  background: none;
  font-weight: var(--fw-strong);
  font-size: 14px;
  text-align: left;
}

.suggest-item:hover {
  background: var(--alt);
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: calc(3px * var(--rk));
}

.suggest-name {
  flex: 1;
}

.suggest-when {
  font-weight: var(--fw-body);
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
  font-weight: var(--fw-strong);
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
  font-weight: var(--fw-strong);
  font-size: 13px;
  color: var(--mute);
}

@media (max-width: 599px) {
  .pad,
  .bottom {
    padding-inline: 16px;
  }

  .title-input {
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
