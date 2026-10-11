<script setup lang="ts">
import { journalDates, matchesQuery, memosOn, plainText } from '~/utils/memo'
import { toIsoDate } from '~/utils/time'

definePageMeta({ layout: 'dashboard' })

const { t } = useI18n()
useHead({ title: () => t('feature.memo.label') })

const now = useNow()
const today = computed(() => toIsoDate(new Date(now.value)))
const { memos, moods, moodOn, remove } = useMemos()
const { findSchedule } = useSchedules()

const SEARCH_MAX = 80
const query = ref('')
// Tanggal terpilih bertahan selama sesi (mis. balik dari Kalender).
const selected = useState<string>('memo-selected', () => toIsoDate(new Date()))

const plain = (text: string): string =>
  plainText(text, (id) => findSchedule(id)?.title ?? null, t('memo.deletedSchedule'))
const matching = computed(() =>
  memos.value.filter((memo) => matchesQuery(memo, query.value, plain)),
)
const dates = computed(() => {
  const all = journalDates(memos.value, moods.value, today.value)
  if (!query.value.trim()) return all
  const hits = new Set(matching.value.map((memo) => memo.date))
  return all.filter((day) => hits.has(day))
})
const entries = computed(() => memosOn(matching.value, selected.value))
</script>

<template>
  <div class="memo-page">
    <header class="header" data-anchor="header" data-anchor-kind="header">
      <div>
        <h1 class="title">{{ $t('feature.memo.label') }}</h1>
        <p class="summary">{{ $t('memo.summary', { n: memos.length }) }}</p>
      </div>
      <input
        v-model="query"
        class="search"
        type="search"
        :maxlength="SEARCH_MAX"
        :placeholder="$t('memo.search')"
        :aria-label="$t('memo.search')"
      />
    </header>

    <MemoDateStrip v-model="selected" :dates="dates" :today="today" :memos="memos" :plain="plain" />

    <div class="pages">
      <MemoEditor :day="selected" />
      <MemoEntry
        v-for="(memo, index) in entries"
        :key="memo.id"
        :memo="memo"
        :index="index"
        :mood="moodOn(memo.date)"
        @remove="remove(memo.id)"
      />
      <p v-if="!entries.length" class="empty">{{ $t('memo.emptyDay') }}</p>
    </div>
  </div>
</template>

<style scoped>
.memo-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding-bottom: 80px;
}

.header {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
}

.title {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 36px;
  line-height: 1.1;
}

.summary {
  margin-top: 4px;
  font-weight: 700;
  font-size: 16px;
  color: var(--mute);
}

.search {
  width: 280px;
  max-width: 100%;
  padding: 11px 16px;
  border: 2.5px solid var(--ink);
  border-radius: var(--radius-pill);
  background: var(--paper);
  font-weight: 700;
  font-size: 15px;
  outline: none;
}

.pages {
  display: flex;
  flex-direction: column;
  gap: 28px;
  min-width: 0;
}

.empty {
  padding: 10px;
  text-align: center;
  font-family: var(--font-hand);
  font-size: 19px;
  color: var(--mute);
}

@media (max-width: 599px) {
  .title {
    font-size: 28px;
  }

  .search {
    width: 100%;
  }
}
</style>
