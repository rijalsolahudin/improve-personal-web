/** Fullscreen browser hanya diminta di layar lebar; di HP lapisan fokus saja sudah penuh layar. */
const FULLSCREEN_QUERY = '(min-width: 600px)'

/**
 * Mode fokus menulis: satu lapisan layar penuh di atas aplikasi, plus fullscreen browser di desktop.
 *
 * Keluar lewat `Esc` atau `exit()`. Saat browser sedang fullscreen, `Esc` dimakan browser untuk
 * keluar fullscreen (keydown tidak sampai ke halaman), jadi `fullscreenchange` ikut menutup mode
 * fokus supaya dua keadaan itu tidak pernah berbeda.
 */
export function useFocusMode() {
  const isFocus = ref(false)
  let hasFullscreen = false
  let bodyOverflow = ''

  function onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') exit()
  }

  function onFullscreenChange(): void {
    if (hasFullscreen && document.fullscreenElement === null) {
      hasFullscreen = false
      exit()
    }
  }

  async function enter(): Promise<void> {
    if (isFocus.value) return
    isFocus.value = true
    // Halaman di belakang lapisan tidak ikut ter-scroll.
    bodyOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKeydown)
    document.addEventListener('fullscreenchange', onFullscreenChange)

    const root = document.documentElement
    if (
      !window.matchMedia(FULLSCREEN_QUERY).matches ||
      typeof root.requestFullscreen !== 'function'
    )
      return
    try {
      await root.requestFullscreen()
      // User bisa sudah keluar fokus selagi permintaan fullscreen berjalan.
      if (isFocus.value) hasFullscreen = true
      else await document.exitFullscreen()
    } catch {
      // Ditolak browser (izin, iframe): lapisan fokus tetap berfungsi tanpa fullscreen.
    }
  }

  function exit(): void {
    if (!isFocus.value) return
    isFocus.value = false
    document.body.style.overflow = bodyOverflow
    window.removeEventListener('keydown', onKeydown)
    document.removeEventListener('fullscreenchange', onFullscreenChange)
    if (hasFullscreen && document.fullscreenElement !== null) {
      hasFullscreen = false
      void document.exitFullscreen().catch(() => undefined)
    }
  }

  onBeforeUnmount(exit)

  return {
    isFocus: readonly(isFocus),
    enter,
    exit,
  }
}
