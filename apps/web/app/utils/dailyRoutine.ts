// Daily Routine (PRD F12 · Desktop.dc.html `dailyVals`). Fungsi murni; waktu selalu di-inject.

import type { IconName } from './icons'
import type { Task } from './tasks'
import { MS_PER_DAY, fromIsoDate } from './time'

export const ROUTINE_BLOCKS = ['pagi', 'siang', 'malam'] as const
export type RoutineBlock = (typeof ROUTINE_BLOCKS)[number]

/** Blok waktu: jam mulai–akhir (eksklusif), warna tile, ikon (design META). */
export const ROUTINE_BLOCK_META: Record<
  RoutineBlock,
  { from: number; to: number; color: string; icon: IconName }
> = {
  pagi: { from: 5, to: 12, color: '--icon-home', icon: 'sun' },
  siang: { from: 12, to: 18, color: '--icon-overview', icon: 'cloud-sun' },
  malam: { from: 18, to: 24, color: '--cat-diri', icon: 'moon' },
}

/** Dini hari (00–04) masih dihitung blok pagi, sama seperti design. */
export function blockOf(hour: number): RoutineBlock {
  if (hour < ROUTINE_BLOCK_META.siang.from) return 'pagi'
  if (hour < ROUTINE_BLOCK_META.malam.from) return 'siang'
  return 'malam'
}

export interface RoutineStep {
  id: string
  title: string
  block: RoutineBlock
}

export const WEATHER_KINDS = ['cerah', 'berawan', 'mendung', 'hujan'] as const
export type WeatherKind = (typeof WEATHER_KINDS)[number]

export const WEATHER_META: Record<WeatherKind, { icon: IconName; color: string }> = {
  cerah: { icon: 'sun', color: '#E6A800' },
  berawan: { icon: 'cloud-sun', color: '#E07A10' },
  mendung: { icon: 'cloud', color: '#6B7A90' },
  hujan: { icon: 'cloud-rain', color: '#0A55E6' },
}

// ---- Prioritas -----------------------------------------------------------------------

/** Daftar panjang dilipat di "Lihat N lagi" setelah sekian item (PRD F12), bukan dipotong. */
export const PRIORITY_VISIBLE_COUNT = 7

/** Asal item prioritas: kuadran Penting & Mendesak (F3) atau prioritas urgent (F2). */
export type PriorityOrigin = 'quadrant' | 'urgent'

export interface PriorityTask {
  task: Task
  origin: PriorityOrigin
}

function byDeadline(a: Task, b: Task): number {
  return (a.deadline ?? Number.MAX_SAFE_INTEGER) - (b.deadline ?? Number.MAX_SAFE_INTEGER)
}

/**
 * Prioritas hari ini (PRD F12), tanpa batas jumlah: task kuadran Penting & Mendesak dulu, lalu
 * task urgent di luar kuadran itu; tiap grup urut deadline (tanpa deadline di akhir grup).
 * Task selesai hanya ikut kalau dicentang hari ini (`checkedIds`), supaya tampil dicoret.
 */
export function dailyPriorities(
  tasks: readonly Task[],
  checkedIds: readonly string[],
): PriorityTask[] {
  const checked = new Set(checkedIds)
  const shown = tasks.filter((task) => !task.done || checked.has(task.id))
  const quadrant = shown.filter((task) => task.quadrant === 'do').sort(byDeadline)
  const urgent = shown
    .filter((task) => task.quadrant !== 'do' && task.priority === 'urgent')
    .sort(byDeadline)
  return [
    ...quadrant.map((task) => ({ task, origin: 'quadrant' as const })),
    ...urgent.map((task) => ({ task, origin: 'urgent' as const })),
  ]
}

// ---- To-do hari ini -------------------------------------------------------------------

/** Widget tetap ringkas; sisanya di halaman To-do. */
export const TODAY_TASK_LIMIT = 10

export interface TodayTask {
  task: Task
  /** Belum selesai dan deadline sudah lewat. */
  isOverdue: boolean
}

function isDueToday(task: Task, start: number, end: number): boolean {
  return task.deadline !== null && task.deadline < end && (!task.done || task.deadline >= start)
}

/**
 * To-do hari ini (PRD F12): deadline hari ini + terlambat yang belum selesai, plus task yang
 * ditambah dari Daily Routine hari ini (`addedIds`, boleh tanpa deadline - design `addedOn`).
 * Task yang sudah tampil di Prioritas tidak diulang; yang selesai hari ini tetap tampil dicoret.
 * Satu daftar tanpa grup, urutan tetap, supaya baris tidak pindah saat dicentang.
 */
export function todayTasks(
  tasks: readonly Task[],
  excludeIds: readonly string[],
  addedIds: readonly string[],
  today: string,
  now: number,
): TodayTask[] {
  const start = fromIsoDate(today).getTime()
  const end = start + MS_PER_DAY
  const excluded = new Set(excludeIds)
  const added = new Set(addedIds)
  return tasks
    .filter(
      (task) => !excluded.has(task.id) && (added.has(task.id) || isDueToday(task, start, end)),
    )
    .slice(0, TODAY_TASK_LIMIT)
    .map((task) => ({
      task,
      isOverdue: !task.done && task.deadline !== null && task.deadline < now,
    }))
}

// ---- Progres hari ---------------------------------------------------------------------

export interface Progress {
  done: number
  total: number
  percent: number
}

export function sumProgress(parts: readonly { done: number; total: number }[]): Progress {
  const done = parts.reduce((sum, part) => sum + part.done, 0)
  const total = parts.reduce((sum, part) => sum + part.total, 0)
  return { done, total, percent: total ? Math.round((done / total) * 100) : 0 }
}

/** Selisih menit → jam + sisa menit (untuk "1 jam 20 mnt lagi"). */
export function splitMinutes(minutes: number): { hours: number; minutes: number } {
  const safe = Math.max(0, Math.round(minutes))
  return { hours: Math.floor(safe / 60), minutes: safe % 60 }
}
