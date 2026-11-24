import { describe, expect, it } from 'vitest'

import {
  chapterProgress,
  chapterStatus,
  goalProgress,
  type Chapter,
  type Goal,
  type GoalItem,
} from './goals.ts'

/**
 * Angka halaman Goals (T18): progress chapter/main goal dan status stepper. Nilai yang diharapkan
 * ditulis eksplisit (hasil aturan `calc/goal.ts`: rata-rata per tipe, pembulatan 1 desimal, chapter
 * kosong 0%), supaya web dan mobile yang memakai modul ini tidak bisa menyimpang diam-diam.
 */

const PERIOD = { start: '2026-01-05', end: '2026-01-11' }
const TODAY = '2026-02-15'

function task(id: string, done: boolean): GoalItem {
  return { id, kind: 'task', title: id, meta: '', done, rate: 0 }
}

function habit(id: string, rate: number): GoalItem {
  return { id, kind: 'habit', title: id, meta: '', done: false, rate }
}

function chapter(patch: Partial<Chapter> = {}): Chapter {
  return {
    id: 'c1',
    title: 'Base building',
    start: PERIOD.start,
    end: PERIOD.end,
    isManualDone: false,
    isClosed: false,
    items: [],
    ...patch,
  }
}

function goal(chapters: Chapter[], along: GoalItem[] = []): Goal {
  return {
    id: 'g1',
    title: 'Lari 10K',
    why: 'Sehat',
    category: 'kesehatan',
    status: 'aktif',
    start: PERIOD.start,
    end: PERIOD.end,
    cover: null,
    along,
    chapters,
  }
}

const MIXED_ITEMS = [task('t1', true), task('t2', false), habit('h1', 100)]

describe('progress chapter', () => {
  it('2 task (1 selesai) + 1 habit 100% -> rata-rata per tipe (50 + 100) / 2', () => {
    expect(chapterProgress(chapter({ items: MIXED_ITEMS }))).toBe(75)
  })

  it('3 task (1 selesai) -> dibulatkan 1 desimal, bukan bilangan bulat', () => {
    const items = [task('t1', true), task('t2', false), task('t3', false)]
    expect(chapterProgress(chapter({ items }))).toBe(33.3)
  })
})

describe('progress main goal & Sepanjang Goal', () => {
  it('chapter berisi + chapter kosong berbobot sama', () => {
    const web = goal([
      chapter({ items: MIXED_ITEMS }),
      chapter({ id: 'c2', title: 'Pemulihan', items: [] }),
    ])
    expect(goalProgress(web)).toBe(37.5)
  })

  it('Sepanjang goal (item langsung ke main goal) memakai rata-rata per tipe', () => {
    expect(goalProgress(goal([], MIXED_ITEMS))).toBe(75)
  })
})

describe('status chapter stepper', () => {
  it('chapter kosong yang sudah lewat tanggal = terlewat (bukan selesai)', () => {
    expect(chapterStatus(chapter({ items: [] }), TODAY)).toBe('terlewat')
  })

  it('chapter ditutup menang atas tanggal', () => {
    expect(chapterStatus(chapter({ isClosed: true, items: MIXED_ITEMS }), TODAY)).toBe('ditutup')
  })

  it('chapter selesai manual di dalam periode = selesai', () => {
    expect(chapterStatus(chapter({ isManualDone: true }), '2026-01-07')).toBe('selesai')
  })

  it('chapter selesai manual sebelum periode mulai = selesai, bukan belum mulai', () => {
    expect(chapterStatus(chapter({ isManualDone: true }), '2026-01-01')).toBe('selesai')
  })
})
