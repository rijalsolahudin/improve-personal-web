<script setup lang="ts">
import { isEncryptedBackupText } from '~/utils/account/encrypted-backup'

/**
 * Form pembuka kunci perangkat: passkey, kode pemulihan (`iprk1.*`), atau berkas terenkripsi kata sandi.
 *
 * Dipakai dua tempat dengan aturan yang sama: dialog wajib "Buka datamu di perangkat ini" (perangkat
 * terkunci) dan langkah "lupa OTP" di halaman login. Dipisah supaya tidak ada dua salinan aturan
 * pentingnya - batas ukuran berkas, pemetaan error, dan syarat tombol submit.
 *
 * Kunci utama tidak pernah ditampilkan atau disimpan di sini: `useKeyRecovery` membukanya lewat
 * `utils/account/unlock.ts` lalu langsung membungkusnya dengan pembuka perangkat.
 */
const MAX_CODE_FILE_BYTES = 64 * 1024
const MS_PER_MINUTE = 60_000

const emit = defineEmits<{ recovered: [] }>()

const recovery = useKeyRecovery()
const { t } = useI18n()

const code = ref('')
const fileError = ref(false)
/** Isi berkas terenkripsi yang dipilih; `null` = alur kode biasa. */
const encryptedBackup = ref<string | null>(null)
const passphrase = ref('')

const canSubmit = computed(() => {
  if (recovery.isBusy.value) return false
  return encryptedBackup.value === null ? code.value.trim() !== '' : passphrase.value !== ''
})

const submitLabel = computed(() => {
  if (recovery.isBusy.value) return t('account.unlock.busy')
  return t(`account.unlock.${encryptedBackup.value === null ? 'submit' : 'submitFile'}`)
})

const errorText = computed(() => {
  if (fileError.value) return t('account.unlock.errors.fileTooLarge')

  const key = recovery.error.value
  if (key === null) return null

  return t(`account.unlock.errors.${key}`, {
    remaining: recovery.remainingAttempts.value ?? 0,
    minutes: Math.max(
      1,
      Math.ceil(((recovery.lockedUntilMs.value ?? 0) - Date.now()) / MS_PER_MINUTE),
    ),
  })
})

async function readCodeFile(event: Event): Promise<void> {
  const file = (event.target as HTMLInputElement).files?.[0]
  fileError.value = false
  if (file === undefined) return

  if (file.size > MAX_CODE_FILE_BYTES) {
    fileError.value = true
    return
  }

  const text = await file.text()
  if (isEncryptedBackupText(text)) {
    encryptedBackup.value = text
    passphrase.value = ''
  } else {
    encryptedBackup.value = null
    code.value = text
  }
}

function useCodeInstead(): void {
  encryptedBackup.value = null
  passphrase.value = ''
}

/** Passkey juga harus memberi tahu pemanggil saat berhasil (mis. langkah lupa OTP perlu navigasi). */
async function recoverWithPasskey(): Promise<void> {
  await recovery.recoverWithPasskey()
  if (recovery.error.value === null) emit('recovered')
}

async function submit(): Promise<void> {
  if (!canSubmit.value) return

  if (encryptedBackup.value === null) await recovery.recoverWithCode(code.value)
  else await recovery.recoverWithEncryptedBackup(encryptedBackup.value, passphrase.value)

  // `run()` mengosongkan error di awal dan hanya mengisinya saat gagal.
  if (recovery.error.value === null) emit('recovered')
}
</script>

<template>
  <div class="unlock-form">
    <Button
      v-if="recovery.isPasskeySupported.value"
      size="lg"
      block
      :disabled="recovery.isBusy.value"
      @click="recoverWithPasskey"
    >
      {{ recovery.isBusy.value ? $t('account.unlock.passkeyBusy') : $t('account.unlock.passkey') }}
    </Button>

    <p class="divider">{{ $t('account.unlock.or') }}</p>

    <form class="code-form" novalidate @submit.prevent="submit">
      <template v-if="encryptedBackup !== null">
        <label class="code-label" for="recovery-passphrase">
          {{ $t('account.unlock.passphraseLabel') }}
        </label>
        <PasswordInput id="recovery-passphrase" v-model="passphrase" />
        <p class="hint">{{ $t('account.unlock.passphraseHint') }}</p>
        <button type="button" class="file" @click="useCodeInstead">
          {{ $t('account.unlock.useCode') }}
        </button>
      </template>
      <template v-else>
        <label class="code-label" for="recovery-code">{{ $t('account.unlock.codeLabel') }}</label>
        <Input
          id="recovery-code"
          v-model="code"
          variant="bare"
          multiline
          class="code"
          rows="3"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          :placeholder="$t('account.unlock.codePlaceholder')"
        />
        <label class="file">
          <input
            type="file"
            accept=".txt,.json,text/plain,application/json"
            @change="readCodeFile"
          />
          {{ $t('account.unlock.pickFile') }}
        </label>
      </template>
      <Button type="submit" variant="outline" block :disabled="!canSubmit">
        {{ submitLabel }}
      </Button>
    </form>

    <p v-if="errorText" class="error" role="alert">{{ errorText }}</p>
  </div>
</template>

<style scoped>
.unlock-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-8);
}

.divider {
  display: flex;
  align-items: center;
  gap: var(--space-6);
  color: var(--text-subtle);
  font-size: var(--fs-caption);
}

.divider::before,
.divider::after {
  content: '';
  flex: 1;
  border-top: var(--border-thin) solid var(--line);
}

.code-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

.code-label {
  font-weight: var(--fw-medium);
  font-size: var(--fs-body-sm);
}

.code {
  width: 100%;
  padding: var(--space-6);
  border: var(--border-thin) solid var(--line);
  border-radius: var(--radius-inner);
  background: var(--paper-2);
  font-family: ui-monospace, monospace;
  font-size: var(--fs-caption);
  word-break: break-all;
}

.hint {
  color: var(--text-subtle);
  font-size: var(--fs-caption);
}

.file {
  align-self: flex-start;
  padding: 0;
  border: none;
  background: none;
  color: var(--accent);
  font-weight: var(--fw-medium);
  font-size: var(--fs-body-sm);
  cursor: pointer;
}

.file input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
}

.file:focus-within {
  outline: 3px solid var(--accent);
  outline-offset: 2px;
}

.error {
  padding: var(--space-4) var(--space-6);
  border-radius: var(--radius-inner);
  background: #ffe1da;
  color: var(--danger);
  font-size: var(--fs-body-sm);
}
</style>
