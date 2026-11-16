<script setup lang="ts">
/** Modal "Data di perangkat ini": penyimpanan lokal (dan nanti backup/transfer, T28/T31). */
const { open } = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()
</script>

<template>
  <Modal
    :open="open"
    :title="t('account.title')"
    is-dismissible
    align="top"
    width="40rem"
    @close="emit('close')"
  >
    <AccountStorageCard v-if="open" />
  </Modal>
</template>
