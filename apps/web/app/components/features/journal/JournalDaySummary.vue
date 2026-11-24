<script setup lang="ts">
import { JOURNAL_LISTS } from '@improve-personal/core/planner'

/** Bagian harian di mode baca: afirmasi + daftar yang terisi saja (tanpa baris kosong). */
const { day } = defineProps<{ day: string }>()

const journal = useJournalDay(() => day)
const COLORS = { grat: '#1da20f', sad: '#0a55e6', better: '#f03fbf' } as const

const affirm = computed(() => journal.day.value.affirm.trim())
const lists = computed(() =>
  JOURNAL_LISTS.map((key) => ({
    key,
    color: COLORS[key],
    items: journal.day.value[key].filter((item) => item.trim() !== ''),
  })).filter((list) => list.items.length > 0),
)
</script>

<template>
  <div v-if="affirm || lists.length" class="summary">
    <p v-if="affirm" class="affirm">“{{ affirm }}”</p>
    <div v-if="lists.length" class="lists">
      <section v-for="list in lists" :key="list.key">
        <JournalHeading :title="$t(`journal.list.${list.key}`)" :dot="list.color" />
        <ul class="items">
          <li v-for="(item, index) in list.items" :key="index">{{ item }}</li>
        </ul>
      </section>
    </div>
  </div>
</template>

<style scoped>
.summary {
  display: flex;
  flex-direction: column;
  gap: var(--space-14);
  margin-top: var(--space-16);
  padding-top: var(--space-14);
  border-top: var(--border-thin) dashed var(--mline);
}

.affirm {
  font-family: var(--font-hand);
  /* Patrick Hand hanya punya weight 400; paragraf mewarisi `--fw-body` (700) → faux-bold. */
  font-weight: 400;
  font-size: var(--fs-hand-19);
  color: var(--deep);
}

.lists {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 200px), 1fr));
  gap: var(--space-16);
}

.items {
  margin: var(--space-4) 0 0;
  padding-left: var(--space-20);
  font-family: var(--font-hand);
  font-weight: 400;
  font-size: var(--fs-hand-17);
  line-height: 30px;
}
</style>
