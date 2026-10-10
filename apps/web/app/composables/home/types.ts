import type { MemoPaperName } from '@improve-personal/tokens'

import type { Task } from '~/utils/tasks'
import type { GoalCategory } from '~/utils/goals'

/**
 * View model widget Home. Sementara didefinisikan di web; begitu packages/core punya
 * entitas Todo/Habit/Goal/Schedule/Countdown, tipe ini diturunkan dari sana.
 */

export type { Priority } from '~/utils/tasks'

export type { GoalCategory }

/** Task di widget Home = task dari store bersama (F2). */
export type HomeTask = Task

export interface HomeHabit {
  id: string
  name: string
  /** Warna tile saat sudah dicentang. */
  color: string
  /** Streak sebelum hari ini. */
  streak: number
  done: boolean
}

export interface HomeSchedule {
  id: string
  title: string
  startsAt: number
  endsAt: number
  goalTitle: string | null
}

export interface HomeChapter {
  id: string
  title: string
  /** 0–100 */
  progress: number
}

export interface HomeGoal {
  id: string
  title: string
  category: GoalCategory
  progress: number
  endsAt: number
  nextItem: string | null
  chapters: HomeChapter[]
}

export interface HomeCountdown {
  id: string
  title: string
  at: number
  tint: string
  ink: string
}

/** Isian memo cepat di Home (disimpan ke jurnal + mood hari ini). */
export interface HomeMemo {
  text: string
  /** Indeks mood 0 (berat) … 4 (bahagia). */
  mood: number | null
  paper: MemoPaperName
}

export interface HomeSnapshot {
  goal: HomeGoal | null
  countdowns: HomeCountdown[]
  productiveStreak: number
}
