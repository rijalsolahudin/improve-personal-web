<script setup lang="ts">
/**
 * Dialog "Tambah perangkat" (PRD F15): dua peran, dua QR.
 *
 * Peran harus dipilih dulu karena arah alurnya berlawanan: perangkat baru menampilkan QR, perangkat
 * lama memindainya. Menebak peran dari state lokal ("kayaknya ini perangkat baru") justru berbahaya -
 * yang salah tebak bisa membungkus kunci untuk perangkat yang salah.
 */
const { open } = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()

const role = ref<'new' | 'existing' | null>(null)

// Dialog ditutup -> peran direset, supaya membuka lagi selalu mulai dari pertanyaan yang sama.
watch(
  () => open,
  (isOpen) => {
    if (!isOpen) role.value = null
  },
)
</script>

<template>
  <Modal
    :open="open"
    :title="t('account.pairing.title')"
    align="top"
    width="480px"
    is-dismissible
    @close="emit('close')"
  >
    <div v-if="role === null" class="roles">
      <p class="hint">{{ t('account.pairing.intro') }}</p>
      <Button variant="outline" block @click="role = 'new'">
        {{ t('account.pairing.roles.new') }}
      </Button>
      <Button variant="outline" block @click="role = 'existing'">
        {{ t('account.pairing.roles.existing') }}
      </Button>
    </div>

    <template v-else>
      <Button variant="link" class="back" @click="role = null">
        <span aria-hidden="true">←</span> {{ t('account.pairing.back') }}
      </Button>
      <AccountPairingNewDevice v-if="role === 'new'" />
      <AccountPairingExistingDevice v-else />
    </template>
  </Modal>
</template>

<style scoped>
.roles {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

.hint {
  color: var(--text-muted);
  font-size: var(--fs-body-sm);
  line-height: var(--lh-body);
}

.back {
  align-self: flex-start;
}
</style>
