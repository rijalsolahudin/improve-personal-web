<script setup lang="ts">
import { JOURNAL_NOTE_MAX } from '~/utils/journal'

/** Afirmasi (kutipan di kertas lembut + selotip) atau Refleksi diri (kertas bergaris). */
const { day, kind } = defineProps<{ day: string; kind: 'affirm' | 'reflect' }>()

const journal = useJournalDay(() => day)
const isAffirm = computed(() => kind === 'affirm')
</script>

<template>
  <JournalCard
    :title="$t(`journal.${kind}.title`)"
    :dot="isAffirm ? 'var(--deep)' : 'var(--accent)'"
    :is-soft="isAffirm"
  >
    <template v-if="isAffirm" #decor>
      <Tape :width="84" :height="24" :top="-13" left="auto" :rotate="4" :radius="4" class="tape" />
    </template>
    <p v-if="!isAffirm" class="hint">{{ $t('journal.reflect.hint') }}</p>
    <div :class="isAffirm ? 'quote' : undefined">
      <span v-if="isAffirm" class="mark" aria-hidden="true">“</span>
      <Input
        :model-value="journal.day.value[kind]"
        variant="bare"
        multiline
        :class="isAffirm ? 'affirm' : 'lined-text reflect'"
        :rows="isAffirm ? 2 : 4"
        :maxlength="JOURNAL_NOTE_MAX"
        :placeholder="$t(`journal.${kind}.placeholder`)"
        :aria-label="$t(`journal.${kind}.title`)"
        @update:model-value="(text) => journal.setNote(kind, String(text))"
      />
    </div>
  </JournalCard>
</template>

<style scoped>
.tape {
  right: 28px;
  opacity: 0.75;
}

.hint {
  margin-top: -4px;
  font-weight: var(--fw-body);
  font-size: 13px;
  color: var(--mute);
}

.quote {
  display: flex;
  align-items: flex-start;
  gap: 6px;
}

.mark {
  flex-shrink: 0;
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: 44px;
  line-height: 0.8;
  color: var(--deep);
}

.affirm {
  flex: 1;
  min-width: 0;
  padding: 4px 0 0;
  border: none;
  background: transparent;
  font-family: var(--font-hand);
  font-size: 24px;
  line-height: 32px;
  resize: none;
  outline: none;
}

.reflect {
  --line-h: 33px;

  font-size: 19px;
}
</style>
