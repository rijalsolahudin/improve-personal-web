<script setup lang="ts">
import { memoPapers } from '@improve-personal/tokens'

import {
  MEMO_TEXT_MAX,
  MEMO_TITLE_MAX,
  goalMentionQuery,
  insertGoalMention,
  insertMention,
  mentionQuery,
  wordCount,
} from '~/utils/memo'
import type { MentionKind, RichFormatTarget } from '~/utils/memo/richtext'
import { SCHEDULE_COLORS, occurrencesOn } from '~/utils/schedule'
import { addDays, fromIsoDate } from '~/utils/time'

/** Halaman tulis jurnal untuk tanggal `day` (design: kertas bergaris + selotip). */
const { day } = defineProps<{ day: string }>()

/** Rentang jadwal yang ditawarkan saat mengetik `@` (design: ±2 hari dari tanggal memo). */
const SUGGEST_RANGE_DAYS = 2
const SUGGEST_LIMIT = 6
/** Jeda setelah ketikan terakhir sebelum autosave (PRD F8: tulisan tersimpan otomatis). */
const AUTOSAVE_DELAY_MS = 1200
const PROMPT_KEYS = ['smile', 'mind', 'proud', 'tomorrow'] as const

const { t } = useI18n()
const memos = useMemos()
const { schedules, findSchedule } = useSchedules()
const { goals, findGoal } = useGoals()
const { longDate, shortDate } = useDateFormat()

const { draft, hold, isDirty, load, prepareSave, release, showDay, unchangedSince } = useMemoDraft()
const paper = computed({
  get: () => memos.paper.value,
  set: (value) => memos.setPaper(value),
})
const paperStyle = computed(() => {
  const stock = memoPapers[paper.value]
  return {
    '--memo-bg': stock.bg,
    '--memo-line': stock.line,
    '--memo-margin': stock.margin,
    '--memo-ink': stock.ink,
  }
})

const { isFocus, enter: enterFocus, exit: exitFocus } = useFocusMode()
/** Kertas rich text (dimuat lazy); `null` sampai editornya siap, toolbar format menunggu itu. */
const richPaper = useTemplateRef<RichFormatTarget>('richPaper')
const formatTarget = computed(() => richPaper.value ?? null)

function mentionLabel(kind: MentionKind, id: string): string {
  return kind === 'goal'
    ? (findGoal(id)?.title ?? t('memo.deletedGoal'))
    : (findSchedule(id)?.title ?? t('memo.deletedSchedule'))
}
/** Bar atas mode fokus memudar selama mengetik; gerakan mouse memunculkannya lagi. */
const isQuiet = ref(false)

function openFocus(): void {
  openTool.value = null
  isQuiet.value = false
  void enterFocus()
}
const words = computed(() => wordCount(draft.value.text))
const query = computed(() => mentionQuery(draft.value.text))
const suggestions = computed(() => {
  const q = query.value
  if (q === null) return []
  const seen = new Set<string>()
  const result = []
  for (let offset = -SUGGEST_RANGE_DAYS; offset <= SUGGEST_RANGE_DAYS; offset += 1) {
    const date = addDays(day, offset)
    for (const occurrence of occurrencesOn(schedules.value, date)) {
      const { schedule } = occurrence
      if (seen.has(schedule.id) || !schedule.title.toLowerCase().includes(q.toLowerCase())) continue
      seen.add(schedule.id)
      result.push({
        id: schedule.id,
        title: schedule.title,
        color: (SCHEDULE_COLORS[schedule.color] ?? SCHEDULE_COLORS[0])[0],
        when: `${shortDate(fromIsoDate(date).getTime())} · ${schedule.time}`,
      })
    }
  }
  return result.slice(0, SUGGEST_LIMIT)
})

/** Autocomplete `#`: goal aktif + chapter-nya (PRD F13 "Journal"). */
const goalQuery = computed(() => goalMentionQuery(draft.value.text))
const goalSuggestions = computed(() => {
  const q = goalQuery.value
  if (q === null) return []
  const needle = q.toLowerCase()
  return goals.value
    .filter((goal) => goal.status === 'aktif')
    .flatMap((goal) => [
      { id: goal.id, title: goal.title, detail: t('goals.along') },
      ...goal.chapters.map((chapter) => ({
        id: goal.id,
        title: chapter.title,
        detail: goal.title,
      })),
    ])
    .filter((item) => item.title.toLowerCase().includes(needle))
    .slice(0, SUGGEST_LIMIT)
})

function addPrompt(key: (typeof PROMPT_KEYS)[number]): void {
  const prompt = t(`memo.prompt.${key}`).replace('…', ' ')
  const current = draft.value.text.trimEnd()
  draft.value.text = current ? `${current}\n\n${prompt}` : prompt
}

const saving = ref(false)
/** Halaman tanggal ini sudah tersimpan otomatis setidaknya sekali sejak dibuka. */
const hasSaved = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined

/**
 * Satu halaman per tanggal (PRD F8): saat tanggal berganti, editor menampilkan isi halaman tanggal
 * itu supaya "simpan" = perbarui halaman yang sama, bukan menimpa tulisan lama dengan draf kosong.
 */
watch(
  () => day,
  (next, previous) => {
    // Ketikan tanggal sebelumnya yang masih menunggu jeda autosave disimpan dulu, selagi draf di
    // editor masih milik tanggal itu.
    if (previous !== undefined) flush(previous)
    hasSaved.value = false
    showDay(next, memos.memoOn(next))
  },
  { immediate: true },
)

/**
 * Halaman tersimpan bisa datang belakangan (hidrasi repository setelah editor mount) atau berubah
 * di luar editor (kartu review goal). `showDay` untuk tanggal yang sama hanya merekonsiliasi, jadi
 * draf yang sedang diketik tidak tertimpa - tetapi halaman yang baru dimuat ikut tampil.
 */
watch(
  () => memos.memoOn(day),
  (page, previous) => {
    showDay(day, page)
    // Halaman yang dihapus/dikosongkan sudah tidak punya tulisan tertunda: lepas tahanan drafnya
    // supaya banner & "Coba lagi" tidak nyangkut setelah tombol hapus (BUG-71-02). Kalau pengosongan
    // gagal (masih `unsaved`), tahanan tetap sampai tulisannya terkonfirmasi.
    if (page === null && previous !== null && previous.date === day && !memos.hasUnsaved(day)) {
      release(day)
    }
  },
)

/** Tulisan tanggal ini pernah gagal: tampilkan "belum tersimpan" + tombol coba lagi. */
const saveFailed = computed(() => memos.hasUnsaved(day))

/**
 * Simpan halaman. Draf ditahan sampai tulisannya benar-benar terkonfirmasi (BUG-65-01): kalau
 * penyimpanan gagal (quota penuh, IndexedDB diblokir, kunci hilang), teks user tetap ada di draf,
 * banner error muncul, dan tombol "coba lagi" memakai jalur yang sama.
 */
async function save(target = day): Promise<void> {
  clearTimeout(timer)
  timer = undefined
  // Tulisan sebelumnya masih berjalan: `finally` di bawah menjadwalkan ulang kalau draf masih kotor.
  if (saving.value) return

  // BUG-54-01: halaman ini juga ditulis penulis lain (kartu review goal). Ambil nilai yang sudah
  // digabung dengan halaman terkini supaya simpan tidak menghapus catatan yang masuk di sela-selanya.
  const values = prepareSave(target, memos.memoOn(target))
  hold(target)
  saving.value = true
  try {
    // Isi dihapus = halaman dikosongkan; judul yang tersisa tetap disimpan (record, mood, dan
    // sticker tetap ada).
    const page = values.text.trim()
      ? memos.save({ date: target, ...values, paper: paper.value })
      : memos.clear(target, values)
    if (page === null) {
      release(target)
      return
    }
    if (!(await memos.waitForSave(page.id))) return

    // BUG-71-03: textarea tetap bisa diketik selama menunggu tulis. Kalau draf tanggal ini sudah
    // berubah, `load` akan menimpa ketikan itu dengan versi yang lebih lama. Hanya segarkan editor
    // (dan buang draf) bila isinya masih sama dengan yang tadi dikirim; kalau berubah, ketikan user
    // dipertahankan bersama drafnya dan tinggal disimpan lagi. `release` tetap dipanggil supaya
    // tahanan draf tidak menggantung; draf yang berbeda dari halaman tidak ikut dibuang.
    if (unchangedSince(target, values)) load(memos.memoOn(target) ?? page, target)
    release(target)
    if (target === day) hasSaved.value = true
  } finally {
    saving.value = false
    if (isDirty(day) && !memos.hasUnsaved(day)) schedule()
  }
}

function schedule(): void {
  clearTimeout(timer)
  timer = setTimeout(() => void save(), AUTOSAVE_DELAY_MS)
}

/** Fokus keluar dari kertas: simpan tanpa menunggu jeda supaya ketikan tidak menggantung. */
function saveOnLeave(): void {
  if (isDirty(day)) void save()
}

/** Simpan sekarang kalau ada ketikan yang masih menunggu jeda autosave. */
function flush(target: string): void {
  if (timer === undefined) return
  void save(target)
}

watch(
  draft,
  () => {
    if (isDirty(day)) schedule()
  },
  { deep: true },
)

onBeforeUnmount(() => flush(day))

/** Panel di bawah kertas yang sedang terbuka; satu per waktu supaya kertas tetap lapang. */
const openTool = ref<'prompts' | 'paper' | null>(null)
function toggleTool(tool: 'prompts' | 'paper'): void {
  openTool.value = openTool.value === tool ? null : tool
}

const saveStatus = computed(() => {
  if (saving.value) return 'saving'
  return hasSaved.value && !isDirty(day) ? 'saved' : 'idle'
})
</script>

<template>
  <!-- Mode fokus memindah kertas ke `body` supaya lapisan penuh layar tidak terpotong layout. -->
  <Teleport to="body" :disabled="!isFocus">
    <section
      class="sheet"
      :class="{ focus: isFocus }"
      data-anchor="memo-editor"
      data-anchor-kind="content"
      aria-labelledby="memo-editor-title"
      @focusout="saveOnLeave"
      @keydown="isQuiet = isFocus"
      @mousemove="isQuiet = false"
    >
      <Tape
        v-if="!isFocus"
        :width="120"
        :top="-15"
        :left="'50%'"
        :height="28"
        :radius="4"
        :rotate="-3"
        translate="-50%"
      />
      <div v-if="!isFocus" class="pad">
        <MemoSheetHead :day="day">
          <!-- Tanggal sudah tampil di kartu hari di atas; judul ini hanya untuk pembaca layar. -->
          <h2 id="memo-editor-title" class="visually-hidden">
            {{ longDate(fromIsoDate(day).getTime()) }}
          </h2>
        </MemoSheetHead>
      </div>
      <div v-if="!isFocus" class="tools">
        <MemoFormatBar :target="formatTarget" />
        <button
          type="button"
          class="tool"
          :aria-expanded="openTool === 'prompts'"
          @click="toggleTool('prompts')"
        >
          {{ $t('memo.promptsLabel') }}
        </button>
        <button
          type="button"
          class="tool"
          :aria-expanded="openTool === 'paper'"
          @click="toggleTool('paper')"
        >
          {{ $t('memo.paperToggle') }}
        </button>
        <button type="button" class="tool" @click="openFocus">
          {{ $t('memo.focus') }}
        </button>
        <p class="meta">
          <span id="memo-hint">{{ $t('memo.wordsHint', { n: words }) }}</span>
          ·
          <span role="status">{{ $t(`memo.autosave.${saveStatus}`) }}</span>
        </p>
      </div>
      <MemoPaperPicker v-if="!isFocus && openTool === 'paper'" v-model="paper" class="tool-panel" />
      <div v-if="!isFocus && openTool === 'prompts'" class="tool-panel prompts">
        <button
          v-for="key in PROMPT_KEYS"
          :key="key"
          type="button"
          class="prompt"
          @click="addPrompt(key)"
        >
          {{ $t(`memo.prompt.${key}`) }}
        </button>
      </div>
      <div class="page" :style="paperStyle">
        <header v-if="isFocus" class="focus-bar" :class="{ quiet: isQuiet }">
          <h2 id="memo-editor-title" class="focus-date">
            {{ longDate(fromIsoDate(day).getTime()) }}
          </h2>
          <MemoFormatBar :target="formatTarget" />
          <div class="focus-end">
            <p class="meta">
              <span id="memo-hint">{{ $t('memo.wordsHint', { n: words }) }}</span>
              ·
              <span role="status">{{ $t(`memo.autosave.${saveStatus}`) }}</span>
            </p>
            <button type="button" class="tool" @click="exitFocus">
              {{ $t('memo.focusExit') }}
            </button>
          </div>
        </header>
        <Input
          v-model="draft.title"
          variant="bare"
          class="title-input"
          :maxlength="MEMO_TITLE_MAX"
          :placeholder="$t('memo.titlePlaceholder')"
          :aria-label="$t('memo.titleLabel')"
        />
        <LazyMemoRichPaper
          ref="richPaper"
          v-model="draft.text"
          :paper="paper"
          :placeholder="$t('memo.placeholder')"
          :label="$t('memo.textLabel')"
          described-by="memo-hint"
          :maxlength="MEMO_TEXT_MAX"
          :mention-label="mentionLabel"
        />
      </div>
      <div
        v-if="suggestions.length"
        class="suggest"
        role="listbox"
        :aria-label="$t('memo.mentionTitle')"
      >
        <p class="eyebrow suggest-title">{{ $t('memo.mentionTitle') }}</p>
        <button
          v-for="item in suggestions"
          :key="item.id"
          type="button"
          role="option"
          class="suggest-item"
          :aria-selected="false"
          @click="draft.text = insertMention(draft.text, item.id)"
        >
          <span class="dot" :style="{ background: item.color }" aria-hidden="true" />
          <span class="suggest-name">{{ item.title }}</span>
          <span class="suggest-when">{{ item.when }}</span>
        </button>
      </div>
      <div
        v-if="goalSuggestions.length"
        class="suggest"
        role="listbox"
        :aria-label="$t('memo.goalMentionTitle')"
      >
        <p class="eyebrow suggest-title">{{ $t('memo.goalMentionTitle') }}</p>
        <button
          v-for="(item, index) in goalSuggestions"
          :key="`${item.id}-${index}`"
          type="button"
          role="option"
          class="suggest-item"
          :aria-selected="false"
          @click="draft.text = insertGoalMention(draft.text, item.id)"
        >
          <span class="dot" aria-hidden="true" />
          <span class="suggest-name">{{ item.title }}</span>
          <span class="suggest-when">{{ item.detail }}</span>
        </button>
      </div>

      <div v-if="saveFailed" class="bottom">
        <p class="save-error" role="alert">
          <span>{{ $t('memo.saveFailed') }}</span>
          <button type="button" class="retry" :disabled="saving" @click="save()">
            {{ $t('memo.retry') }}
          </button>
        </p>
      </div>
    </section>
  </Teleport>
</template>

<style scoped>
/*
 * Design v2 (`a45`): kertas tulis adalah kartu diam - garis tipis `--line` tanpa bayangan
 * keras; bayangan 6px hanya dipakai dropdown saran (`mm.showSuggest`).
 */
.sheet {
  position: relative;
  margin-top: var(--space-10);
  /* Atas lebih tipis dari samping: tinggi baris judul tulisan tangan sudah menambah jarak sendiri. */
  padding: var(--space-20) 0 var(--space-18);
  border: var(--border-thin) solid var(--line);
  border-radius: calc(28px * var(--rk));
  background: var(--paper-2);
}

.pad {
  padding: 0 var(--space-28);
}

/*
 * Toolbar di antara kepala dan kertas, menempel di atas layar saat kertas di-scroll: sepanjang apa
 * pun tulisannya, pancingan, poin refleksi, fokus, dan status simpan tetap terjangkau.
 */
.tools {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  margin-top: var(--space-20);
  padding: var(--space-6) var(--space-28) var(--space-6) var(--space-64);
  border-block: var(--border-thin) solid var(--line);
  background: var(--paper-2);
}

/* Tombol teks polos, tanpa bingkai: toolbar terbaca sebagai satu baris, bukan deretan pil. */
.tool {
  padding: var(--space-4) var(--space-10);
  border: none;
  border-radius: var(--radius-pill);
  background: none;
  color: var(--mute-2);
  font-weight: var(--fw-strong);
  font-size: var(--fs-12);
}

.tool:hover,
.tool[aria-expanded='true'] {
  background: var(--alt);
  color: var(--ink);
}

/* Grup format dipisah dari tombol lain cukup lewat garis tipis, bukan bingkai. */
.tools > .formats {
  margin-right: var(--space-8);
  padding-right: var(--space-8);
  border-right: var(--border-thin) solid var(--line);
}

.meta {
  margin-left: auto;
  font-weight: var(--fw-strong);
  font-size: var(--fs-12);
  color: var(--mute-3);
}

.tool-panel {
  padding: var(--space-10) var(--space-28) var(--space-10) var(--space-64);
}

/* Lapisan fokus: latar redup + satu lembar kertas selebar 90% layar di tengah. */
.focus {
  position: fixed;
  inset: 0;
  z-index: 150;
  margin: 0;
  padding: var(--space-32);
  overflow-y: auto;
  border: none;
  border-radius: 0;
  background: color-mix(in srgb, var(--bg) 90%, var(--ink));
}

.focus .page {
  width: 90vw;
  max-width: 100%;
  /* Kertas sampai dasar layar: tinggi viewport dikurangi jarak tepi lapisan. */
  min-height: calc(100dvh - 2 * var(--space-32));
  display: flex;
  flex-direction: column;
  margin: 0 auto;
  /* `clip`, bukan `hidden`: `hidden` menjadikan kartu wadah scroll sehingga kepala kertas tidak bisa menempel. */
  overflow: clip;
  border: var(--border-thin) solid var(--line);
  border-radius: calc(20px * var(--rk));
  background: var(--memo-bg);
  box-shadow: 0 24px 60px rgb(47 42 36 / 0.18);
}

.focus .title-input {
  padding-top: var(--space-24);
  font-size: var(--fs-hand-30);
}

.focus :deep(.paper) {
  flex: 1;
  border-bottom: none;
  font-size: var(--fs-hand-22);
}

/*
 * Kepala kertas di mode fokus: strip di atas lembar (bukan bar mengambang di latar redup), tanggal
 * kiri - format tengah - status & keluar kanan. Menempel saat kertas di-scroll.
 */
.focus-bar {
  position: sticky;
  top: 0;
  z-index: 2;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: var(--space-16);
  padding: var(--space-12) var(--space-24);
  border-bottom: var(--border-thin) dashed var(--mline);
  background: var(--memo-bg);
  transition: opacity 0.3s;
}

.focus-bar.quiet {
  opacity: 0.45;
}

.focus-bar:hover,
.focus-bar:focus-within {
  opacity: 1;
}

.focus-end {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-12);
}

.focus-date {
  font-family: var(--font-hand);
  /* Patrick Hand hanya punya weight 400; judul mewarisi weight tebal → faux-bold. */
  font-weight: 400;
  font-size: var(--fs-hand-22);
  color: var(--ink-2);
}

.focus-bar .meta {
  margin-left: 0;
}

.title-input {
  display: block;
  width: 100%;
  border: none;
  outline: none;
  color: var(--memo-ink);
  font-family: var(--font-hand);
  /* Patrick Hand hanya punya weight 400; input mewarisi `--fw-body` (700) → faux-bold. */
  font-weight: 400;
  background-color: var(--memo-bg);
  padding: var(--space-14) var(--space-28) 2px var(--space-64);
  font-size: var(--fs-hand-26);
  background-image: linear-gradient(
    90deg,
    transparent 48px,
    var(--memo-margin) 48px,
    var(--memo-margin) 50px,
    transparent 50px
  );
}

.suggest {
  margin: var(--space-4) var(--space-28) 0 var(--space-64);
  padding: var(--space-6);
  border: var(--border) solid var(--outline);
  border-radius: var(--radius-row);
  background: var(--paper);
  box-shadow: calc(6px * var(--sx)) calc(6px * var(--sy)) calc(6px * var(--sbl))
    var(--shadow-color, rgb(47 42 36 / 0.12));
}

.suggest-title {
  padding: var(--space-4) var(--space-8);
  color: var(--mute-3);
}

.suggest-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: var(--space-8);
  padding: var(--space-8) var(--space-10);
  border: none;
  border-radius: var(--radius-inner);
  background: none;
  font-weight: var(--fw-strong);
  font-size: var(--fs-14);
  text-align: left;
}

.suggest-item:hover {
  background: var(--alt);
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: calc(3px * var(--rk));
}

.suggest-name {
  flex: 1;
}

.suggest-when {
  font-weight: var(--fw-body);
  font-size: var(--fs-12);
  color: var(--mute);
}

.prompts {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-6);
}

.prompt {
  padding: var(--space-4) var(--space-12);
  border: none;
  border-radius: var(--radius-pill);
  background: var(--alt);
  color: var(--ink-2);
  font-family: var(--font-hand);
  /* Patrick Hand hanya punya weight 400; tombol mewarisi `--fw-body` (700) → faux-bold. */
  font-weight: 400;
  font-size: var(--fs-hand-15);
}

.prompt:hover {
  background: var(--chip);
}

.bottom {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-12);
  padding: var(--space-16) var(--space-28) 0;
}

.save-error {
  flex: 1 0 100%;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-8);
  padding: var(--space-10) var(--space-12);
  border: var(--border-thin) solid var(--danger);
  border-radius: var(--radius-row);
  color: var(--danger);
  font-weight: var(--fw-strong);
  font-size: var(--fs-13);
}

.retry {
  padding: var(--space-4) var(--space-12);
  border: var(--border-thin) solid currentcolor;
  border-radius: var(--radius-pill);
  background: none;
  color: inherit;
  font-weight: var(--fw-strong);
  font-size: var(--fs-13);
}

@media (max-width: 599px) {
  .pad,
  .bottom {
    padding-inline: var(--space-16);
  }

  .title-input {
    padding-left: var(--space-56);
    padding-right: var(--space-16);
  }

  .tools,
  .tool-panel,
  .suggest {
    margin-left: 0;
    padding-left: var(--space-16);
  }
}
</style>
