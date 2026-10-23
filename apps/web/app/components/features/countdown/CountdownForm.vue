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
const { countdownId, initial = null } = defineProps<{
  countdownId: string | null
  /** Isian awal dari integrasi lain (mis. tanggal target goal, PRD F13/F5). */
  initial?: { title?: string; date?: string } | null
}>()
const emit = defineEmits<{ close: []; saved: [] }>()

const { t } = useI18n()
const now = useNow()
const countdownText = useCountdownText()
const { find, save, remove } = useCountdowns()
const { rememberSticker } = useDeco()
const original = countdownId ? find(countdownId) : undefined

const draft = ref<CountdownDraft>(
  original
    ? draftFromCountdown(original)
    : {
        ...newCountdownDraft(toIsoDate(new Date())),
        ...(initial?.title ? { title: initial.title } : {}),
        ...(initial?.date ? { date: initial.date } : {}),
      },
)
const error = ref<CountdownDraftError | null>(null)
const isConfirmingDelete = ref(false)
const isPickingSticker = ref(false)

const tint = computed(() => countdownTint(draft.value.color))
const previewTarget = computed(() => countdownTarget(draft.value, now.value))
const previewLeft = computed(() => {
  if (!draft.value.date) return ''
  return isCountdownToday(draft.value, previewTarget.value, now.value)
    ? t('countdown.today')
    : countdownText(previewTarget.value, now.value)
})

const colorOptions = computed(() =>
  COUNTDOWN_COLORS.map((color, index) => ({
    value: color,
    color,
    label: t('countdown.form.colorN', { n: index + 1 }),
  })),
)

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
</script>

<template>
  <Modal
    open
    align="top"
    width="540px"
    :title="$t(original ? 'countdown.form.editTitle' : 'countdown.form.newTitle')"
    is-dismissible
    @close="emit('close')"
  >
    <form class="form" novalidate @submit.prevent="submit">
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

      <Field :label="$t('countdown.form.title')">
        <Input
          v-model="draft.title"
          data-autofocus
          :maxlength="COUNTDOWN_TITLE_MAX"
          :placeholder="$t('countdown.form.titlePlaceholder')"
          :aria-invalid="error === 'titleRequired'"
        />
      </Field>

      <div class="pair">
        <Field :label="$t('countdown.form.date')">
          <Input
            v-model="draft.date"
            type="date"
            :aria-invalid="error === 'dateRequired' || error === 'pastDate'"
          />
        </Field>
        <Field :label="$t('countdown.form.time')">
          <template #action>
            <Button variant="link" @click="toggleTime">
              {{ draft.time ? $t('countdown.form.allDay') : $t('countdown.form.useTime') }}
            </Button>
          </template>
          <Input v-if="draft.time" v-model="draft.time" type="time" />
          <div v-else class="static">{{ $t('countdown.form.allDay') }}</div>
        </Field>
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

      <Field :label="$t('countdown.form.decor')" is-group>
        <div class="emojis">
          <OptionTile
            v-for="emoji in COUNTDOWN_EMOJIS"
            :key="emoji"
            :active="isEmojiOn(emoji)"
            :tint="tint[0]"
            :aria-label="$t('countdown.form.emojiN', { emoji })"
            @click="pickEmoji(emoji)"
          >
            {{ emoji }}
          </OptionTile>
        </div>
        <DecoStickerButton
          :sticker="draft.sticker"
          :label="$t(draft.sticker ? 'countdown.form.changeSticker' : 'countdown.form.useSticker')"
          @click="isPickingSticker = true"
        />
        <SwatchPicker v-model="draft.color" class="colors" :options="colorOptions" />
      </Field>

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
  </Modal>
</template>

<style scoped>
.form {
  display: flex;
  flex-direction: column;
  gap: 16px;
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

.static {
  height: 46px;
  display: flex;
  align-items: center;
  padding: 0 14px;
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

.colors {
  margin-top: 10px;
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
</style>
