<script setup lang="ts">
import { APP_HOME_PATH } from '~/utils/features'

/**
 * Langkah "lupa OTP" di halaman login (PRD F15: email → "Pakai passkey atau kode pemulihan?").
 *
 * Yang bisa dan tidak bisa dilakukan langkah ini, dan kenapa ditulis apa adanya:
 *
 * - Passkey dan kode pemulihan membuka **kunci data** di perangkat ini, bukan membuat sesi API. Server
 *   hanya mengirim envelope kunci untuk user yang sudah punya sesi (`GET /v1/keys/envelopes` wajib
 *   `requireSession`), jadi tanpa sesi tidak ada yang bisa dibuka - dan UI tidak boleh berpura-pura.
 * - Karena itu langkah ini memeriksa sesi lebih dulu. Ada sesi → form pembuka kunci ditampilkan
 *   (kode, berkas terenkripsi, atau passkey). Tidak ada → dijelaskan apa yang perlu dilakukan, dengan
 *   tombol kembali ke email; bukan jalan buntu tanpa penjelasan.
 */
const emit = defineEmits<{ back: [] }>()

const auth = useAuthSession()
const { t } = useI18n()

const hasSession = ref<boolean | null>(null)
const isRecovered = ref(false)

onMounted(async () => {
  hasSession.value = (await auth.ensureLoaded()) !== null
})

async function onRecovered(): Promise<void> {
  isRecovered.value = true
  await navigateTo(APP_HOME_PATH)
}
</script>

<template>
  <div class="step">
    <Button variant="soft" size="sm" class="back" @click="emit('back')">
      <span aria-hidden="true">←</span> {{ t('login.recovery.back') }}
    </Button>

    <AuthHeading :eyebrow="t('login.recovery.eyebrow')" :title="t('login.recovery.title')">
      {{ t('login.recovery.sub') }}
    </AuthHeading>

    <p v-if="isRecovered" class="notice" role="status">{{ t('login.recovery.recovered') }}</p>

    <template v-else-if="hasSession === null">
      <p class="notice" role="status">{{ t('login.recovery.checking') }}</p>
    </template>

    <template v-else-if="hasSession">
      <AccountUnlockForm @recovered="onRecovered" />
    </template>

    <p v-else class="notice">{{ t('login.recovery.noSession') }}</p>
  </div>
</template>

<style scoped>
.step {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.back {
  align-self: flex-start;
}

.notice {
  padding: 12px 14px;
  border-radius: var(--radius-row);
  background: #fff6df;
  color: #6b5e4b;
  font-weight: var(--fw-medium);
  font-size: var(--fs-body-sm);
  line-height: 1.6;
}
</style>
