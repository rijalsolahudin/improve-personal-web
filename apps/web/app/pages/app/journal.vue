<script setup lang="ts">
import { journalDates, matchesQuery, plainText } from '~/utils/memo'
import { toIsoDate } from '~/utils/time'

definePageMeta({ layout: 'dashboard' })

const { t } = useI18n()
useHead({ title: () => t('feature.memo.label') })

const now = useNow()
const today = computed(() => toIsoDate(new Date(now.value)))
const { memos, moods, moodOn, memoOn, remove } = useMemos()
const stickers = useJournalStickers()
const { findSchedule } = useSchedules()
const { findGoal } = useGoals()

const SEARCH_MAX = 80
/** Design: kolom cari `padding: 11px 16px`; `Input` size-md bawaannya 14px horizontal. */
const SEARCH_STYLE = { paddingInline: '16px' }
const query = ref('')
// Tanggal terpilih bertahan selama sesi (mis. balik dari Kalender).
const selected = useState<string>('memo-selected', () => toIsoDate(new Date()))

const plain = (text: string): string =>
  plainText(
    text,
    (id) => findSchedule(id)?.title ?? null,
    t('memo.deletedSchedule'),
    (id) => findGoal(id)?.title ?? null,
    t('memo.deletedGoal'),
  )
const matching = computed(() =>
  memos.value.filter((memo) => matchesQuery(memo, query.value, plain)),
)
const dates = computed(() => {
  const all = journalDates(memos.value, moods.value, today.value)
  if (!query.value.trim()) return all
  const hits = new Set(matching.value.map((memo) => memo.date))
  return all.filter((day) => hits.has(day))
})
const isSearching = computed(() => query.value.trim() !== '')
/** Hasil cari lintas tanggal, terbaru dulu (Diary Book PRD F8). */
const results = computed(() =>
  [...matching.value].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt),
)

/**
 * Satu jurnal per hari, jadi editor dan kartu tidak tampil bersamaan. Hari ini dan hari kosong
 * langsung bisa ditulis; hari lain yang sudah berisi dibuka sebagai halaman baca supaya tidak
 * terubah karena salah klik, dan "Ubah" membuka editornya.
 */
const editingDay = ref<string | null>(null)
const page = computed(() => memoOn(selected.value))
const isEditing = computed(
  () =>
    selected.value === today.value || page.value === null || editingDay.value === selected.value,
)
const canFinishEditing = computed(
  () => selected.value !== today.value && page.value !== null && isEditing.value,
)
watch(selected, () => (editingDay.value = null))

function openDay(day: string): void {
  selected.value = day
  query.value = ''
}

function removePage(id: string): void {
  stickers.removeAllOf(id)
  remove(id)
}
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
        :style="SEARCH_STYLE"
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
      <template v-if="isSearching">
        <MemoEntry
          v-for="(memo, index) in results"
          :key="memo.id"
          :memo="memo"
          :index="index"
          :mood="moodOn(memo.date)"
          mode="result"
          @open="openDay(memo.date)"
        />
        <p v-if="!results.length" class="empty">{{ $t('memo.noMatch') }}</p>
      </template>
      <template v-else-if="isEditing">
        <div v-if="canFinishEditing" class="mode-bar">
          <Button variant="soft" size="sm" @click="editingDay = null">
            {{ $t('memo.doneEditing') }}
          </Button>
        </div>
        <div class="workspace">
          <MemoEditor :day="selected" />
          <JournalLists
            class="points"
            :day="selected"
            data-anchor="journal-lists"
            data-anchor-kind="content"
          />
        </div>
      </template>
      <MemoEntry
        v-else-if="page"
        :memo="page"
        :index="0"
        :mood="moodOn(page.date)"
        @edit="editingDay = selected"
        @remove="removePage(page.id)"
      >
        <JournalDaySummary :day="selected" />
      </MemoEntry>
    </div>
  </div>
</template>

<style scoped>
.memo-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-20);
  padding-bottom: var(--space-80);
}

.header {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--space-16);
}

.title {
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: var(--fs-display-36);
  line-height: 1.1;
}

.summary {
  margin-top: var(--space-4);
  font-weight: var(--fw-body);
  font-size: var(--fs-16);
  color: var(--mute);
}

.search {
  width: 280px;
  max-width: 100%;
}

.pages {
  display: flex;
  flex-direction: column;
  gap: var(--space-28);
  min-width: 0;
}

.mode-bar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: calc(-1 * var(--space-12));
}

/*
 * Kertas tetap yang utama; poin refleksi jadi kolom sempit di sampingnya dan menempel saat tulisan
 * di-scroll. Di layar sempit kolom itu turun ke bawah kertas.
 */
.workspace {
  display: grid;
  gap: var(--space-28);
}

@media (min-width: 1100px) {
  .workspace {
    grid-template-columns: minmax(0, 7fr) minmax(320px, 3fr);
    gap: var(--space-20);
    align-items: start;
  }

  .points {
    position: sticky;
    top: var(--space-16);
    /* Sejajar dengan kartu kertas yang turun sedikit untuk memberi ruang selotip. */
    margin-top: var(--space-10);
  }
}

.empty {
  padding: var(--space-10);
  text-align: center;
  font-family: var(--font-hand);
  /* Patrick Hand hanya punya weight 400; paragraf mewarisi `--fw-body` (700) → faux-bold. */
  font-weight: 400;
  font-size: var(--fs-hand-19);
  color: var(--mute);
}

@media (max-width: 599px) {
  .title {
    font-size: var(--fs-display-28);
  }

  .search {
    width: 100%;
  }
}
</style>
