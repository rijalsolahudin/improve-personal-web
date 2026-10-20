<script setup lang="ts">
import { BRAND } from '#shared/brand'
import { downloadTextFile } from '~/utils/download'

/**
 * Kartu "Backup kode pemulihan" (PRD T22).
 *
 * Kode pemulihan = 24 kata + envelope dalam SATU string. User **tidak perlu menulis apa pun**: yang perlu
 * dia lakukan cuma menyimpan kode itu di tempat yang dia percaya. Itu menjawab keberatan "24 kata bikin
 * ribet" tanpa mengubah model keamanan - kode tetap satu-satunya jalan pulih, dan server tetap tidak
 * memegangnya.
 *
 * Alurnya dua langkah: (1) simpan kode yang TERLIHAT lewat Salin / Unduh / Bagikan, (2) centang konfirmasi
 * lalu Selesai. Konfirmasi dipisah dari cara menyimpan karena menyalin belum berarti tersimpan.
 * "Bagikan" memakai share sheet OS (`navigator.share`) - tanpa OAuth, isi kode tidak lewat server kita -
 * dan disembunyikan kalau browser tidak punya (umumnya desktop), bukan jadi tombol yang gagal.
 *
 * Yang BELUM, dan tidak diklaim ada: integrasi Drive langsung ("Simpan ke Drive" dari dalam app). Itu
 * butuh scope OAuth `drive.file` + consent screen, dan client Google app ini masih placeholder.
 */
const { isEmbedded = false } = defineProps<{
  /** Di dalam dialog onboarding: tanpa bingkai, judul, dan baris status - dialognya sudah punya. */
  isEmbedded?: boolean
}>()

const emit = defineEmits<{ saved: [] }>()

const account = useAccount()
const { t } = useI18n()

const isCopied = ref(false)
const isConfirmed = ref(false)

/** Menu bagikan OS (Drive/email/Catatan). Tidak ada di kebanyakan desktop: tombolnya disembunyikan. */
const canShare = ref(false)

const code = computed(() => account.freshRecoveryCode.value)

/**
 * Status mengikuti kode yang SEDANG ditampilkan: kode baru yang belum dikonfirmasi berstatus belum
 * disimpan, walau perangkat masih memegang catatan kode lama.
 */
const isSaved = computed(() => account.recovery.value === 'set' && code.value === null)

onMounted(() => {
  canShare.value = typeof navigator.share === 'function'

  // Di onboarding user datang untuk menyimpan kode: kodenya langsung disiapkan, tanpa klik "buat" dulu.
  if (isEmbedded && code.value === null) void createCode()
})

async function createCode(): Promise<void> {
  isCopied.value = false
  isConfirmed.value = false
  await account.createRecoveryBackup()
}

async function shareCode(): Promise<void> {
  if (code.value === null) return

  try {
    await navigator.share({ title: `${BRAND.name} — kode pemulihan`, text: code.value })
  } catch {
    // Dibatalkan user: kodenya tetap terlihat dan bisa disalin/diunduh, jadi tidak perlu pesan apa pun.
  }
}

async function copyCode(): Promise<void> {
  if (code.value === null) return

  try {
    await navigator.clipboard.writeText(code.value)
    isCopied.value = true
  } catch {
    // Clipboard butuh izin/konteks aman; kodenya terlihat, jadi masih bisa disalin manual.
  }
}

function downloadCode(): void {
  const file = account.recoveryBackupFile()
  if (file === null) return

  downloadTextFile(file.name, file.text, 'text/plain')
}

async function confirmSaved(): Promise<void> {
  await account.markRecoveryBackupSaved()
  if (account.recovery.value === 'set') emit('saved')
}
</script>

<template>
  <article class="card" :class="{ 'card--embedded': isEmbedded }">
    <template v-if="!isEmbedded">
      <h2 class="card-title">{{ t('account.backup.title') }}</h2>
      <p class="hint">{{ t('account.backup.intro') }}</p>
      <p class="status">
        <span>{{ t('account.backup.statusLabel') }}</span>
        <span :class="['badge', isSaved ? 'badge--ok' : 'badge--warn']">
          {{ t(`account.backup.status.${isSaved ? 'set' : 'unset'}`) }}
        </span>
      </p>
    </template>

    <template v-if="code">
      <section class="step">
        <h3 class="step-title">
          <span class="step-number" aria-hidden="true">1</span>
          {{ t('account.backup.stepSave') }}
        </h3>
        <div class="code-box">
          <p class="code" :aria-label="t('account.backup.statusLabel')">{{ code }}</p>
        </div>
        <div class="save-actions">
          <Button variant="outline" @click="copyCode">
            {{ isCopied ? t('account.backup.copied') : t('account.backup.copy') }}
          </Button>
          <Button variant="outline" @click="downloadCode">{{
            t('account.backup.download')
          }}</Button>
          <Button v-if="canShare" variant="outline" @click="shareCode">
            {{ t('account.backup.share') }}
          </Button>
        </div>
        <p class="warning">{{ t('account.backup.warning') }}</p>
        <details class="encrypted">
          <summary>{{ t('account.backup.encrypted.toggle') }}</summary>
          <AccountEncryptedBackupForm :code="code" />
        </details>
      </section>

      <section class="step">
        <h3 class="step-title">
          <span class="step-number" aria-hidden="true">2</span>
          {{ t('account.backup.stepConfirm') }}
        </h3>
        <div
          class="confirm"
          :class="{ 'confirm--checked': isConfirmed }"
          @click="isConfirmed = !isConfirmed"
        >
          <Checkbox
            :checked="isConfirmed"
            :label="t('account.backup.confirmLabel')"
            @toggle="isConfirmed = !isConfirmed"
          />
          <span class="confirm-text">{{ t('account.backup.confirmLabel') }}</span>
        </div>
        <Button
          class="finish"
          block
          :disabled="!isConfirmed || account.busy.value"
          @click="confirmSaved"
        >
          {{ t('account.backup.finish') }}
        </Button>
      </section>
    </template>

    <p v-else-if="isEmbedded" class="hint">{{ t('account.backup.preparing') }}</p>

    <Button v-else block :disabled="account.busy.value" @click="createCode">
      {{ isSaved ? t('account.backup.recreate') : t('account.backup.create') }}
    </Button>
  </article>
</template>

<style scoped>
.card {
  display: flex;
  flex-direction: column;
  gap: var(--space-11);
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

.step {
  display: flex;
  flex-direction: column;
  gap: var(--space-7);
}

.step-title {
  display: flex;
  align-items: center;
  gap: var(--space-5);
  font-weight: var(--fw-strong);
  font-size: var(--fs-body);
}

.step-number {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: var(--radius-pill);
  background: var(--accent);
  color: var(--text-on-accent);
  font-size: var(--fs-caption);
}

/* Padding di bingkai luar, scroll di dalam: padding bawah elemen yang di-scroll sendiri hilang saat mentok. */
.code-box {
  padding: var(--space-6) var(--space-4) var(--space-6) var(--space-8);
  background: var(--surface-inset);
  border: var(--border-thin) dashed var(--dash-2);
  border-radius: var(--radius-inner);
}

.code {
  max-height: 6em;
  overflow-y: auto;
  padding-right: var(--space-4);
  font-family: ui-monospace, monospace;
  font-size: var(--fs-caption);
  line-height: 1.5;
  word-break: break-all;
  user-select: all;
}

.save-actions {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr));
  gap: var(--space-6);
}

.warning {
  padding: var(--space-5) var(--space-8);
  border-radius: var(--radius-inner);
  background: var(--prio-medium-bg);
  color: var(--prio-medium-fg);
  font-size: var(--fs-caption);
  line-height: var(--lh-body);
}

.encrypted summary {
  color: var(--accent);
  font-weight: var(--fw-medium);
  font-size: var(--fs-body-sm);
  cursor: pointer;
}

.encrypted[open] summary {
  margin-bottom: var(--space-6);
}

.confirm {
  display: flex;
  align-items: center;
  gap: var(--space-7);
  padding: var(--space-7) var(--space-8);
  background: var(--surface-inset);
  border: var(--border-thin) solid transparent;
  border-radius: var(--radius-inner);
  cursor: pointer;
}

.confirm--checked {
  border-color: var(--accent);
}

.confirm-text {
  font-size: var(--fs-body-sm);
  line-height: var(--lh-body);
}

.finish {
  margin-top: var(--space-2);
}
</style>
