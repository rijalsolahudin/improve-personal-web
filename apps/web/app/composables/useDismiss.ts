import type { Ref } from 'vue'

/**
 * Popover: tutup saat pointer ditekan di luar `root` atau tombol Escape.
 * Listener cuma terpasang selama popover terbuka.
 */
export function useDismiss(root: Readonly<Ref<HTMLElement | null>>, isOpen: Ref<boolean>): void {
  function onPointerDown(event: PointerEvent): void {
    if (root.value && event.target instanceof Node && !root.value.contains(event.target)) {
      isOpen.value = false
    }
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') isOpen.value = false
  }

  function detach(): void {
    document.removeEventListener('pointerdown', onPointerDown)
    document.removeEventListener('keydown', onKeydown)
  }

  watch(
    isOpen,
    (open) => {
      if (!import.meta.client) return
      detach()
      if (open) {
        document.addEventListener('pointerdown', onPointerDown)
        document.addEventListener('keydown', onKeydown)
      }
    },
    { immediate: true },
  )

  onBeforeUnmount(detach)
}
