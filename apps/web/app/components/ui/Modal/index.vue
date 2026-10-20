<script setup lang="ts">
/**
 * Dialog modal tengah layar.
 *
 * Beda dengan `Sheet` (panel bawah yang selalu bisa ditutup): modal ini cocok untuk langkah yang
 * menahan user. Secara default TIDAK bisa ditutup (`isDismissible` false): Esc dan klik latar diabaikan,
 * fokus dikunci di dalam dialog, dan scroll halaman di belakangnya dimatikan - kalau tidak, aturan
 * "wajib selesaikan dulu" terlihat seperti saran.
 *
 * Yang membuat dialog hilang adalah pemanggil (prop `open`), bukan modal ini.
 */
const {
  open,
  labelledBy,
  isDismissible = false,
} = defineProps<{
  open: boolean
  /** Id elemen judul di dalam slot; dibaca pembaca layar sebagai nama dialog. */
  labelledBy: string
  isDismissible?: boolean
}>()

const emit = defineEmits<{ close: [] }>()

const dialog = useTemplateRef<HTMLElement>('dialog')

useScrollLock(() => open)

// Fokus masuk ke dialog tiap kali dibuka, supaya keyboard & pembaca layar mulai dari sini.
watch(
  () => open,
  (isOpen) => {
    if (isOpen) void nextTick(() => dialog.value?.focus())
  },
  { immediate: true },
)

function onEscape(): void {
  if (isDismissible) emit('close')
}

function onBackdropClick(event: MouseEvent): void {
  // Hanya klik pada latarnya sendiri, bukan klik di dalam dialog yang menggelembung.
  if (isDismissible && event.target === event.currentTarget) emit('close')
}

function trapFocus(event: KeyboardEvent): void {
  const root = dialog.value
  if (root === null) return

  const focusable = [
    ...root.querySelectorAll<HTMLElement>(
      'button:not([disabled]), a[href], textarea:not([disabled]), input:not([disabled])',
    ),
  ]
  const first = focusable[0]
  const last = focusable.at(-1)
  if (first === undefined || last === undefined) return

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
    return
  }

  if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}
</script>

<template>
  <ClientOnly>
    <div v-if="open" class="backdrop" @click="onBackdropClick">
      <section
        ref="dialog"
        class="dialog"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="labelledBy"
        tabindex="-1"
        @keydown.esc.prevent="onEscape"
        @keydown.tab="trapFocus"
      >
        <slot />
      </section>
    </div>
  </ClientOnly>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-8);
  background: var(--scrim);
  overflow-y: auto;
  /* Scroll di dalam dialog tidak boleh "tembus" ke halaman di belakang saat sudah mentok. */
  overscroll-behavior: contain;
}

.dialog {
  display: flex;
  flex-direction: column;
  gap: var(--space-8);
  width: min(34rem, 100%);
  max-height: 90vh;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: var(--space-12);
  background: var(--paper);
  border: var(--border-thick) solid var(--outline);
  border-radius: var(--radius-panel);
  box-shadow: var(--shadow-drop);
}

@media (max-width: 480px) {
  .dialog {
    padding: var(--space-11) var(--space-10) var(--space-10);
  }
}

.dialog:focus {
  outline: none;
}
</style>
