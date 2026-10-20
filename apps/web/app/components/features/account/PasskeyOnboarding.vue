<script setup lang="ts">
import E2eeExplainer from '~/components/features/account/E2eeExplainer.vue'
import RecoveryBackupCard from '~/components/features/account/RecoveryBackupCard.vue'
import { BRAND } from '#shared/brand'
import { isWebAuthnAvailable } from '~/utils/crypto/webauthn'
import {
  PASSKEY_UNAVAILABLE_HINT,
  readPasskeySkip,
  shouldForcePasskeyOnboarding,
  writePasskeySkip,
} from '~/utils/account/passkey-setup'

/**
 * Onboarding pembuka kunci: **satu tap Face ID/passkey** (ARCHITECTURE §7, ADR 10-12).
 *
 * Alasan layar ini ada, dan kenapa tidak bisa ditutup:
 *
 * Kunci utama dibuat acak di perangkat dan tidak pernah dikirim ke server. Kalau perangkat ini hilang
 * tanpa pembuka lain, datanya hilang permanen - tidak ada layanan, termasuk kita, yang bisa
 * mengembalikannya. Pembuka itu sekarang passkey: satu sentuhan, envelope-nya dititip di server,
 * dan PRF dari authenticator tidak pernah keluar dari perangkat.
 *
 * Yang TIDAK ada di sini, dan itu disengaja: 24 kata. Versi sebelumnya meminta user menulis 24 kata di
 * dua tempat berbeda; itu membingungkan dan bukan yang dibutuhkan mayoritas user.
 *
 * Satu pengecualian yang penting: kalau perangkatnya memang tidak mendukung WebAuthn, dialog ini TIDAK
 * boleh jadi jalan buntu. Di situ baru muncul tombol "lanjut tanpa passkey" - dengan peringatan apa
 * artinya - dan penandanya disimpan supaya dialognya tidak muncul lagi.
 */
const account = useAccount()
const { logout } = useLogout()
const localData = useLocalData()
const { session, ensureLoaded } = useAuthSession()

const isActivating = ref(false)

/**
 * Langkah kedua setelah passkey aktif: simpan kode pemulihan.
 *
 * Dialog sengaja TIDAK langsung tertutup setelah passkey jadi: begitu passkey aktif, gate-nya berhenti
 * memaksa - dan kalau dialog langsung hilang, user tidak pernah melihat opsi backup-nya. Ditahan satu
 * langkah, dengan tombol tutup yang eksplisit.
 */
const backupStep = ref(false)

/**
 * `isWebAuthnAvailable` dievaluasi sekali saat mount: kalau perangkat tidak mendukung, user berhak tahu
 * SEBELUM menekan tombol dan gagal.
 */
const isSupported = ref(false)

const isOpen = computed(
  () =>
    backupStep.value ||
    shouldForcePasskeyOnboarding({
      localDataStatus: localData.state.value.status,
      hasPasskey: account.passkey.value === 'set',
      hasSkipped: readPasskeySkip(),
    }),
)

onMounted(async () => {
  isSupported.value = isWebAuthnAvailable()
  await ensureLoaded()
  await account.load()
})

async function activate(): Promise<void> {
  isActivating.value = true

  try {
    const name = session.value?.user.email ?? BRAND.passkeyName
    await account.activatePasskey({ userName: name, userDisplayName: name })

    // Passkey sudah ada -> tawarkan langkah simpan kode pemulihan (bukan dipaksa, tapi di depan mata).
    if (account.passkey.value === 'set') backupStep.value = true
  } finally {
    isActivating.value = false
  }
}

/**
 * Keluar dari langkah backup (sudah disimpan, dilewati, atau kembali).
 *
 * Kalau passkey belum ada, gate-nya memaksa dialog tetap terbuka - jadi ini kembali ke langkah 1,
 * bukan menutup lalu berkedip terbuka lagi.
 */
function closeOnboarding(): void {
  backupStep.value = false
}

/** Hanya ditawarkan saat perangkatnya tidak mendukung - lihat catatan di atas. */
function continueWithoutPasskey(): void {
  writePasskeySkip()
  account.load()
}
</script>

<template>
  <Modal :open="isOpen" labelled-by="passkey-onboarding-title">
    <span class="badge" aria-hidden="true">
      <svg
        width="28"
        height="28"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <rect x="4" y="10" width="16" height="11" rx="3" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
        <path d="M12 14.5v2" />
      </svg>
    </span>

    <h2 id="passkey-onboarding-title" class="title">
      {{
        backupStep
          ? $t('account.passkeyOnboarding.backupTitle')
          : $t('account.passkeyOnboarding.title')
      }}
    </h2>

    <template v-if="backupStep">
      <p class="lead">{{ $t('account.passkeyOnboarding.backupHint') }}</p>
      <RecoveryBackupCard is-embedded @saved="closeOnboarding" />
      <Button class="exit" variant="ghost" block @click="closeOnboarding">
        {{
          account.passkey.value === 'set'
            ? $t('account.passkeyOnboarding.skip')
            : $t('account.passkeyOnboarding.back')
        }}
      </Button>
    </template>

    <template v-else>
      <p class="lead">{{ $t('account.passkeyOnboarding.why') }}</p>
      <E2eeExplainer />

      <div class="actions">
        <Button
          v-if="isSupported"
          size="lg"
          block
          :disabled="isActivating || account.busy.value"
          @click="activate"
        >
          {{
            isActivating
              ? $t('account.passkeyOnboarding.activating')
              : $t('account.passkeyOnboarding.activate')
          }}
        </Button>
        <template v-else>
          <p class="note note--warn">{{ PASSKEY_UNAVAILABLE_HINT }}</p>
          <Button variant="outline" block @click="continueWithoutPasskey">
            {{ $t('account.passkeyOnboarding.continueWithout') }}
          </Button>
        </template>
        <Button variant="ghost" block @click="backupStep = true">
          {{ $t('account.passkeyOnboarding.backupFirst') }}
        </Button>
      </div>

      <p v-if="isSupported" class="note note--center">
        {{ $t('account.passkeyOnboarding.cannotSkip') }}
      </p>

      <Button variant="ghost" size="sm" block @click="logout">
        {{ $t('account.passkeyOnboarding.logout') }}
      </Button>
    </template>

    <p v-if="account.error.value" class="error" role="alert">
      {{ $t('account.errorPrefix') }} {{ account.error.value }}
    </p>
  </Modal>
</template>

<style scoped>
.badge {
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  border-radius: var(--radius-pill);
  background: var(--chip);
  color: var(--accent);
}

.title {
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: var(--fs-h1);
  line-height: var(--lh-title);
}

.lead {
  color: var(--ink);
  font-weight: var(--fw-medium);
  font-size: var(--fs-body);
  line-height: var(--lh-body);
}

.actions {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  margin-top: var(--space-4);
}

.note {
  color: var(--text-subtle);
  font-size: var(--fs-caption);
}

.note--center {
  text-align: center;
}

.note--warn {
  color: var(--danger);
}

.error {
  padding: var(--space-4) var(--space-6);
  border-radius: var(--radius-inner);
  background: #ffe1da;
  color: var(--danger);
  font-size: var(--fs-body-sm);
}

/* Jalan keluar dipisah jelas dari tombol "Selesai" di atasnya, supaya tidak terbaca satu kelompok. */
.exit {
  margin-top: var(--space-4);
}
</style>
