import { MS_PER_SECOND } from '~/utils/time'

export default defineNuxtPlugin({
  name: 'ticker',
  parallel: true,
  setup() {
    // Di test, jam disemai lewat `useState('now')` supaya hasil tanggal deterministik. Ticker yang
    // tetap jalan akan menimpanya dengan waktu nyata - dan karena suite penuh berjalan paralel,
    // test yang butuh lebih dari satu detik jadi gagal acak (mis. tombol "Hari ini" melompat ke
    // pekan berjalan). Tidak ada test yang menguji ticker, jadi ia memang tidak perlu hidup di sini.
    if (import.meta.env.MODE === 'test') return

    const now = useNow()
    const tick = (): void => {
      now.value = Date.now()
    }

    setInterval(tick, MS_PER_SECOND)
    // Browser men-throttle interval di tab background; sinkronkan begitu tab terlihat lagi.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') tick()
    })
  },
})
