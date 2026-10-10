/** Nada pendek 3x (design `beep`) lewat Web Audio; tanpa file audio. */
function beep(): void {
  try {
    const context = new AudioContext()
    for (const offset of [0, 0.25, 0.5]) {
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      const at = context.currentTime + offset
      oscillator.frequency.value = 880
      gain.gain.setValueAtTime(0.15, at)
      gain.gain.exponentialRampToValueAtTime(0.001, at + 0.2)
      oscillator.connect(gain).connect(context.destination)
      oscillator.start(at)
      oscillator.stop(at + 0.22)
    }
  } catch {
    // Audio tidak tersedia/diblokir: notifikasi in-app tetap tampil.
  }
}

/**
 * Satu pengamat untuk seluruh app: fase Pomodoro selesai otomatis di halaman mana pun
 * (bukan cuma saat widget/halaman Pomodoro terbuka). Ikut jam global dari plugin ticker.
 */
export default defineNuxtPlugin({
  name: 'pomodoro',
  dependsOn: ['ticker'],
  setup() {
    const pomodoro = usePomodoro()
    watch(pomodoro.remainingMs, (left) => {
      if (left > 0 || !pomodoro.isRunning.value) return
      if (pomodoro.isSoundOn.value) beep()
      pomodoro.finish(true)
    })
  },
})
