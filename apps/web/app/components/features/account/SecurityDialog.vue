<script setup lang="ts">
/** Modal "Keamanan & perangkat". Isinya baru dimuat (dan memanggil server) saat dibuka. */
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
    width="72rem"
    @close="emit('close')"
  >
    <AccountSecurityPanel v-if="open" />
  </Modal>
</template>
