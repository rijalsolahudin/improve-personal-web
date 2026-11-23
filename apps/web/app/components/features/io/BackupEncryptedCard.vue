<script setup lang="ts">
import {
  BACKUP_PASSWORD_MIN_LENGTH,
  backupPasswordStrength,
  checkBackupPassword,
} from '@improve-personal/core'

import { downloadFile } from '~/utils/download'

/**
 * Kartu "Backup terenkripsi" (PRD F15): kata sandi backup -> berkas `.ipbackup`.
 *
 * Kata sandi hanya hidup di `ref` kartu ini dan dikosongkan begitu berkas jadi - tidak disimpan,
 * tidak dikirim. Konsekuensinya ditulis terang di kartu: tanpa kata sandi berkasnya tidak bisa dibuka
 * siapa pun, termasuk kami.
 */
const { isBusy, error, status, exportEncryptedBackup } = useBackupExport()

const password = ref('')
const confirmation = ref('')
const isTouched = ref(false)

const issues = computed(() => checkBackupPassword(password.value, confirmation.value))
const strength = computed(() => backupPasswordStrength(password.value))
const strengthLabel = computed(
  () => ['Terlalu pendek', 'Lemah', 'Cukup', 'Kuat', 'Sangat kuat'][strength.value],
)
const issueMessage = computed(() => {
  if (!isTouched.value) return null
  if (issues.value.includes('TOO_SHORT')) {
    return `Kata sandi minimal ${BACKUP_PASSWORD_MIN_LENGTH} karakter.`
  }
  if (issues.value.includes('MISMATCH')) return 'Ketik ulang belum sama.'
  return null
})

async function download(): Promise<void> {
  isTouched.value = true
  if (issues.value.length > 0) return

  const file = await exportEncryptedBackup(password.value)
  if (file === null) return

  downloadFile(file.name, file.bytes, 'application/octet-stream')
  password.value = ''
  confirmation.value = ''
  isTouched.value = false
}
</script>

<template>
  <Card class="encrypted-card">
    <h2 class="card-title">Backup terenkripsi <span class="badge">disarankan</span></h2>
    <p class="hint">
      Simpan semua data ke satu berkas <code>.ipbackup</code> yang dikunci kata sandi. Pakai berkas
      ini untuk memulihkan data di HP/laptop baru.
    </p>
    <p class="warning" role="note">
      Data hanya ada di perangkat ini. Perangkat hilang atau data browser terhapus tanpa backup =
      data hilang permanen. Lupa kata sandi backup = berkasnya tidak bisa dibuka siapa pun, termasuk
      kami.
    </p>

    <form class="form" @submit.prevent="download">
      <Field label="Kata sandi backup">
        <PasswordInput
          id="backup-password"
          v-model="password"
          autocomplete="new-password"
          :is-invalid="issueMessage !== null && issues.includes('TOO_SHORT')"
        />
      </Field>
      <div class="meter" :data-strength="strength" aria-live="polite">
        <span v-for="level in 4" :key="level" class="bar" :class="{ on: strength >= level }" />
        <span class="meter-label">{{ strengthLabel }}</span>
      </div>
      <Field label="Ketik ulang kata sandi">
        <PasswordInput
          id="backup-password-confirm"
          v-model="confirmation"
          autocomplete="new-password"
          :is-invalid="issueMessage !== null && issues.includes('MISMATCH')"
        />
      </Field>
      <p v-if="issueMessage" class="error" role="alert">{{ issueMessage }}</p>

      <Button type="submit" variant="primary" :disabled="isBusy">
        {{ isBusy ? 'Mengenkripsi…' : 'Unduh backup terenkripsi' }}
      </Button>
    </form>

    <p v-if="status" class="status" role="status" aria-live="polite">{{ status }}</p>
    <p v-if="error" class="error" role="alert" aria-live="assertive">{{ error }}</p>
  </Card>
</template>

<style scoped>
.encrypted-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-10);
  padding: var(--space-16);
}

.card-title {
  display: flex;
  align-items: center;
  gap: var(--space-8);
  font-size: var(--fs-h2);
}

.badge {
  padding: var(--space-2) var(--space-8);
  border-radius: var(--radius-pill);
  background: var(--accent-soft);
  color: var(--accent-ink);
  font-size: var(--fs-caption);
  font-weight: var(--fw-medium);
}

.hint {
  color: var(--text-muted);
  font-size: var(--fs-caption);
  line-height: var(--lh-body);
}

.warning {
  padding: var(--space-10) var(--space-16);
  border-radius: var(--radius-inner);
  background: var(--prio-medium-bg);
  color: var(--prio-medium-fg);
  font-size: var(--fs-caption);
  line-height: var(--lh-body);
}

.form {
  display: flex;
  flex-direction: column;
  gap: var(--space-10);
}

.meter {
  display: flex;
  align-items: center;
  gap: var(--space-4);
}

.bar {
  flex: 1;
  height: 4px;
  border-radius: var(--radius-pill);
  background: var(--line);
}

.meter[data-strength='1'] .bar.on {
  background: var(--danger);
}

.meter[data-strength='2'] .bar.on {
  background: var(--prio-medium-fg);
}

.meter[data-strength='3'] .bar.on,
.meter[data-strength='4'] .bar.on {
  background: var(--success);
}

.meter-label {
  min-width: 6.5rem;
  color: var(--text-muted);
  font-size: var(--fs-caption);
  text-align: right;
}

.status {
  color: var(--text-muted);
  font-size: var(--fs-caption);
}

.error {
  color: var(--danger);
  font-size: var(--fs-caption);
  line-height: var(--lh-body);
}
</style>
