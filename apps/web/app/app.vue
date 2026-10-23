<script setup lang="ts">
const { t } = useI18n()
const { theme, style } = useAppearance()

// Preferensi tampilan per akun (PRD F16) dihidrasi oleh layout dashboard - lihat komentar di sana.
// Sengaja TIDAK di sini: halaman publik (`/`, `/login`) tidak punya akun, jadi tidak perlu menyeret
// modul core + akses IndexedDB ke dalam JS awalnya.
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
