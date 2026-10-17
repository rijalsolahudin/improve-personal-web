/** Dijalankan sebelum render pertama route client, jadi tidak ada kedip tema/gaya salah. */
export default defineNuxtPlugin({
  name: 'appearance',
  // Store cuma bisa diakses setelah plugin `pinia` terpasang di nuxtApp.
  dependsOn: ['pinia'],
  parallel: true,
  setup() {
    useAppearance().restore()
  },
})
