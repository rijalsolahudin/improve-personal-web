<script setup lang="ts">
import type { LoginFlow } from '~/composables/useLoginFlow'
import { EMAIL_MAX_LENGTH } from '~/utils/validation'

const { flow } = defineProps<{ flow: LoginFlow }>()

const emailModel = computed({ get: () => flow.email.value, set: flow.setEmail })
</script>

<template>
  <div class="step">
    <AuthHeading :eyebrow="$t('login.choose.eyebrow')" :title="$t('login.choose.title')">
      {{ $t('login.choose.sub') }}
    </AuthHeading>

    <div class="google-block">
      <button
        type="button"
        class="google"
        :aria-busy="flow.isGooglePending.value"
        @click="flow.loginWithGoogle"
      >
        <UiSpinner v-if="flow.isGooglePending.value" />
        <svg v-else width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
          <path
            fill="#FFC107"
            d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
          />
          <path
            fill="#FF3D00"
            d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
          />
          <path
            fill="#4CAF50"
            d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
          />
          <path
            fill="#1976D2"
            d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"
          />
        </svg>
        {{ $t(flow.isGooglePending.value ? 'login.google.pending' : 'login.google.idle') }}
      </button>
      <p v-if="flow.googleError.value" class="error" role="alert">
        {{ $t(`login.error.${flow.googleError.value}`) }}
      </p>
    </div>

    <p class="divider">{{ $t('login.choose.divider') }}</p>

    <form class="form" novalidate @submit.prevent="flow.submitEmail">
      <div class="field">
        <label class="label" for="login-email">{{ $t('login.choose.emailLabel') }}</label>
        <input
          id="login-email"
          v-model="emailModel"
          class="input"
          :class="{ invalid: flow.emailError.value }"
          type="email"
          inputmode="email"
          autocomplete="email"
          :maxlength="EMAIL_MAX_LENGTH"
          :placeholder="$t('login.choose.emailPlaceholder')"
          :aria-invalid="Boolean(flow.emailError.value)"
          :aria-describedby="flow.emailError.value ? 'login-email-error' : undefined"
        />
        <p v-if="flow.emailError.value" id="login-email-error" class="error" role="alert">
          {{ $t(`login.error.${flow.emailError.value}`) }}
        </p>
      </div>
      <AuthPrimaryButton :is-loading="flow.isSending.value">
        {{ $t(flow.isSending.value ? 'login.choose.sending' : 'login.choose.send') }}
      </AuthPrimaryButton>
    </form>
    <p class="hint">{{ $t('login.choose.hint') }}</p>
  </div>
</template>

<style scoped>
.step,
.form,
.google-block {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.google-block {
  gap: 8px;
}

.google {
  width: 100%;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  border: var(--border) solid var(--ink);
  border-radius: var(--radius-row);
  background: #fff;
  font-weight: 800;
  font-size: var(--fs-body-lg);
  box-shadow: 0 4px 0 rgba(47, 42, 36, 0.14);
}

.google:hover {
  background: #fff6df;
}

.google:active {
  transform: translateY(2px);
  box-shadow: 0 2px 0 rgba(47, 42, 36, 0.14);
}

.divider {
  display: flex;
  align-items: center;
  gap: 12px;
  font-weight: 800;
  font-size: var(--fs-meta);
  letter-spacing: 0.12em;
  color: #8a7a60;
}

.divider::before,
.divider::after {
  content: '';
  flex: 1;
  border-top: 2px dashed #e3c79c;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.label {
  font-weight: 800;
  font-size: var(--fs-caption);
  letter-spacing: 0.06em;
  color: #6b5e4b;
}

.input {
  width: 100%;
  height: 54px;
  padding: 0 16px;
  border: var(--border) solid var(--ink);
  border-radius: var(--radius-row);
  background: #fffdf8;
  font-weight: 700;
  font-size: var(--fs-body-lg);
  outline: none;
}

.input:focus {
  background: #fff;
  box-shadow: 0 0 0 4px rgba(242, 201, 76, 0.45);
}

.input.invalid {
  border-color: #b2402b;
}

.error {
  font-weight: 700;
  font-size: var(--fs-caption);
  color: #b2402b;
}

.hint {
  margin-top: -8px;
  font-weight: 600;
  font-size: var(--fs-caption);
  line-height: 1.5;
  color: #8a7a60;
}
</style>
