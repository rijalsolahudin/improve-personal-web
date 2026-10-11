<script setup lang="ts">
import { memoPapers, type MemoPaperName } from '@improve-personal/tokens'

const {
  paper = 'krem',
  placeholder = '',
  minHeight = 308,
} = defineProps<{
  paper?: MemoPaperName
  placeholder?: string
  minHeight?: number
}>()

const model = defineModel<string>({ default: '' })

const style = computed(() => {
  const stock = memoPapers[paper] ?? memoPapers.krem
  return {
    '--memo-bg': stock.bg,
    '--memo-line': stock.line,
    '--memo-margin': stock.margin,
    '--memo-ink': stock.ink,
    minHeight: `${minHeight}px`,
  }
})
</script>

<template>
  <textarea v-model="model" class="paper" :style="style" :placeholder="placeholder" />
</template>

<style scoped>
.paper {
  display: block;
  width: 100%;
  box-sizing: border-box;
  border: none;
  border-bottom: 2px dashed var(--mline);
  outline: none;
  color: var(--memo-ink);
  font-family: var(--font-hand);
  font-size: 21px;
  line-height: 34px;
  resize: vertical;
  padding: 6px 28px 0 66px;
  background-color: var(--memo-bg);
  background-image:
    linear-gradient(
      90deg,
      transparent 48px,
      var(--memo-margin) 48px,
      var(--memo-margin) 50px,
      transparent 50px
    ),
    repeating-linear-gradient(
      transparent 0,
      transparent 33px,
      var(--memo-line) 33px,
      var(--memo-line) 34px
    );
  background-attachment: local;
  background-position: 0 6px;
}

@media (max-width: 599px) {
  .paper {
    padding-left: 56px;
    padding-right: 16px;
  }
}
</style>
