<script setup lang="ts">
import { BRAND } from '#shared/brand'

/**
 * Kartu "Backup kode pemulihan" (PRD T22).
 *
 * Kode pemulihan = 24 kata + envelope dalam SATU string. User **tidak perlu menulis apa pun**: yang perlu
 * dia lakukan cuma menyimpan kode itu di tempat yang dia percaya. Itu menjawab keberatan "24 kata bikin
 * ribet" tanpa mengubah model keamanan - kode tetap satu-satunya jalan pulih, dan server tetap tidak
 * memegangnya.
 *
 * "Simpan ke cloud" memakai **share sheet OS** (`navigator.share`): satu tap, user pilih Drive/email/
 * Catatan sendiri. Tidak ada OAuth, tidak ada endpoint baru, dan isi kode tidak pernah lewat server kita.
 * Kalau share sheet tidak tersedia (umumnya desktop), jalur Salin/Unduh yang dipakai - bukan jalan buntu.
 *
 * Yang BELUM, dan tidak diklaim ada: integrasi Drive langsung ("Simpan ke Drive" dari dalam app). Itu
 * butuh scope OAuth `drive.file` + consent screen, dan client Google app ini masih placeholder.
 */
const account = useAccount()
const { t } = useI18n()

/** Kode ditampilkan apa adanya hanya kalau user memilih jalur manual (salin/unduh). */
const revealed = ref(false)
const notice = ref<'share-cancelled' | 'share-unavailable' | 'copied' | null>(null)

const isSaved = computed(() => account.recovery.value === 'set')

function revealForManual(reason: 'share-cancelled' | 'share-unavailable'): void {
  revealed.value = true
  notice.value = reason
}

/** Satu tap: share sheet OS (Drive/email/Catatan pilihan user). */
async function saveToCloud(): Promise<void> {
  const code = account.freshRecoveryCode.value
  if (code === null) return

  notice.value = null

  if (typeof navigator.share !== 'function') {
    revealForManual('share-unavailable')
    return
  }

  try {
    await navigator.share({ title: `${BRAND.name} — kode pemulihan`, text: code })
  } catch {
    // Dibatalkan user, atau share ditolak. Ditampilkan jalur manual, bukan gagal diam-diam.
    revealForManual('share-cancelled')
  }
}

async function copyCode(): Promise<void> {
  const code = account.freshRecoveryCode.value
  if (code === null) return

  revealed.value = true
  try {
    await navigator.clipboard.writeText(code)
    notice.value = 'copied'
  } catch {
    // Clipboard butuh konteks aman/izin; kodenya sudah terlihat, user bisa menyalin manual.
    notice.value = null
  }
}

function downloadCode(): void {
  const file = account.recoveryBackupFile()
  if (file === null) return

  const url = URL.createObjectURL(new Blob([file.text], { type: 'text/plain' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = file.name
  anchor.click()
  URL.revokeObjectURL(url)
}

async function confirmSaved(): Promise<void> {
  await account.markRecoveryBackupSaved()
  revealed.value = false
  notice.value = null
}
</script>

<template>
  <article class="card">
    <h2 class="card-title">{{ t('account.backup.title') }}</h2>
    <p class="hint">{{ t('account.backup.intro') }}</p>

    <p class="row">
      <span class="label">{{ t('account.backup.statusLabel') }}</span>
      <span :class="['badge', isSaved ? 'ok' : 'warn']">
        {{ t(`account.backup.status.${isSaved ? 'set' : 'unset'}`) }}
      </span>
    </p>

    <div v-if="account.freshRecoveryCode.value" class="block">
      <p class="notice">{{ t('account.backup.readyToSave') }}</p>

      <div class="actions">
        <button
          type="button"
          class="button button--primary"
          :disabled="account.busy.value"
          @click="saveToCloud"
        >
          {{ t('account.backup.saveToCloud') }}
        </button>
        <button type="button" class="button" @click="copyCode">
          {{ t('account.backup.copy') }}
        </button>
        <button type="button" class="button" @click="downloadCode">
          {{ t('account.backup.download') }}
        </button>
        <button type="button" class="button" :disabled="account.busy.value" @click="confirmSaved">
          {{ t('account.backup.saved') }}
        </button>
      </div>

      <p v-if="notice === 'share-unavailable'" class="notice">
        {{ t('account.backup.shareUnavailable') }}
      </p>
      <p v-else-if="notice === 'share-cancelled'" class="notice">
        {{ t('account.backup.shareCancelled') }}
      </p>
      <p v-else-if="notice === 'copied'" class="notice">{{ t('account.backup.copied') }}</p>

      <textarea
        v-if="revealed"
        class="code"
        readonly
        rows="3"
        :value="account.freshRecoveryCode.value"
      />
    </div>

    <div v-else class="actions">
      <button
        type="button"
        class="button button--primary"
        :disabled="account.busy.value"
        @click="account.createRecoveryBackup"
      >
        {{ isSaved ? t('account.backup.recreate') : t('account.backup.create') }}
      </button>
    </div>

    <p class="warning">{{ t('account.backup.warning') }}</p>
    <p class="hint">{{ t('account.backup.driveNote') }}</p>
  </article>
</template>

<style scoped>
.card {
  padding: 1rem;
  border: 1px solid #e6ded1;
  border-radius: 0.8rem;
  background: #fffdf8;
}

.card-title {
  margin: 0 0 0.6rem;
  font-size: 1rem;
}

.row {
  display: flex;
  gap: 0.6rem;
  align-items: center;
  margin: 0.2rem 0;
}

.label {
  min-width: 9rem;
}

.badge {
  padding: 0.1rem 0.5rem;
  border-radius: 999px;
  font-size: 0.75rem;
}

.badge.ok {
  background: #dff2e3;
  color: #1d6b34;
}

.badge.warn {
  background: #fff0c8;
  color: #8a5a00;
}

.hint {
  margin: 0.4rem 0;
  font-size: 0.85rem;
  opacity: 0.8;
}

.block {
  margin-top: 0.5rem;
}

.notice {
  margin: 0.4rem 0;
  font-size: 0.85rem;
}

.warning {
  margin: 0.6rem 0 0.2rem;
  padding: 0.5rem 0.75rem;
  border-radius: 0.5rem;
  background: #fff0c8;
  color: #8a5a00;
  font-size: 0.8rem;
}

.actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-top: 0.4rem;
}

.button {
  padding: 0.45rem 0.9rem;
  border: 1px solid #d8cfc0;
  border-radius: 0.5rem;
  background: #fff;
  cursor: pointer;
}

.button--primary {
  border-color: #0a55e6;
  background: #0a55e6;
  color: #fff;
}

.code {
  width: 100%;
  margin-top: 0.5rem;
  padding: 0.5rem;
  border: 1px solid #d8cfc0;
  border-radius: 0.5rem;
  font-family: var(--font-mono, monospace);
  font-size: 0.72rem;
  word-break: break-all;
}
</style>
