<script setup lang="ts">
/**
 * Sisi perangkat LAMA dari alur tambah perangkat: pindai QR permintaan perangkat baru, lalu tampilkan
 * QR jawaban yang membawa kunci utama TERENKRIPSI (sealed box ke public key perangkat baru).
 *
 * Kunci utama dibuka hanya selama pembungkusan (`withMasterKey`), dan yang dikirim ke server cuma blob
 * opak - server tidak bisa membukanya. Masa berlaku QR jawaban berasal dari `expiresAt` server.
 */
import { formatPairingCountdown } from '~/utils/account/pairing'

const pairing = useDevicePairing()
const { t } = useI18n()

const qrLabel = computed(() => t('account.pairing.existingDevice.qrLabel'))
const countdown = computed(() =>
  t('account.pairing.expiresIn', {
    time: formatPairingCountdown(pairing.secondsLeft.value),
  }),
)
</script>

<template>
  <section class="pairing">
    <template v-if="pairing.step.value === 'response' && pairing.qrValue.value">
      <h3 class="title">{{ t('account.pairing.existingDevice.doneTitle') }}</h3>
      <p class="hint">{{ t('account.pairing.existingDevice.doneHint') }}</p>

      <div class="qr-box">
        <QrCode :value="pairing.qrValue.value" :label="qrLabel" :size="240" />
      </div>

      <p v-if="pairing.isExpired.value" class="warn" role="alert">
        {{ t('account.pairing.expired') }}
      </p>
      <p v-else class="countdown">{{ countdown }}</p>

      <Button variant="outline" @click="pairing.reset">
        {{ t('account.pairing.existingDevice.restart') }}
      </Button>
    </template>

    <template v-else>
      <h3 class="title">{{ t('account.pairing.existingDevice.title') }}</h3>
      <p class="hint">{{ t('account.pairing.existingDevice.hint') }}</p>

      <AccountQrScanner @scanned="pairing.pairFromRequest" />
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
.countdown {
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

.error {
  padding: var(--space-4) var(--space-6);
  border-radius: var(--radius-inner);
  background: #ffe1da;
  color: var(--danger);
  font-size: var(--fs-body-sm);
}
</style>
