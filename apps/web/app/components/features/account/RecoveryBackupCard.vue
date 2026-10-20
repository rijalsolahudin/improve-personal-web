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
const { isEmbedded = false } = defineProps<{
  /** Di dalam dialog onboarding: tanpa bingkai kartu & judul, karena dialognya sudah punya. */
  isEmbedded?: boolean
}>()

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
  <article class="card" :class="{ 'card--embedded': isEmbedded }">
    <template v-if="!isEmbedded">
      <h2 class="card-title">{{ t('account.backup.title') }}</h2>
      <p class="hint">{{ t('account.backup.intro') }}</p>
    </template>

    <p class="status">
      <span>{{ t('account.backup.statusLabel') }}</span>
      <span :class="['badge', isSaved ? 'badge--ok' : 'badge--warn']">
        {{ t(`account.backup.status.${isSaved ? 'set' : 'unset'}`) }}
      </span>
    </p>

    <div v-if="account.freshRecoveryCode.value" class="block">
      <p class="hint">{{ t('account.backup.readyToSave') }}</p>

      <Button block :disabled="account.busy.value" @click="saveToCloud">
        {{ t('account.backup.saveToCloud') }}
      </Button>
      <div class="pair">
        <Button variant="outline" @click="copyCode">{{ t('account.backup.copy') }}</Button>
        <Button variant="outline" @click="downloadCode">{{ t('account.backup.download') }}</Button>
      </div>

      <p v-if="notice === 'share-unavailable'" class="hint">
        {{ t('account.backup.shareUnavailable') }}
      </p>
      <p v-else-if="notice === 'share-cancelled'" class="hint">
        {{ t('account.backup.shareCancelled') }}
      </p>
      <p v-else-if="notice === 'copied'" class="hint">{{ t('account.backup.copied') }}</p>

      <textarea
        v-if="revealed"
        class="code"
        readonly
        rows="3"
        :value="account.freshRecoveryCode.value"
      />

      <Button variant="soft" block :disabled="account.busy.value" @click="confirmSaved">
        {{ t('account.backup.saved') }}
      </Button>
    </div>

    <Button v-else block :disabled="account.busy.value" @click="account.createRecoveryBackup">
      {{ isSaved ? t('account.backup.recreate') : t('account.backup.create') }}
    </Button>

    <p class="warning">{{ t('account.backup.warning') }}</p>
    <p v-if="!isEmbedded" class="hint">{{ t('account.backup.driveNote') }}</p>
  </article>
</template>

<style scoped>
.card {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
  padding: var(--space-10);
  background: var(--surface-card);
  border: var(--border) solid var(--outline);
  border-radius: var(--radius-card);
}

.card--embedded {
  padding: 0;
  background: none;
  border: none;
}

.card-title {
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: var(--fs-h3);
}

.hint {
  color: var(--text-muted);
  font-size: var(--fs-body-sm);
  line-height: var(--lh-body);
}

.status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-6);
  padding: var(--space-6) var(--space-8);
  background: var(--surface-inset);
  border-radius: var(--radius-inner);
  font-weight: var(--fw-medium);
  font-size: var(--fs-body-sm);
}

.badge {
  padding: var(--space-1) var(--space-5);
  border-radius: var(--radius-pill);
  font-size: var(--fs-caption);
}

.badge--ok {
  background: var(--success-soft);
  color: var(--success);
}

.badge--warn {
  background: var(--prio-medium-bg);
  color: var(--prio-medium-fg);
}

.block {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

.pair {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-6);
}

.warning {
  padding: var(--space-6) var(--space-8);
  border-radius: var(--radius-inner);
  background: var(--prio-medium-bg);
  color: var(--prio-medium-fg);
  font-size: var(--fs-caption);
  line-height: var(--lh-body);
}

.code {
  width: 100%;
  padding: var(--space-6);
  border: var(--border-thin) solid var(--line);
  border-radius: var(--radius-inner);
  font-family: ui-monospace, monospace;
  font-size: var(--fs-caption);
  word-break: break-all;
}
</style>
