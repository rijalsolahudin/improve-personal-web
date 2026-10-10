<script setup lang="ts">
import type { GoalTone } from '~/utils/goals'

/** Chip status/jenis di halaman Goals; warna mengikuti tabel CH/GS/T di design. */
const { tone } = defineProps<{ tone: GoalTone }>()
</script>

<template>
  <span class="chip" :class="tone"><slot /></span>
</template>

<style scoped>
.chip {
  display: inline-block;
  padding: 3px 10px;
  border-radius: var(--radius-pill);
  font-weight: 800;
  font-size: 12px;
  white-space: nowrap;
}

.green {
  background: #e3f2de;
  color: #2e6a26;
}

.yellow {
  background: #fff0c8;
  color: #8a5a00;
}

.sand {
  background: #f2e4cc;
  color: #7a6b58;
}

.red {
  background: #ffe1da;
  color: #c2381a;
}

.grey {
  background: #ede7dd;
  color: #7a6b58;
}

.purple {
  background: #eee6fa;
  color: #6b3fa0;
}

.violet {
  background: #dcd3f4;
  color: #5e3a9a;
}
</style>
