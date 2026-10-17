<script setup lang="ts">
import { JOURNAL_LISTS, JOURNAL_LIST_ITEM_MAX, listRows } from '~/utils/journal'

/** Tiga daftar bernomor (design `dl.lists`): bersyukur, sedih, bisa lebih baik. */
const { day } = defineProps<{ day: string }>()

const journal = useJournalDay(() => day)
const COLORS = { grat: '#1da20f', sad: '#0a55e6', better: '#f03fbf' } as const

const lists = computed(() =>
  JOURNAL_LISTS.map((key) => ({ key, color: COLORS[key], rows: listRows(journal.day.value[key]) })),
)
</script>

<template>
  <JournalCard class="lists">
    <div v-for="list in lists" :key="list.key" class="list">
      <JournalHeading :title="$t(`journal.list.${list.key}`)" :dot="list.color" />
      <ol class="rows">
        <li v-for="(value, index) in list.rows" :key="index" class="row">
          <span class="n" aria-hidden="true">{{ index + 1 }}</span>
          <input
            :value="value"
            class="input"
            :maxlength="JOURNAL_LIST_ITEM_MAX"
            placeholder="…"
            :aria-label="
              $t('journal.listItem', { list: $t(`journal.list.${list.key}`), n: index + 1 })
            "
            @input="journal.setListItem(list.key, index, ($event.target as HTMLInputElement).value)"
          />
        </li>
      </ol>
    </div>
  </JournalCard>
</template>

<style scoped>
.lists {
  gap: 20px;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 0 4px;
}

.rows {
  margin: 0;
  padding: 0;
  list-style: none;
}

.row {
  display: flex;
  align-items: center;
  gap: 10px;
  border-bottom: var(--border-thin) solid var(--mline);
}

.n {
  width: 14px;
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: 15px;
  color: var(--mute-3);
}

.input {
  flex: 1;
  min-width: 0;
  padding: 0;
  border: none;
  background: transparent;
  font-family: var(--font-hand);
  font-size: 19px;
  line-height: 32px;
  outline: none;
}
</style>
