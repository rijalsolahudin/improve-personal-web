<script setup lang="ts">
import { DRIVE_OAUTH_CHANNEL } from '~/utils/drive/oauth'

/**
 * Halaman balikan izin Google Drive (redirect URI OAuth, T29). Dibuka di popup oleh
 * `requestDriveToken`: fragmen `#access_token=...` diteruskan ke tab app lewat `BroadcastChannel`
 * (origin sama), dihapus dari URL & riwayat, lalu jendela ditutup. Validasi `state` + scope
 * dilakukan tab app - halaman ini tidak menafsirkan apa pun dan tidak menyimpan token.
 */
const isDone = ref(false)

onMounted(() => {
  const fragment = window.location.hash
  history.replaceState(null, '', window.location.pathname)

  const channel = new BroadcastChannel(DRIVE_OAUTH_CHANNEL)
  channel.postMessage({ fragment })
  channel.close()

  isDone.value = true
  window.close()
})
</script>

<template>
  <main class="oauth">
    <p>{{ isDone ? 'Selesai. Jendela ini boleh ditutup.' : 'Menyambungkan Google Drive…' }}</p>
  </main>
</template>

<style scoped>
.oauth {
  display: grid;
  min-height: 100dvh;
  place-items: center;
  padding: var(--space-16);
  color: var(--text-muted);
}
</style>
