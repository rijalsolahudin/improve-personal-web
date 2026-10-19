<script setup lang="ts">
/**
 * Halaman "Akun & perangkat" (PRD T22, ARCHITECTURE §7).
 *
 * Yang ADA di halaman ini:
 * - status pembuka kunci (passkey: sudah diatur atau belum),
 * - mengaktifkan passkey (envelope dititip ke server, kredensialnya tinggal di perangkat),
 * - daftar perangkat + logout jarak jauh.
 *
 * Yang BELUM ada, dan tidak diklaim ada: memulihkan akses lewat passkey saat pembuka perangkat hilang,
 * layar tambah perangkat via QR (butuh pemindai QR), hapus akun, alur lupa OTP, dan opsi menyimpan
 * salinan kunci ke cloud.
 *
 * Catatan keputusan: 24 kata recovery DIHAPUS dari UI karena membingungkan user; pembuka kuncinya
 * sekarang passkey. Modul kripto & artefaknya masih ada dan teruji, menunggu jalur cloud.
 */
import RecoveryBackupCard from '~/components/features/account/RecoveryBackupCard.vue'
import { BRAND } from '#shared/brand'

definePageMeta({ layout: 'dashboard' })

const { t } = useI18n()
const { session, ensureLoaded } = useAuthSession()
const account = useAccount()

const email = computed(() => session.value?.user.email ?? '')

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
        <button
          type="button"
          class="button"
          :disabled="account.busy.value"
          @click="activatePasskey"
        >
          {{
            account.passkey.value === 'set'
              ? t('account.passkey.replace')
              : t('account.passkey.activate')
          }}
        </button>
      </div>
    </article>

    <RecoveryBackupCard />

    <article class="card">
      <h2 class="card-title">{{ t('account.devices.title') }}</h2>
      <p v-if="account.devices.value.length === 0" class="hint">{{ t('account.devices.empty') }}</p>
      <ul v-else class="devices">
        <li v-for="device in account.devices.value" :key="device.id" class="device">
          <span class="device-name">
            {{ device.name }}
            <span v-if="device.isCurrent" class="badge ok">{{ t('account.devices.current') }}</span>
          </span>
          <span class="device-meta">
            {{ device.platform }} · {{ t('account.devices.lastSeen') }} {{ device.lastSeenAt }}
            <template v-if="device.lastIpCity"> · {{ device.lastIpCity }}</template>
          </span>
          <button
            v-if="!device.isCurrent"
            type="button"
            class="button button--danger"
            :disabled="account.busy.value"
            @click="account.revokeDevice(device.id)"
          >
            {{ t('account.devices.revoke') }}
          </button>
        </li>
      </ul>
    </article>
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

.actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-top: 0.6rem;
}

.button {
  padding: 0.45rem 0.9rem;
  border: 1px solid #d8cfc0;
  border-radius: 0.5rem;
  background: #fff;
  cursor: pointer;
}

.button--danger {
  border-color: #e2445c;
  color: #b0283e;
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

.device-meta {
  font-size: 0.8rem;
  opacity: 0.75;
}

.error {
  margin: 0;
  padding: 0.5rem 0.75rem;
  border-radius: 0.5rem;
  background: #ffe1da;
  color: #b0283e;
}
</style>
