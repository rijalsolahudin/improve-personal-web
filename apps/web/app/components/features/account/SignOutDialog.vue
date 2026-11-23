<script setup lang="ts">
import { useAuthGateway } from '~/composables/auth/http-gateway'

/**
 * Konfirmasi "Keluar dari perangkat ini" (ADR 15: tidak ada akun, jadi keluar = lepas lisensi).
 * Data lokal sengaja tidak disentuh: keluar tidak boleh jadi jalan pintas menghapus jurnal user.
 */
const { open } = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()
const license = useLicense()
const auth = useAuthSession()
const isLeaving = ref(false)

async function leave(): Promise<void> {
  isLeaving.value = true
  try {
    await useAuthGateway().signOut()
  } catch {
    // Offline / sesi sudah berakhir: sesi server habis sendiri; yang menentukan akses adalah token.
  }
  license.release()
  auth.clear()
  emit('close')
  await navigateTo('/login')
}
</script>

<template>
  <Modal
    :open="open"
    :title="t('signOut.title')"
    is-dismissible
    width="26rem"
    @close="emit('close')"
  >
    <p>{{ t('signOut.body') }}</p>
    <p class="hint">{{ t('signOut.hint') }}</p>
    <div class="actions">
      <Button variant="ghost" @click="emit('close')">{{ t('signOut.cancel') }}</Button>
      <Button variant="danger" :disabled="isLeaving" data-autofocus @click="leave">
        {{ t('signOut.confirm') }}
      </Button>
    </div>
  </Modal>
</template>

<style scoped>
.hint {
  color: var(--text-muted);
  font-size: var(--fs-body-sm);
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-12);
}
</style>
