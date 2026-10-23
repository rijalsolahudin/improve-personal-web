<script setup lang="ts">
/**
 * Layar "buka datamu di perangkat ini" - muncul saat `localData.status === 'locked'`: akunnya sudah
 * punya kunci, tapi perangkat ini belum punya pembukanya (perangkat baru, atau data situs terhapus).
 *
 * Sama seperti onboarding passkey, dialog ini tidak bisa ditutup: di belakangnya tidak ada data yang
 * bisa dipakai, dan membiarkan user melewatinya berarti melihat aplikasi kosong tanpa penjelasan. Jalan
 * keluarnya adalah logout, atau memulihkan kuncinya.
 *
 * Satu jalan masuk yang WAJIB ada di sini: "tambah perangkat lewat QR" (PRD F15). Perangkat baru selalu
 * berakhir di layar ini, sedangkan dialog pairing dulu hanya dipasang di `/app/akun` - halaman yang
 * justru ada di belakang layar ini. Tanpa opsi tersebut, alur dua QR tidak pernah bisa DIMULAI dari
 * perangkat yang membutuhkan kunci.
 *
 * Form pembukanya (`AccountUnlockForm`) dipakai bersama langkah "lupa OTP" di halaman login; di sini
 * yang ditambahkan cuma bingkai dialog, opsi QR, dan tombol logout.
 */
const localData = useLocalData()
const { logout } = useLogout()

const isOpen = computed(() => localData.state.value.status === 'locked')

/** Panel QR menggantikan daftar pembuka kunci, bukan menumpuk di bawahnya. */
const isPairing = ref(false)

// Kunci berhasil diterima (lewat QR) -> dialog tertutup. Panel QR harus ikut direset supaya kunjungan
// berikutnya di perangkat ini mulai dari pilihan pembuka kunci, bukan dari QR yang sudah kedaluwarsa.
watch(isOpen, (open) => {
  if (!open) isPairing.value = false
})
</script>

<template>
  <Modal :open="isOpen" labelled-by="key-recovery-title">
    <h2 id="key-recovery-title" class="title">{{ $t('account.unlock.title') }}</h2>

    <template v-if="isPairing">
      <p class="lead">{{ $t('account.unlock.addDeviceLead') }}</p>

      <!-- Lazy: dialog ini hidup di layout dashboard, sedangkan QR + pemindai hanya dibutuhkan saat
           user benar-benar memilih jalur ini. -->
      <LazyAccountPairingNewDevice />

      <Button variant="ghost" block @click="isPairing = false">
        {{ $t('account.unlock.backToUnlock') }}
      </Button>
    </template>

    <template v-else>
      <p class="lead">{{ $t('account.unlock.lead') }}</p>

      <!-- Lazy: form ini menarik jalur pemulihan (BIP39 + envelope + kripto). Dialog `locked` hanya
           terbuka di perangkat baru, jadi mayoritas kunjungan `/app` tidak boleh membayar bundelnya. -->
      <LazyAccountUnlockForm />

      <Button variant="outline" block @click="isPairing = true">
        {{ $t('account.unlock.addDevice') }}
      </Button>
    </template>

    <Button variant="ghost" block @click="logout">{{ $t('account.unlock.logout') }}</Button>
  </Modal>
</template>

<style scoped>
.title {
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: var(--fs-h1);
  line-height: var(--lh-title);
}

.lead {
  color: var(--text-muted);
  font-size: var(--fs-body);
  line-height: var(--lh-body);
}
</style>
