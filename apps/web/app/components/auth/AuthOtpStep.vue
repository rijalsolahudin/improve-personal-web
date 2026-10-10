<script setup lang="ts">
import { DEMO_OTP } from '~/composables/auth/gateway'
import type { LoginFlow } from '~/composables/useLoginFlow'

const { flow } = defineProps<{ flow: LoginFlow }>()

const { otp } = flow
const boxes: (HTMLInputElement | null)[] = []

function setBox(index: number, el: unknown): void {
  boxes[index] = el instanceof HTMLInputElement ? el : null
}

function focusBox(index: number | null): void {
  if (index === null) return
  nextTick(() => {
    const box = boxes[index]
    box?.focus()
    box?.select()
  })
}

function onInput(index: number, event: Event): void {
  const target = event.target as HTMLInputElement
  focusBox(otp.input(index, target.value))
  // Kembalikan nilai DOM ke state (mis. karakter non-digit ditolak).
  target.value = otp.digits.value[index] ?? ''
}

function onKeydown(index: number, event: KeyboardEvent): void {
  if (event.key === 'Backspace' && !otp.digits.value[index]) {
    event.preventDefault()
    focusBox(otp.backspace(index))
  } else if (event.key === 'ArrowLeft' && index > 0) {
    focusBox(index - 1)
  } else if (event.key === 'ArrowRight' && index < OTP_LENGTH - 1) {
    focusBox(index + 1)
  }
}

function onPaste(event: ClipboardEvent): void {
  const next = otp.paste(event.clipboardData?.getData('text') ?? '')
  if (next === null) return
  event.preventDefault()
  focusBox(next)
}

// Design: verifikasi otomatis begitu 6 digit terisi.
watch(otp.isComplete, (isComplete) => {
  if (isComplete) flow.verify()
})
watch(flow.otpError, (error) => {
  if (error) focusBox(0)
})
onMounted(() => focusBox(0))

const resendCountdown = computed(() => `0:${String(flow.resendSecondsLeft.value).padStart(2, '0')}`)
</script>

<template>
  <div class="step">
    <button type="button" class="back" @click="flow.backToEmail">
      <span aria-hidden="true">←</span> {{ $t('login.otp.back') }}
    </button>

    <AuthHeading :eyebrow="$t('login.otp.eyebrow')" :title="$t('login.otp.title')">
      {{ $t('login.otp.sentTo') }} <strong class="email">{{ flow.email.value }}</strong>
    </AuthHeading>

    <form class="form" novalidate @submit.prevent="flow.verify">
      <fieldset class="boxes" @paste="onPaste">
        <legend class="visually-hidden">{{ $t('login.otp.legend') }}</legend>
        <!-- Slot OTP berposisi tetap (6 kotak), jadi indeks memang identitasnya. -->
        <input
          v-for="(digit, index) in otp.digits.value"
          :key="`otp-${index}`"
          :ref="(el) => setBox(index, el)"
          class="box"
          :class="{ filled: digit, invalid: flow.otpError.value }"
          :value="digit"
          type="text"
          inputmode="numeric"
          autocomplete="one-time-code"
          maxlength="1"
          :aria-label="$t('login.otp.digit', { n: index + 1, total: OTP_LENGTH })"
          :aria-invalid="Boolean(flow.otpError.value)"
          @input="onInput(index, $event)"
          @keydown="onKeydown(index, $event)"
        />
      </fieldset>
      <p v-if="flow.otpError.value" class="error" role="alert">
        {{ $t(`login.error.${flow.otpError.value}`) }}
      </p>
      <AuthPrimaryButton :is-loading="flow.isVerifying.value" :is-dimmed="!otp.isComplete.value">
        {{ $t(flow.isVerifying.value ? 'login.otp.verifying' : 'login.otp.verify') }}
      </AuthPrimaryButton>
    </form>

    <p class="resend">
      <span>{{ $t('login.otp.noCode') }}</span>
      <button
        v-if="flow.resendSecondsLeft.value === 0"
        type="button"
        class="resend-btn"
        @click="flow.resend"
      >
        {{ $t('login.otp.resend') }}
      </button>
      <span v-else class="resend-wait">
        {{ $t('login.otp.resendIn', { time: resendCountdown }) }}
      </span>
    </p>
    <p v-if="flow.isDemo" class="preview-note">
      {{ $t('login.otp.demoNote', { code: DEMO_OTP }) }}
    </p>
    <p v-else-if="!flow.isServerConnected" class="preview-note">
      {{ $t('login.otp.previewNote') }}
    </p>
  </div>
</template>

<style scoped>
.step,
.form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.back {
  align-self: flex-start;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px 8px 10px;
  border: none;
  border-radius: var(--radius-pill);
  background: #f6ebda;
  font-weight: 800;
  font-size: var(--fs-body-sm);
}

.back:hover {
  background: #f0dfc3;
}

.email {
  color: var(--ink);
}

.boxes {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: clamp(6px, 1.4vw, 10px);
  margin: 0;
  padding: 0;
  border: none;
}

.box {
  width: 100%;
  min-width: 0;
  height: 62px;
  border: var(--border) solid var(--ink);
  border-radius: var(--radius-btn-sq);
  background: #fffdf8;
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 28px;
  text-align: center;
  outline: none;
}

.box.filled {
  background: #fff6df;
}

.box:focus {
  background: #fff;
  box-shadow: 0 0 0 4px rgba(242, 201, 76, 0.5);
}

.box.invalid {
  border-color: #b2402b;
}

.error {
  margin-top: -8px;
  font-weight: 700;
  font-size: var(--fs-caption);
  color: #b2402b;
}

.resend {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  font-weight: 700;
  font-size: var(--fs-body-sm);
  color: #6b5e4b;
}

.resend-btn {
  padding: 0;
  border: none;
  background: none;
  font-weight: 800;
  color: var(--accent);
}

.resend-btn:hover {
  color: var(--ink);
}

.resend-wait {
  font-weight: 800;
  color: #8a7a60;
  font-variant-numeric: tabular-nums;
}

.preview-note {
  font-family: var(--font-hand);
  font-size: 17px;
  color: #8a7a60;
}
</style>
