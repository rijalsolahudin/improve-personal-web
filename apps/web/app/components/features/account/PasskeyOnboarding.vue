<script setup lang="ts">
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
const localData = useLocalData()
const { session, ensureLoaded } = useAuthSession()

const dialog = ref<HTMLElement | null>(null)
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

  void nextTick(() => dialog.value?.focus())
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

/** Tutup onboarding setelah langkah backup selesai/dilewati. */
function closeOnboarding(): void {
  backupStep.value = false

  // Kalau passkey belum ada, dialog ini memang akan dipaksa muncul lagi - jadi "tutup" berarti kembali ke
  // langkah 1, bukan menutup lalu berkedip terbuka lagi.
  if (account.passkey.value !== 'set') return
}

/** Hanya ditawarkan saat perangkatnya tidak mendukung - lihat catatan di atas. */
function continueWithoutPasskey(): void {
  writePasskeySkip()
  account.load()
}

/**
 * Jaga fokus tetap di dalam dialog.
 *
 * Tanpa ini, Tab bisa membawa fokus ke elemen di belakang: user tidak bisa menutupnya, tapi bisa
 * "menyentuh" aplikasi yang belum boleh dipakai - dan itu bikin aturannya kelihatan seperti saran.
 */
function trapFocus(event: KeyboardEvent): void {
  const root = dialog.value
  if (root === null) return

  const focusable = [...root.querySelectorAll<HTMLElement>('button:not([disabled]), a[href]')]
  const first = focusable[0]
  const last = focusable.at(-1)
  if (first === undefined || last === undefined) return

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
    return
  }

  if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}
</script>

<template>
  <ClientOnly>
    <div v-if="isOpen" class="backdrop">
      <section
        ref="dialog"
        class="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="passkey-onboarding-title"
        tabindex="-1"
        @keydown.esc.prevent
        @keydown.tab="trapFocus"
      >
        <h2 id="passkey-onboarding-title" class="title">
          {{ $t('account.passkeyOnboarding.title') }}
        </h2>
        <p class="why">{{ $t('account.passkeyOnboarding.why') }}</p>

        <template v-if="backupStep">
          <p class="cannot-skip">{{ $t('account.passkeyOnboarding.backupHint') }}</p>
          <RecoveryBackupCard />
          <div class="actions">
            <button type="button" class="button button--primary" @click="closeOnboarding">
              {{ $t('account.passkeyOnboarding.done') }}
            </button>
          </div>
        </template>

        <template v-else-if="isSupported">
          <p class="cannot-skip">{{ $t('account.passkeyOnboarding.cannotSkip') }}</p>

          <div class="actions">
            <button
              type="button"
              class="button button--primary"
              :disabled="isActivating || account.busy.value"
              @click="activate"
            >
              {{
                isActivating
                  ? $t('account.passkeyOnboarding.activating')
                  : $t('account.passkeyOnboarding.activate')
              }}
            </button>
          </div>
        </template>

        <template v-else>
          <p class="cannot-skip">{{ PASSKEY_UNAVAILABLE_HINT }}</p>
          <div class="actions">
            <button type="button" class="button" @click="continueWithoutPasskey">
              {{ $t('account.passkeyOnboarding.continueWithout') }}
            </button>
          </div>
        </template>

        <div v-if="!backupStep" class="actions">
          <button type="button" class="button" @click="backupStep = true">
            {{ $t('account.passkeyOnboarding.backupFirst') }}
          </button>
        </div>

        <p v-if="account.error.value" class="error" role="alert">
          {{ $t('account.errorPrefix') }} {{ account.error.value }}
        </p>
      </section>
    </div>
  </ClientOnly>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: rgba(32, 24, 16, 0.55);
  overflow-y: auto;
}

.dialog {
  width: min(38rem, 100%);
  max-height: 90vh;
  overflow-y: auto;
  padding: 1.25rem;
  border-radius: 0.9rem;
  background: #fffdf8;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.25);
}

.title {
  margin: 0 0 0.5rem;
  font-size: 1.15rem;
}

.why {
  margin: 0 0 0.6rem;
  line-height: 1.5;
}

.cannot-skip {
  margin: 0 0 0.6rem;
  padding: 0.5rem 0.75rem;
  border-radius: 0.5rem;
  background: #fff0c8;
  color: #8a5a00;
  font-size: 0.85rem;
}

.actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-top: 0.5rem;
}

.button {
  padding: 0.55rem 1.1rem;
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

.button--primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.error {
  margin: 0.6rem 0 0;
  padding: 0.5rem 0.75rem;
  border-radius: 0.5rem;
  background: #ffe1da;
  color: #b0283e;
}
</style>
