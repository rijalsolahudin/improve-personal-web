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
 *
 * Dua pemakaian: tanpa `title`, isi slot memegang judulnya sendiri (`labelledBy` menunjuk id-nya).
 * Dengan `title`, modal menggambar kepala (judul + tombol tutup bila `isDismissible`) dan menamai
 * dialog dari judul itu - dipakai form `align="top"` yang panjang dan bisa di-scroll.
 */
defineOptions({ inheritAttrs: false })

const {
  open,
  labelledBy = undefined,
  title = undefined,
  isDismissible = false,
  align = 'center',
  width = undefined,
  isFlush = false,
} = defineProps<{
  open: boolean
  /** Id elemen judul di dalam slot; dibaca pembaca layar sebagai nama dialog. Tidak perlu bila ada `title`. */
  labelledBy?: string
  title?: string
  isDismissible?: boolean
  /** `top` untuk form panjang: dialog menempel ke atas dan halaman modal yang di-scroll. */
  align?: 'center' | 'top'
  /** Lebar maksimum dialog (nilai CSS), default 34rem. */
  width?: string
  /** Tanpa padding & jarak bawaan: isi mengatur tata letaknya sendiri (mis. daftar yang di-scroll sendiri). */
  isFlush?: boolean
}>()

const emit = defineEmits<{ close: [] }>()

const dialog = useTemplateRef<HTMLElement>('dialog')
const titleId = useId()
const nameId = computed(() => (title === undefined ? labelledBy : titleId))

useScrollLock(() => open)

// Fokus masuk ke dialog tiap kali dibuka, supaya keyboard & pembaca layar mulai dari sini.
// Isi boleh menandai kolom pertama dengan `data-autofocus`; tanpa itu, dialog sendiri yang fokus.
// Diamati lewat ref karena isinya baru ada setelah `ClientOnly` selesai mount.
watch(dialog, (element) => {
  if (element === null) return
  const target = element.querySelector<HTMLElement>('[data-autofocus]') ?? element
  target.focus()
})

function onEscape(event: KeyboardEvent): void {
  // Modal bertumpuk: Esc milik modal paling dalam, jangan ikut menutup modal di bawahnya.
  if (event.defaultPrevented) return

  event.preventDefault()
  if (isDismissible) emit('close')
}

function onBackdropClick(event: MouseEvent): void {
  // Hanya klik pada latarnya sendiri, bukan klik di dalam dialog yang menggelembung.
  if (isDismissible && event.target === event.currentTarget) emit('close')
}

function trapFocus(event: KeyboardEvent): void {
  const root = dialog.value
  if (root === null || event.defaultPrevented) return

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
    <div
      v-if="open"
      v-bind="$attrs"
      class="backdrop"
      :class="`align-${align}`"
      @click="onBackdropClick"
    >
      <section
        ref="dialog"
        class="dialog"
        :class="{ flush: isFlush }"
        :style="width === undefined ? undefined : { '--modal-width': width }"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="nameId"
        tabindex="-1"
        @keydown.esc="onEscape"
        @keydown.tab="trapFocus"
      >
        <header v-if="title !== undefined" class="head">
          <h2 :id="titleId" class="title">{{ title }}</h2>
          <IconButton
            v-if="isDismissible"
            tone="plain"
            :size="40"
            :radius="14"
            :title="$t('common.close')"
            @click="emit('close')"
          >
            ×
          </IconButton>
        </header>
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

/* Form panjang: dialog menempel ke atas dengan jarak lega; yang di-scroll adalah latarnya. */
.backdrop.align-top {
  align-items: flex-start;
  padding: 40px 20px;
}

.align-top .dialog {
  max-height: none;
  overflow-y: visible;
}

.dialog {
  display: flex;
  flex-direction: column;
  gap: var(--space-8);
  width: min(var(--modal-width, 34rem), 100%);
  max-height: 90vh;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: var(--space-12);
  background: var(--paper);
  border: var(--border-thick) solid var(--outline);
  border-radius: var(--radius-panel);
  box-shadow: var(--shadow-drop);
}

.dialog.flush {
  gap: 0;
  padding: 0;
  overflow: hidden;
  max-height: calc(100vh - 2 * var(--space-8));
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.title {
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: 26px;
}

@media (max-width: 480px) {
  .backdrop.align-top {
    padding: 16px 10px;
  }

  .dialog {
    padding: var(--space-11) var(--space-10) var(--space-10);
  }
}

.dialog:focus {
  outline: none;
}
</style>
