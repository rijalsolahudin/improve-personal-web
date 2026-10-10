import { describe, expect, it } from 'vitest'

import {
  applyGoalDraft,
  chapterProgress,
  chapterStatus,
  draftFromGoal,
  emptyGoalDraft,
  extendChapter,
  focusChapterIndex,
  goalProgress,
  nextChapterDraft,
  shiftChapter,
  toggleTaskItem,
  validateGoalDraft,
  type Chapter,
  type Goal,
  type GoalDraft,
  type GoalItem,
} from './goals'
import { addDays, daysBetween } from './time'

const TODAY = '2026-10-09'
const task = (id: string, done: boolean): GoalItem => ({
  id,
  kind: 'task',
  title: id,
  meta: '',
  done,
  rate: 0,
})
const habit = (id: string, rate: number): GoalItem => ({
  id,
  kind: 'habit',
  title: id,
  meta: '',
  done: false,
  rate,
})
const chapter = (overrides: Partial<Chapter> = {}): Chapter => ({
  id: 'c1',
  title: 'Bab',
  start: '2026-10-01',
  end: '2026-10-31',
  isManualDone: false,
  isClosed: false,
  items: [],
  ...overrides,
})
const goal = (overrides: Partial<Goal> = {}): Goal => ({
  id: 'g1',
  title: 'Goal',
  why: '',
  category: 'karier',
  status: 'aktif',
  start: '2026-09-01',
  end: '2026-12-31',
  cover: null,
  along: [],
  chapters: [],
  ...overrides,
})

describe('tanggal', () => {
  it('addDays & daysBetween lintas bulan/tahun', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02')
    expect(daysBetween('2026-10-01', '2026-10-31')).toBe(30)
  })
})

describe('progres', () => {
  it('chapter = rata-rata item; task 0/100, habit pakai rate; manual = 100', () => {
    const c = chapter({ items: [task('a', true), task('b', false), habit('h', 40)] })
    expect(chapterProgress(c)).toBe(47)
    expect(chapterProgress({ ...c, isManualDone: true })).toBe(100)
    expect(chapterProgress(chapter())).toBe(0)
  })

  it('goal tanpa chapter = item langsung; dengan chapter = rata-rata chapter + Sepanjang goal', () => {
    expect(goalProgress(goal({ along: [habit('h', 80), task('t', false)] }))).toBe(40)
    const withChapters = goal({
      along: [habit('h', 100)],
      chapters: [chapter({ isManualDone: true }), chapter({ id: 'c2', items: [task('t', false)] })],
    })
    expect(goalProgress(withChapters)).toBe(67)
  })
})

describe('status chapter', () => {
  it('belum mulai / berjalan / selesai / terlewat / ditutup', () => {
    expect(chapterStatus(chapter({ start: '2026-10-10' }), TODAY)).toBe('belum-mulai')
    expect(chapterStatus(chapter(), TODAY)).toBe('berjalan')
    expect(chapterStatus(chapter({ isManualDone: true }), TODAY)).toBe('selesai')
    const past = chapter({ start: '2026-09-01', end: '2026-09-30' })
    expect(chapterStatus({ ...past, items: [task('a', true)] }, TODAY)).toBe('selesai')
    expect(chapterStatus({ ...past, items: [task('a', false)] }, TODAY)).toBe('terlewat')
    expect(chapterStatus({ ...past, isClosed: true }, TODAY)).toBe('ditutup')
  })

  it('chapter fokus = terlewat/berjalan pertama', () => {
    const g = goal({
      chapters: [
        chapter({ id: 'done', end: '2026-09-30', start: '2026-09-01', isManualDone: true }),
        chapter({ id: 'run' }),
      ],
    })
    expect(focusChapterIndex(g, TODAY)).toBe(1)
  })

  it('perpanjang +14 hari dari hari ini; geser periode menjaga panjang', () => {
    const c = chapter({ start: '2026-09-01', end: '2026-09-11' })
    expect(extendChapter(c, TODAY).end).toBe('2026-10-23')
    expect(shiftChapter(c, TODAY)).toMatchObject({ start: TODAY, end: '2026-10-19' })
  })

  it('centang cuma berlaku untuk task', () => {
    const items = toggleTaskItem([task('t', false), habit('h', 10)], 't')
    expect(items[0]?.done).toBe(true)
    expect(toggleTaskItem(items, 'h')[1]).toEqual(habit('h', 10))
  })
})

describe('form goal', () => {
  const valid = (): GoalDraft => ({
    ...emptyGoalDraft(TODAY),
    title: 'Lari 10K',
    chapters: [{ key: 'k', sourceId: null, title: 'Base', start: TODAY, end: addDays(TODAY, 10) }],
  })

  it('validasi berurutan', () => {
    expect(validateGoalDraft(valid())).toBeNull()
    expect(validateGoalDraft({ ...valid(), title: '   ' })).toBe('titleRequired')
    expect(validateGoalDraft({ ...valid(), title: 'x'.repeat(121) })).toBe('titleTooLong')
    expect(validateGoalDraft({ ...valid(), end: addDays(TODAY, -1) })).toBe('dateOrder')
    expect(validateGoalDraft({ ...valid(), start: 'bukan-tanggal' })).toBe('dateOrder')
    const [row] = valid().chapters
    if (!row) throw new Error('draft tanpa chapter')
    expect(validateGoalDraft({ ...valid(), chapters: [{ ...row, title: '' }] })).toBe(
      'chapterTitle',
    )
    expect(
      validateGoalDraft({ ...valid(), chapters: [{ ...row, end: addDays(TODAY, 200) }] }),
    ).toBe('chapterRange')
  })

  it('chapter baru mulai dari akhir chapter terakhir', () => {
    const draft = valid()
    expect(nextChapterDraft(draft, 'k2')).toMatchObject({
      start: addDays(TODAY, 10),
      end: draft.end,
      sourceId: null,
    })
  })

  it('edit: isi chapter dipertahankan, item chapter yang dihapus pindah ke Sepanjang goal', () => {
    const base = goal({
      cover: 'hewan/kelinci',
      along: [habit('h', 50)],
      chapters: [
        chapter({ id: 'keep', items: [task('a', true)], isManualDone: true }),
        chapter({ id: 'drop', items: [task('b', false)] }),
      ],
    })
    const draft = draftFromGoal(base)
    draft.title = '  Judul baru  '
    draft.chapters = draft.chapters.filter((row) => row.sourceId === 'keep')

    const saved = applyGoalDraft(draft, base, () => 'new')
    expect(saved).toMatchObject({ id: 'g1', title: 'Judul baru', cover: 'hewan/kelinci' })
    expect(saved.chapters).toHaveLength(1)
    expect(saved.chapters[0]).toMatchObject({ id: 'keep', isManualDone: true })
    expect(saved.along.map((item) => item.id)).toEqual(['h', 'b'])
  })

  it('goal baru dapat id baru dan tanpa item', () => {
    const saved = applyGoalDraft(valid(), null, () => 'baru')
    expect(saved).toMatchObject({ id: 'baru', along: [], cover: null })
    expect(saved.chapters[0]?.id).toBe('baru')
  })
})
