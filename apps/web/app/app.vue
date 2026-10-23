<script setup lang="ts">
const { t } = useI18n()
const { theme, style } = useAppearance()

/**
 * Preferensi tampilan (PRD F16) ada di record `user_prefs` per akun. Dipasang di root supaya pilihan
 * akun ikut berubah saat sesi berganti tanpa reload, di halaman mana pun.
 */
useAppearancePrefs()
const appearance = useAppearanceStore()
const { session } = useAuthSession()

// Akun berganti di browser yang sama: cache tampilan milik akun sebelumnya tidak boleh dipakai akun
// berikutnya. Transisi `null → id` (login) dan `id → id lain` menetapkan pemilik baru; logout
// mengosongkan cache. Tanpa ini, tema akun A terbawa ke akun B di perangkat yang sama.
let accountId: string | null = session.value?.user.id ?? null
watch(
  () => session.value?.user.id ?? null,
  (next) => {
    if (next === accountId) return
    if (next === null) appearance.forget()
    else appearance.adopt(next)
    accountId = next
  },
)

useHead({
  htmlAttrs: { 'data-theme': theme, 'data-style': style },
  titleTemplate: (title) => (title ? `${title} · ${t('brand.name')}` : t('brand.name')),
})
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
