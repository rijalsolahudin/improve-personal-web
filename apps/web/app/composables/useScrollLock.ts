/** Berapa pemegang kunci yang aktif. Kunci baru dilepas saat yang terakhir selesai (modal bisa bertumpuk). */
let holders = 0
let savedOverflow = ''
let savedPaddingRight = ''

function acquire(): void {
  holders += 1
  if (holders > 1) return

  const root = document.documentElement
  savedOverflow = root.style.overflow
  savedPaddingRight = root.style.paddingRight

  // Scrollbar hilang saat overflow disembunyikan; tanpa ganti ruangnya, halaman melompat selebar scrollbar.
  const scrollbarWidth = window.innerWidth - root.clientWidth
  if (scrollbarWidth > 0) root.style.paddingRight = `${scrollbarWidth}px`
  root.style.overflow = 'hidden'
}

function release(): void {
  holders = Math.max(0, holders - 1)
  if (holders > 0) return

  const root = document.documentElement
  root.style.overflow = savedOverflow
  root.style.paddingRight = savedPaddingRight
}

/**
 * Matikan scroll halaman di belakang selama `isLocked()` true (dialog modal).
 *
 * Dilepas juga saat komponen di-unmount, supaya dialog yang hilang karena rute berpindah tidak
 * meninggalkan halaman yang tidak bisa di-scroll.
 */
export function useScrollLock(isLocked: () => boolean): void {
  if (!import.meta.client) return

  let isHolding = false

  function sync(locked: boolean): void {
    if (locked === isHolding) return

    isHolding = locked
    if (locked) acquire()
    else release()
  }

  watch(isLocked, sync, { immediate: true })
  onBeforeUnmount(() => sync(false))
}
