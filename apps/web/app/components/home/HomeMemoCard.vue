<script setup lang="ts">
import { memoPapers, type MemoPaperName } from '@improve-personal/tokens'

import type { HomeMemo } from '~/composables/home/types'
import { MEMO_TEXT_MAX } from '~/utils/memo'

const { pagesToday } = defineProps<{ pagesToday: number }>()
const emit = defineEmits<{ save: [entry: HomeMemo] }>()

const { t } = useI18n()
const text = ref('')
const mood = ref<number | null>(null)
const paper = ref<MemoPaperName>('krem')
const isSaved = ref(false)

const wordCount = computed(() => text.value.trim().split(/\s+/).filter(Boolean).length)
const status = computed(() => {
  if (isSaved.value) return t('memo.status.saved')
  return wordCount.value ? t('memo.status.words', { n: wordCount.value }) : t('memo.status.open')
})
const title = computed(() =>
  pagesToday ? t('memo.titleNextPage', { n: pagesToday + 1 }) : t('memo.title'),
)
const paperStyle = computed(() => {
  const stock = memoPapers[paper.value]
  return {
    '--memo-bg': stock.bg,
    '--memo-line': stock.line,
    '--memo-margin': stock.margin,
    '--memo-ink': stock.ink,
  }
})

function save(): void {
  if (!wordCount.value) return
  emit('save', { text: text.value, mood: mood.value, paper: paper.value })
  text.value = ''
  isSaved.value = true
}
</script>

<template>
  <section class="memo" aria-labelledby="home-memo-title">
    <span class="tape" aria-hidden="true" />
    <UiMascot class="mascot" name="beruang" :size="96" />
    <div class="pad">
      <h2 id="home-memo-title" class="title">{{ title }}</h2>
      <p class="feeling">{{ $t('memo.feeling') }}</p>
      <MemoMoodPicker v-model="mood" class="moods" />
    </div>
    <MemoPaperPicker v-model="paper" class="pad papers" />
    <div class="divider" />
    <label class="visually-hidden" for="home-memo-text">{{ $t('memo.textLabel') }}</label>
    <textarea
      id="home-memo-text"
      v-model="text"
      class="sheet"
      :style="paperStyle"
      :maxlength="MEMO_TEXT_MAX"
      :placeholder="$t('memo.placeholder')"
      @input="isSaved = false"
    />
    <div class="footer">
      <NuxtLink :to="getFeature('memo').path" class="status">{{ status }}</NuxtLink>
      <button type="button" class="save" :disabled="!wordCount" @click="save">
        {{ $t('memo.save') }}
      </button>
    </div>
  </section>
</template>

<style scoped>
.memo {
  position: relative;
  margin-top: 8px;
  padding: 22px 0 16px;
  background: var(--paper-2);
  border: var(--border-thick) solid var(--ink);
  border-radius: 28px;
  box-shadow: var(--shadow-drop-sm);
}

.tape {
  position: absolute;
  top: -13px;
  left: 28px;
  width: 90px;
  height: 24px;
  border-radius: 3px;
  background: var(--primary);
  opacity: 0.8;
  transform: rotate(-4deg);
}

.mascot {
  position: absolute;
  top: -50px;
  right: 6px;
  transform: rotate(8deg);
}

.pad {
  padding: 0 22px;
}

.title {
  padding-right: 90px;
  font-family: var(--font-hand);
  font-weight: 400;
  font-size: 24px;
  line-height: 1.1;
}

.feeling {
  margin-top: 12px;
  font-weight: 800;
  font-size: var(--fs-meta);
  letter-spacing: 0.08em;
  color: var(--mute-2);
}

.moods {
  margin-top: 8px;
}

.papers {
  padding-top: 12px;
}

.divider {
  margin-top: 12px;
  border-top: 2px dashed var(--mline);
}

.sheet {
  display: block;
  width: 100%;
  min-height: 150px;
  padding: 6px 22px 0 48px;
  border: none;
  outline: none;
  resize: vertical;
  font-family: var(--font-hand);
  font-size: var(--fs-hand-body);
  line-height: var(--lh-ruled);
  color: var(--memo-ink);
  background-color: var(--memo-bg);
  background-image:
    linear-gradient(
      90deg,
      transparent 34px,
      var(--memo-margin) 34px,
      var(--memo-margin) 36px,
      transparent 36px
    ),
    repeating-linear-gradient(
      transparent 0,
      transparent 29px,
      var(--memo-line) 29px,
      var(--memo-line) 30px
    );
  background-attachment: local;
  background-position: 0 6px;
}

.sheet:focus-visible {
  box-shadow: inset 0 0 0 3px var(--accent);
}

.footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 22px 0;
}

.status {
  font-weight: 800;
  font-size: var(--fs-meta);
  color: var(--mute-3);
}

.status:hover {
  color: var(--accent);
}

.save {
  padding: 10px 18px;
  border: none;
  border-radius: var(--radius-pill);
  background: var(--accent);
  color: var(--paper);
  font-weight: 800;
  font-size: var(--fs-body-sm);
}

.save:disabled {
  opacity: 0.45;
  cursor: default;
}

@media (max-width: 599px) {
  .memo {
    margin-top: 6px;
    padding: 18px 0 14px;
    border-radius: var(--radius-sticker);
  }

  .tape {
    top: -12px;
    left: 24px;
    width: 80px;
    height: 22px;
  }

  .mascot {
    top: -26px;
    right: 12px;
    transform: scale(0.58);
    transform-origin: top right;
  }

  .pad {
    padding: 0 16px;
  }

  .title {
    padding-right: 56px;
    font-size: var(--fs-hand-title);
  }

  .feeling {
    margin-top: 10px;
    font-size: var(--fs-eyebrow);
  }

  .sheet {
    padding: 6px 16px 0 44px;
    resize: none;
    background-image:
      linear-gradient(
        90deg,
        transparent 30px,
        var(--memo-margin) 30px,
        var(--memo-margin) 32px,
        transparent 32px
      ),
      repeating-linear-gradient(
        transparent 0,
        transparent 29px,
        var(--memo-line) 29px,
        var(--memo-line) 30px
      );
  }

  .footer {
    padding: 12px 16px 0;
  }

  .save {
    min-height: var(--tap-min);
    padding: 0 18px;
  }
}
</style>
