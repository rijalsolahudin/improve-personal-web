<script setup lang="ts">
/**
 * Daftar habit terarsip (PRD F7 "arsipkan") di bawah grid Habit.
 *
 * Dua keputusan:
 * 1. **`<details>` native, bukan state Vue.** Lipat/buka, fokus, dan pengumuman ke pembaca layar sudah
 *    benar tanpa JS - section ini jarang dibuka, jadi tidak perlu ikut hydration.
 * 2. **Habit terarsip hanya ada di sini.** `habits` dari `useHabits()` berisi habit aktif saja, jadi
 *    grid, Daily, Overview, dan target Pomodoro tidak perlu menyaring sendiri.
 */
const { archivedHabits, setArchived } = useHabits()

/** Id yang sedang dikembalikan: tombol lain dimatikan supaya tidak ada dua tulisan bersamaan. */
const pendingId = ref<string | null>(null)
const hasFailed = ref(false)

async function restore(id: string): Promise<void> {
  if (pendingId.value !== null) return

  pendingId.value = id
  hasFailed.value = false
  try {
    // Gagal = habit kembali ke daftar arsip (state di-rollback composable); beri tahu user.
    const result = await setArchived(id, false)
    hasFailed.value = !result.ok
  } finally {
    pendingId.value = null
  }
}
</script>

<template>
  <details v-if="archivedHabits.length" class="archive">
    <summary class="summary">
      <span class="chevron" aria-hidden="true">›</span>
      {{ $t('habit.archive.title', { n: archivedHabits.length }) }}
    </summary>

    <p class="hint">{{ $t('habit.archive.hint') }}</p>

    <ul class="list">
      <li v-for="habit in archivedHabits" :key="habit.id" class="item">
        <HabitIcon :habit="habit" :size="30" />
        <span class="name">{{ habit.name }}</span>
        <Button size="xs" variant="soft" :disabled="pendingId !== null" @click="restore(habit.id)">
          {{ $t('habit.archive.restore') }}
        </Button>
      </li>
    </ul>

    <p v-if="hasFailed" class="error" role="alert">{{ $t('habit.archive.failed') }}</p>
  </details>
</template>

<style scoped>
.archive {
  padding: 4px 0 10px;
  border: var(--border-thin) solid var(--line);
  border-radius: calc(20px * var(--rk));
  background: var(--paper);
}

.summary {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  list-style: none;
  cursor: pointer;
  font-weight: var(--fw-strong);
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--mute);
}

/* Panah bawaan browser diganti chevron sendiri supaya bentuknya sama di semua browser. */
.summary::-webkit-details-marker {
  display: none;
}

.chevron {
  display: inline-block;
  transition: transform var(--dur) var(--ease);
}

.archive[open] .chevron {
  transform: rotate(90deg);
}

.hint {
  padding: 0 20px 6px;
  font-weight: var(--fw-body);
  font-size: 12px;
  color: var(--mute);
}

.list {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}

.item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 20px;
  border-top: var(--border-thin) solid var(--line-2);
}

.name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-weight: var(--fw-strong);
  font-size: 14px;
}

.error {
  margin: 8px 20px 0;
  padding: 10px 14px;
  border-radius: calc(14px * var(--rk));
  background: #ffe1da;
  color: #9a2a14;
  font-weight: var(--fw-strong);
  font-size: 13px;
}
</style>
