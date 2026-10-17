<script setup lang="ts">
import { INTENTION_TEXT_MAX } from '~/utils/journal'

/** Kartu "Niat baru" (design): tulis lalu Enter / + Tambah. */
const { day } = defineProps<{ day: string }>()

const journal = useJournalDay(() => day)
const draft = ref('')

function add(): void {
  if (journal.addIntention(draft.value)) draft.value = ''
}
</script>

<template>
  <li class="new">
    <form class="new-form" @submit.prevent="add">
      <label class="new-label" for="intention-draft">{{ $t('journal.newIntention') }}</label>
      <input
        id="intention-draft"
        v-model="draft"
        class="new-input"
        :maxlength="INTENTION_TEXT_MAX"
        :placeholder="$t('journal.newPlaceholder')"
      />
      <button type="submit" class="new-add">+ {{ $t('journal.add') }}</button>
    </form>
  </li>
</template>

<style scoped>
.new {
  min-height: 140px;
  display: flex;
  padding: 14px;
  border: var(--border) dashed var(--deeper);
  border-radius: calc(20px * var(--rk));
  background: rgb(255 255 255 / 0.35);
}

.new-form {
  width: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 8px;
}

.new-label {
  font-weight: var(--fw-strong);
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--deeper);
}

.new-input {
  min-width: 0;
  padding: 4px 0;
  border: none;
  border-bottom: var(--border-thin) solid var(--outline);
  background: transparent;
  font-family: var(--font-hand);
  font-size: 19px;
  outline: none;
}

.new-add {
  align-self: flex-start;
  padding: 7px 13px;
  border: none;
  border-radius: var(--radius-pill);
  background: var(--ink);
  color: var(--paper);
  font-weight: var(--fw-strong);
  font-size: 13px;
}
</style>
