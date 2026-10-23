<script setup lang="ts">
/**
 * Sisi perangkat BARU dari alur tambah perangkat: tampilkan QR permintaan, lalu pindai QR jawaban.
 *
 * Perangkat baru tidak memegang kunci utama siapa pun di sini - ia hanya membuat keypair ephemeral dan
 * menampilkan public key-nya. Yang berisi kunci adalah QR jawaban, dan itu pun tetap terenkripsi
 * (sealed box) sampai dibuka dengan private key yang tidak pernah keluar dari komponen ini.
 */
import { formatPairingCountdown } from '~/utils/account/pairing'

const account = useAccount()
const pairing = useDevicePairing({
  onPaired: async ({ replacedKey }) => {
    if (replacedKey) {
      // Perangkat ini sebelumnya memakai kunci yang dibuat otomatis. Sesi lokal yang masih hidup
      // memegang kunci data LAMA, jadi tulisan berikutnya akan memakai kunci yang bukan milik akun.
      // Muat ulang penuh adalah satu-satunya cara memastikan semua sesi memakai pembuka yang baru.
      reloadPage()
      return
    }

    // Perangkat yang belum punya kunci: `ensure()` membuka sesi dengan kunci hasil transfer, dan gate
    // pemulihan ikut tertutup karena statusnya berubah jadi siap.
    await account.load()
  },
})

const { t } = useI18n()

onMounted(() => {
  void pairing.startAsNewDevice()
})

function reloadPage(): void {
  if (import.meta.client) window.location.reload()
}

const qrLabel = computed(() => t('account.pairing.newDevice.qrLabel'))
const countdown = computed(() =>
  t('account.pairing.expiresIn', {
    time: formatPairingCountdown(pairing.secondsLeft.value),
  }),
)
</script>

<template>
  <section class="pairing">
    <template v-if="pairing.step.value === 'done'">
      <p class="success" role="status">{{ t('account.pairing.newDevice.done') }}</p>
    </template>

    <template v-else-if="pairing.step.value === 'request' && pairing.qrValue.value">
      <h3 class="title">{{ t('account.pairing.newDevice.title') }}</h3>
      <p class="hint">{{ t('account.pairing.newDevice.hint') }}</p>

      <div class="qr-box">
        <QrCode :value="pairing.qrValue.value" :label="qrLabel" :size="240" />
      </div>

      <p v-if="pairing.isExpired.value" class="warn" role="alert">
        {{ t('account.pairing.expired') }}
      </p>
      <p v-else class="countdown">{{ countdown }}</p>

      <Button variant="outline" :disabled="pairing.busy.value" @click="pairing.startAsNewDevice">
        {{ t('account.pairing.regenerate') }}
      </Button>

      <p class="divider">{{ t('account.pairing.newDevice.scanResponse') }}</p>

      <AccountQrScanner @scanned="pairing.claimResponse" />
    </template>

    <p v-if="pairing.error.value" class="error" role="alert">
      {{ t(`account.pairing.errors.${pairing.error.value}`) }}
    </p>
  </section>
</template>

<style scoped>
.pairing {
  display: flex;
  flex-direction: column;
  gap: var(--space-7);
}

.title {
  font-weight: var(--fw-strong);
  font-size: var(--fs-body);
}

.hint,
.countdown,
.divider {
  color: var(--text-muted);
  font-size: var(--fs-body-sm);
  line-height: var(--lh-body);
}

.qr-box {
  display: grid;
  place-items: center;
  padding: var(--space-6);
  background: #fff;
  border: var(--border-thin) solid var(--line);
  border-radius: var(--radius-inner);
}

.countdown {
  font-variant-numeric: tabular-nums;
}

.warn {
  color: var(--danger, #b0283e);
  font-weight: var(--fw-medium);
  font-size: var(--fs-body-sm);
}

.divider {
  padding-top: var(--space-4);
  border-top: var(--border-thin) dashed var(--line);
  font-weight: var(--fw-medium);
}

.success {
  padding: var(--space-5) var(--space-7);
  border-radius: var(--radius-inner);
  background: var(--success-soft, #dff2e3);
  color: var(--success, #1d6b34);
  font-weight: var(--fw-medium);
  font-size: var(--fs-body-sm);
}

.error {
  padding: var(--space-4) var(--space-6);
  border-radius: var(--radius-inner);
  background: #ffe1da;
  color: var(--danger);
  font-size: var(--fs-body-sm);
}
</style>
