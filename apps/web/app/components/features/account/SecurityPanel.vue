<script setup lang="ts">
/**
 * Isi modal "Keamanan & perangkat" (PRD F15, ARCHITECTURE §7). Dulu halaman `/app/akun`; sekarang
 * dibuka dari menu akun lewat `AccountSecurityDialog`, jadi tidak punya judul halaman sendiri.
 *
 * Isinya: passkey, kartu backup kode pemulihan, penyimpanan lokal, daftar perangkat + tambah perangkat
 * lewat QR + logout jarak jauh, dan hapus akun.
 *
 * Catatan keputusan: 24 kata recovery tidak ditampilkan sebagai daftar kata; pembuka kuncinya passkey
 * dan kode pemulihan dalam SATU string (`iprk1.*`). Server hanya menyimpan envelope passkey.
 */
import type { DevicePlatform } from '@improve-personal/contracts'

import RecoveryBackupCard from './RecoveryBackupCard.vue'
import StorageCard from './StorageCard.vue'
import { formatLastSeen } from '~/utils/account/last-seen'
import { BRAND } from '#shared/brand'

const PLATFORM_LABEL: Record<DevicePlatform, string> = {
  web: 'Web',
  ios: 'iOS',
  android: 'Android',
}

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

/** Daftar perangkat hanya dirender di client (dimuat saat mount), jadi `Date.now()` aman dari mismatch SSR. */
function lastSeen(iso: string): string {
  return formatLastSeen(iso, Date.now())
}

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
  <div class="account">
    <p v-if="account.error.value" class="error" role="alert">
      {{ t('account.errorPrefix') }} {{ account.error.value }}
    </p>

    <div class="grid">
      <article class="card">
        <header class="card-head">
          <h2 class="card-title">{{ t('account.passkey.title') }}</h2>
          <span :class="['badge', account.passkey.value === 'set' ? 'ok' : 'warn']">
            {{ t(`account.keyStatus.${account.passkey.value}`) }}
          </span>
        </header>
        <p class="hint">{{ t('account.passkey.intro') }}</p>
        <div class="actions">
          <Button
            variant="outline"
            size="sm"
            :disabled="account.busy.value"
            @click="activatePasskey"
          >
            {{
              account.passkey.value === 'set'
                ? t('account.passkey.replace')
                : t('account.passkey.activate')
            }}
          </Button>
        </div>
      </article>

      <RecoveryBackupCard />

      <article class="card">
        <header class="card-head">
          <h2 class="card-title">{{ t('account.devices.title') }}</h2>
          <Button variant="outline" size="sm" @click="isPairingOpen = true">
            {{ t('account.pairing.open') }}
          </Button>
        </header>
        <p class="hint">{{ t('account.pairing.cardHint') }}</p>

        <p v-if="devices.length === 0" class="hint">{{ t('account.devices.empty') }}</p>
        <ul v-else class="devices">
          <li
            v-for="device in devices"
            :key="device.id"
            class="device"
            :class="{ 'device--revoked': device.revokedAt !== null }"
          >
            <div class="device-main">
              <span class="device-name">
                {{ device.name }}
                <span v-if="device.isCurrent" class="badge ok">
                  {{ t('account.devices.current') }}
                </span>
                <span v-if="device.revokedAt" class="badge muted">
                  {{ t('account.devices.revoked') }}
                </span>
              </span>
              <span class="device-meta">
                {{ PLATFORM_LABEL[device.platform] }}, {{ t('account.devices.lastSeen') }}
                <time :datetime="device.lastSeenAt" :title="device.lastSeenAt">{{
                  lastSeen(device.lastSeenAt)
                }}</time>
                <template v-if="device.lastIpCity">, {{ device.lastIpCity }}</template>
              </span>
            </div>
            <Button
              v-if="!device.isCurrent && !device.revokedAt"
              variant="danger"
              size="xs"
              :disabled="account.busy.value"
              @click="account.revokeDevice(device.id)"
            >
              {{ t('account.devices.revoke') }}
            </Button>
          </li>
        </ul>
      </article>

      <StorageCard />

      <article class="card card--danger">
        <div class="danger-row">
          <div>
            <h2 class="card-title">{{ t('account.delete.cardTitle') }}</h2>
            <p class="hint">{{ t('account.delete.cardHint') }}</p>
          </div>
          <Button variant="danger" size="sm" @click="isDeleteOpen = true">
            {{ t('account.delete.open') }}
          </Button>
        </div>
      </article>
    </div>

    <AccountDevicePairingDialog :open="isPairingOpen" @close="isPairingOpen = false" />
    <AccountDeleteAccountDialog
      :open="isDeleteOpen"
      :session-email="email"
      @close="isDeleteOpen = false"
    />
  </div>
</template>

<style scoped>
.account {
  display: flex;
  flex-direction: column;
  gap: var(--space-10);
}

/*
 * Kolom mengalir (1-3 tergantung lebar), bukan grid baris: tinggi kartu sangat beda (daftar perangkat,
 * langkah kode pemulihan), dan grid baris meninggalkan lubang di bawah kartu pendek.
 */
.grid {
  columns: 3 22rem;
  column-gap: var(--space-10);
}

.grid > * {
  break-inside: avoid;
  margin-bottom: var(--space-10);
}

.card {
  display: flex;
  flex-direction: column;
  gap: var(--space-8);
  padding: var(--space-10);
  background: var(--surface-card);
  border: var(--border) solid var(--outline);
  border-radius: var(--radius-card);
}

.card--danger {
  border-color: var(--danger);
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-6);
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

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-6);
}

.badge {
  padding: var(--space-1) var(--space-5);
  border-radius: var(--radius-pill);
  font-size: var(--fs-caption);
  white-space: nowrap;
}

.badge.ok {
  background: var(--success-soft);
  color: var(--success);
}

.badge.warn {
  background: var(--prio-medium-bg);
  color: var(--prio-medium-fg);
}

.badge.muted {
  background: var(--chip);
  color: var(--mute-2);
}

.devices {
  display: grid;
  margin: 0;
  padding: 0;
  list-style: none;
}

.device {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-6);
  padding: var(--space-6) 0;
  border-top: var(--border-thin) solid var(--line);
}

.device-main {
  display: grid;
  gap: var(--space-1);
  min-width: 0;
}

.device-name {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-4);
  font-weight: var(--fw-strong);
}

.device--revoked {
  color: var(--mute-3);
}

.device-meta {
  font-size: var(--fs-caption);
  /* Token `--mute-2` = >= 7,03:1 dan tidak ikut terpangkas warna induk `.device--revoked` (QA #62). */
  color: var(--mute-2);
}

.danger-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-6);
}

.error {
  padding: var(--space-5) var(--space-8);
  border-radius: var(--radius-inner);
  background: var(--prio-urgent-bg);
  color: var(--danger);
}
</style>
