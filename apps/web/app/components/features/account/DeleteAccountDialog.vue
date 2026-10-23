<script setup lang="ts">
/**
 * Dialog "Hapus akun permanen" (PRD F15): konfirmasi email + OTP ulang.
 *
 * Dua bukti yang diminta, dan keduanya memang harus diketik user:
 * 1. email akun (server menolak kalau tidak sama dengan email sesi),
 * 2. kode 6 digit yang dikirim server ke email itu lewat `POST /v1/account/deletion-otp`.
 *
 * Tidak ada tombol "hapus" yang aktif sebelum kodenya lengkap - aksi ini tidak bisa dibatalkan, jadi
 * lebih baik tombolnya mati daripada user menekannya karena penasaran.
 */
const { open, sessionEmail } = defineProps<{ open: boolean; sessionEmail: string }>()
const emit = defineEmits<{ close: [] }>()

const deletion = useAccountDeletion()
const { t } = useI18n()

const email = ref('')
const code = ref('')

const resendTime = computed(() => `0:${String(deletion.resendSecondsLeft.value).padStart(2, '0')}`)

const canDelete = computed(
  () =>
    !deletion.isDeleting.value &&
    email.value.trim() !== '' &&
    code.value.length === 6 &&
    email.value.trim().toLowerCase() === sessionEmail.trim().toLowerCase(),
)

watch(
  () => open,
  (isOpen) => {
    if (!isOpen) return
    email.value = ''
    code.value = ''
    deletion.resetError()
  },
)

function onCodeInput(value: string | number): void {
  code.value = String(value).replace(/\D/g, '').slice(0, 6)
}
</script>

<template>
  <Modal
    :open="open"
    :title="t('account.delete.title')"
    align="top"
    width="440px"
    is-dismissible
    @close="emit('close')"
  >
    <p class="warning">{{ t('account.delete.warning') }}</p>

    <form class="form" novalidate @submit.prevent="deletion.remove(sessionEmail, { email, code })">
      <Field :label="t('account.delete.emailLabel')">
        <Input
          v-model="email"
          type="email"
          autocomplete="email"
          :placeholder="sessionEmail"
          data-autofocus
        />
      </Field>
      <p class="hint">{{ t('account.delete.emailHint') }}</p>

      <div class="code-row">
        <Field :label="t('account.delete.codeLabel')">
          <Input
            :model-value="code"
            inputmode="numeric"
            autocomplete="one-time-code"
            maxlength="6"
            :placeholder="t('account.delete.codePlaceholder')"
            @update:model-value="onCodeInput"
          />
        </Field>
        <Button
          variant="outline"
          :disabled="deletion.isSendingCode.value || deletion.resendSecondsLeft.value > 0"
          @click="deletion.requestCode"
        >
          {{
            deletion.isSendingCode.value
              ? t('account.delete.sending')
              : deletion.resendSecondsLeft.value > 0
                ? t('account.delete.resendIn', { time: resendTime })
                : t('account.delete.send')
          }}
        </Button>
      </div>

      <p v-if="deletion.error.value" class="error" role="alert">
        {{ t(`account.delete.errors.${deletion.error.value}`) }}
      </p>

      <Button type="submit" variant="danger" block :disabled="!canDelete">
        {{ deletion.isDeleting.value ? t('account.delete.busy') : t('account.delete.submit') }}
      </Button>
      <Button variant="ghost" block @click="emit('close')">{{ t('common.close') }}</Button>
    </form>
  </Modal>
</template>

<style scoped>
.warning {
  padding: var(--space-5) var(--space-7);
  border-radius: var(--radius-inner);
  background: #ffe1da;
  color: #8f1f2f;
  font-size: var(--fs-body-sm);
  line-height: var(--lh-body);
}

.form {
  display: flex;
  flex-direction: column;
  gap: var(--space-7);
}

.hint {
  margin-top: calc(var(--space-4) * -1);
  color: var(--text-subtle);
  font-size: var(--fs-caption);
  line-height: var(--lh-body);
}

.code-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
  gap: var(--space-5);
}

.error {
  padding: var(--space-4) var(--space-6);
  border-radius: var(--radius-inner);
  background: #ffe1da;
  color: var(--danger);
  font-size: var(--fs-body-sm);
}
</style>
