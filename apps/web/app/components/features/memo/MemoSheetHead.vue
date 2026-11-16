<script setup lang="ts">
import { JOURNAL_NOTE_MAX } from '~/utils/journal'
import { MEMO_FEELINGS } from '~/utils/memo'

/**
 * Kepala kertas jurnal: pertanyaan + perasaan di kiri, mood di kanan, lalu satu baris afirmasi. Tanggal tidak diulang
 * (sudah ada di kartu hari); slot hanya untuk judul pembaca layar.
 * Isinya singkat dan sengaja ringan secara visual supaya tulisan diary di bawahnya tetap yang utama.
 */
const { day } = defineProps<{ day: string }>()

const memos = useMemos()
const journal = useJournalDay(() => day)
const { draft, toggleFeeling } = useMemoDraft()

/** Pilihan perasaan dilipat sampai diminta; yang sudah dipilih tetap terlihat sebagai tag. */
const isPickingFeelings = ref(false)
const shownFeelings = computed(() =>
  isPickingFeelings.value
    ? MEMO_FEELINGS
    : MEMO_FEELINGS.filter((feeling) => draft.value.feelings.includes(feeling)),
)
const toggleLabel = computed(() => {
  if (isPickingFeelings.value) return 'memo.feelingsDone'
  return draft.value.feelings.length ? 'memo.feelingsEdit' : 'memo.feelingsAdd'
})

const mood = computed({
  get: () => memos.moodOn(day),
  set: (value: number | null) => memos.setMood(day, value),
})
</script>

<template>
  <div class="head" data-anchor="journal-feeling" data-anchor-kind="content">
    <slot />
    <div class="top">
      <div class="intro">
        <p class="ask">{{ $t('memo.howToday') }}</p>
        <div
          class="feelings"
          :class="{ picking: isPickingFeelings }"
          role="group"
          :aria-label="$t('memo.feelingsLabel')"
        >
          <button
            v-for="feeling in shownFeelings"
            :key="feeling"
            type="button"
            class="tag"
            :aria-pressed="draft.feelings.includes(feeling)"
            @click="toggleFeeling(feeling)"
          >
            {{ feeling }}
          </button>
          <button
            type="button"
            class="more"
            :aria-expanded="isPickingFeelings"
            @click="isPickingFeelings = !isPickingFeelings"
          >
            {{ $t(toggleLabel) }}
          </button>
        </div>
      </div>
      <MoodPicker v-model="mood" class="mood-picker" :label="$t('memo.moodLabel')" />
    </div>

    <label class="affirm" data-anchor="journal-affirm" data-anchor-kind="content">
      <span class="mark" aria-hidden="true">“</span>
      <Input
        :model-value="journal.day.value.affirm"
        variant="bare"
        class="affirm-input"
        :maxlength="JOURNAL_NOTE_MAX"
        :placeholder="$t('journal.affirm.placeholder')"
        :aria-label="$t('journal.affirm.title')"
        @update:model-value="(text) => journal.setAffirm(String(text))"
      />
    </label>
  </div>
</template>

<style scoped>
.head {
  display: flex;
  flex-direction: column;
  gap: var(--space-12);
}

/* Pertanyaan + perasaan di kiri, mood di kanan: kepala seimbang, tidak menumpuk di satu sisi. */
.top {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-12);
}

/* Bukan `.mood`: nama itu dipakai ubin di dalam MoodPicker dan ikut kena gaya root-nya. */
.mood-picker {
  width: min(100%, 340px);
}

.intro {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.ask {
  font-family: var(--font-hand);
  /* Patrick Hand hanya punya weight 400; paragraf mewarisi `--fw-body` (700) → faux-bold. */
  font-weight: 400;
  font-size: var(--fs-hand-30);
  line-height: 1.1;
  color: var(--ink);
}

.feelings {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-6);
}

.picking {
  padding: var(--space-8) var(--space-10);
  border-radius: var(--radius-row);
  background: var(--alt);
}

.tag,
.more {
  padding: 2px var(--space-10);
  border: var(--border-thin) solid transparent;
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--mute-2);
  font-family: var(--font-hand);
  /* Patrick Hand hanya punya weight 400; tombol mewarisi `--fw-body` (700) → faux-bold. */
  font-weight: 400;
  font-size: var(--fs-hand-15);
}

/* Tag terpilih: tinta lembut, bukan pil hitam - perasaan adalah catatan kecil, bukan tombol utama. */
.tag[aria-pressed='true'] {
  border-color: var(--dash);
  background: var(--soft);
  color: var(--ink);
}

.picking .tag[aria-pressed='false'] {
  border-color: var(--dash);
  background: var(--paper);
}

.more {
  color: var(--deep);
  text-decoration: underline dashed;
  text-underline-offset: 3px;
}

/* Afirmasi = satu baris kutipan berlatar lembut, tanpa bingkai dan label: placeholder sudah menjelaskan. */
.affirm {
  display: flex;
  align-items: center;
  gap: var(--space-8);
  padding: var(--space-4) var(--space-14);
  border-radius: var(--radius-pill);
  background: var(--alt);
}

.mark {
  flex-shrink: 0;
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: var(--fs-24);
  line-height: 1;
  color: var(--deep);
}

.affirm-input {
  flex: 1;
  min-width: 0;
  padding: 0;
  border: none;
  background: transparent;
  font-family: var(--font-hand);
  /* Patrick Hand hanya punya weight 400; input mewarisi `--fw-body` (700) → faux-bold. */
  font-weight: 400;
  font-size: var(--fs-hand-18);
  line-height: 28px;
  color: var(--ink);
  outline: none;
}

.affirm-input::placeholder {
  color: var(--mute-3);
}
</style>
