<script setup lang="ts">
import type { GridEvent } from '~/composables/useTimeGrid'
import { focusPillStyle, type ResizeEdge } from '~/utils/calendarGrid'
import { formatMinutes } from '~/utils/schedule'

/**
 * Item jadwal di timeline (Desktop.dc.html): centang selesai, tarik tepi atas/bawah buat
 * ubah jam, to-do tertaut di dalam kartu, dan "▶ Fokus" kalau diizinkan.
 */
const {
  item,
  isCompact = false,
  canFocus = false,
} = defineProps<{
  item: GridEvent
  isCompact?: boolean
  canFocus?: boolean
}>()
const emit = defineEmits<{
  open: []
  toggle: []
  focus: [title: string]
  'toggle-task': [id: string]
  'resize-start': [edge: ResizeEdge, event: PointerEvent]
}>()

const { t } = useI18n()

const title = computed(() => item.occurrence.schedule.title)
const end = computed(() => item.start + item.dur)
const durationLabel = computed(() => {
  if (item.dur < 60) return t('calendar.grid.minutes', { n: item.dur })
  const hours = (item.dur / 60).toLocaleString('id-ID', { maximumFractionDigits: 1 })
  return t('calendar.grid.hours', { n: hours })
})
const timeLine = computed(() => {
  if (isCompact) {
    // Daftar to-do-nya tampil di bawah judul; di sini cukup sisa yang tidak muat.
    return item.moreCount
      ? `${formatMinutes(item.start)} · ${t('calendar.grid.more', { n: item.moreCount })}`
      : formatMinutes(item.start)
  }
  return `${formatMinutes(item.start)}–${formatMinutes(end.value)} · ${durationLabel.value}`
})
const style = computed(() => ({
  top: `${item.top}px`,
  height: `${item.height}px`,
  left: `calc(${item.left}% + 2px)`,
  width: `calc(${item.width}% - 4px)`,
  '--ev-solid': item.solid,
  '--ev-tint': item.tint,
}))
/** Pill Fokus 14px di kartu pendek, 18px di kartu normal (design). */
const focusStyle = computed(() => focusPillStyle(item.size === 'tiny'))
</script>

<template>
  <div
    class="event hover-reveal"
    :class="[
      `size-${item.size}`,
      { done: item.isDone, dragging: item.isDragging, compact: isCompact },
    ]"
    :style="style"
  >
    <!-- Pointer saja; dari keyboard jam diubah lewat form edit (klik item). -->
    <span
      class="handle top"
      aria-hidden="true"
      :title="$t('calendar.grid.resize')"
      @pointerdown.stop="emit('resize-start', 'top', $event)"
    >
      <span />
    </span>
    <Button
      v-if="canFocus && !item.isDone"
      variant="chip"
      size="xs"
      class="focus reveal"
      :style="focusStyle"
      :aria-label="$t('daily.focusLabel', { title })"
      @click.stop="emit('focus', title)"
    >
      {{ $t('daily.focus') }}
    </Button>
    <button
      type="button"
      role="checkbox"
      class="check"
      :aria-checked="item.isDone"
      :aria-label="$t('common.toggleDone', { title })"
      @click.stop="emit('toggle')"
    >
      <span v-if="item.isDone" aria-hidden="true">✓</span>
    </button>
    <button type="button" class="body" @click="emit('open')">
      <span v-if="item.size !== 'big'" class="line">
        <span class="dot" aria-hidden="true" />
        <span class="title">{{ title }}</span>
        <span class="time">{{ formatMinutes(item.start) }}</span>
      </span>
      <span v-else class="head">
        <span v-if="!isCompact" class="glyph" aria-hidden="true">
          <span>{{ title.charAt(0) }}</span>
        </span>
        <span class="text">
          <span class="title clamp">{{ title }}</span>
          <span class="time">{{ timeLine }}</span>
        </span>
        <span v-if="!isCompact && item.moreCount" class="more">
          {{ $t('calendar.grid.more', { n: item.moreCount }) }}
        </span>
      </span>
    </button>
    <CalendarEventTodos
      v-if="item.size === 'big' && item.linked.length"
      :tasks="item.linked"
      @toggle="emit('toggle-task', $event)"
      @focus="emit('focus', $event)"
    />
    <!-- Pointer saja; dari keyboard jam diubah lewat form edit (klik item). -->
    <span
      class="handle bottom"
      aria-hidden="true"
      :title="$t('calendar.grid.resize')"
      @pointerdown.stop="emit('resize-start', 'bottom', $event)"
    >
      <span />
    </span>
  </div>
</template>

<style scoped>
.event {
  position: absolute;
  z-index: 2;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: calc(10px * var(--rk));
  background: color-mix(in srgb, var(--ev-solid) 15%, var(--paper));
}

.event.done {
  /* Dulu `opacity: 0.6` - seluruh kartu (termasuk judul) turun ke ~3,37:1. Sekarang hanya teks
     yang diredupkan lewat token; latar & centang tetap penuh supaya state selesai masih jelas. */
  background: color-mix(in srgb, var(--ev-solid) 8%, var(--paper));
}

.event.done .title {
  /* Latar kartu = campuran warna kategori; `--mute-3` gagal di biru/pink (4,32-4,47:1),
     `--mute` terukur >= 4,89:1 di semua campuran (QA #62). */
  color: var(--mute);
  text-decoration: line-through;
}

.event.done .time {
  color: var(--mute);
}

.event.dragging {
  z-index: 5;
  box-shadow: 0 6px 14px rgb(47 42 36 / 0.22);
}

.body {
  flex: 1 1 auto;
  min-height: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 3px 30px 3px 8px;
  border: 0;
  background: none;
  color: var(--ink);
  text-align: left;
  overflow: hidden;
}

/* Kepala kartu tidak boleh menyusut: kalau ruang kurang, daftar to-do yang terpotong, bukan
   to-do yang menimpa judul/jam. */
.size-big .body {
  flex-shrink: 0;
}

.compact .body {
  padding-right: 16px;
}

/* Kolom pekan lebih sempit: kurangi margin/padding daftar to-do supaya judulnya masih terbaca.
   Kiri-kanan disamakan - tombol centang ada di kepala kartu, bukan di baris to-do. */
.compact :deep(.todos) {
  margin: 0 8px 4px;
  padding: 2px 6px;
}

/* Di kolom pekan, tombol Fokus dan badge prioritas menghabiskan hampir seluruh lebar baris -
   sisakan checkbox + judul. Keduanya tetap ada di panel hari dan kartu tampilan Hari. */
.compact :deep(.todos .focus),
.compact :deep(.todos .badge) {
  display: none;
}

.line,
.head {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px 8px;
}

.line {
  flex: 1;
}

.head {
  padding-top: 3px;
}

.compact .head {
  flex-wrap: wrap;
}

.dot {
  width: 8px;
  height: 8px;
  flex-shrink: 0;
  border-radius: calc(3px * var(--rk));
  background: var(--ev-solid);
}

.size-tiny .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.glyph {
  width: 26px;
  height: 26px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-leaf-sm);
  background: var(--ev-solid);
  box-shadow: var(--shadow-icon-inset);
}

.glyph > span {
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: var(--border-thin) solid var(--outline);
  border-radius: calc(5px * var(--rk));
  background: var(--paper);
  font-weight: var(--fw-strong);
  font-size: 8px;
  transform: rotate(calc(-6deg * var(--bev)));
}

.text {
  flex: 1 1 0%;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.compact .text {
  flex-basis: 100%;
}

.title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: var(--fw-strong);
  font-size: 12.5px;
  line-height: 1.15;
}

.size-tiny .title {
  font-size: 10.5px;
  line-height: 1;
}

.title.clamp {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow-wrap: anywhere;
  font-size: 13px;
}

.event:not(.compact) .title.clamp {
  white-space: nowrap;
}

.time {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: var(--fw-body);
  font-size: 11px;
  color: var(--mute);
  font-variant-numeric: tabular-nums;
}

.size-tiny .time {
  font-size: 10px;
}

.more {
  flex-shrink: 0;
  padding: 2px 7px;
  border-radius: var(--radius-pill);
  background: var(--paper);
  color: var(--ink-2);
  font-weight: var(--fw-strong);
  font-size: 10px;
  white-space: nowrap;
}

.check {
  position: absolute;
  top: 8px;
  right: 6px;
  z-index: 4;
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: var(--border-thin) solid var(--outline);
  border-radius: 50%;
  background: var(--paper);
  color: var(--paper);
  font-weight: var(--fw-strong);
  font-size: 10px;
  line-height: 1;
}

.done .check {
  background: var(--ev-solid);
}

.size-small .check {
  top: calc(50% - 9px);
}

.size-tiny .check,
.compact .check {
  width: 14px;
  height: 14px;
  top: calc(50% - 7px);
}

.compact.size-big .check {
  top: 4px;
}

/* Geometri (top/right/tinggi) datang dari `focusPillStyle` sebagai style inline, jadi varian
   kartu pendek tidak mungkin kalah oleh urutan rule CSS. */
.focus {
  position: absolute;
  z-index: 4;
  box-shadow: 0 1px 0 rgb(47 42 36 / 0.18);
}

/* Lebih kecil dari pill "▶ Fokus" standar: harus muat di blok jadwal yang pendek. */
.event .focus {
  padding: 0 8px;
  font-size: 10.5px;
}

.handle {
  position: absolute;
  left: 0;
  right: 0;
  z-index: 3;
  height: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: ns-resize;
  touch-action: none;
}

.handle:hover {
  background: rgb(47 42 36 / 0.06);
}

.handle.top {
  top: -3px;
}

.handle.bottom {
  bottom: -3px;
}

.handle > span {
  width: 22px;
  height: 3px;
  border-radius: 2px;
  background: var(--ev-solid);
  opacity: 0.7;
}
</style>
