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
      <Input
        v-model="query"
        class="search"
        shape="pill"
        type="search"
        :maxlength="SEARCH_MAX"
        :placeholder="$t('memo.search')"
        :aria-label="$t('memo.search')"
      />
    </header>

    <MemoDateStrip
      v-model="selected"
      data-anchor="memo-dates"
      data-anchor-kind="content"
      :dates="dates"
      :today="today"
      :memos="memos"
      :plain="plain"
    />

    <div class="pages">
      <JournalIntentions
        :day="selected"
        :today="today"
        data-anchor="journal-intentions"
        data-anchor-kind="content"
      />
      <div class="daily">
        <div class="col">
          <JournalFeeling
            :day="selected"
            data-anchor="journal-feeling"
            data-anchor-kind="content"
          />
          <JournalNote
            :day="selected"
            kind="affirm"
            data-anchor="journal-affirm"
            data-anchor-kind="content"
          />
          <JournalNote
            :day="selected"
            kind="reflect"
            data-anchor="journal-reflect"
            data-anchor-kind="content"
          />
        </div>
        <div class="col">
          <JournalLists :day="selected" data-anchor="journal-lists" data-anchor-kind="content" />
        </div>
      </div>
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
  font-weight: var(--fw-display);
  font-size: 36px;
  line-height: 1.1;
}

.summary {
  margin-top: 4px;
  font-weight: var(--fw-body);
  font-size: 16px;
  color: var(--mute);
}

.search {
  width: 280px;
  max-width: 100%;
}

.pages {
  display: flex;
  flex-direction: column;
  gap: 28px;
  min-width: 0;
}

/* Dua kolom isian harian; kolom yang lebih pendek ikut sticky saat kolom lain di-scroll. */
.daily {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 360px), 1fr));
  align-items: start;
  gap: 24px;
}

.col {
  position: sticky;
  top: var(--gap-desktop);
  /* Di atas kolom tetangga: sticker yang ditempel di dalam kolom boleh menjorok keluar. */
  z-index: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 20px;
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
