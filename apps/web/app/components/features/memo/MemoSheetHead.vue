<script setup lang="ts">
import { JOURNAL_NOTE_MAX } from '~/utils/journal'
import { MEMO_FEELINGS } from '~/utils/memo'

/**
 * Kepala kertas jurnal: judul tanggal + mood sebaris, satu baris perasaan, dan satu baris afirmasi.
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
    <div class="top">
      <div class="title">
        <slot />
      </div>
      <MoodPicker v-model="mood" class="mood-picker" :label="$t('memo.moodLabel')" />
    </div>

    <div
      class="feelings"
      :class="{ picking: isPickingFeelings }"
      role="group"
      :aria-label="$t('memo.feelingsLabel')"
    >
      <span class="feelings-label" aria-hidden="true">{{ $t('memo.feelingsShort') }}</span>
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

    <label class="affirm" data-anchor="journal-affirm" data-anchor-kind="content">
      <span class="mark" aria-hidden="true">“</span>
      <span class="affirm-body">
        <span class="eyebrow affirm-label">{{ $t('journal.affirm.title') }}</span>
        <Input
          :model-value="journal.day.value.affirm"
          variant="bare"
          class="affirm-input"
          :maxlength="JOURNAL_NOTE_MAX"
          :placeholder="$t('journal.affirm.placeholder')"
          :aria-label="$t('journal.affirm.title')"
          @update:model-value="(text) => journal.setAffirm(String(text))"
        />
      </span>
    </label>
  </div>
</template>

<style scoped>
.head {
  display: flex;
  flex-direction: column;
  gap: var(--space-12);
}

/* Tanggal di kiri, mood di kanan: kepala seimbang, tidak menumpuk di satu sisi. */
.top {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--space-12);
}

.title {
  min-width: 0;
}

/* Bukan `.mood`: nama itu dipakai ubin di dalam MoodPicker dan ikut kena gaya root-nya. */
.mood-picker {
  width: min(100%, 360px);
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

.feelings-label {
  margin-right: var(--space-2);
  font-weight: var(--fw-strong);
  font-size: var(--fs-12);
  color: var(--mute-3);
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

/* Afirmasi = kartu kutipan kecil bergaya kartu jurnal lain: garis tipis keliling, sudut bulat. */
.affirm {
  display: flex;
  align-items: center;
  gap: var(--space-10);
  padding: var(--space-8) var(--space-16);
  border: var(--border-thin) solid var(--line);
  border-radius: calc(18px * var(--rk));
  background: var(--alt);
}

.mark {
  flex-shrink: 0;
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: var(--fs-display-36);
  line-height: 1;
  color: var(--deep);
}

.affirm-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.affirm-label {
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
  font-size: var(--fs-hand-20);
  line-height: 28px;
  color: var(--ink);
  outline: none;
}

.affirm-input::placeholder {
  color: var(--mute-3);
}
</style>
