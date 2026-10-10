import { MS_PER_SECOND } from '~/utils/time'

export default defineNuxtPlugin({
  name: 'ticker',
  parallel: true,
  setup() {
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
