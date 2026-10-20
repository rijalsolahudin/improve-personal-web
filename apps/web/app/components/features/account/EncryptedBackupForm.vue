<script setup lang="ts">
import {
  MIN_PASSPHRASE_LENGTH,
  encryptRecoveryBackup,
  encryptedBackupFileName,
  serializeEncryptedBackup,
} from '~/utils/account/encrypted-backup'
import { downloadTextFile } from '~/utils/download'

/**
 * Unduh kode pemulihan sebagai berkas terenkripsi kata sandi pilihan user (PRD F15, "format tambahan").
 *
 * Bedanya dengan `.txt`: berkas ini aman ditaruh di tempat yang kurang dipercaya (flashdisk, email),
 * karena tanpa kata sandinya isinya tidak terbaca. Harganya: lupa kata sandi = berkasnya tidak berguna,
 * dan itu diucapkan di UI sebelum user mengunduh.
 *
 * Kata sandi diketik dua kali karena salah ketik di sini tidak ketahuan sampai user butuh pulih - saat
 * itu sudah terlambat.
 */
const { code } = defineProps<{
  /** Kode pemulihan yang sedang ditampilkan kartu backup; itulah isi berkasnya. */
  code: string
}>()

const { t } = useI18n()

const passphrase = ref('')
const confirmation = ref('')
const isBusy = ref(false)
const isDownloaded = ref(false)
const hasFailed = ref(false)

const isTooShort = computed(() => passphrase.value.trim().length < MIN_PASSPHRASE_LENGTH)
// Pesan hanya muncul setelah user mulai mengetik, supaya kolom kosong tidak langsung terlihat salah.
const isShortPassphrase = computed(() => passphrase.value !== '' && isTooShort.value)
const isMismatch = computed(
  () => confirmation.value !== '' && confirmation.value !== passphrase.value,
)
const canSubmit = computed(
  () => !isBusy.value && !isTooShort.value && confirmation.value === passphrase.value,
)

const submitLabel = computed(() => {
  if (isBusy.value) return t('account.backup.encrypted.busy')
  return t(`account.backup.encrypted.${isDownloaded.value ? 'downloaded' : 'download'}`)
})

// Kode baru = berkas lama sudah tidak cocok; status "terunduh" tidak boleh terbawa.
watch(
  () => code,
  () => {
    isDownloaded.value = false
  },
)

async function download(): Promise<void> {
  if (!canSubmit.value) return

  isBusy.value = true
  hasFailed.value = false

  try {
    const document = await encryptRecoveryBackup({
      payload: code,
      passphrase: passphrase.value,
      createdAtMs: Date.now(),
    })
    downloadTextFile(
      encryptedBackupFileName(),
      serializeEncryptedBackup(document),
      'application/json',
    )
    isDownloaded.value = true
    // Kata sandi tidak perlu tinggal di memori setelah berkasnya jadi.
    passphrase.value = ''
    confirmation.value = ''
  } catch {
    hasFailed.value = true
  } finally {
    isBusy.value = false
  }
}
</script>

<template>
  <form class="form" @submit.prevent="download">
    <p class="hint">{{ t('account.backup.encrypted.intro') }}</p>

    <label class="label" for="backup-passphrase">{{ t('account.backup.encrypted.label') }}</label>
    <PasswordInput
      id="backup-passphrase"
      v-model="passphrase"
      autocomplete="new-password"
      :is-invalid="isShortPassphrase"
    />
    <p v-if="isShortPassphrase" class="error" role="alert">
      {{ t('account.backup.encrypted.tooShort') }}
    </p>
    <p class="hint">{{ t('account.backup.encrypted.rule', { min: MIN_PASSPHRASE_LENGTH }) }}</p>

    <label class="label" for="backup-passphrase-confirm">
      {{ t('account.backup.encrypted.confirmLabel') }}
    </label>
    <PasswordInput
      id="backup-passphrase-confirm"
      v-model="confirmation"
      autocomplete="new-password"
      :is-invalid="isMismatch"
    />
    <p v-if="isMismatch" class="error" role="alert">{{ t('account.backup.encrypted.mismatch') }}</p>

    <p class="warning">{{ t('account.backup.encrypted.warning') }}</p>

    <Button type="submit" variant="outline" block :disabled="!canSubmit">
      {{ submitLabel }}
    </Button>
    <p v-if="hasFailed" class="error" role="alert">{{ t('account.backup.encrypted.failed') }}</p>
  </form>
</template>

<style scoped>
.form {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

.label {
  font-weight: var(--fw-medium);
  font-size: var(--fs-body-sm);
}

.hint {
  color: var(--text-muted);
  font-size: var(--fs-caption);
  line-height: var(--lh-body);
}

.warning {
  padding: var(--space-5) var(--space-8);
  border-radius: var(--radius-inner);
  background: var(--prio-medium-bg);
  color: var(--prio-medium-fg);
  font-size: var(--fs-caption);
  line-height: var(--lh-body);
}

.error {
  color: var(--danger);
  font-size: var(--fs-caption);
}
</style>
