<script setup lang="ts">
import {
  COUNTDOWN_COLORS,
  COUNTDOWN_EMOJIS,
  COUNTDOWN_TITLE_MAX,
  countdownTarget,
  countdownTint,
  draftFromCountdown,
  isCountdownToday,
  newCountdownDraft,
  type CountdownDraft,
  type CountdownDraftError,
} from '~/utils/countdown'
import { toIsoDate } from '~/utils/time'

/** Modal momen baru / edit (design "Momen baru" / "Edit momen"). */
const { countdownId } = defineProps<{ countdownId: string | null }>()
const emit = defineEmits<{ close: []; saved: [] }>()

const { t } = useI18n()
const now = useNow()
const countdownText = useCountdownText()
const { find, save, remove } = useCountdowns()
const { rememberSticker } = useDeco()
const original = countdownId ? find(countdownId) : undefined

const draft = ref<CountdownDraft>(
  original ? draftFromCountdown(original) : newCountdownDraft(toIsoDate(new Date())),
)
const error = ref<CountdownDraftError | null>(null)
const isConfirmingDelete = ref(false)
const isPickingSticker = ref(false)
const panel = useTemplateRef<HTMLElement>('panel')

const tint = computed(() => countdownTint(draft.value.color))
const previewTarget = computed(() => countdownTarget(draft.value, now.value))
const previewLeft = computed(() => {
  if (!draft.value.date) return ''
  return isCountdownToday(draft.value, previewTarget.value, now.value)
    ? t('countdown.today')
    : countdownText(previewTarget.value, now.value)
})

watch(draft, () => (error.value = null), { deep: true })

function submit(): void {
  const result = save(draft.value, original?.id ?? null)
  if ('error' in result) error.value = result.error
  else emit('saved')
}

function onDelete(): void {
  if (!original) return
  if (!isConfirmingDelete.value) {
    isConfirmingDelete.value = true
    return
  }
  remove(original.id)
  emit('close')
}

/** Emoji aktif hanya kalau tidak sedang pakai sticker. */
const isEmojiOn = (emoji: string): boolean => !draft.value.sticker && draft.value.emoji === emoji

function pickEmoji(emoji: string): void {
  draft.value.emoji = emoji
  draft.value.sticker = null
}

function onSticker(sid: string): void {
  rememberSticker(sid)
  draft.value.sticker = sid
  isPickingSticker.value = false
}

function toggleTime(): void {
  draft.value.time = draft.value.time ? '' : '09:00'
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && !isPickingSticker.value) emit('close')
}
onMounted(() => {
  panel.value?.querySelector<HTMLInputElement>('input')?.focus()
  window.addEventListener('keydown', onKeydown)
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="scrim" @click.self="emit('close')">
    <form
      ref="panel"
      class="panel"
      role="dialog"
      aria-modal="true"
      aria-labelledby="countdown-form-title"
      novalidate
      @submit.prevent="submit"
    >
      <div class="top">
        <h2 id="countdown-form-title" class="heading">
          {{ $t(original ? 'countdown.form.editTitle' : 'countdown.form.newTitle') }}
        </h2>
        <IconButton
          tone="plain"
          :size="40"
          :radius="14"
          :title="$t('common.close')"
          @click="emit('close')"
        >
          ×
        </IconButton>
      </div>

      <div class="preview" :style="{ '--cd-soft': tint[0], '--cd-deep': tint[1] }">
        <span class="tile" aria-hidden="true">
          <CountdownArt :countdown="draft" :size="38" />
        </span>
        <span class="preview-info">
          <span class="preview-title">
            {{ draft.title.trim() || $t('countdown.form.previewFallback') }}
          </span>
          <span class="preview-left">{{ previewLeft }}</span>
        </span>
      </div>

      <label class="field-wrap">
        <span class="label">{{ $t('countdown.form.title') }}</span>
        <input
          v-model="draft.title"
          class="field"
          :maxlength="COUNTDOWN_TITLE_MAX"
          :placeholder="$t('countdown.form.titlePlaceholder')"
          :aria-invalid="error === 'titleRequired'"
        />
      </label>

      <div class="pair">
        <label class="field-wrap">
          <span class="label">{{ $t('countdown.form.date') }}</span>
          <input
            v-model="draft.date"
            class="field"
            type="date"
            :aria-invalid="error === 'dateRequired' || error === 'pastDate'"
          />
        </label>
        <div class="field-wrap">
          <span class="label-row">
            <span class="label">{{ $t('countdown.form.time') }}</span>
            <button type="button" class="toggle-time" @click="toggleTime">
              {{ draft.time ? $t('countdown.form.allDay') : $t('countdown.form.useTime') }}
            </button>
          </span>
          <input v-if="draft.time" v-model="draft.time" class="field" type="time" />
          <div v-else class="field static">{{ $t('countdown.form.allDay') }}</div>
        </div>
      </div>

      <div class="switch-row">
        <span class="switch-text">
          <span class="switch-title">{{ $t('countdown.form.yearly') }}</span>
          <span class="switch-hint">{{ $t('countdown.form.yearlyHint') }}</span>
        </span>
        <Toggle
          :on="draft.yearly"
          :aria-label="$t('countdown.form.yearly')"
          @click="draft.yearly = !draft.yearly"
        />
      </div>

      <div>
        <span class="label">{{ $t('countdown.form.decor') }}</span>
        <div class="emojis">
          <button
            v-for="emoji in COUNTDOWN_EMOJIS"
            :key="emoji"
            type="button"
            class="emoji"
            :class="{ on: isEmojiOn(emoji) }"
            :style="isEmojiOn(emoji) ? { background: tint[0] } : undefined"
            :aria-pressed="isEmojiOn(emoji)"
            :aria-label="$t('countdown.form.emojiN', { emoji })"
            @click="pickEmoji(emoji)"
          >
            {{ emoji }}
          </button>
        </div>
        <DecoStickerButton
          :sticker="draft.sticker"
          :label="$t(draft.sticker ? 'countdown.form.changeSticker' : 'countdown.form.useSticker')"
          @click="isPickingSticker = true"
        />
        <div class="colors">
          <button
            v-for="(color, index) in COUNTDOWN_COLORS"
            :key="color"
            type="button"
            class="swatch"
            :class="{ on: draft.color === color }"
            :style="{ background: color }"
            :aria-pressed="draft.color === color"
            :aria-label="$t('countdown.form.colorN', { n: index + 1 })"
            @click="draft.color = color"
          />
        </div>
      </div>

      <p v-if="error" class="error" role="alert">
        {{ $t(`countdown.form.error.${error}`) }}
      </p>

      <div class="actions">
        <template v-if="original">
          <Button variant="danger" @click="onDelete">
            {{ $t(isConfirmingDelete ? 'countdown.form.deleteConfirm' : 'countdown.form.delete') }}
          </Button>
          <span class="spacer" />
        </template>
        <Button variant="soft" @click="emit('close')">
          {{ $t('countdown.form.cancel') }}
        </Button>
        <Button type="submit" variant="primary">
          {{ $t(original ? 'countdown.form.saveEdit' : 'countdown.form.saveNew') }}
        </Button>
      </div>
    </form>
    <LazyDecoPicker
      v-if="isPickingSticker"
      :title="$t('countdown.form.stickerTitle')"
      :current="draft.sticker"
      :clear-label="draft.sticker ? $t('countdown.form.removeSticker') : null"
      @choose="onSticker"
      @clear="((draft.sticker = null), (isPickingSticker = false))"
      @close="isPickingSticker = false"
    />
  </div>
</template>

<style scoped>
.scrim {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  overflow-y: auto;
  padding: 40px 20px;
  background: rgb(47 42 36 / 0.4);
}

.panel {
  width: 100%;
  max-width: 540px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 26px 28px;
  border: var(--border-thick) solid var(--outline);
  border-radius: var(--radius-panel);
  background: var(--paper);
  box-shadow: calc(10px * var(--sx)) calc(10px * var(--sy)) calc(10px * var(--sbl))
    var(--shadow-color, rgb(47 42 36 / 0.15));
}

.top,
.label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.heading {
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: 26px;
}

.preview {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  border-radius: var(--radius-card);
  background: var(--cd-soft);
}

.preview .tile {
  width: 56px;
  height: 56px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: var(--border) solid var(--outline);
  border-radius: calc(18px * var(--rk)) calc(18px * var(--rk)) calc(18px * var(--rk))
    calc(6px * var(--rk));
  background: var(--paper);
  font-size: 28px;
  transform: rotate(calc(-5deg * var(--bev)));
}

.preview-info {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.preview-title {
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: 19px;
  line-height: 1.15;
}

.preview-left {
  font-weight: var(--fw-strong);
  font-size: 14px;
  color: var(--cd-deep);
}

.field-wrap {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.label {
  margin-bottom: 6px;
  font-weight: var(--fw-strong);
  font-size: 13px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--mute-2);
}

.label-row .label {
  margin-bottom: 0;
}

.toggle-time {
  margin-bottom: 6px;
  padding: 0;
  border: none;
  background: none;
  color: var(--accent);
  font-weight: var(--fw-strong);
  font-size: 12px;
}

.field {
  width: 100%;
  padding: 11px 14px;
  border: var(--border) solid var(--outline);
  border-radius: var(--radius-btn-sq);
  background: var(--paper);
  font-weight: var(--fw-body);
  font-size: 15px;
  outline: none;
}

.field[aria-invalid='true'] {
  border-color: #e2445c;
}

.field.static {
  height: 46px;
  display: flex;
  align-items: center;
  border: none;
  border-radius: var(--radius-btn-sq);
  background: var(--alt);
  color: var(--mute-2);
  font-size: 14px;
}

.pair {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 12px;
}

.switch-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-radius: var(--radius-row);
  background: var(--alt);
}

.switch-text {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.switch-title {
  font-weight: var(--fw-strong);
  font-size: 15px;
}

.switch-hint {
  font-weight: var(--fw-body);
  font-size: 12px;
  color: var(--mute);
}

.emojis {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.emoji {
  width: 42px;
  height: 42px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: var(--border) solid var(--line);
  border-radius: calc(14px * var(--rk));
  background: var(--paper);
  font-size: 20px;
}

.emoji.on {
  border-color: var(--outline);
}

.colors {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}

.swatch {
  width: 32px;
  height: 32px;
  border: var(--border-thick) solid transparent;
  border-radius: calc(11px * var(--rk));
}

.swatch.on {
  border-color: var(--outline);
}

.error {
  padding: 10px 14px;
  border-radius: calc(14px * var(--rk));
  background: #ffe1da;
  color: #9a2a14;
  font-weight: var(--fw-strong);
  font-size: 14px;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}

.spacer {
  flex: 1;
}

@media (max-width: 599px) {
  .scrim {
    padding: 16px 10px;
  }

  .panel {
    padding: 20px 18px;
  }
}
</style>
