<script setup lang="ts">
import { POMODORO_TARGET_MAX } from '~/composables/usePomodoro'
import {
  POMODORO_TARGET_MODES,
  searchTargetOptions,
  type PomodoroTargetMode,
} from '@improve-personal/core/planner'

/** Target fokus (PRD F4, design `pmPicker`): pilih dari task/jadwal/habit, atau teks bebas. */
const { t } = useI18n()
const pomodoro = usePomodoro()
const { options } = usePomodoroTargets()

const mode = computed(() => pomodoro.targetMode.value)
const query = ref('')
const freeText = ref(pomodoro.targetKind.value === 'teks' ? (pomodoro.target.value ?? '') : '')

const modes = computed(() =>
  POMODORO_TARGET_MODES.map((key) => {
    const label = t(`pomodoro.targetMode.${key}`)
    const n = key === 'free' ? 0 : options.value[key].length
    return { value: key, label: n ? t('pomodoro.targetModeCount', { label, n }) : label }
  }),
)
const list = computed(() =>
  mode.value === 'free' ? [] : searchTargetOptions(options.value[mode.value], query.value),
)
const emptyText = computed(() => {
  if (mode.value === 'free') return ''
  const q = query.value.trim()
  return q ? t('pomodoro.targetNotFound', { q }) : t(`pomodoro.targetEmpty.${mode.value}`)
})

function pickMode(next: PomodoroTargetMode): void {
  pomodoro.setTargetMode(next)
  query.value = ''
}

function onFreeInput(value: string | number): void {
  freeText.value = String(value)
  pomodoro.setTarget(freeText.value, 'teks')
}
</script>

<template>
  <div class="target">
    <span class="eyebrow label">{{ $t('pomodoro.targetTitle') }}</span>
    <Segmented
      class="modes"
      size="sm"
      is-equal
      :model-value="mode"
      :options="modes"
      :label="$t('pomodoro.targetTitle')"
      @update:model-value="pickMode"
    />

    <div class="current">
      <span class="kind">{{
        $t(`pomodoro.targetKind.${pomodoro.targetKind.value ?? 'none'}`)
      }}</span>
      <span class="current-title">{{ pomodoro.target.value ?? $t('pomodoro.targetNone') }}</span>
    </div>

    <div v-if="pomodoro.isTargetLocked.value" class="locked" role="status">
      <span class="locked-text">{{ $t('pomodoro.targetLocked') }}</span>
      <Button variant="link" class="locked-cancel" @click="pomodoro.cancelFocus">
        {{ $t('pomodoro.cancelFocus') }}
      </Button>
    </div>

    <template v-if="mode !== 'free'">
      <Input
        v-model="query"
        class="search"
        variant="subtle"
        size="sm"
        type="search"
        :disabled="pomodoro.isTargetLocked.value"
        :placeholder="$t(`pomodoro.targetSearch.${mode}`)"
        :aria-label="$t(`pomodoro.targetSearch.${mode}`)"
      />
      <ul class="options">
        <li v-for="option in list" :key="option.label">
          <button
            type="button"
            class="option"
            :aria-pressed="pomodoro.target.value === option.label"
            :disabled="pomodoro.isTargetLocked.value"
            @click="pomodoro.setTarget(option.label, mode)"
          >
            <span class="dot" :style="{ background: option.color }" aria-hidden="true" />
            <span class="option-title">{{ option.label }}</span>
            <span v-if="option.meta" class="meta">{{ option.meta }}</span>
            <span class="check" aria-hidden="true"
              ><Icon name="check" :size="12" :stroke="3"
            /></span>
          </button>
        </li>
      </ul>
      <p v-if="!list.length" class="empty">{{ emptyText }}</p>
    </template>
    <Input
      v-else
      class="free"
      :model-value="freeText"
      :maxlength="POMODORO_TARGET_MAX"
      :disabled="pomodoro.isTargetLocked.value"
      :placeholder="$t('pomodoro.freePlaceholder')"
      :aria-label="$t('pomodoro.targetMode.free')"
      @update:model-value="onFreeInput"
    />
  </div>
</template>

<style scoped>
.target {
  width: 100%;
  max-width: 520px;
  display: flex;
  flex-direction: column;
  padding: var(--space-14) var(--space-16);
  border-radius: var(--radius-card);
  background: rgb(255 255 255 / 0.7);
}

.label {
  /* Design: 12px / nowrap (eyebrow global 11px). */
  font-size: var(--fs-12);
  white-space: nowrap;
  color: var(--ph-deep);
}

.modes {
  --seg-bg: var(--paper);
  --seg-active: var(--ph-deep);

  margin-top: var(--space-8);
}

.current {
  display: flex;
  align-items: center;
  gap: var(--space-8);
  margin-top: var(--space-10);
  padding: var(--space-8) var(--space-12);
  border: var(--border-thin) solid var(--outline);
  border-radius: calc(14px * var(--rk));
  background: var(--paper);
}

.kind {
  flex-shrink: 0;
  font-weight: var(--fw-strong);
  font-size: var(--fs-12);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ph-deep);
}

.current-title,
.option-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  font-weight: var(--fw-strong);
  font-size: var(--fs-14);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.locked {
  display: flex;
  align-items: center;
  gap: var(--space-8);
  margin-top: var(--space-8);
  font-weight: var(--fw-body);
  font-size: var(--fs-13);
  color: var(--mute);
}

.locked-text {
  flex: 1;
}

.option:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.search {
  margin-top: var(--space-10);
}

.options {
  max-height: 236px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: var(--space-8) 0 0;
  padding: 0 2px 0 0;
  overflow-y: auto;
  list-style: none;
}

.option {
  width: 100%;
  display: flex;
  align-items: center;
  gap: var(--space-10);
  padding: var(--space-8) var(--space-10);
  border: none;
  border-radius: calc(12px * var(--rk));
  /* Design: baris belum dipilih = putih transparan di atas panel wash, bukan transparan penuh. */
  background: rgb(255 255 255 / 0.5);
  color: var(--ink);
  text-align: left;
}

.option:hover,
.option[aria-pressed='true'] {
  background: var(--paper);
}

.dot {
  width: 10px;
  height: 10px;
  flex-shrink: 0;
  border-radius: calc(3px * var(--rk));
}

.meta {
  flex-shrink: 0;
  font-weight: var(--fw-body);
  font-size: var(--fs-12);
  color: var(--mute);
  white-space: nowrap;
}

.check {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  color: transparent;
  font-weight: var(--fw-strong);
  font-size: var(--fs-12);
}

.option[aria-pressed='true'] .check {
  background: var(--ph-deep);
  color: var(--paper);
}

.empty {
  padding: var(--space-14) var(--space-10);
  text-align: center;
  font-weight: var(--fw-body);
  font-size: var(--fs-13);
  color: var(--mute);
}

.free {
  width: 100%;
  margin-top: var(--space-10);
  padding: var(--space-12) var(--space-14);
  border: var(--border) solid var(--outline);
  border-radius: var(--radius-btn-sq);
  background: var(--paper);
  font-weight: var(--fw-body);
  font-size: var(--fs-15);
  outline: none;
}
</style>
