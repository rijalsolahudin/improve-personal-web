<script setup lang="ts">
import { MEMO_PAPER_NAMES, memoPapers, type MemoPaperName } from '@improve-personal/tokens'

const model = defineModel<MemoPaperName>({ required: true })
</script>

<template>
  <div class="papers" role="group" :aria-label="$t('memo.paperLabel')">
    <span class="eyebrow-label" aria-hidden="true">{{ $t('memo.paper') }}</span>
    <button
      v-for="name in MEMO_PAPER_NAMES"
      :key="name"
      type="button"
      class="swatch"
      :title="$t(`memo.papers.${name}`)"
      :aria-label="$t(`memo.papers.${name}`)"
      :aria-pressed="model === name"
      :style="{ '--paper-bg': memoPapers[name].bg, '--paper-line': memoPapers[name].line }"
      @click="model = name"
    />
  </div>
</template>

<style scoped>
.papers {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.eyebrow-label {
  flex-shrink: 0;
  font-weight: var(--fw-strong);
  font-size: var(--fs-eyebrow);
  letter-spacing: 0.08em;
  color: var(--mute-3);
}

.swatch {
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  padding: 0;
  border: var(--border) solid rgba(47, 42, 36, 0.25);
  border-radius: 50%;
  background-color: var(--paper-bg);
  background-image: repeating-linear-gradient(
    transparent 0,
    transparent 5px,
    var(--paper-line) 5px,
    var(--paper-line) 6px
  );
}

.swatch[aria-pressed='true'] {
  width: 26px;
  height: 26px;
  border-color: var(--outline);
}

@media (max-width: 599px) {
  .papers {
    flex-wrap: nowrap;
    overflow-x: auto;
  }
}
</style>
