<script setup lang="ts">
/**
 * Layar "buka datamu di perangkat ini" - muncul saat `localData.status === 'locked'`: akunnya sudah
 * punya kunci, tapi perangkat ini belum punya pembukanya (perangkat baru, atau data situs terhapus).
 *
 * Sama seperti onboarding passkey, dialog ini tidak bisa ditutup: di belakangnya tidak ada data yang
 * bisa dipakai, dan membiarkan user melewatinya berarti melihat aplikasi kosong tanpa penjelasan. Jalan
 * keluarnya adalah logout, supaya tidak jadi jalan buntu.
 */
const MAX_CODE_FILE_BYTES = 64 * 1024
const MS_PER_MINUTE = 60_000

const localData = useLocalData()
const recovery = useKeyRecovery()
const { logout } = useLogout()
const { t } = useI18n()

const code = ref('')
const fileError = ref(false)

const isOpen = computed(() => localData.state.value.status === 'locked')

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

  code.value = await file.text()
}
</script>

<template>
  <Modal :open="isOpen" labelled-by="key-recovery-title">
    <h2 id="key-recovery-title" class="title">{{ $t('account.unlock.title') }}</h2>
    <p class="lead">{{ $t('account.unlock.lead') }}</p>

    <Button
      v-if="recovery.isPasskeySupported.value"
      size="lg"
      block
      :disabled="recovery.isBusy.value"
      @click="recovery.recoverWithPasskey"
    >
      {{ recovery.isBusy.value ? $t('account.unlock.passkeyBusy') : $t('account.unlock.passkey') }}
    </Button>

    <p class="divider">{{ $t('account.unlock.or') }}</p>

    <form class="code-form" @submit.prevent="recovery.recoverWithCode(code)">
      <label class="code-label" for="recovery-code">{{ $t('account.unlock.codeLabel') }}</label>
      <textarea
        id="recovery-code"
        v-model="code"
        class="code"
        rows="3"
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        :placeholder="$t('account.unlock.codePlaceholder')"
      />
      <label class="file">
        <input type="file" accept=".txt,text/plain" @change="readCodeFile" />
        {{ $t('account.unlock.pickFile') }}
      </label>
      <Button
        type="submit"
        variant="outline"
        block
        :disabled="recovery.isBusy.value || code.trim() === ''"
      >
        {{ recovery.isBusy.value ? $t('account.unlock.busy') : $t('account.unlock.submit') }}
      </Button>
    </form>

    <p v-if="errorText" class="error" role="alert">{{ errorText }}</p>

    <Button variant="ghost" block @click="logout">{{ $t('account.unlock.logout') }}</Button>
  </Modal>
</template>

<style scoped>
.title {
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: var(--fs-h1);
  line-height: var(--lh-title);
}

.lead {
  color: var(--text-muted);
  font-size: var(--fs-body);
  line-height: var(--lh-body);
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

.file {
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
