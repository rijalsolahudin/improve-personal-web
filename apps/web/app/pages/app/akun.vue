<script setup lang="ts">
/**
 * Halaman "Akun & perangkat" (PRD F15, ARCHITECTURE §7).
 *
 * Isinya: status pembuka kunci, aktivasi passkey, kartu backup kode pemulihan, tambah perangkat lewat
 * QR, daftar perangkat + logout jarak jauh, dan hapus akun.
 *
 * Catatan keputusan: 24 kata recovery tidak ditampilkan sebagai daftar kata; pembuka kuncinya passkey
 * dan kode pemulihan dalam SATU string (`iprk1.*`). Server hanya menyimpan envelope passkey.
 */
import RecoveryBackupCard from '~/components/features/account/RecoveryBackupCard.vue'
import StorageCard from '~/components/features/account/StorageCard.vue'
import { BRAND } from '#shared/brand'

definePageMeta({ layout: 'dashboard' })

const { t } = useI18n()
const { session, ensureLoaded } = useAuthSession()
const account = useAccount()

const isPairingOpen = ref(false)
const isDeleteOpen = ref(false)

const email = computed(() => session.value?.user.email ?? '')

/**
 * Perangkat aktif dulu, jejak audit (sudah dicabut) di bawah. Server sengaja mengembalikan baris yang
 * sudah di-revoke (`revokedAt` terisi); daftar ini adalah "perangkat yang login sekarang", jadi yang
 * sudah tidak aktif tidak boleh tampil setara.
 */
const devices = computed(() =>
  [...account.devices.value].sort(
    (a, b) => Number(a.revokedAt !== null) - Number(b.revokedAt !== null),
  ),
)

onMounted(async () => {
  await ensureLoaded()
  await account.load()
})

async function activatePasskey(): Promise<void> {
  await account.activatePasskey({
    userName: email.value || BRAND.passkeyName,
    userDisplayName: email.value || BRAND.passkeyName,
  })
}
</script>

<template>
  <section class="account">
    <h1 class="title">{{ t('account.title') }}</h1>

    <p v-if="account.error.value" class="error" role="alert">
      {{ t('account.errorPrefix') }} {{ account.error.value }}
    </p>

    <article class="card">
      <h2 class="card-title">{{ t('account.keyStatus.title') }}</h2>
      <p class="row">
        <span class="label">{{ t('account.keyStatus.passkey') }}</span>
        <span :class="['badge', account.passkey.value === 'set' ? 'ok' : 'warn']">
          {{ t(`account.keyStatus.${account.passkey.value}`) }}
        </span>
      </p>
      <p class="hint">{{ t('account.keyStatus.hint') }}</p>
    </article>

    <article class="card">
      <h2 class="card-title">{{ t('account.passkey.title') }}</h2>
      <p class="hint">{{ t('account.passkey.intro') }}</p>
      <div class="actions">
        <Button variant="outline" size="sm" :disabled="account.busy.value" @click="activatePasskey">
          {{
            account.passkey.value === 'set'
              ? t('account.passkey.replace')
              : t('account.passkey.activate')
          }}
        </Button>
      </div>
    </article>

    <RecoveryBackupCard />

    <StorageCard />

    <article class="card">
      <h2 class="card-title">{{ t('account.pairing.title') }}</h2>
      <p class="hint">{{ t('account.pairing.cardHint') }}</p>
      <div class="actions">
        <Button variant="outline" size="sm" @click="isPairingOpen = true">
          {{ t('account.pairing.open') }}
        </Button>
      </div>
    </article>

    <article class="card">
      <h2 class="card-title">{{ t('account.devices.title') }}</h2>
      <p v-if="devices.length === 0" class="hint">{{ t('account.devices.empty') }}</p>
      <ul v-else class="devices">
        <li
          v-for="device in devices"
          :key="device.id"
          class="device"
          :class="{ 'device--revoked': device.revokedAt !== null }"
        >
          <span class="device-name">
            {{ device.name }}
            <span v-if="device.isCurrent" class="badge ok">{{ t('account.devices.current') }}</span>
            <span v-if="device.revokedAt" class="badge muted">
              {{ t('account.devices.revoked') }}
            </span>
          </span>
          <span class="device-meta">
            {{ device.platform }} · {{ t('account.devices.lastSeen') }} {{ device.lastSeenAt }}
            <template v-if="device.lastIpCity"> · {{ device.lastIpCity }}</template>
          </span>
          <Button
            v-if="!device.isCurrent && !device.revokedAt"
            variant="danger"
            size="sm"
            :disabled="account.busy.value"
            @click="account.revokeDevice(device.id)"
          >
            {{ t('account.devices.revoke') }}
          </Button>
        </li>
      </ul>
    </article>

    <article class="card card--danger">
      <h2 class="card-title">{{ t('account.delete.cardTitle') }}</h2>
      <p class="hint">{{ t('account.delete.cardHint') }}</p>
      <div class="actions">
        <Button variant="danger" size="sm" @click="isDeleteOpen = true">
          {{ t('account.delete.open') }}
        </Button>
      </div>
    </article>

    <AccountDevicePairingDialog :open="isPairingOpen" @close="isPairingOpen = false" />
    <AccountDeleteAccountDialog
      :open="isDeleteOpen"
      :session-email="email"
      @close="isDeleteOpen = false"
    />
  </section>
</template>

<style scoped>
.account {
  display: grid;
  gap: 1rem;
  max-width: 46rem;
}

.title {
  margin: 0;
  font-size: 1.4rem;
}

.card {
  padding: 1rem;
  border: 1px solid #e6ded1;
  border-radius: 0.8rem;
  background: #fffdf8;
}

.card--danger {
  border-color: #e9b7ae;
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

.badge.muted {
  background: #efe8db;
  color: #6b5e4b;
}

.hint {
  margin: 0.4rem 0;
  font-size: 0.85rem;
  /* 0.8 x `--ink` di kartu terang masih >= 7,15:1 (AA lolos); sengaja tidak diganti token
     supaya kontras tidak turun (inventaris QA #62: hanya teks < 0,7 yang gagal). */
  opacity: 0.8;
}

.actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-top: 0.6rem;
}

.devices {
  display: grid;
  gap: 0.6rem;
  margin: 0;
  padding-left: 0;
  list-style: none;
}

.device {
  display: grid;
  gap: 0.2rem;
  padding-top: 0.5rem;
  border-top: 1px solid #efe8db;
}

.device--revoked {
  /* Dulu opacity 0.6 (~3,89:1). Perangkat yang dicabut tetap terbaca; status ditandai badge. */
  color: var(--mute-3);
}

.device-meta {
  font-size: 0.8rem;
  /* Dulu opacity 0.75 x `--ink` (6,07:1). Token `--mute-2` = >= 7,03:1 dan tidak ikut
     terpangkas opacity induk `.device--revoked` (QA #62). */
  color: var(--mute-2);
}

.error {
  margin: 0;
  padding: 0.5rem 0.75rem;
  border-radius: 0.5rem;
  background: #ffe1da;
  color: #b0283e;
}
</style>
