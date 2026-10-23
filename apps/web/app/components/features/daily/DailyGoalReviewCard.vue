<script setup lang="ts">
import {
  closeChapter,
  extendChapter,
  goalReviewTargets,
  shiftChapter,
  type Chapter,
  type GoalReviewTarget,
} from '~/utils/goals'

/**
 * Kartu review berkala di Daily (PRD F13): muncul saat chapter berakhir/terlewat dan tiap akhir
 * pekan untuk goal aktif. Jawaban disimpan sebagai bagian jurnal "Tentang Hari Ini" + auto-mention.
 *
 * Yang "sudah dijawab" disimpan per tanggal di localStorage supaya kartu tidak muncul lagi di hari
 * yang sama setelah aksi, tanpa menambah tabel/record baru.
 */
const STORAGE_KEY = 'ip-goal-review'
const MAX_ANSWERED = 200

const { goals, today, updateChapter } = useGoals()
const memos = useMemos()

function readAnswered(): string[] {
  if (!import.meta.client) return []
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    if (!Array.isArray(raw)) return []
    return raw
      .filter((item): item is string => typeof item === 'string' && item.length <= 160)
      .slice(-MAX_ANSWERED)
  } catch {
    return []
  }
}

const answered = useState<string[]>('goal-review-answered', readAnswered)
const notes = ref<Record<string, string>>({})

const keyOf = (target: GoalReviewTarget): string => `${today.value}:${target.key}`
const targets = computed(() =>
  goalReviewTargets(goals.value, today.value).filter(
    (target) => !answered.value.includes(keyOf(target)),
  ),
)

function markAnswered(target: GoalReviewTarget): void {
  const key = keyOf(target)
  if (answered.value.includes(key)) return
  answered.value = [...answered.value, key]
  if (!import.meta.client) return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(answered.value.slice(-MAX_ANSWERED)))
  } catch {
    // Storage penuh/diblokir: kartu tetap tertutup untuk sesi ini.
  }
}

function saveAnswer(target: GoalReviewTarget): void {
  const note = notes.value[target.key]?.trim()
  if (!note) return

  // Jawaban user + token mention supaya chip `#goal` muncul di entri jurnal.
  memos.append(today.value, `${note}\n\n#[${target.goalId}]`)
  markAnswered(target)
}

function review(target: GoalReviewTarget, action: 'extend' | 'shift' | 'close'): void {
  if (target.chapterId === null) return
  const apply: Record<typeof action, (chapter: Chapter) => Chapter> = {
    extend: (chapter) => extendChapter(chapter, today.value, target.goalEnd),
    shift: (chapter) => shiftChapter(chapter, today.value, target.goalEnd),
    close: closeChapter,
  }
  updateChapter(target.goalId, target.chapterId, apply[action])
  markAnswered(target)
}
</script>

<template>
  <section
    v-if="targets.length"
    class="review"
    data-anchor="daily-goal-review"
    data-anchor-kind="content"
  >
    <h2 class="title">{{ $t('daily.goalReview.title') }}</h2>
    <article v-for="target in targets" :key="target.key" class="card">
      <header class="head">
        <p class="question">
          {{
            $t('daily.goalReview.question', {
              goal: target.goalTitle,
              chapter: target.chapterTitle ?? $t('goals.along'),
            })
          }}
        </p>
        <GoalChip v-if="target.isOverdue" tone="red">{{ $t('goals.needsReview') }}</GoalChip>
      </header>

      <textarea
        class="note"
        :value="notes[target.key] ?? ''"
        :placeholder="$t('daily.goalReview.placeholder')"
        :aria-label="$t('daily.goalReview.placeholder')"
        rows="3"
        maxlength="2000"
        @input="notes[target.key] = ($event.target as HTMLTextAreaElement).value"
      />

      <div class="actions">
        <Button variant="primary" size="sm" @click="saveAnswer(target)">
          {{ $t('daily.goalReview.save') }}
        </Button>
        <template v-if="target.isOverdue">
          <Button variant="paper" size="sm" @click="review(target, 'extend')">
            {{ $t('goals.review.extend') }}
          </Button>
          <Button variant="paper" size="sm" @click="review(target, 'shift')">
            {{ $t('goals.review.shift') }}
          </Button>
          <Button variant="paper" size="sm" @click="review(target, 'close')">
            {{ $t('goals.review.close') }}
          </Button>
        </template>
        <Button variant="link" @click="markAnswered(target)">
          {{ $t('daily.goalReview.skip') }}
        </Button>
      </div>
    </article>
  </section>
</template>

<style scoped>
.review {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.title {
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: 22px;
}

.card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px 18px;
  border: var(--border) solid var(--line);
  border-radius: var(--radius-sticker);
  background: var(--paper);
}

.head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.question {
  flex: 1;
  min-width: 200px;
  font-weight: var(--fw-strong);
  font-size: 15px;
}

.note {
  width: 100%;
  min-height: 72px;
  padding: 10px 12px;
  border: var(--border-thin) solid var(--line);
  border-radius: calc(14px * var(--rk));
  background: var(--paper-2);
  color: var(--ink);
  font: inherit;
  resize: vertical;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
</style>
