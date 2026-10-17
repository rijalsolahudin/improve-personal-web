<script setup lang="ts">
import { POMODORO_TARGET_MAX } from '~/composables/usePomodoro'
import {
  POMODORO_TARGET_MODES,
  searchTargetOptions,
  type PomodoroTargetMode,
} from '~/utils/pomodoro'

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
    return { key, label: n ? t('pomodoro.targetModeCount', { label, n }) : label }
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

function onFreeInput(event: Event): void {
  freeText.value = (event.target as HTMLInputElement).value
  pomodoro.setTarget(freeText.value, 'teks')
}
</script>

<template>
  <div class="target">
    <span class="eyebrow label">{{ $t('pomodoro.targetTitle') }}</span>
    <div class="modes" role="group" :aria-label="$t('pomodoro.targetTitle')">
      <button
        v-for="item in modes"
        :key="item.key"
        type="button"
        :aria-pressed="mode === item.key"
        @click="pickMode(item.key)"
      >
        {{ item.label }}
      </button>
    </div>

    <div class="current">
      <span class="kind">{{
        $t(`pomodoro.targetKind.${pomodoro.targetKind.value ?? 'none'}`)
      }}</span>
      <span class="current-title">{{ pomodoro.target.value ?? $t('pomodoro.targetNone') }}</span>
    </div>

    <template v-if="mode !== 'free'">
      <input
        v-model="query"
        class="search"
        type="search"
        :placeholder="$t(`pomodoro.targetSearch.${mode}`)"
        :aria-label="$t(`pomodoro.targetSearch.${mode}`)"
      />
      <ul class="options">
        <li v-for="option in list" :key="option.label">
          <button
            type="button"
            class="option"
            :aria-pressed="pomodoro.target.value === option.label"
            @click="pomodoro.setTarget(option.label, mode)"
          >
            <span class="dot" :style="{ background: option.color }" aria-hidden="true" />
            <span class="option-title">{{ option.label }}</span>
            <span v-if="option.meta" class="meta">{{ option.meta }}</span>
            <span class="check" aria-hidden="true">✓</span>
          </button>
        </li>
      </ul>
      <p v-if="!list.length" class="empty">{{ emptyText }}</p>
    </template>
    <input
      v-else
      class="free"
      :value="freeText"
      :maxlength="POMODORO_TARGET_MAX"
      :placeholder="$t('pomodoro.freePlaceholder')"
      :aria-label="$t('pomodoro.targetMode.free')"
      @input="onFreeInput"
    />
  </div>
</template>

<style scoped>
.target {
  width: 100%;
  max-width: 520px;
  display: flex;
  flex-direction: column;
  padding: 14px 16px;
  border-radius: var(--radius-card);
  background: rgb(255 255 255 / 0.7);
}

.label {
  color: var(--ph-deep);
}

.modes {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 2px;
  margin-top: 8px;
  padding: 3px;
  border-radius: var(--radius-pill);
  background: var(--paper);
}

.modes button {
  overflow: hidden;
  padding: 6px;
  border: none;
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--mute-2);
  font-weight: var(--fw-strong);
  font-size: 13px;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.modes button[aria-pressed='true'] {
  background: var(--ph-deep);
  color: var(--paper);
}

.current {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
  padding: 8px 12px;
  border: var(--border-thin) solid var(--outline);
  border-radius: calc(14px * var(--rk));
  background: var(--paper);
}

.kind {
  flex-shrink: 0;
  font-weight: var(--fw-strong);
  font-size: 11px;
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
  font-size: 14px;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.search {
  width: 100%;
  margin-top: 10px;
  padding: 9px 12px;
  border: var(--border-thin) solid var(--line);
  border-radius: calc(14px * var(--rk));
  background: var(--paper);
  font-weight: var(--fw-body);
  font-size: 14px;
  outline: none;
}

.search:focus-visible {
  border-color: var(--outline);
}

.options {
  max-height: 236px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 8px 0 0;
  padding: 0 2px 0 0;
  overflow-y: auto;
  list-style: none;
}

.option {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border: none;
  border-radius: calc(12px * var(--rk));
  background: transparent;
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
  font-size: 12px;
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
  font-size: 11px;
}

.option[aria-pressed='true'] .check {
  background: var(--ph-deep);
  color: var(--paper);
}

.empty {
  padding: 14px 10px;
  text-align: center;
  font-weight: var(--fw-body);
  font-size: 13px;
  color: var(--mute);
}

.free {
  width: 100%;
  margin-top: 10px;
  padding: 11px 14px;
  border: var(--border) solid var(--outline);
  border-radius: var(--radius-btn-sq);
  background: var(--paper);
  font-weight: var(--fw-body);
  font-size: 15px;
  outline: none;
}
</style>
