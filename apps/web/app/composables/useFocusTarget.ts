/** "▶ Fokus" (Desktop.dc.html): jadikan item target Pomodoro, mulai, lalu buka Pomodoro. */
export function useFocusTarget() {
  const pomodoro = usePomodoro()

  async function focusOn(title: string): Promise<void> {
    // Sesi fokus yang sedang berjalan tidak dibajak: cukup buka halamannya.
    if (!pomodoro.isTargetLocked.value) {
      pomodoro.setTarget(title)
      pomodoro.start()
    }
    await navigateTo(getFeature('pomodoro').path)
  }

  return { focusOn }
}
