<script setup lang="ts">
import type { GoalTone } from '~/utils/goals'

/** Label status/jenis di halaman Goals. Tiga tone saja, lihat `GoalTone`. */
const { tone = 'neutral' } = defineProps<{ tone?: GoalTone }>()
</script>

<template>
  <span class="chip" :class="tone"><slot /></span>
</template>

<style scoped>
.chip {
  display: inline-block;
  padding: 3px var(--space-10);
  border-radius: var(--radius-pill);
  font-weight: var(--fw-strong);
  font-size: var(--fs-12);
  white-space: nowrap;
}

.neutral {
  background: var(--chip);
  color: var(--ink);
}

.success {
  background: #e3f2de;
  color: #2e6a26;
}

.alert {
  background: var(--danger);
  color: var(--paper);
}
</style>
